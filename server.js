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
