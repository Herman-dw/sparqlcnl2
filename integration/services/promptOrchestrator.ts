/**
 * CompetentNL Multi-Prompt Orchestrator
 * =====================================
 * Classificeert vragen en assembleert domein-specifieke prompts
 * 
 * Gebruik:
 * ```typescript
 * import { createPromptOrchestrator } from './services/promptOrchestrator';
 * 
 * const orchestrator = await createPromptOrchestrator();
 * const result = await orchestrator.orchestrate("Welke vaardigheden heeft een kapper?");
 * console.log(result.fullPrompt);
 * ```
 */

import mysql, { Pool, RowDataPacket } from 'mysql2/promise';

// ============================================================
// TYPES
// ============================================================

export interface DomainMatch {
  domainKey: string;
  domainName: string;
  confidence: number;
  matchedKeywords: string[];
}

export interface AssembledPrompt {
  systemPrompt: string;
  contextPrompt: string;
  examplePrompts: string;
  rulesPrompt: string;
  fullPrompt: string;
  domains: DomainMatch[];
  metadata: {
    primaryDomain: string;
    exampleCount: number;
    schemaElementCount: number;
  };
}

export interface ExampleQuery {
  questionNl: string;
  sparqlQuery: string;
  queryPattern: string;
  similarity?: number;
}

export interface SchemaElement {
  elementType: string;
  prefixShort: string;
  localName: string;
  labelNl: string;
  descriptionNl: string;
  importance: string;
}

interface OrchestratorConfig {
  maxExamples: number;
  similarityThreshold: number;
  keywordConfidenceThreshold: number;
}

// ============================================================
// MAIN CLASS
// ============================================================

export class PromptOrchestrator {
  private pool: Pool;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minuten
  private config: OrchestratorConfig = {
    maxExamples: 3,
    similarityThreshold: 0.7,
    keywordConfidenceThreshold: 0.6
  };
  private initialized = false;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialiseer de orchestrator (laad config)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT config_key, config_value FROM orchestrator_config WHERE is_active = TRUE`
      );
      
      for (const row of rows) {
        if (row.config_key === 'max_examples_per_query') {
          this.config.maxExamples = parseInt(row.config_value);
        } else if (row.config_key === 'similarity_threshold') {
          this.config.similarityThreshold = parseFloat(row.config_value);
        } else if (row.config_key === 'keyword_confidence_threshold') {
          this.config.keywordConfidenceThreshold = parseFloat(row.config_value);
        }
      }
      
      this.initialized = true;
      console.log('[Orchestrator] Geïnitialiseerd met config:', this.config);
    } catch (error) {
      console.warn('[Orchestrator] Config laden mislukt, gebruik defaults:', error);
      this.initialized = true;
    }
  }

  /**
   * Hoofdmethode: classificeer vraag en assembleer prompt
   */
  async orchestrate(
    question: string, 
    isFollowUp: boolean = false,
    previousContext?: string
  ): Promise<AssembledPrompt> {
    await this.initialize();
    
    console.log(`[Orchestrator] Vraag: "${question.substring(0, 50)}..."`);
    
    // Stap 1: Classificeer de vraag
    const domains = await this.classifyQuestion(question);
    console.log(`[Orchestrator] Domein: ${domains.map(d => `${d.domainKey} (${(d.confidence * 100).toFixed(0)}%)`).join(', ')}`);
    
    // Stap 2: Haal basis prompts op
    const orchestratorPrompt = await this.getOrchestratorPrompt();
    const defaultPrefixes = await this.getDefaultPrefixes();
    
    // Stap 3: Haal domein-specifieke prompts op
    const primaryDomain = domains[0];
    const domainPrompts = await this.getDomainPrompts(primaryDomain.domainKey);
    
    // Stap 4: Haal relevante voorbeelden op (via fulltext search)
    const examples = await this.getRelevantExamples(question, primaryDomain.domainKey);
    console.log(`[Orchestrator] ${examples.length} voorbeelden gevonden`);
    
    // Stap 5: Haal schema elementen op
    const schemaElements = await this.getSchemaElements(primaryDomain.domainKey);
    
    // Stap 6: Assembleer de finale prompt
    const assembled = this.assemblePrompt({
      orchestratorPrompt,
      defaultPrefixes,
      domainPrompts,
      examples,
      schemaElements,
      question,
      isFollowUp,
      previousContext,
      domains
    });
    
    return assembled;
  }

  /**
   * Classificeer vraag naar domein(en) op basis van keywords
   */
  async classifyQuestion(question: string): Promise<DomainMatch[]> {
    const normalizedQuestion = question.toLowerCase().trim();
    
    // Haal alle keywords op (gecached)
    const keywords = await this.getAllKeywords();
    
    // Score per domein berekenen
    const domainScores = new Map<string, {
      score: number;
      name: string;
      priority: number;
      matchedKeywords: string[];
      hasExclusive: boolean;
    }>();
    
    for (const kw of keywords) {
      if (normalizedQuestion.includes(kw.keyword_normalized)) {
        const current = domainScores.get(kw.domain_key) || {
          score: 0,
          name: kw.domain_name,
          priority: kw.priority,
          matchedKeywords: [],
          hasExclusive: false
        };
        
        current.score += parseFloat(kw.weight);
        current.matchedKeywords.push(kw.keyword_normalized);
        if (kw.is_exclusive) {
          current.hasExclusive = true;
        }
        
        domainScores.set(kw.domain_key, current);
      }
    }
    
    // Als er een exclusieve match is, gebruik alleen dat domein
    for (const [key, data] of domainScores) {
      if (data.hasExclusive) {
        return [{
          domainKey: key,
          domainName: data.name,
          confidence: Math.min(data.score, 1.0),
          matchedKeywords: data.matchedKeywords
        }];
      }
    }
    
    // Sorteer op score en priority
    const sorted = Array.from(domainScores.entries())
      .map(([key, data]) => ({
        domainKey: key,
        domainName: data.name,
        confidence: Math.min(data.score / 2, 1.0),
        matchedKeywords: data.matchedKeywords,
        priority: data.priority
      }))
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return b.priority - a.priority;
      });
    
    // Return top matches, of fallback naar 'occupation'
    if (sorted.length === 0) {
      return [{
        domainKey: 'occupation',
        domainName: 'Beroepen',
        confidence: 0.3,
        matchedKeywords: []
      }];
    }
    
    return sorted.slice(0, 2);
  }

  /**
   * Haal alle keywords op (gecached)
   */
  private async getAllKeywords(): Promise<RowDataPacket[]> {
    const cached = this.getFromCache('all_keywords');
    if (cached) return cached;
    
    const [rows] = await this.pool.execute<RowDataPacket[]>(`
      SELECT 
        ck.keyword_normalized,
        ck.weight,
        ck.is_exclusive,
        pd.domain_key,
        pd.domain_name,
        pd.priority
      FROM classification_keywords ck
      JOIN prompt_domains pd ON ck.domain_id = pd.id
      WHERE pd.is_active = TRUE
      ORDER BY pd.priority DESC, ck.weight DESC
    `);
    
    this.setCache('all_keywords', rows);
    return rows;
  }

  /**
   * Haal orchestrator system prompt op
   */
  private async getOrchestratorPrompt(): Promise<string> {
    const cached = this.getFromCache('orchestrator_prompt');
    if (cached) return cached;
    
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT config_value FROM orchestrator_config WHERE config_key = 'system_prompt' AND is_active = TRUE`
    );
    
    const prompt = rows[0]?.config_value || '';
    this.setCache('orchestrator_prompt', prompt);
    return prompt;
  }

  /**
   * Haal default prefixes op
   */
  private async getDefaultPrefixes(): Promise<string> {
    const cached = this.getFromCache('default_prefixes');
    if (cached) return cached;
    
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT config_value FROM orchestrator_config WHERE config_key = 'default_prefixes' AND is_active = TRUE`
    );
    
    const prefixes = rows[0]?.config_value || '';
    this.setCache('default_prefixes', prefixes);
    return prefixes;
  }

  /**
   * Haal domein-specifieke prompts op
   */
  private async getDomainPrompts(domainKey: string): Promise<Map<string, string>> {
    const cacheKey = `domain_prompts_${domainKey}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const [rows] = await this.pool.execute<RowDataPacket[]>(`
      SELECT dp.prompt_type, dp.prompt_content
      FROM domain_prompts dp
      JOIN prompt_domains pd ON dp.domain_id = pd.id
      WHERE pd.domain_key = ? AND dp.is_active = TRUE AND pd.is_active = TRUE
      ORDER BY dp.prompt_order
    `, [domainKey]);
    
    const prompts = new Map<string, string>();
    for (const row of rows) {
      const existing = prompts.get(row.prompt_type) || '';
      prompts.set(row.prompt_type, existing + '\n' + row.prompt_content);
    }
    
    this.setCache(cacheKey, prompts);
    return prompts;
  }

  /**
   * Haal relevante voorbeelden op via fulltext search
   */
  private async getRelevantExamples(
    question: string, 
    domainKey: string
  ): Promise<ExampleQuery[]> {
    try {
      // Probeer fulltext search
      const [rows] = await this.pool.execute<RowDataPacket[]>(`
        SELECT 
          question_nl,
          sparql_query,
          query_pattern,
          MATCH(question_nl) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
        FROM domain_example_queries deq
        JOIN prompt_domains pd ON deq.domain_id = pd.id
        WHERE pd.domain_key = ? 
          AND deq.is_active = TRUE
          AND MATCH(question_nl) AGAINST(? IN NATURAL LANGUAGE MODE)
        ORDER BY relevance DESC
        LIMIT ?
      `, [question, domainKey, question, this.config.maxExamples]);
      
      if (rows.length > 0) {
        return rows.map(row => ({
          questionNl: row.question_nl,
          sparqlQuery: row.sparql_query,
          queryPattern: row.query_pattern,
          similarity: row.relevance
        }));
      }
    } catch (error) {
      console.warn('[Orchestrator] Fulltext search mislukt, fallback naar recente:', error);
    }
    
    // Fallback: pak recente voorbeelden
    const [fallback] = await this.pool.execute<RowDataPacket[]>(`
      SELECT question_nl, sparql_query, query_pattern
      FROM domain_example_queries deq
      JOIN prompt_domains pd ON deq.domain_id = pd.id
      WHERE pd.domain_key = ? AND deq.is_active = TRUE
      ORDER BY usage_count DESC, id DESC
      LIMIT ?
    `, [domainKey, this.config.maxExamples]);
    
    return fallback.map(row => ({
      questionNl: row.question_nl,
      sparqlQuery: row.sparql_query,
      queryPattern: row.query_pattern
    }));
  }

  /**
   * Haal schema elementen op voor een domein
   */
  private async getSchemaElements(domainKey: string): Promise<SchemaElement[]> {
    const cacheKey = `schema_${domainKey}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const [rows] = await this.pool.execute<RowDataPacket[]>(`
      SELECT 
        element_type,
        prefix_short,
        local_name,
        label_nl,
        description_nl,
        importance
      FROM domain_schema_elements dse
      JOIN prompt_domains pd ON dse.domain_id = pd.id
      WHERE pd.domain_key = ?
      ORDER BY 
        CASE importance 
          WHEN 'essential' THEN 1 
          WHEN 'important' THEN 2 
          ELSE 3 
        END,
        element_type
    `, [domainKey]);
    
    const elements = rows.map(row => ({
      elementType: row.element_type,
      prefixShort: row.prefix_short || '',
      localName: row.local_name || '',
      labelNl: row.label_nl || '',
      descriptionNl: row.description_nl || '',
      importance: row.importance
    }));
    
    this.setCache(cacheKey, elements);
    return elements;
  }

  /**
   * Assembleer de finale prompt
   */
  private assemblePrompt(params: {
    orchestratorPrompt: string;
    defaultPrefixes: string;
    domainPrompts: Map<string, string>;
    examples: ExampleQuery[];
    schemaElements: SchemaElement[];
    question: string;
    isFollowUp: boolean;
    previousContext?: string;
    domains: DomainMatch[];
  }): AssembledPrompt {
    const { 
      orchestratorPrompt, 
      defaultPrefixes,
      domainPrompts, 
      examples, 
      schemaElements,
      question,
      isFollowUp,
      previousContext,
      domains
    } = params;

    // System prompt samenstellen
    let systemPrompt = orchestratorPrompt + '\n\n';
    systemPrompt += `## BESCHIKBARE PREFIXES\n${defaultPrefixes}\n\n`;
    
    // Domein-specifieke system prompt
    const domainSystem = domainPrompts.get('system') || '';
    if (domainSystem) {
      systemPrompt += `## DOMEIN: ${domains[0].domainName.toUpperCase()}\n${domainSystem}\n\n`;
    }

    // Context prompt (schema elementen)
    let contextPrompt = '## SCHEMA ELEMENTEN\n';
    const essentialElements = schemaElements.filter(e => e.importance === 'essential');
    const importantElements = schemaElements.filter(e => e.importance === 'important');
    
    if (essentialElements.length > 0) {
      contextPrompt += '### Essentieel:\n';
      for (const el of essentialElements) {
        contextPrompt += `- ${el.prefixShort}${el.localName} (${el.labelNl}): ${el.descriptionNl || ''}\n`;
      }
    }
    
    if (importantElements.length > 0) {
      contextPrompt += '\n### Belangrijk:\n';
      for (const el of importantElements) {
        contextPrompt += `- ${el.prefixShort}${el.localName} (${el.labelNl})\n`;
      }
    }

    // Examples prompt
    let examplePrompts = '';
    if (examples.length > 0) {
      examplePrompts = '## VOORBEELDEN\n';
      for (let i = 0; i < examples.length; i++) {
        const ex = examples[i];
        examplePrompts += `\n### Voorbeeld ${i + 1}:\n`;
        examplePrompts += `Vraag: ${ex.questionNl}\n`;
        examplePrompts += `Query:\n\`\`\`sparql\n${ex.sparqlQuery}\n\`\`\`\n`;
      }
    }

    // Rules prompt
    const rulesPrompt = domainPrompts.get('rules') || '';

    // Follow-up context
    let followUpSection = '';
    if (isFollowUp && previousContext) {
      followUpSection = `
## VERVOLGVRAAG CONTEXT
Dit is een vervolgvraag. Gebruik de context van de vorige vraag.
Vorige context: ${previousContext}
`;
    }

    // Finale prompt samenstellen
    const fullPrompt = [
      systemPrompt,
      contextPrompt,
      examplePrompts,
      rulesPrompt ? `## REGELS\n${rulesPrompt}` : '',
      followUpSection,
      `\n## VRAAG VAN GEBRUIKER\n${question}`
    ].filter(Boolean).join('\n\n');

    return {
      systemPrompt,
      contextPrompt,
      examplePrompts,
      rulesPrompt,
      fullPrompt,
      domains,
      metadata: {
        primaryDomain: domains[0].domainKey,
        exampleCount: examples.length,
        schemaElementCount: schemaElements.length
      }
    };
  }

  /**
   * Log query voor feedback tracking
   */
  async logQuery(params: {
    sessionId: string;
    question: string;
    domains: DomainMatch[];
    sparqlQuery: string;
    resultCount?: number;
    executionTimeMs?: number;
    error?: string;
  }): Promise<number> {
    try {
      const [result] = await this.pool.execute(`
        INSERT INTO query_log (
          session_id,
          question_original,
          detected_domains,
          selected_domain_id,
          classification_method,
          sparql_query,
          result_count,
          execution_time_ms,
          error_message
        ) VALUES (?, ?, ?, 
          (SELECT id FROM prompt_domains WHERE domain_key = ? LIMIT 1),
          'hybrid', ?, ?, ?, ?
        )
      `, [
        params.sessionId,
        params.question,
        JSON.stringify(params.domains),
        params.domains[0]?.domainKey || 'occupation',
        params.sparqlQuery,
        params.resultCount ?? null,
        params.executionTimeMs ?? null,
        params.error ?? null
      ]);
      
      return (result as any).insertId;
    } catch (error) {
      console.error('[Orchestrator] Query logging mislukt:', error);
      return 0;
    }
  }

  /**
   * Update feedback voor een query
   */
  async updateFeedback(
    queryId: number, 
    feedback: 'positive' | 'negative',
    comment?: string
  ): Promise<void> {
    await this.pool.execute(`
      UPDATE query_log 
      SET user_feedback = ?, feedback_comment = ?
      WHERE id = ?
    `, [feedback, comment ?? null, queryId]);
  }

  /**
   * Haal statistieken op
   */
  async getStats(): Promise<any> {
    const [stats] = await this.pool.execute<RowDataPacket[]>(`
      SELECT * FROM v_domain_stats
    `);
    return stats;
  }

  // Cache helpers
  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(): void {
    this.cache.clear();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ============================================================
// FACTORY FUNCTION
// ============================================================

export async function createPromptOrchestrator(config?: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}): Promise<PromptOrchestrator> {
  const pool = mysql.createPool({
    host: config?.host || process.env.DB_HOST || 'localhost',
    port: config?.port || parseInt(process.env.DB_PORT || '3306'),
    user: config?.user || process.env.DB_USER || 'root',
    password: config?.password || process.env.DB_PASSWORD || '',
    database: config?.database || process.env.DB_NAME || 'competentnl_prompts',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  
  const orchestrator = new PromptOrchestrator(pool);
  await orchestrator.initialize();
  
  return orchestrator;
}

export default PromptOrchestrator;
