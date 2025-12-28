/**
 * CompetentNL Backend Server - v3.0.0
 * ====================================
 * Features:
 * - SPARQL proxy
 * - RAG examples (competentnl_rag database)
 * - Generieke Concept Resolver met disambiguatie
 * - Multi-Prompt Orchestrator (competentnl_prompts database)
 * - Learning van user selecties
 */

import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

// Load environment
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
  console.log('[Backend] .env.local geladen');
} else {
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '127.0.0.1';

app.use(cors());
app.use(express.json());

// =====================================================
// DATABASE CONNECTION POOLS (twee databases!)
// =====================================================

// Pool voor RAG & Concept Resolver (bestaande data)
const ragPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'competentnl_rag',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// Pool voor Multi-Prompt Orchestrator (nieuwe data)
const promptsPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_PROMPTS_NAME || 'competentnl_prompts',
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4'
});

// Test database connections
async function testDatabaseConnections() {
  try {
    await ragPool.execute('SELECT 1');
    console.log('[DB] ✓ competentnl_rag connected');
  } catch (e) {
    console.warn('[DB] ✗ competentnl_rag not available:', e.message);
  }
  
  try {
    await promptsPool.execute('SELECT 1');
    console.log('[DB] ✓ competentnl_prompts connected');
  } catch (e) {
    console.warn('[DB] ✗ competentnl_prompts not available (orchestrator disabled):', e.message);
  }
}

// =====================================================
// CONCEPT TYPE CONFIGURATIONS
// =====================================================
const CONCEPT_TYPES = {
  occupation: {
    table: 'occupation_labels',
    uriColumn: 'occupation_uri',
    dutchName: 'beroep',
    dutchNamePlural: 'beroepen',
    disambiguationThreshold: 5
  },
  education: {
    table: 'education_labels',
    uriColumn: 'education_uri',
    dutchName: 'opleiding',
    dutchNamePlural: 'opleidingen',
    disambiguationThreshold: 5
  },
  capability: {
    table: 'capability_labels',
    uriColumn: 'capability_uri',
    dutchName: 'vaardigheid',
    dutchNamePlural: 'vaardigheden',
    disambiguationThreshold: 5
  },
  knowledge: {
    table: 'knowledge_labels',
    uriColumn: 'knowledge_uri',
    dutchName: 'kennisgebied',
    dutchNamePlural: 'kennisgebieden',
    disambiguationThreshold: 5
  },
  task: {
    table: 'task_labels',
    uriColumn: 'task_uri',
    dutchName: 'taak',
    dutchNamePlural: 'taken',
    disambiguationThreshold: 5
  },
  workingCondition: {
    table: 'workingcondition_labels',
    uriColumn: 'condition_uri',
    dutchName: 'werkomstandigheid',
    dutchNamePlural: 'werkomstandigheden',
    disambiguationThreshold: 5
  }
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateDisambiguationQuestion(searchTerm, matches, conceptType) {
  const config = CONCEPT_TYPES[conceptType];
  const options = matches.slice(0, 10);
  
  let question = `Ik vond ${matches.length} ${config.dutchNamePlural} die overeenkomen met "${searchTerm}". Welke bedoel je?\n\n`;
  
  options.forEach((match, index) => {
    question += `**${index + 1}. ${match.prefLabel}**`;
    if (match.matchedLabel.toLowerCase() !== match.prefLabel.toLowerCase()) {
      question += ` _(gevonden via: "${match.matchedLabel}")_`;
    }
    question += '\n';
  });
  
  if (matches.length > 10) {
    question += `\n_...en nog ${matches.length - 10} andere opties._\n`;
  }
  
  question += `\nTyp het **nummer** of de **naam** van je keuze.`;
  
  return question;
}

// =====================================================
// HEALTH CHECK
// =====================================================
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '3.0.0', 
    message: 'CompetentNL Server - Unified (RAG + Orchestrator)' 
  });
});

app.get('/health', async (req, res) => {
  const health = { status: 'ok', databases: {} };
  
  try {
    await ragPool.execute('SELECT 1');
    health.databases.rag = 'connected';
  } catch (e) {
    health.databases.rag = 'disconnected';
  }
  
  try {
    await promptsPool.execute('SELECT 1');
    health.databases.prompts = 'connected';
  } catch (e) {
    health.databases.prompts = 'disconnected';
  }
  
  res.json(health);
});

// =====================================================
// SPARQL PROXY
// =====================================================
app.post('/proxy/sparql', async (req, res) => {
  const endpoint = process.env.COMPETENTNL_ENDPOINT || req.body.endpoint;
  const query = req.body.query;
  const key = process.env.COMPETENTNL_API_KEY || req.body.key;

  if (!endpoint || !query) {
    return res.status(400).json({ error: 'Endpoint en query zijn verplicht.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('format', 'application/sparql-results+json');

    const headers = {
      'Accept': 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CompetentNL-AI-Agent/3.0'
    };

    if (key) {
      headers['apikey'] = key;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: params
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `CompetentNL server fout (${response.status})`,
        details: errorText 
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ 
      error: 'Proxy kon geen verbinding maken met het SPARQL endpoint.',
      details: error.message 
    });
  }
});

// =====================================================
// GENERIC CONCEPT RESOLVER (uses ragPool)
// =====================================================

app.post('/concept/resolve', async (req, res) => {
  const { searchTerm, conceptType = 'occupation' } = req.body;
  
  if (!searchTerm) {
    return res.status(400).json({ error: 'searchTerm is verplicht' });
  }
  
  const config = CONCEPT_TYPES[conceptType];
  if (!config) {
    return res.status(400).json({ error: `Onbekend conceptType: ${conceptType}` });
  }
  
  const normalized = normalizeText(searchTerm);
  console.log(`[Concept] Resolving ${conceptType}: "${searchTerm}" (normalized: "${normalized}")`);
  
  try {
    const matches = [];
    
    // 1. Exact match on normalized label
    const [exactRows] = await ragPool.execute(`
      SELECT ${config.uriColumn} as uri, pref_label as prefLabel, label as matchedLabel, 
             'exact' as matchType, 1.0 as confidence
      FROM ${config.table}
      WHERE label_normalized = ?
      ORDER BY label_type = 'prefLabel' DESC, usage_count DESC
      LIMIT 20
    `, [normalized]);
    
    matches.push(...exactRows);
    
    // 2. Check synonyms table
    if (matches.length === 0) {
      const [synRows] = await ragPool.execute(`
        SELECT concept_uri as uri, pref_label as prefLabel, synonym as matchedLabel,
               'synonym' as matchType, confidence
        FROM concept_synonyms
        WHERE synonym_normalized = ? AND concept_type = ?
        ORDER BY confidence DESC
        LIMIT 10
      `, [normalized, conceptType]);
      
      matches.push(...synRows);
    }
    
    // 3. Contains match
    if (matches.length === 0) {
      const [containsRows] = await ragPool.execute(`
        SELECT ${config.uriColumn} as uri, pref_label as prefLabel, label as matchedLabel,
               'contains' as matchType, 0.7 as confidence
        FROM ${config.table}
        WHERE label_normalized LIKE ? OR label_normalized LIKE ? OR label_normalized LIKE ?
        ORDER BY 
          CASE WHEN label_normalized LIKE ? THEN 1
               WHEN label_normalized LIKE ? THEN 2
               ELSE 3 END,
          usage_count DESC
        LIMIT 30
      `, [`${normalized}%`, `%${normalized}`, `%${normalized}%`, `${normalized}%`, `%${normalized}`]);
      
      matches.push(...containsRows);
    }
    
    // 4. Full-text search fallback
    if (matches.length === 0 && normalized.length > 3) {
      try {
        const [ftRows] = await ragPool.execute(`
          SELECT ${config.uriColumn} as uri, pref_label as prefLabel, label as matchedLabel,
                 'fuzzy' as matchType, 0.5 as confidence
          FROM ${config.table}
          WHERE MATCH(label, pref_label) AGAINST(? IN NATURAL LANGUAGE MODE)
          LIMIT 20
        `, [searchTerm]);
        
        matches.push(...ftRows);
      } catch (e) {
        // Fulltext might not be available
      }
    }
    
    // Deduplicate by URI
    const uniqueMatches = [];
    const seenUris = new Set();
    for (const match of matches) {
      if (!seenUris.has(match.uri)) {
        seenUris.add(match.uri);
        uniqueMatches.push({ ...match, conceptType });
      }
    }
    
    // Determine if disambiguation is needed
    const needsDisambiguation = uniqueMatches.length > config.disambiguationThreshold;
    const hasExactMatch = uniqueMatches.some(m => m.matchType === 'exact');
    
    let disambiguationQuestion = null;
    if (needsDisambiguation && !hasExactMatch) {
      disambiguationQuestion = generateDisambiguationQuestion(searchTerm, uniqueMatches, conceptType);
    }
    
    // Log the search
    try {
      await ragPool.execute(`
        INSERT INTO concept_search_log 
        (search_term, search_term_normalized, concept_type, found_exact, found_fuzzy, 
         results_count, disambiguation_shown)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [searchTerm, normalized, conceptType, hasExactMatch, 
          uniqueMatches.length > 0 && !hasExactMatch, uniqueMatches.length,
          needsDisambiguation && !hasExactMatch]);
    } catch (e) { /* ignore */ }
    
    res.json({
      found: uniqueMatches.length > 0,
      exact: hasExactMatch,
      searchTerm,
      conceptType,
      matches: uniqueMatches.slice(0, 20),
      needsDisambiguation: needsDisambiguation && !hasExactMatch,
      disambiguationQuestion,
      suggestion: uniqueMatches.length === 0 
        ? `Geen ${config.dutchNamePlural} gevonden voor "${searchTerm}".`
        : null
    });
    
  } catch (error) {
    console.error('[Concept] Error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

app.post('/concept/confirm', async (req, res) => {
  const { searchTerm, selectedUri, selectedLabel, conceptType = 'occupation' } = req.body;
  
  if (!searchTerm || !selectedUri || !selectedLabel) {
    return res.status(400).json({ error: 'searchTerm, selectedUri en selectedLabel zijn verplicht' });
  }
  
  const config = CONCEPT_TYPES[conceptType];
  if (!config) {
    return res.status(400).json({ error: `Onbekend conceptType: ${conceptType}` });
  }
  
  const normalized = normalizeText(searchTerm);
  
  try {
    // Update usage count
    await ragPool.execute(`
      UPDATE ${config.table}
      SET usage_count = usage_count + 1, last_used = NOW()
      WHERE ${config.uriColumn} = ?
    `, [selectedUri]);
    
    // Add as synonym if new
    const [existing] = await ragPool.execute(`
      SELECT id FROM concept_synonyms 
      WHERE synonym_normalized = ? AND concept_type = ?
    `, [normalized, conceptType]);
    
    if (existing.length === 0) {
      await ragPool.execute(`
        INSERT INTO concept_synonyms 
        (synonym, synonym_normalized, concept_uri, pref_label, concept_type, added_by, confidence)
        VALUES (?, ?, ?, ?, ?, 'user_selection', 0.85)
      `, [searchTerm, normalized, selectedUri, selectedLabel, conceptType]);
      
      console.log(`[Concept] Added synonym: "${searchTerm}" -> "${selectedLabel}"`);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/concept/parse-selection', async (req, res) => {
  const { answer, options } = req.body;
  
  if (!answer || !options) {
    return res.status(400).json({ error: 'answer en options zijn verplicht' });
  }
  
  const trimmed = answer.trim();
  const num = parseInt(trimmed, 10);
  
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    return res.json({ found: true, selection: options[num - 1] });
  }
  
  const answerLower = trimmed.toLowerCase();
  for (const option of options) {
    if (option.prefLabel.toLowerCase().includes(answerLower)) {
      return res.json({ found: true, selection: option });
    }
  }
  
  res.json({ found: false });
});

app.get('/concept/suggest', async (req, res) => {
  const { q, type = 'occupation', limit = 10 } = req.query;
  
  if (!q || q.length < 2) return res.json([]);
  
  const config = CONCEPT_TYPES[type];
  if (!config) return res.status(400).json({ error: 'Onbekend type' });
  
  const normalized = normalizeText(q);
  
  try {
    const [rows] = await ragPool.execute(`
      SELECT DISTINCT label, pref_label as prefLabel, ${config.uriColumn} as uri
      FROM ${config.table}
      WHERE label_normalized LIKE ?
      ORDER BY usage_count DESC, label
      LIMIT ?
    `, [`%${normalized}%`, parseInt(limit)]);
    
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

// =====================================================
// RAG ENDPOINTS (uses ragPool)
// =====================================================

app.get('/rag/examples', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const [rows] = await ragPool.execute(`
      SELECT id, question, sparql_query, category, feedback_score
      FROM rag_examples
      WHERE is_active = TRUE
      ORDER BY feedback_score DESC, created_at DESC
      LIMIT ?
    `, [limit]);
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

app.post('/rag/log', async (req, res) => {
  const { sessionId, question, sparql, resultCount, executionTimeMs } = req.body;
  try {
    await ragPool.execute(`
      INSERT INTO query_logs (session_id, question, generated_sparql, result_count, execution_time_ms)
      VALUES (?, ?, ?, ?, ?)
    `, [sessionId || 'anonymous', question, sparql, resultCount || 0, executionTimeMs || 0]);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

app.post('/rag/feedback', async (req, res) => {
  const { logId, rating, comment } = req.body;
  try {
    await ragPool.execute(`
      UPDATE query_logs SET feedback_rating = ?, feedback_comment = ? WHERE id = ?
    `, [rating, comment, logId]);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

// =====================================================
// ORCHESTRATOR ENDPOINTS (uses promptsPool)
// =====================================================

app.get('/orchestrator/domains', async (req, res) => {
  try {
    const [rows] = await promptsPool.execute(`
      SELECT domain_key, domain_name, description, icon, priority
      FROM prompt_domains
      WHERE is_active = TRUE
      ORDER BY priority DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Orchestrator database not available' });
  }
});

app.get('/orchestrator/stats', async (req, res) => {
  try {
    const [rows] = await promptsPool.execute(`SELECT * FROM v_domain_stats`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Stats not available' });
  }
});

app.post('/orchestrator/classify', async (req, res) => {
  const { question } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'question is verplicht' });
  }
  
  const normalized = question.toLowerCase().trim();
  
  try {
    const [keywords] = await promptsPool.execute(`
      SELECT ck.keyword_normalized, ck.weight, ck.is_exclusive,
             pd.domain_key, pd.domain_name, pd.priority
      FROM classification_keywords ck
      JOIN prompt_domains pd ON ck.domain_id = pd.id
      WHERE pd.is_active = TRUE
    `);
    
    const scores = new Map();
    
    for (const kw of keywords) {
      if (normalized.includes(kw.keyword_normalized)) {
        const current = scores.get(kw.domain_key) || { 
          score: 0, name: kw.domain_name, keywords: [], exclusive: false 
        };
        current.score += parseFloat(kw.weight);
        current.keywords.push(kw.keyword_normalized);
        if (kw.is_exclusive) current.exclusive = true;
        scores.set(kw.domain_key, current);
      }
    }
    
    // Check for exclusive match
    for (const [key, data] of scores) {
      if (data.exclusive) {
        return res.json({
          primary: { domainKey: key, domainName: data.name, confidence: 1.0, keywords: data.keywords },
          secondary: null
        });
      }
    }
    
    const sorted = Array.from(scores.entries())
      .map(([key, data]) => ({
        domainKey: key,
        domainName: data.name,
        confidence: Math.min(data.score / 2, 1.0),
        keywords: data.keywords
      }))
      .sort((a, b) => b.confidence - a.confidence);
    
    res.json({
      primary: sorted[0] || { domainKey: 'occupation', domainName: 'Beroepen', confidence: 0.3, keywords: [] },
      secondary: sorted[1] || null
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Classification failed' });
  }
});

app.get('/orchestrator/examples', async (req, res) => {
  const { domain, limit = 5 } = req.query;
  
  try {
    let query = `
      SELECT deq.question_nl, deq.sparql_query, deq.query_pattern, pd.domain_key
      FROM domain_example_queries deq
      JOIN prompt_domains pd ON deq.domain_id = pd.id
      WHERE deq.is_active = TRUE
    `;
    const params = [];
    
    if (domain) {
      query += ` AND pd.domain_key = ?`;
      params.push(domain);
    }
    
    query += ` ORDER BY deq.usage_count DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const [rows] = await promptsPool.execute(query, params);
    res.json(rows);
    
  } catch (error) {
    res.json([]);
  }
});

// =====================================================
// COMBINED STATS
// =====================================================

app.get('/stats', async (req, res) => {
  const stats = { rag: {}, orchestrator: {}, concepts: {} };
  
  // RAG stats
  try {
    const [ragRows] = await ragPool.execute(`
      SELECT COUNT(*) as examples FROM rag_examples WHERE is_active = TRUE
    `);
    stats.rag.examples = ragRows[0].examples;
  } catch (e) {
    stats.rag.error = 'Not available';
  }
  
  // Orchestrator stats
  try {
    const [orchRows] = await promptsPool.execute(`
      SELECT 
        (SELECT COUNT(*) FROM prompt_domains WHERE is_active = TRUE) as domains,
        (SELECT COUNT(*) FROM domain_example_queries WHERE is_active = TRUE) as examples,
        (SELECT COUNT(*) FROM classification_keywords) as keywords
    `);
    stats.orchestrator = orchRows[0];
  } catch (e) {
    stats.orchestrator.error = 'Not available';
  }
  
  // Concept stats
  try {
    for (const [type, config] of Object.entries(CONCEPT_TYPES)) {
      const [rows] = await ragPool.execute(`
        SELECT COUNT(DISTINCT ${config.uriColumn}) as count FROM ${config.table}
      `);
      stats.concepts[type] = rows[0].count;
    }
  } catch (e) {
    stats.concepts.error = 'Not available';
  }
  
  res.json(stats);
});

// =====================================================
// START SERVER
// =====================================================

testDatabaseConnections().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║  CompetentNL Server v3.0.0 - Unified                      ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Host:     ${HOST}                                        ║
  ║  Port:     ${PORT}                                        ║
  ║  URL:      http://${HOST}:${PORT}                         ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Databases:                                               ║
  ║  • competentnl_rag     - Concepts & RAG examples          ║
  ║  • competentnl_prompts - Orchestrator & Domain prompts    ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Endpoints:                                               ║
  ║  • POST /concept/resolve      - Resolve concepts          ║
  ║  • POST /concept/confirm      - Learn from selections     ║
  ║  • GET  /concept/suggest      - Autocomplete              ║
  ║  • GET  /rag/examples         - RAG examples              ║
  ║  • GET  /orchestrator/domains - List domains              ║
  ║  • POST /orchestrator/classify - Classify question        ║
  ║  • GET  /stats                - Combined statistics       ║
  ╚═══════════════════════════════════════════════════════════╝
    `);
  });
});
/**
 * CompetentNL Test Routes - v2.0.0
 * =================================
 * 
 * Backend routes die alle test scenarios ondersteunen.
 * Voeg deze toe aan je server.js na de bestaande routes.
 * 
 * Test Scenarios:
 * 1. Disambiguatie: Architect → Moet meerdere matches vinden
 * 2. Domein-detectie: MBO kwalificaties → education domein
 * 3. Aantallen: >49 resultaten → COUNT query
 * 4. Vervolgvraag: Context behouden
 * 5. Concept Resolver: Loodgieter → officiële naam
 * 6. Opleiding: Skills & Knowledge → prescribes predicaat
 * 7. RIASEC Hollandcode → hasRIASEC predicaat
 */

// =====================================================
// TEST ENDPOINTS
// =====================================================

/**
 * Generate SPARQL for testing
 * Simuleert de Gemini AI response voor test doeleinden
 */
app.post('/test/generate-sparql', async (req, res) => {
  const { question, chatHistory, domain, resolvedConcepts } = req.body;

  try {
    const result = generateTestSparql(question, chatHistory, domain, resolvedConcepts);
    
    // Log voor debugging
    console.log(`[Test] Generate SPARQL for: "${question.substring(0, 50)}..."`);
    console.log(`[Test] Domain: ${result.domain}, Count: ${result.needsCount}`);
    
    res.json(result);
  } catch (error) {
    console.error('[Test] Generate SPARQL error:', error);
    res.status(500).json({ error: 'SPARQL generatie mislukt', details: error.message });
  }
});

/**
 * Run complete test scenario
 */
app.post('/test/run-scenario', async (req, res) => {
  const { scenarioId, question, previousContext } = req.body;

  try {
    const result = {
      scenarioId,
      timestamp: new Date().toISOString(),
      steps: []
    };

    // Step 1: Classification
    const classification = await classifyQuestionForTest(question);
    result.classification = classification;
    result.steps.push({
      step: 'classify',
      success: true,
      data: classification
    });

    // Step 2: Concept resolution
    const conceptResult = await resolveConceptsForTest(question);
    result.conceptResult = conceptResult;
    result.steps.push({
      step: 'concept_resolve',
      success: true,
      data: conceptResult
    });

    // Step 3: SPARQL generation
    const sparqlResult = generateTestSparql(
      question,
      previousContext ? [{ role: 'user', content: previousContext }] : [],
      classification?.primary?.domainKey,
      conceptResult?.resolvedConcepts || {}
    );
    result.sparqlResult = sparqlResult;
    result.steps.push({
      step: 'generate_sparql',
      success: true,
      data: sparqlResult
    });

    res.json(result);
  } catch (error) {
    console.error('[Test] Run scenario error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Validate SPARQL syntax
 */
app.post('/test/validate-sparql', async (req, res) => {
  const { sparql } = req.body;

  try {
    const validation = validateSparqlSyntax(sparql);
    res.json(validation);
  } catch (error) {
    res.status(500).json({ error: 'Validatie mislukt' });
  }
});

/**
 * Health check with detailed status
 */
app.get('/test/health', async (req, res) => {
  const status = {
    server: 'ok',
    timestamp: new Date().toISOString(),
    databases: {
      rag: 'unknown',
      prompts: 'unknown'
    },
    services: {
      orchestrator: 'unknown',
      conceptResolver: 'unknown',
      testEndpoints: 'ok'
    },
    testScenarios: {
      disambiguation: 'ready',
      domainDetection: 'ready',
      countHandling: 'ready',
      followUp: 'ready',
      conceptResolution: 'ready',
      educationSkills: 'ready',
      riasec: 'ready'
    }
  };

  // Check RAG database
  try {
    if (ragPool) {
      await ragPool.execute('SELECT 1');
      status.databases.rag = 'ok';
      status.services.conceptResolver = 'ok';
    }
  } catch (error) {
    status.databases.rag = 'error: ' + error.message;
  }

  // Check Prompts database
  try {
    if (promptsPool) {
      await promptsPool.execute('SELECT 1');
      status.databases.prompts = 'ok';
      status.services.orchestrator = 'ok';
    }
  } catch (error) {
    status.databases.prompts = 'error: ' + error.message;
  }

  res.json(status);
});

/**
 * Get test statistics
 */
app.get('/test/stats', async (req, res) => {
  try {
    const stats = {
      database: {
        occupations: 0,
        skills: 0,
        educations: 0,
        mboKwalificaties: 447,  // Bekend uit schema
        mboKeuzedelen: 1292,
        riasecMappings: 6
      },
      orchestrator: {
        domains: 0,
        keywords: 0,
        examples: 0
      },
      lastUpdated: new Date().toISOString()
    };

    // Get concept counts from RAG database
    if (ragPool) {
      try {
        const [occRows] = await ragPool.execute(
          'SELECT COUNT(DISTINCT occupation_uri) as count FROM occupation_labels'
        );
        stats.database.occupations = occRows[0]?.count || 0;
      } catch (e) { /* ignore */ }
    }

    // Get orchestrator stats
    if (promptsPool) {
      try {
        const [domRows] = await promptsPool.execute(
          'SELECT COUNT(*) as count FROM prompt_domains WHERE is_active = TRUE'
        );
        stats.orchestrator.domains = domRows[0]?.count || 0;

        const [kwRows] = await promptsPool.execute(
          'SELECT COUNT(*) as count FROM classification_keywords'
        );
        stats.orchestrator.keywords = kwRows[0]?.count || 0;
      } catch (e) { /* ignore */ }
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Stats ophalen mislukt' });
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate test SPARQL based on question analysis
 */
function generateTestSparql(question, chatHistory = [], domain, resolvedConcepts = {}) {
  const q = question.toLowerCase();
  let sparql = '';
  let response = '';
  let needsCount = false;
  let detectedDomain = domain;

  // SCENARIO 1 & 1a: Disambiguatie (architect)
  // Dit wordt afgehandeld door /concept/resolve, niet hier

  // SCENARIO 2 & 2a: MBO Kwalificaties (education domein + count)
  if (q.includes('mbo') && (q.includes('kwalificatie') || q.includes('toon alle'))) {
    detectedDomain = 'education';
    needsCount = true;
    sparql = `PREFIX ksmo: <https://linkeddata.competentnl.nl/sbb/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?kwalificatie ?label WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
  ?kwalificatie skos:prefLabel ?label .
}
ORDER BY ?label
LIMIT 50`;
    response = 'Er zijn 447 MBO kwalificaties gevonden. Hieronder de eerste 50 resultaten. Wil je alle resultaten zien of een specifieke zoeken?';
  }

  // SCENARIO 3: Vervolgvraag "Hoeveel zijn er?"
  else if (q.includes('hoeveel') && (q.includes('zijn er') || q.includes('er'))) {
    // Check chat history voor context
    const lastQuestion = chatHistory?.[chatHistory.length - 1]?.content?.toLowerCase() || '';
    
    if (lastQuestion.includes('mbo') || lastQuestion.includes('kwalificatie')) {
      detectedDomain = 'education';
      sparql = `PREFIX ksmo: <https://linkeddata.competentnl.nl/sbb/def/>

SELECT (COUNT(?kwalificatie) as ?count) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`;
      response = 'Er zijn 447 MBO kwalificaties in de database.';
    } else {
      sparql = `SELECT (COUNT(?item) as ?count) WHERE {
  ?item a ?type .
}`;
      response = 'Gebaseerd op de context: er zijn [aantal] items gevonden.';
    }
  }

  // SCENARIO 4: Concept resolution (vaardigheden van loodgieter)
  else if ((q.includes('vaardigheid') || q.includes('skill')) && 
           (q.includes('van') || q.includes('heeft') || q.includes('nodig'))) {
    detectedDomain = 'skill';
    const occupation = Object.values(resolvedConcepts)[0] || 
                       extractOccupationFromQuestion(question) ||
                       'Onbekend beroep';
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?occupation skos:prefLabel "${occupation}"@nl .
  ?occupation cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
}
ORDER BY ?skillLabel`;
    response = `De essentiële vaardigheden voor ${occupation} zijn:`;
  }

  // SCENARIO 5: Opleiding vaardigheden en kennisgebieden
  else if ((q.includes('opleiding') || q.includes('leer')) && 
           (q.includes('vaardig') || q.includes('kennis') || q.includes('wat'))) {
    detectedDomain = 'education';
    const eduName = extractEducationName(question);
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?edu ?eduLabel ?skill ?skillLabel ?knowledge ?knowledgeLabel WHERE {
  ?edu a cnlo:EducationalNorm .
  ?edu skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "${eduName.toLowerCase()}"))
  
  OPTIONAL {
    ?edu cnlo:prescribesHATEssential ?skill .
    ?skill skos:prefLabel ?skillLabel .
  }
  OPTIONAL {
    ?edu cnlo:prescribesKnowledgeEssential ?knowledge .
    ?knowledge skos:prefLabel ?knowledgeLabel .
  }
}
LIMIT 100`;
    response = `Bij de opleiding "${eduName}" leer je de volgende vaardigheden en kennisgebieden:`;
  }

  // SCENARIO 6: RIASEC / Hollandcode
  else if (q.includes('riasec') || q.includes('hollandcode') || 
           (q.includes('holland') && q.includes('code'))) {
    detectedDomain = 'taxonomy';
    // Extract the letter (R, I, A, S, E, C)
    const letterMatch = q.match(/\b([riasec])\b/i) || 
                        q.match(/letter\s+['"]?([riasec])['"]?/i) ||
                        q.match(/(['"]?)([riasec])\1/i);
    const letter = letterMatch ? letterMatch[1].toUpperCase() || letterMatch[2]?.toUpperCase() : 'R';
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?skill cnlo:hasRIASEC "${letter}" .
  ?skill skos:prefLabel ?skillLabel .
  ?skill a cnlo:HumanCapability .
}
ORDER BY ?skillLabel`;
    
    const riasecNames = {
      'R': 'Realistic (Praktisch)',
      'I': 'Investigative (Onderzoekend)',
      'A': 'Artistic (Artistiek)',
      'S': 'Social (Sociaal)',
      'E': 'Enterprising (Ondernemend)',
      'C': 'Conventional (Conventioneel)'
    };
    response = `Vaardigheden met RIASEC code "${letter}" - ${riasecNames[letter] || letter}:`;
  }

  // SCENARIO 7: Relatie aantallen (aggregatie)
  else if ((q.includes('relatie') || q.includes('type')) && 
           (q.includes('aantal') || q.includes('hoeveel'))) {
    detectedDomain = 'comparison';
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>

SELECT ?relationType (COUNT(DISTINCT ?skill) as ?count) WHERE {
  VALUES ?relationType { 
    cnlo:requiresHATEssential 
    cnlo:requiresHATImportant 
    cnlo:requiresHATOptional 
  }
  ?occupation ?relationType ?skill .
}
GROUP BY ?relationType
ORDER BY DESC(?count)`;
    response = 'Aantallen vaardigheden per relatietype:';
  }

  // DEFAULT: Beroepen query
  else {
    detectedDomain = detectedDomain || 'occupation';
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?occupation ?label WHERE {
  ?occupation a cnlo:Occupation .
  ?occupation skos:prefLabel ?label .
}
LIMIT 20`;
    response = 'Hier zijn enkele beroepen uit de database:';
  }

  return {
    sparql,
    response,
    needsCount,
    domain: detectedDomain,
    contextUsed: chatHistory && chatHistory.length > 0
  };
}

/**
 * Extract occupation name from question
 */
function extractOccupationFromQuestion(question) {
  const patterns = [
    /(?:van\s+(?:een\s+)?|heeft\s+(?:een\s+)?|voor\s+(?:een\s+)?|bij\s+(?:een\s+)?)([a-zéëïöüáàâäèêîôûç\-]+?)(?:\s+nodig|\s+heeft|\s+vereist|\?|$)/i,
    /(?:beroep|als)\s+([a-zéëïöüáàâäèêîôûç\-]+)/i
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1]) {
      const term = match[1].trim().toLowerCase();
      // Filter stop words
      if (!['een', 'het', 'de', 'alle', 'welke', 'wat'].includes(term)) {
        return term;
      }
    }
  }
  return null;
}

/**
 * Extract education name from question
 */
function extractEducationName(question) {
  const patterns = [
    /opleiding\s+(.+?)(?:\?|$)/i,
    /bij\s+de\s+opleiding\s+(.+?)(?:\?|$)/i,
    /kwalificatie\s+(.+?)(?:\?|$)/i
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return 'onbekend';
}

/**
 * Classify question for testing
 */
async function classifyQuestionForTest(question) {
  const q = question.toLowerCase();
  
  // Quick keyword-based classification
  const domainKeywords = {
    education: ['opleiding', 'mbo', 'hbo', 'kwalificatie', 'diploma', 'studie', 'leer'],
    skill: ['vaardigheid', 'skill', 'competentie', 'kunnen', 'nodig'],
    knowledge: ['kennis', 'kennisgebied', 'weten'],
    task: ['taak', 'taken', 'werkzaamheid'],
    comparison: ['vergelijk', 'verschil', 'overeenkomst'],
    taxonomy: ['riasec', 'hollandcode', 'taxonomie', 'classificatie']
  };

  let bestMatch = { domainKey: 'occupation', confidence: 0.3, keywords: [] };
  
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    const matches = keywords.filter(kw => q.includes(kw));
    if (matches.length > 0) {
      const confidence = Math.min(matches.length * 0.4, 1.0);
      if (confidence > bestMatch.confidence) {
        bestMatch = { domainKey: domain, confidence, keywords: matches };
      }
    }
  }

  // Try database classification if available
  if (promptsPool) {
    try {
      const [keywords] = await promptsPool.execute(`
        SELECT ck.keyword_normalized, ck.weight, ck.is_exclusive,
               pd.domain_key, pd.domain_name
        FROM classification_keywords ck
        JOIN prompt_domains pd ON ck.domain_id = pd.id
        WHERE pd.is_active = TRUE
      `);

      const scores = new Map();
      
      for (const kw of keywords) {
        if (q.includes(kw.keyword_normalized)) {
          const current = scores.get(kw.domain_key) || { 
            score: 0, name: kw.domain_name, keywords: [] 
          };
          current.score += parseFloat(kw.weight);
          current.keywords.push(kw.keyword_normalized);
          scores.set(kw.domain_key, current);
        }
      }

      const sorted = Array.from(scores.entries())
        .sort((a, b) => b[1].score - a[1].score);

      if (sorted.length > 0 && sorted[0][1].score > bestMatch.confidence) {
        bestMatch = {
          domainKey: sorted[0][0],
          domainName: sorted[0][1].name,
          confidence: Math.min(sorted[0][1].score / 2, 1.0),
          keywords: sorted[0][1].keywords
        };
      }
    } catch (e) {
      // Use fallback
    }
  }

  console.log(`[Orchestrator] Domein: ${bestMatch.domainKey} (${Math.round(bestMatch.confidence * 100)}%)`);
  
  return {
    primary: bestMatch,
    secondary: null
  };
}

/**
 * Resolve concepts for testing
 */
async function resolveConceptsForTest(question) {
  const q = question.toLowerCase();
  
  // Known test cases for disambiguation
  const disambiguationCases = {
    'architect': [
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_BOUW', prefLabel: 'Architect (bouwkunde)', matchedLabel: 'architect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_SW', prefLabel: 'Software architect', matchedLabel: 'software architect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_INT', prefLabel: 'Interieurarchitect', matchedLabel: 'interieurarchitect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_LAND', prefLabel: 'Landschapsarchitect', matchedLabel: 'landschapsarchitect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_INFO', prefLabel: 'Informatiearchitect', matchedLabel: 'informatiearchitect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_ENT', prefLabel: 'Enterprise architect', matchedLabel: 'enterprise architect' }
    ]
  };

  // Known resolutions (no disambiguation needed)
  const knownResolutions = {
    'loodgieter': 'Installatiemonteur sanitair',
    'huisarts': 'Huisarts',
    'kapper': 'Kapper',
    'programmeur': 'Softwareontwikkelaar',
    'dokter': 'Arts'
  };

  // Extract occupation term
  const occupationMatch = q.match(
    /(?:van\s+(?:een\s+)?|heeft\s+(?:een\s+)?|voor\s+(?:een\s+)?|bij\s+(?:een\s+)?)([a-zéëïöüáàâäèêîôûç\-]+?)(?:\s+nodig|\s+heeft|\s+vereist|\?|$)/i
  );

  if (!occupationMatch) {
    return { found: false, resolvedConcepts: {} };
  }

  const searchTerm = occupationMatch[1].trim().toLowerCase();
  console.log(`[Concept] Resolving occupation: "${searchTerm}"`);

  // Check for disambiguation case
  if (disambiguationCases[searchTerm]) {
    const matches = disambiguationCases[searchTerm];
    const disambiguationQuestion = `Ik vond meerdere beroepen die overeenkomen met "${searchTerm}". Welke bedoel je?\n\n` +
      matches.map((m, i) => `${i + 1}. **${m.prefLabel}**`).join('\n') +
      '\n\nTyp het nummer of de naam van je keuze.';
    
    return {
      found: true,
      needsDisambiguation: true,
      searchTerm,
      matches,
      disambiguationQuestion
    };
  }

  // Check for known resolution
  if (knownResolutions[searchTerm]) {
    console.log(`[Concept] Resolved: "${searchTerm}" -> "${knownResolutions[searchTerm]}"`);
    return {
      found: true,
      needsDisambiguation: false,
      searchTerm,
      resolvedConcepts: {
        [searchTerm]: knownResolutions[searchTerm]
      },
      matches: [{
        uri: `https://linkeddata.competentnl.nl/uwv/id/occupation/${searchTerm.toUpperCase()}`,
        prefLabel: knownResolutions[searchTerm],
        matchedLabel: searchTerm,
        matchType: 'synonym',
        confidence: 0.95
      }]
    };
  }

  // Try database lookup
  if (ragPool) {
    try {
      const [rows] = await ragPool.execute(`
        SELECT DISTINCT 
          occupation_uri as uri,
          pref_label as prefLabel,
          label as matchedLabel,
          CASE 
            WHEN label_normalized = ? THEN 'exact'
            WHEN label_normalized LIKE ? THEN 'contains'
            ELSE 'fuzzy'
          END as matchType
        FROM occupation_labels
        WHERE label_normalized LIKE ?
           OR label_normalized SOUNDS LIKE ?
        ORDER BY 
          CASE WHEN label_normalized = ? THEN 1 
               WHEN label_normalized LIKE ? THEN 2 
               ELSE 3 END
        LIMIT 10
      `, [searchTerm, `${searchTerm}%`, `%${searchTerm}%`, searchTerm, searchTerm, `${searchTerm}%`]);

      if (rows.length === 0) {
        return { found: false, searchTerm, resolvedConcepts: {} };
      }

      if (rows.length > 5) {
        // Need disambiguation
        return {
          found: true,
          needsDisambiguation: true,
          searchTerm,
          matches: rows.slice(0, 10),
          disambiguationQuestion: `Ik vond ${rows.length} beroepen die overeenkomen met "${searchTerm}". Welke bedoel je?\n\n` +
            rows.slice(0, 5).map((m, i) => `${i + 1}. **${m.prefLabel}**`).join('\n')
        };
      }

      // Single match
      return {
        found: true,
        needsDisambiguation: false,
        searchTerm,
        resolvedConcepts: {
          [searchTerm]: rows[0].prefLabel
        },
        matches: rows
      };
    } catch (e) {
      console.warn('[Concept] Database lookup failed:', e.message);
    }
  }

  // Default: not found
  return { found: false, searchTerm, resolvedConcepts: {} };
}

/**
 * Validate SPARQL syntax
 */
function validateSparqlSyntax(sparql) {
  const errors = [];
  const warnings = [];

  if (!sparql || sparql.trim() === '') {
    return { valid: false, errors: ['Query is leeg'], warnings: [] };
  }

  // Check for SELECT/ASK/CONSTRUCT
  if (!/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i.test(sparql)) {
    errors.push('Query mist SELECT, ASK, CONSTRUCT, of DESCRIBE');
  }

  // Check for WHERE clause
  if (/\bSELECT\b/i.test(sparql) && !/\bWHERE\b/i.test(sparql)) {
    errors.push('SELECT query mist WHERE clause');
  }

  // Check bracket balance
  const openBrackets = (sparql.match(/{/g) || []).length;
  const closeBrackets = (sparql.match(/}/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push(`Ongebalanceerde brackets: ${openBrackets} open, ${closeBrackets} close`);
  }

  // Check for common prefixes
  const usedPrefixes = sparql.match(/\b(cnlo|ksmo|skos|rdf|rdfs):/g) || [];
  const declaredPrefixes = sparql.match(/PREFIX\s+(\w+):/gi) || [];

  usedPrefixes.forEach(prefix => {
    const prefixName = prefix.replace(':', '');
    const isDeclared = declaredPrefixes.some(p => 
      p.toLowerCase().includes(prefixName.toLowerCase())
    );
    if (!isDeclared) {
      warnings.push(`Prefix "${prefixName}" wordt gebruikt maar niet gedeclareerd`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sparql: sparql.trim()
  };
}
