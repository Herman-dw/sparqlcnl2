/**
 * CompetentNL Backend Server - v2.0.0
 * ====================================
 * Features:
 * - SPARQL proxy
 * - RAG examples
 * - Generieke Concept Resolver met disambiguatie
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
// DATABASE CONNECTION POOL
// =====================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'competentnl_rag',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

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
  res.json({ status: 'ok', version: '2.0.0', message: 'CompetentNL Server with Disambiguation' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
      'User-Agent': 'CompetentNL-AI-Agent/2.0'
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
// GENERIC CONCEPT RESOLVER
// =====================================================

/**
 * POST /concept/resolve
 * Resolve a search term to official concept(s)
 * Body: { searchTerm: string, conceptType: string }
 */
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
    const [exactRows] = await pool.execute(`
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
      const [synRows] = await pool.execute(`
        SELECT concept_uri as uri, pref_label as prefLabel, synonym as matchedLabel,
               'synonym' as matchType, confidence
        FROM concept_synonyms
        WHERE synonym_normalized = ? AND concept_type = ?
        ORDER BY confidence DESC
        LIMIT 10
      `, [normalized, conceptType]);
      
      matches.push(...synRows);
    }
    
    // 3. Contains match (starts with, ends with, contains)
    if (matches.length === 0) {
      const [containsRows] = await pool.execute(`
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
        const [ftRows] = await pool.execute(`
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
    
    // Deduplicate by URI, keeping best match
    const uniqueMatches = [];
    const seenUris = new Set();
    for (const match of matches) {
      if (!seenUris.has(match.uri)) {
        seenUris.add(match.uri);
        uniqueMatches.push({
          ...match,
          conceptType
        });
      }
    }
    
    // Determine if disambiguation is needed
    const needsDisambiguation = uniqueMatches.length > config.disambiguationThreshold;
    const hasExactMatch = uniqueMatches.some(m => m.matchType === 'exact');
    
    // Generate disambiguation question if needed
    let disambiguationQuestion = null;
    if (needsDisambiguation && !hasExactMatch) {
      disambiguationQuestion = generateDisambiguationQuestion(searchTerm, uniqueMatches, conceptType);
    }
    
    // Log the search
    try {
      await pool.execute(`
        INSERT INTO concept_search_log 
        (search_term, search_term_normalized, concept_type, found_exact, found_fuzzy, 
         results_count, disambiguation_shown)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        searchTerm, 
        normalized, 
        conceptType,
        hasExactMatch,
        uniqueMatches.length > 0 && !hasExactMatch,
        uniqueMatches.length,
        needsDisambiguation && !hasExactMatch
      ]);
    } catch (e) { /* ignore logging errors */ }
    
    const result = {
      found: uniqueMatches.length > 0,
      exact: hasExactMatch,
      searchTerm,
      conceptType,
      matches: uniqueMatches.slice(0, 20),
      needsDisambiguation: needsDisambiguation && !hasExactMatch,
      disambiguationQuestion,
      suggestion: uniqueMatches.length === 0 
        ? `Geen ${config.dutchNamePlural} gevonden voor "${searchTerm}". Probeer een andere zoekterm.`
        : null
    };
    
    console.log(`[Concept] Found ${uniqueMatches.length} matches, disambiguation: ${result.needsDisambiguation}`);
    res.json(result);
    
  } catch (error) {
    console.error('[Concept] Error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

/**
 * POST /concept/confirm
 * Confirm a user's selection (for learning)
 */
app.post('/concept/confirm', async (req, res) => {
  const { searchTerm, selectedUri, selectedLabel, conceptType = 'occupation', sessionId } = req.body;
  
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
    await pool.execute(`
      UPDATE ${config.table}
      SET usage_count = usage_count + 1, last_used = NOW()
      WHERE ${config.uriColumn} = ?
    `, [selectedUri]);
    
    // Add as synonym if it's a new mapping
    const [existing] = await pool.execute(`
      SELECT id FROM concept_synonyms 
      WHERE synonym_normalized = ? AND concept_type = ?
    `, [normalized, conceptType]);
    
    if (existing.length === 0) {
      await pool.execute(`
        INSERT INTO concept_synonyms 
        (synonym, synonym_normalized, concept_uri, pref_label, concept_type, added_by, confidence)
        VALUES (?, ?, ?, ?, ?, 'user_selection', 0.85)
      `, [searchTerm, normalized, selectedUri, selectedLabel, conceptType]);
      
      console.log(`[Concept] Added new synonym: "${searchTerm}" -> "${selectedLabel}"`);
    }
    
    // Log the confirmation
    await pool.execute(`
      UPDATE concept_search_log 
      SET selected_concept_uri = ?, selected_label = ?, user_confirmed = TRUE
      WHERE search_term_normalized = ? AND concept_type = ?
      ORDER BY created_at DESC LIMIT 1
    `, [selectedUri, selectedLabel, normalized, conceptType]);
    
    res.json({ success: true, message: 'Selectie opgeslagen' });
    
  } catch (error) {
    console.error('[Concept] Confirm error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

/**
 * GET /concept/suggest
 * Autocomplete suggestions
 */
app.get('/concept/suggest', async (req, res) => {
  const { q, type = 'occupation', limit = 10 } = req.query;
  
  if (!q || q.length < 2) {
    return res.json([]);
  }
  
  const config = CONCEPT_TYPES[type];
  if (!config) {
    return res.status(400).json({ error: `Onbekend conceptType: ${type}` });
  }
  
  const normalized = normalizeText(q);
  
  try {
    const [rows] = await pool.execute(`
      SELECT DISTINCT label, pref_label as prefLabel, ${config.uriColumn} as uri
      FROM ${config.table}
      WHERE label_normalized LIKE ?
      ORDER BY 
        CASE WHEN label_normalized = ? THEN 0
             WHEN label_normalized LIKE ? THEN 1
             ELSE 2 END,
        usage_count DESC,
        label
      LIMIT ?
    `, [`%${normalized}%`, normalized, `${normalized}%`, parseInt(limit)]);
    
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /concept/parse-selection
 * Parse a user's answer to a disambiguation question
 */
app.post('/concept/parse-selection', async (req, res) => {
  const { answer, options } = req.body;
  
  if (!answer || !options || !Array.isArray(options)) {
    return res.status(400).json({ error: 'answer en options zijn verplicht' });
  }
  
  const trimmed = answer.trim();
  
  // Check if it's a number
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    return res.json({ 
      found: true, 
      selection: options[num - 1],
      matchedBy: 'number'
    });
  }
  
  // Check if it matches a name
  const answerLower = trimmed.toLowerCase();
  for (const option of options) {
    if (option.prefLabel.toLowerCase() === answerLower ||
        option.prefLabel.toLowerCase().includes(answerLower) ||
        option.matchedLabel.toLowerCase() === answerLower) {
      return res.json({ 
        found: true, 
        selection: option,
        matchedBy: 'name'
      });
    }
  }
  
  res.json({ 
    found: false, 
    message: 'Geen match gevonden. Typ een nummer of een (deel van de) naam.' 
  });
});

/**
 * GET /concept/stats
 * Statistics for all concept types
 */
app.get('/concept/stats', async (req, res) => {
  try {
    const stats = {};
    
    for (const [type, config] of Object.entries(CONCEPT_TYPES)) {
      try {
        const [countRows] = await pool.execute(`
          SELECT 
            COUNT(*) as total_labels,
            COUNT(DISTINCT ${config.uriColumn}) as unique_concepts,
            SUM(CASE WHEN label_type = 'prefLabel' THEN 1 ELSE 0 END) as pref_labels,
            SUM(CASE WHEN label_type = 'altLabel' THEN 1 ELSE 0 END) as alt_labels
          FROM ${config.table}
        `);
        
        stats[type] = countRows[0];
      } catch (e) {
        stats[type] = { error: 'Table not found' };
      }
    }
    
    // Synonyms count
    const [synRows] = await pool.execute(`
      SELECT concept_type, COUNT(*) as count
      FROM concept_synonyms
      GROUP BY concept_type
    `);
    
    stats.synonyms = {};
    for (const row of synRows) {
      stats.synonyms[row.concept_type] = row.count;
    }
    
    // Recent searches
    const [searchRows] = await pool.execute(`
      SELECT concept_type, COUNT(*) as searches, 
             SUM(CASE WHEN disambiguation_shown THEN 1 ELSE 0 END) as disambiguations
      FROM concept_search_log
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY concept_type
    `);
    
    stats.recent_searches = {};
    for (const row of searchRows) {
      stats.recent_searches[row.concept_type] = {
        total: row.searches,
        disambiguations: row.disambiguations
      };
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// =====================================================
// LEGACY OCCUPATION ENDPOINTS (backwards compatibility)
// =====================================================
app.post('/occupation/resolve', async (req, res) => {
  req.body.conceptType = 'occupation';
  // Forward to generic endpoint
  const response = await fetch(`http://${HOST}:${PORT}/concept/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.status(response.status).json(data);
});

app.get('/occupation/suggest', async (req, res) => {
  req.query.type = 'occupation';
  const response = await fetch(`http://${HOST}:${PORT}/concept/suggest?q=${req.query.q}&type=occupation&limit=${req.query.limit || 10}`);
  const data = await response.json();
  res.json(data);
});

app.post('/occupation/confirm', async (req, res) => {
  req.body.conceptType = 'occupation';
  const response = await fetch(`http://${HOST}:${PORT}/concept/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.status(response.status).json(data);
});

app.get('/occupation/stats', async (req, res) => {
  // Return just occupation stats for backwards compatibility
  try {
    const [rows] = await pool.execute(`
      SELECT 
        COUNT(*) as total_labels,
        COUNT(DISTINCT occupation_uri) as unique_occupations,
        SUM(CASE WHEN label_type = 'prefLabel' THEN 1 ELSE 0 END) as pref_labels,
        SUM(CASE WHEN label_type = 'altLabel' THEN 1 ELSE 0 END) as alt_labels
      FROM occupation_labels
    `);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// =====================================================
// RAG ENDPOINTS
// =====================================================
app.get('/rag/examples', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const [rows] = await pool.execute(`
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
    await pool.execute(`
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
    await pool.execute(`
      UPDATE query_logs SET feedback_rating = ?, feedback_comment = ? WHERE id = ?
    `, [rating, comment, logId]);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, HOST, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║  CompetentNL Server v2.0.0 - Met Disambiguatie        ║
  ╠═══════════════════════════════════════════════════════╣
  ║  Host:     ${HOST}                                    ║
  ║  Port:     ${PORT}                                    ║
  ║  URL:      http://${HOST}:${PORT}                     ║
  ╠═══════════════════════════════════════════════════════╣
  ║  Endpoints:                                           ║
  ║  • POST /concept/resolve    - Resolve any concept     ║
  ║  • POST /concept/confirm    - Confirm selection       ║
  ║  • GET  /concept/suggest    - Autocomplete            ║
  ║  • POST /concept/parse-selection - Parse user answer  ║
  ║  • GET  /concept/stats      - Statistics              ║
  ║  • POST /proxy/sparql       - SPARQL proxy            ║
  ╠═══════════════════════════════════════════════════════╣
  ║  Concept Types: occupation, education, capability,    ║
  ║                 knowledge, task, workingCondition     ║
  ╚═══════════════════════════════════════════════════════╝
  `);
});
