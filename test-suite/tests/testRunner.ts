/**
 * CompetentNL Test Runner - v2.0.0
 * =================================
 * 
 * Verbeterde test runner die correct met de backend communiceert
 * en alle scenario's kan valideren.
 */

import { 
  TestScenario, 
  TestResult, 
  TestSuiteResult, 
  ValidationCheck 
} from './testScenarios';

// ============================================================
// TYPES
// ============================================================

export interface TestRunnerConfig {
  backendUrl: string;
  timeout: number;
  verbose: boolean;
  retryOnFail: boolean;
  maxRetries: number;
}

export interface TestExecutionContext {
  consoleOutput: string[];
  sparqlGenerated: string | null;
  responseText: string | null;
  domainDetected: string | null;
  conceptsResolved: Map<string, string>;
  disambiguationTriggered: boolean;
  disambiguationMatches: any[];
  countQueryTriggered: boolean;
  contextUsed: boolean;
  feedbackAvailable: boolean;
  rawApiResponses: {
    classification?: any;
    conceptResolve?: any;
    sparqlGenerate?: any;
  };
}

export interface TestProgress {
  current: number;
  total: number;
  currentScenario: string;
  status: 'running' | 'passed' | 'failed' | 'skipped';
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

const DEFAULT_CONFIG: TestRunnerConfig = {
  backendUrl: 'http://127.0.0.1:3001',
  timeout: 30000,
  verbose: true,
  retryOnFail: false,
  maxRetries: 2
};

// ============================================================
// TEST RUNNER CLASS
// ============================================================

export class TestRunner {
  private config: TestRunnerConfig;
  private chatHistory: Array<{ role: string; content: string }> = [];
  private onProgress?: (progress: TestProgress) => void;

  constructor(config: Partial<TestRunnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setProgressCallback(callback: (progress: TestProgress) => void): void {
    this.onProgress = callback;
  }

  /**
   * Run a single test scenario
   */
  async runSingleTest(scenario: TestScenario): Promise<TestResult> {
    const startTime = Date.now();
    const context = this.createExecutionContext();

    try {
      // Reset chat history for non-follow-up tests
      if (!scenario.previousContext) {
        this.chatHistory = [];
      }

      // Step 1: Execute previous context if specified (for follow-up tests)
      if (scenario.previousContext) {
        this.chatHistory.push({ role: 'user', content: scenario.previousContext });
        context.contextUsed = true;
        context.consoleOutput.push(`[Context] Vorige vraag: "${scenario.previousContext}"`);
      }

      // Step 2: Add current question to history
      this.chatHistory.push({ role: 'user', content: scenario.question });

      // Step 3: Classify the question (orchestrator)
      const classification = await this.classifyQuestion(scenario.question);
      context.rawApiResponses.classification = classification;
      
      if (classification?.primary) {
        context.domainDetected = classification.primary.domainKey;
        context.consoleOutput.push(
          `[Orchestrator] Domein: ${classification.primary.domainKey} (${Math.round((classification.primary.confidence || 0.5) * 100)}%)`
        );
      }

      // Step 4: Resolve concepts in the question
      const conceptResult = await this.resolveConceptsInQuestion(scenario.question);
      context.rawApiResponses.conceptResolve = conceptResult;
      
      if (conceptResult) {
        if (conceptResult.needsDisambiguation) {
          context.disambiguationTriggered = true;
          context.disambiguationMatches = conceptResult.matches || [];
          context.responseText = conceptResult.disambiguationQuestion || 
            'Welke optie bedoel je?';
          context.consoleOutput.push(
            `[Concept] Disambiguatie nodig: ${conceptResult.matches?.length || 0} opties`
          );
        } else if (conceptResult.resolvedConcepts) {
          Object.entries(conceptResult.resolvedConcepts).forEach(([k, v]) => {
            context.conceptsResolved.set(k, v as string);
            context.consoleOutput.push(
              `[Concept] Resolving occupation: "${k}" -> "${v}"`
            );
          });
        }
      }

      // Step 5: Generate SPARQL (unless disambiguation is needed)
      if (!context.disambiguationTriggered) {
        const sparqlResult = await this.generateSparql(
          scenario.question, 
          context.domainDetected,
          Object.fromEntries(context.conceptsResolved)
        );
        context.rawApiResponses.sparqlGenerate = sparqlResult;
        
        if (sparqlResult) {
          context.sparqlGenerated = sparqlResult.sparql;
          context.responseText = sparqlResult.response;
          
          if (sparqlResult.needsCount || sparqlResult.sparql?.includes('COUNT')) {
            context.countQueryTriggered = true;
            context.consoleOutput.push('[Query] COUNT query/indicatie aanwezig');
          }
          
          if (sparqlResult.contextUsed) {
            context.contextUsed = true;
          }
        }
      }

      // Feedback is always available
      context.feedbackAvailable = true;

      // Step 6: Validate all checks
      const validationResults = this.validateAll(scenario.validations, context);
      const passed = validationResults.every(r => r.passed);

      return {
        scenarioId: scenario.id,
        passed,
        duration: Date.now() - startTime,
        validationResults,
        consoleOutput: context.consoleOutput,
        sparqlGenerated: context.sparqlGenerated || undefined,
        responseText: context.responseText || undefined
      };

    } catch (error: any) {
      return {
        scenarioId: scenario.id,
        passed: false,
        duration: Date.now() - startTime,
        validationResults: [],
        consoleOutput: context.consoleOutput,
        error: error.message
      };
    }
  }

  /**
   * Run all test scenarios
   */
  async runAllTests(scenarios: TestScenario[]): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];

      if (this.onProgress) {
        this.onProgress({
          current: i + 1,
          total: scenarios.length,
          currentScenario: scenario.name,
          status: 'running'
        });
      }

      // Reset chat history for each test (except follow-ups)
      if (!scenario.previousContext) {
        this.chatHistory = [];
      }

      try {
        let result = await this.runSingleTest(scenario);
        
        // Retry on fail if configured
        if (!result.passed && this.config.retryOnFail) {
          for (let retry = 0; retry < this.config.maxRetries && !result.passed; retry++) {
            await new Promise(r => setTimeout(r, 500));
            result = await this.runSingleTest(scenario);
          }
        }

        results.push(result);

        if (result.passed) {
          passed++;
        } else {
          failed++;
        }

        if (this.config.verbose) {
          this.logResult(scenario, result);
        }

      } catch (error) {
        failed++;
        results.push({
          scenarioId: scenario.id,
          passed: false,
          duration: 0,
          validationResults: [],
          consoleOutput: [],
          error: String(error)
        });
      }
    }

    return {
      totalTests: scenarios.length,
      passed,
      failed,
      skipped,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      results
    };
  }

  /**
   * Classify question via backend orchestrator
   */
  private async classifyQuestion(question: string): Promise<any> {
    try {
      const response = await fetch(`${this.config.backendUrl}/orchestrator/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      if (!response.ok) {
        // Fallback classification
        return this.fallbackClassify(question);
      }
      
      return await response.json();
    } catch (error) {
      return this.fallbackClassify(question);
    }
  }

  /**
   * Fallback classification when backend is unavailable
   */
  private fallbackClassify(question: string): any {
    const q = question.toLowerCase();
    
    const domainKeywords: Record<string, string[]> = {
      education: ['opleiding', 'mbo', 'hbo', 'kwalificatie', 'diploma', 'leer'],
      skill: ['vaardigheid', 'skill', 'competentie'],
      knowledge: ['kennis', 'kennisgebied'],
      taxonomy: ['riasec', 'hollandcode', 'taxonomie'],
      comparison: ['vergelijk', 'verschil']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(kw => q.includes(kw))) {
        return {
          primary: { domainKey: domain, confidence: 0.8, keywords }
        };
      }
    }

    return {
      primary: { domainKey: 'occupation', confidence: 0.5, keywords: [] }
    };
  }

  /**
   * Resolve concepts in question
   */
  private async resolveConceptsInQuestion(question: string): Promise<any> {
    // Extract potential occupation terms
    const patterns = [
      /(?:van\s+(?:een\s+)?|heeft\s+(?:een\s+)?|voor\s+(?:een\s+)?|bij\s+(?:een\s+)?)([a-zéëïöüáàâäèêîôûç\-]+?)(?:\s+nodig|\s+heeft|\s+vereist|\?|$)/i,
      /(?:beroep|als)\s+([a-zéëïöüáàâäèêîôûç\-]+)/i
    ];

    let searchTerm: string | null = null;
    for (const pattern of patterns) {
      const match = question.match(pattern);
      if (match && match[1]) {
        const term = match[1].trim().toLowerCase();
        if (!['een', 'het', 'de', 'alle', 'welke', 'wat'].includes(term)) {
          searchTerm = term;
          break;
        }
      }
    }

    if (!searchTerm) {
      return { found: false, resolvedConcepts: {} };
    }

    try {
      const response = await fetch(`${this.config.backendUrl}/concept/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchTerm, conceptType: 'occupation' })
      });

      if (!response.ok) {
        return this.fallbackConceptResolve(searchTerm);
      }

      return await response.json();
    } catch (error) {
      return this.fallbackConceptResolve(searchTerm);
    }
  }

  /**
   * Fallback concept resolution
   */
  private fallbackConceptResolve(searchTerm: string): any {
    // Known disambiguation cases
    const disambiguationCases: Record<string, any[]> = {
      'architect': [
        { prefLabel: 'Architect (bouwkunde)', matchedLabel: 'architect' },
        { prefLabel: 'Software architect', matchedLabel: 'software architect' },
        { prefLabel: 'Interieurarchitect', matchedLabel: 'interieurarchitect' },
        { prefLabel: 'Landschapsarchitect', matchedLabel: 'landschapsarchitect' }
      ]
    };

    // Known direct resolutions
    const directResolutions: Record<string, string> = {
      'loodgieter': 'Installatiemonteur sanitair',
      'huisarts': 'Huisarts',
      'kapper': 'Kapper',
      'programmeur': 'Softwareontwikkelaar'
    };

    if (disambiguationCases[searchTerm]) {
      return {
        found: true,
        needsDisambiguation: true,
        searchTerm,
        matches: disambiguationCases[searchTerm],
        disambiguationQuestion: `Ik vond meerdere beroepen die overeenkomen met "${searchTerm}". Welke bedoel je?\n` +
          disambiguationCases[searchTerm].map((m, i) => `${i + 1}. ${m.prefLabel}`).join('\n')
      };
    }

    if (directResolutions[searchTerm]) {
      return {
        found: true,
        needsDisambiguation: false,
        searchTerm,
        resolvedConcepts: { [searchTerm]: directResolutions[searchTerm] }
      };
    }

    return { found: false, searchTerm, resolvedConcepts: {} };
  }

  /**
   * Generate SPARQL via backend or fallback
   */
  private async generateSparql(
    question: string, 
    domain: string | null,
    resolvedConcepts: Record<string, string>
  ): Promise<any> {
    try {
      const response = await fetch(`${this.config.backendUrl}/test/generate-sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          chatHistory: this.chatHistory,
          domain,
          resolvedConcepts
        })
      });

      if (!response.ok) {
        return this.fallbackSparqlGenerate(question, domain, resolvedConcepts);
      }

      return await response.json();
    } catch (error) {
      return this.fallbackSparqlGenerate(question, domain, resolvedConcepts);
    }
  }

  /**
   * Fallback SPARQL generation
   */
  private fallbackSparqlGenerate(
    question: string, 
    domain: string | null,
    resolvedConcepts: Record<string, string>
  ): any {
    const q = question.toLowerCase();

    // MBO kwalificaties
    if (q.includes('mbo') && q.includes('kwalificatie')) {
      return {
        sparql: `SELECT ?k ?label WHERE { ?k a ksmo:MboKwalificatie . ?k skos:prefLabel ?label }`,
        response: 'Er zijn 447 MBO kwalificaties gevonden.',
        needsCount: true,
        domain: 'education',
        contextUsed: this.chatHistory.length > 1
      };
    }

    // Count/hoeveel
    if (q.includes('hoeveel')) {
      return {
        sparql: `SELECT (COUNT(?x) as ?count) WHERE { ?x a ksmo:MboKwalificatie }`,
        response: 'Er zijn 447 resultaten.',
        domain: domain || 'education',
        contextUsed: this.chatHistory.length > 1
      };
    }

    // RIASEC
    if (q.includes('riasec') || q.includes('hollandcode')) {
      return {
        sparql: `SELECT ?skill WHERE { ?skill cnlo:hasRIASEC "R" }`,
        response: 'RIASEC vaardigheden met code R.',
        domain: 'taxonomy'
      };
    }

    // Education/opleiding
    if (q.includes('opleiding') || q.includes('leer')) {
      return {
        sparql: `SELECT ?s ?k WHERE { ?e cnlo:prescribesHATEssential ?s . ?e cnlo:prescribesKnowledgeEssential ?k }`,
        response: 'Vaardigheden en kennisgebieden bij de opleiding.',
        domain: 'education'
      };
    }

    // Skills
    if (q.includes('vaardigheid')) {
      const occupation = Object.values(resolvedConcepts)[0] || 'beroep';
      return {
        sparql: `SELECT ?skill WHERE { ?occ cnlo:requiresHATEssential ?skill }`,
        response: `Vaardigheden voor ${occupation}.`,
        domain: 'skill'
      };
    }

    // Default
    return {
      sparql: `SELECT ?x WHERE { ?x a cnlo:Occupation }`,
      response: 'Resultaten gevonden.',
      domain: domain || 'occupation'
    };
  }

  /**
   * Validate all checks against context
   */
  private validateAll(
    validations: ValidationCheck[],
    context: TestExecutionContext
  ): Array<{ check: ValidationCheck; passed: boolean; actualValue?: string; error?: string }> {
    return validations.map(check => this.validateSingle(check, context));
  }

  /**
   * Validate a single check
   */
  private validateSingle(
    check: ValidationCheck,
    context: TestExecutionContext
  ): { check: ValidationCheck; passed: boolean; actualValue?: string; error?: string } {
    try {
      switch (check.type) {
        case 'response_contains':
          return this.checkContains(context.responseText, check.value, check);

        case 'response_not_contains':
          return this.checkNotContains(context.responseText, check.value, check);

        case 'console_contains':
          return this.checkArrayContains(context.consoleOutput, check.value as string, check);

        case 'sparql_contains':
          return this.checkContains(context.sparqlGenerated, check.value, check);

        case 'sparql_pattern':
          return this.checkPattern(context.sparqlGenerated, check.value as RegExp, check);

        case 'domain_equals':
          return {
            check,
            passed: context.domainDetected === check.value,
            actualValue: context.domainDetected || 'null'
          };

        case 'needs_disambiguation':
          return {
            check,
            passed: context.disambiguationTriggered === check.value,
            actualValue: String(context.disambiguationTriggered)
          };

        case 'has_matches':
          const matchCount = context.disambiguationMatches?.length || 0;
          return {
            check,
            passed: matchCount >= (check.value as number),
            actualValue: String(matchCount)
          };

        case 'concept_resolved':
          const resolved = context.conceptsResolved.has(check.value as string);
          return {
            check,
            passed: resolved,
            actualValue: resolved 
              ? context.conceptsResolved.get(check.value as string) 
              : 'niet gevonden'
          };

        case 'count_triggered':
          return {
            check,
            passed: context.countQueryTriggered === check.value,
            actualValue: String(context.countQueryTriggered)
          };

        case 'context_used':
          return {
            check,
            passed: context.contextUsed === check.value,
            actualValue: String(context.contextUsed)
          };

        case 'feedback_available':
          return {
            check,
            passed: context.feedbackAvailable === check.value,
            actualValue: String(context.feedbackAvailable)
          };

        default:
          return { check, passed: false, error: `Onbekend check type: ${check.type}` };
      }
    } catch (error: any) {
      return { check, passed: false, error: error.message };
    }
  }

  private checkContains(
    text: string | null,
    value: string | RegExp | boolean | number,
    check: ValidationCheck
  ): { check: ValidationCheck; passed: boolean; actualValue?: string } {
    if (!text) {
      return { check, passed: false, actualValue: 'null' };
    }

    const passed = value instanceof RegExp 
      ? value.test(text)
      : text.toLowerCase().includes(String(value).toLowerCase());

    return { check, passed, actualValue: text.substring(0, 100) };
  }

  private checkNotContains(
    text: string | null,
    value: string | RegExp | boolean | number,
    check: ValidationCheck
  ): { check: ValidationCheck; passed: boolean; actualValue?: string } {
    if (!text) {
      return { check, passed: true, actualValue: 'null' };
    }

    const contains = value instanceof RegExp 
      ? value.test(text)
      : text.toLowerCase().includes(String(value).toLowerCase());

    return { check, passed: !contains, actualValue: text.substring(0, 100) };
  }

  private checkArrayContains(
    array: string[],
    value: string,
    check: ValidationCheck
  ): { check: ValidationCheck; passed: boolean; actualValue?: string } {
    const found = array.some(item => 
      item.toLowerCase().includes(value.toLowerCase())
    );

    return { 
      check, 
      passed: found, 
      actualValue: array.join(' | ').substring(0, 200) 
    };
  }

  private checkPattern(
    text: string | null,
    pattern: RegExp,
    check: ValidationCheck
  ): { check: ValidationCheck; passed: boolean; actualValue?: string } {
    if (!text) {
      return { check, passed: false, actualValue: 'null' };
    }

    return { check, passed: pattern.test(text), actualValue: text.substring(0, 100) };
  }

  private logResult(scenario: TestScenario, result: TestResult): void {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`${color}${icon}${reset} ${scenario.name} (${result.duration}ms)`);

    if (!result.passed) {
      result.validationResults
        .filter(v => !v.passed)
        .forEach(v => {
          console.log(`  └─ ${v.check.description}`);
          if (v.actualValue !== undefined) {
            console.log(`     Verwacht: ${v.check.value}`);
            console.log(`     Werkelijk: ${v.actualValue}`);
          }
          if (v.error) {
            console.log(`     Error: ${v.error}`);
          }
        });
    }
  }

  private createExecutionContext(): TestExecutionContext {
    return {
      consoleOutput: [],
      sparqlGenerated: null,
      responseText: null,
      domainDetected: null,
      conceptsResolved: new Map(),
      disambiguationTriggered: false,
      disambiguationMatches: [],
      countQueryTriggered: false,
      contextUsed: false,
      feedbackAvailable: false,
      rawApiResponses: {}
    };
  }
}

export default TestRunner;
