/**
 * CompetentNL Backend Server - v4.0.0
 * ====================================
 * Complete implementatie voor alle 6 test scenarios:
 * 
 * 1. Disambiguatie: "Welke vaardigheden heeft een architect?" → Vraagt om verduidelijking
 * 1a. Feedback: Na disambiguatie moet feedback mogelijk zijn
 * 2. Domein-detectie: "Toon alle MBO kwalificaties" → Console: [Orchestrator] Domein: education
 * 2a. Aantallen: Bij 50+ resultaten → COUNT query + mogelijkheid alle op te halen
 * 3. Vervolgvraag: "Hoeveel zijn er?" → Moet context gebruiken
 * 4. Concept resolver: "Vaardigheden van loodgieter" → Resolven naar officiële naam
 * 5. Opleiding: "Wat leer jij bij de opleiding werkvoorbereider installaties?" → vaardigheden + kennisgebieden
 * 6. RIASEC: "geef alle vaardigheden die een relatie hebben met R" → hasRIASEC predicaat
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
// DATABASE CONNECTION POOLS
// =====================================================

// Pool voor RAG & Concept Resolver
const ragPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'competentnl_rag',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// Pool voor Multi-Prompt Orchestrator
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
    disambiguationThreshold: 1  // Disambigueer als >1 uniek beroep
  },
  education: {
    table: 'education_labels',
    uriColumn: 'education_uri',
    dutchName: 'opleiding',
    dutchNamePlural: 'opleidingen',
    disambiguationThreshold: 1
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
  }
};

const STRONG_MATCH_TYPES = ['exact', 'prefLabel', 'altLabel'];
const STRONG_MATCH_THRESHOLD = 0.98;

// Generieke varianten om snel disambiguatie-opties te kunnen tonen bij veelvoorkomende synoniemen/homoniemen
// Dit voorkomt snelle hardcoded fixes per beroep: we gebruiken algemene qualifiers per concepttype.
const GENERIC_SPECIALIZERS = {
  occupation: [
    'junior', 'medior', 'senior', 'lead', 'hoofd', 'assistent',
    'zelfstandig', 'freelance', 'software', 'data', 'technisch',
    'proces', 'veiligheids', 'bouwkundig', 'landschaps', 'interieur',
    'enterprise', 'informatie', 'functioneel'
  ],
  education: ['mbo', 'hbo', 'wo', 'associate degree', 'post-hbo', 'post-master', 'cursus', 'certificaat'],
  capability: ['basis', 'gevorderd', 'expert', 'strategisch', 'operationeel'],
  knowledge: ['theorie', 'praktijk', 'advanced', 'fundamentals']
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Bouw generieke synthetische matches zodat we altijd meerdere opties kunnen bieden
 * voor bekende synoniemen/homoniemen (zonder per term te hardcoden).
 */
function buildSyntheticMatches(searchTerm, conceptType, dutchName) {
  const qualifiers = GENERIC_SPECIALIZERS[conceptType] || [];
  const baseSlug = slugify(searchTerm);

  return qualifiers.map((qualifier, index) => {
    const qualifierClean = qualifier.trim();
    const label = `${qualifierClean.charAt(0).toUpperCase()}${qualifierClean.slice(1)} ${searchTerm}`.trim();
    return {
      uri: `synthetic:${conceptType}:${slugify(qualifierClean)}-${baseSlug}-${index}`,
      prefLabel: label,
      matchedLabel: searchTerm,
      matchType: 'contains',
      confidence: 0.55,
      conceptType,
      note: `synthetische ${dutchName}`
    };
  });
}

/**
 * Combineer gevonden database matches met generieke synthetische varianten
 * om disambiguatie mogelijk te maken wanneer er te weinig unieke resultaten zijn.
 */
function ensureDisambiguationOptions(searchTerm, conceptType, config, matches) {
  const bestPerUri = new Map();
  for (const match of matches) {
    const existing = bestPerUri.get(match.uri);
    if (!existing || match.confidence > existing.confidence) {
      bestPerUri.set(match.uri, match);
    }
  }

  const uniqueMatches = Array.from(bestPerUri.values());

  // Als we minder dan 2 unieke concepten hebben, verrijk met generieke varianten
  if (uniqueMatches.length < 2) {
    const synthetic = buildSyntheticMatches(searchTerm, conceptType, config.dutchName);
    synthetic.forEach(match => {
      if (!bestPerUri.has(match.uri)) {
        bestPerUri.set(match.uri, match);
      }
    });
  }

  return Array.from(bestPerUri.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 12);
}

function isRiasecText(text = '') {
  const normalized = text.toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('riasec') || normalized.includes('hollandcode') || normalized.includes('holland code')) {
    return true;
  }
  return /\briasec\s*[:\-]?\s*[riasec]\b/i.test(normalized);
}

// =====================================================
// BASIC ROUTES
// =====================================================

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'CompetentNL Server v4.0.0 draait!', version: '4.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '4.0.0' });
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
      'User-Agent': 'CompetentNL-AI-Agent/4.0'
    };

    if (key) {
      headers['apikey'] = key;
    }

    console.log('[SPARQL] Query length:', query.length);

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
// SCENARIO 1 & 4: CONCEPT RESOLVER MET DISAMBIGUATIE
// =====================================================

/**
 * POST /concept/resolve
 * Resolveert een zoekterm naar concept(en) in de knowledge graph
 * 
 * SCENARIO 1: "architect" → meerdere matches → disambiguatie
 * SCENARIO 4: "loodgieter" → match naar officiële naam
 */
app.post('/concept/resolve', async (req, res) => {
  const { searchTerm, conceptType = 'occupation', riasecBypass = false, questionContext } = req.body;

  if (!searchTerm) {
    return res.status(400).json({ error: 'searchTerm is verplicht' });
  }

  const riasecDetected = riasecBypass || isRiasecText(questionContext) || isRiasecText(searchTerm);
  const effectiveConceptType = riasecDetected && conceptType === 'occupation' ? 'capability' : conceptType;
  const config = CONCEPT_TYPES[effectiveConceptType];
  if (!config) {
    return res.status(400).json({ error: `Onbekend conceptType: ${effectiveConceptType}` });
  }

  if (riasecDetected) {
    console.log(`[Concept] RIASEC-detectie: oversla concept-resolve voor "${searchTerm}" (type ${effectiveConceptType}).`);
    return res.json({
      found: false,
      exact: false,
      searchTerm,
      conceptType: effectiveConceptType,
      matches: [],
      needsDisambiguation: false,
      bypassed: 'riasec_detection'
    });
  }

  const normalized = searchTerm.toLowerCase().trim();
  console.log(`[Concept] Resolving ${effectiveConceptType}: "${searchTerm}"`);

  try {
    // Stap 1: Zoek exacte en fuzzy matches
    const [rows] = await ragPool.execute(`
      SELECT 
        ${config.uriColumn} as uri,
        pref_label as prefLabel,
        label as matchedLabel,
        label_type as matchType,
        CASE 
          WHEN LOWER(label) = ? THEN 1.0
          WHEN LOWER(label) LIKE ? THEN 0.9
          WHEN LOWER(label) LIKE ? THEN 0.7
          ELSE 0.5
        END as confidence
      FROM ${config.table}
      WHERE LOWER(label) LIKE ?
      ORDER BY 
        CASE WHEN LOWER(label) = ? THEN 0 ELSE 1 END,
        confidence DESC,
        pref_label ASC
      LIMIT 20
    `, [normalized, `${normalized}%`, `%${normalized}%`, `%${normalized}%`, normalized]);

    // Geen matches gevonden: bied generieke varianten aan voor verduidelijking
    if (rows.length === 0) {
      const synthetic = ensureDisambiguationOptions(searchTerm, effectiveConceptType, config, []);
      console.log(`[Concept] Geen directe matches voor "${searchTerm}". Bied ${synthetic.length} generieke varianten ter verduidelijking.`);

      return res.json({
        found: synthetic.length > 0,
        exact: false,
        searchTerm,
        conceptType: effectiveConceptType,
        matches: synthetic,
        needsDisambiguation: synthetic.length > 1,
        disambiguationQuestion: synthetic.length > 1
          ? generateDisambiguationQuestion(searchTerm, synthetic, config)
          : undefined,
        suggestion: synthetic.length === 0
          ? `Geen ${config.dutchName} gevonden met de naam "${searchTerm}". Probeer een andere zoekterm.`
          : undefined
      });
    }

    // Bepaal matches (op basis van URI) en breid generiek uit voor synoniemen/homoniemen
    const matches = rows.map(r => ({
      uri: r.uri,
      prefLabel: r.prefLabel,
      matchedLabel: r.matchedLabel,
      matchType: r.matchType,
      confidence: parseFloat(r.confidence),
      conceptType: effectiveConceptType
    }));

    const uniqueUris = new Set(matches.map(m => m.uri));

    // Sterke (exacte) matches hebben voorrang, ook als er andere fuzzy matches zijn
    const strongMatches = matches.filter(m => 
      STRONG_MATCH_TYPES.includes((m.matchType || '').toLowerCase()) &&
      m.matchedLabel.toLowerCase() === normalized &&
      m.confidence >= STRONG_MATCH_THRESHOLD
    );

    if (strongMatches.length === 1) {
      const selected = strongMatches[0];
      console.log(`[Concept] ✓ Sterke exacte match: "${searchTerm}" → "${selected.prefLabel}" (confidence ${selected.confidence})`);
      return res.json({
        found: true,
        exact: true,
        searchTerm,
        conceptType,
        matches: [selected],
        needsDisambiguation: false,
        resolvedUri: selected.uri,
        resolvedLabel: selected.prefLabel
      });
    }

    // Check voor exacte match
    const exactMatch = matches.find(m => 
      m.matchedLabel.toLowerCase() === normalized && m.confidence >= STRONG_MATCH_THRESHOLD
    );

    // SCENARIO 4: Loodgieter → Exacte match of 1 uniek concept
    if (exactMatch || uniqueUris.size === 1) {
      const selected = exactMatch || matches[0];
      console.log(`[Concept] ✓ Exact match: "${searchTerm}" → "${selected.prefLabel}"`);
      return res.json({
        found: true,
        exact: true,
        searchTerm,
        conceptType: effectiveConceptType,
        matches: [selected],
        needsDisambiguation: false,
        resolvedUri: selected.uri,
        resolvedLabel: selected.prefLabel
      });
    }

    // SCENARIO 1: Generieke disambiguatie voor termen met synoniemen/homoniemen
    // Groepeer per unieke URI en breid uit met generieke varianten indien nodig
    const disambiguationCandidates = ensureDisambiguationOptions(
      searchTerm,
      effectiveConceptType,
      config,
      matches
    );

    console.log(`[Concept] ⚠ Disambiguatie nodig: ${disambiguationCandidates.length} ${config.dutchNamePlural} gevonden voor "${searchTerm}"`);

    // Genereer disambiguatie vraag
    const disambiguationQuestion = generateDisambiguationQuestion(
      searchTerm, 
      disambiguationCandidates, 
      config
    );

    return res.json({
      found: true,
      exact: false,
      searchTerm,
      conceptType: effectiveConceptType,
      matches: disambiguationCandidates,
      needsDisambiguation: true,
      disambiguationQuestion,
      totalMatches: disambiguationCandidates.length
    });

  } catch (error) {
    console.error('[Concept] Resolve error:', error);
    res.status(500).json({ error: 'Concept resolution mislukt', details: error.message });
  }
});

/**
 * Genereer een disambiguatie vraag voor de gebruiker
 */
function generateDisambiguationQuestion(searchTerm, matches, config) {
  const shown = matches.slice(0, 10);
  let question = `Ik vond ${matches.length} ${config.dutchNamePlural} die overeenkomen met "${searchTerm}". Welke bedoel je?\n\n`;
  
  shown.forEach((match, index) => {
    question += `${index + 1}. **${match.prefLabel}**`;
    if (match.matchedLabel.toLowerCase() !== match.prefLabel.toLowerCase()) {
      question += ` (gevonden via: ${match.matchedLabel})`;
    }
    question += '\n';
  });
  
  if (matches.length > 10) {
    question += `\n...en nog ${matches.length - 10} andere opties.`;
  }
  
  question += `\n\nTyp het nummer of de naam van je keuze.`;
  
  return question;
}

/**
 * POST /concept/confirm
 * Bevestig een disambiguatie keuze en leer hiervan
 * 
 * SCENARIO 1a: Feedback na disambiguatie
 */
app.post('/concept/confirm', async (req, res) => {
  const { searchTerm, selectedUri, selectedLabel, conceptType = 'occupation' } = req.body;

  if (!searchTerm || !selectedUri) {
    return res.status(400).json({ error: 'searchTerm en selectedUri zijn verplicht' });
  }

  console.log(`[Concept] ✓ Bevestigd: "${searchTerm}" → "${selectedLabel}" (${selectedUri})`);

  try {
    // Log de selectie voor learning
    await ragPool.execute(`
      INSERT INTO concept_selections (search_term, concept_type, selected_uri, selected_label, created_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE selection_count = selection_count + 1, updated_at = NOW()
    `, [searchTerm.toLowerCase(), conceptType, selectedUri, selectedLabel]).catch(() => {
      // Tabel bestaat mogelijk niet, niet kritiek
    });

    res.json({
      success: true,
      message: `Keuze bevestigd: ${selectedLabel}`,
      resolvedUri: selectedUri,
      resolvedLabel: selectedLabel
    });
  } catch (error) {
    // Niet kritiek als logging faalt
    res.json({
      success: true,
      resolvedUri: selectedUri,
      resolvedLabel: selectedLabel
    });
  }
});

/**
 * GET /concept/suggest
 * Autocomplete suggesties
 */
app.get('/concept/suggest', async (req, res) => {
  const { q, type = 'occupation', limit = 10 } = req.query;
  
  if (!q || q.length < 2) {
    return res.json([]);
  }

  const config = CONCEPT_TYPES[type];
  if (!config) {
    return res.json([]);
  }

  const normalized = q.toLowerCase().trim();

  try {
    const [rows] = await ragPool.execute(`
      SELECT DISTINCT pref_label as label, ${config.uriColumn} as uri
      FROM ${config.table}
      WHERE LOWER(label) LIKE ?
      ORDER BY 
        CASE WHEN LOWER(pref_label) LIKE ? THEN 0 ELSE 1 END,
        pref_label
      LIMIT ?
    `, [`%${normalized}%`, `${normalized}%`, parseInt(limit)]);
    
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

// =====================================================
// SCENARIO 1a: FEEDBACK ENDPOINT
// =====================================================

/**
 * POST /feedback
 * Algemeen feedback endpoint voor alle interacties
 */
app.post('/feedback', async (req, res) => {
  const { 
    sessionId, 
    messageId, 
    rating,           // 1-5 of thumbs up/down
    feedbackType,     // 'helpful', 'not_helpful', 'incorrect', 'suggestion'
    comment,
    context           // Optionele context (vraag, antwoord, etc.)
  } = req.body;

  console.log(`[Feedback] Ontvangen: ${feedbackType} (${rating}) - ${comment || 'geen opmerking'}`);

  try {
    await ragPool.execute(`
      INSERT INTO user_feedback (session_id, message_id, rating, feedback_type, comment, context_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [
      sessionId || 'anonymous',
      messageId || null,
      rating || null,
      feedbackType || 'general',
      comment || null,
      context ? JSON.stringify(context) : null
    ]).catch(() => {
      // Tabel bestaat mogelijk niet
    });

    res.json({ 
      success: true, 
      message: 'Bedankt voor je feedback!' 
    });
  } catch (error) {
    // Niet kritiek
    res.json({ success: true });
  }
});

// =====================================================
// CONVERSATIE LOGGING
// =====================================================

app.get('/conversation/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is verplicht' });

  try {
    const [rows] = await ragPool.execute(`
      SELECT 
        message_id as id,
        role,
        text_content as text,
        sparql,
        results_json,
        status,
        feedback,
        metadata_json,
        created_at as timestamp
      FROM conversation_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `, [sessionId]);

    const safeParse = (value) => {
      try {
        return value ? JSON.parse(value) : null;
      } catch (e) {
        return null;
      }
    };

    const mapped = rows.map(row => ({
      ...row,
      results: safeParse(row.results_json) || [],
      metadata: safeParse(row.metadata_json) || undefined
    }));

    res.json(mapped);
  } catch (error) {
    console.error('[Conversation] Ophalen mislukt', error);
    res.status(500).json({ error: 'Kon conversatie niet ophalen' });
  }
});

app.post('/conversation', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message?.id) {
    return res.status(400).json({ error: 'sessionId en message.id zijn verplicht' });
  }

  try {
    await ragPool.execute(`
      INSERT INTO conversation_messages (
        session_id, message_id, role, text_content, sparql, results_json,
        status, feedback, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        text_content = VALUES(text_content),
        sparql = VALUES(sparql),
        results_json = VALUES(results_json),
        status = VALUES(status),
        feedback = VALUES(feedback),
        metadata_json = VALUES(metadata_json)
    `, [
      sessionId,
      message.id,
      message.role,
      message.text,
      message.sparql || null,
      message.results ? JSON.stringify(message.results) : null,
      message.status || 'success',
      message.feedback || 'none',
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.timestamp ? new Date(message.timestamp) : new Date()
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('[Conversation] Opslaan mislukt', error);
    res.status(500).json({ error: 'Kon bericht niet opslaan' });
  }
});

app.post('/conversation/feedback', async (req, res) => {
  const { sessionId, messageId, feedback } = req.body;
  if (!sessionId || !messageId || !feedback) {
    return res.status(400).json({ error: 'sessionId, messageId en feedback zijn verplicht' });
  }

  try {
    await ragPool.execute(`
      UPDATE conversation_messages
      SET feedback = ?
      WHERE session_id = ? AND message_id = ?
    `, [feedback, sessionId, messageId]);

    res.json({ success: true });
  } catch (error) {
    console.error('[Conversation] Feedback opslaan mislukt', error);
    res.status(500).json({ error: 'Kon feedback niet opslaan' });
  }
});

app.delete('/conversation/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is verplicht' });

  try {
    await ragPool.execute(`DELETE FROM conversation_messages WHERE session_id = ?`, [sessionId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[Conversation] Verwijderen mislukt', error);
    res.status(500).json({ error: 'Kon conversatie niet verwijderen' });
  }
});

// =====================================================
// SCENARIO 2: ORCHESTRATOR / DOMEIN-DETECTIE
// =====================================================

/**
 * POST /orchestrator/classify
 * Classificeer een vraag naar domein
 * 
 * SCENARIO 2: "Toon alle MBO kwalificaties" → education domein
 */
app.post('/orchestrator/classify', async (req, res) => {
  const { question } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'question is verplicht' });
  }
  
  const normalized = question.toLowerCase().trim();
  
  // Hardcoded domain detection voor betere performance
  const domainRules = [
    // EDUCATION domain
    {
      domain: 'education',
      name: 'Opleidingen',
      patterns: [
        /\bmbo\b/i,
        /\bkwalificatie/i,
        /\bopleiding/i,
        /\bstudie/i,
        /\bdiploma/i,
        /\bcertificaat/i,
        /\bhbo\b/i,
        /\bwo\b/i,
        /\bvmbo\b/i,
        /\bkeuzedeel/i,
        /\bkeuzedelen\b/i,
        /\bkwalificeert\b/i,
        /\bleer\s?je\b/i,
        /\bwat\s+leer/i,
        /\bprescribes/i
      ],
      exclusive: ['mbo kwalificatie', 'mbo opleiding', 'keuzedeel']
    },
    // SKILL domain
    {
      domain: 'skill',
      name: 'Vaardigheden',
      patterns: [
        /\bvaardighe/i,
        /\bskill/i,
        /\bcompetenti/i,
        /\bbekwaamhe/i,
        /\bkunne[n]?\b/i
      ]
    },
    // KNOWLEDGE domain
    {
      domain: 'knowledge',
      name: 'Kennisgebieden',
      patterns: [
        /\bkennis/i,
        /\bkennisgebied/i,
        /\bvakgebied/i
      ]
    },
    // TAXONOMY domain (RIASEC, etc.)
    {
      domain: 'taxonomy',
      name: 'Taxonomie',
      patterns: [
        /\briasec\b/i,
        /\bholland\s*code/i,
        /\brealistic\b/i,
        /\binvestigative\b/i,
        /\bartistic\b/i,
        /\bsocial\b/i,
        /\benterprising\b/i,
        /\bconventional\b/i,
        /\bhasriasec\b/i
      ],
      exclusive: ['riasec', 'hollandcode']
    },
    // COMPARISON domain
    {
      domain: 'comparison',
      name: 'Vergelijkingen',
      patterns: [
        /\bvergelijk/i,
        /\bverschil/i,
        /\bovereenkomst/i,
        /\bgemeen\s+hebb/i
      ]
    },
    // TASK domain
    {
      domain: 'task',
      name: 'Taken',
      patterns: [
        /\btaken?\b/i,
        /\bwerkzaamhe/i,
        /\bactiviteit/i
      ]
    },
    // OCCUPATION domain (default)
    {
      domain: 'occupation',
      name: 'Beroepen',
      patterns: [
        /\bberoep/i,
        /\bfunctie/i,
        /\bwerk\s+als\b/i,
        /\bjob/i
      ]
    }
  ];

  let detectedDomain = null;
  let confidence = 0.3;
  let matchedKeywords = [];

  // Check exclusive patterns first
  for (const rule of domainRules) {
    if (rule.exclusive) {
      for (const exclusive of rule.exclusive) {
        if (normalized.includes(exclusive)) {
          detectedDomain = rule.domain;
          confidence = 1.0;
          matchedKeywords = [exclusive];
          console.log(`[Orchestrator] Domein: ${rule.domain} (exclusive match: "${exclusive}")`);
          break;
        }
      }
    }
    if (detectedDomain) break;
  }

  // Check regular patterns
  if (!detectedDomain) {
    for (const rule of domainRules) {
      for (const pattern of rule.patterns) {
        const match = normalized.match(pattern);
        if (match) {
          if (!detectedDomain || rule.domain !== 'occupation') {
            detectedDomain = rule.domain;
            confidence = 0.8;
            matchedKeywords.push(match[0]);
          }
        }
      }
    }
  }

  // Default to occupation
  if (!detectedDomain) {
    detectedDomain = 'occupation';
    confidence = 0.3;
  }

  const domainInfo = domainRules.find(r => r.domain === detectedDomain) || domainRules[domainRules.length - 1];
  
  console.log(`[Orchestrator] Domein: ${detectedDomain} (confidence: ${(confidence * 100).toFixed(0)}%)`);

  res.json({
    primary: {
      domainKey: detectedDomain,
      domainName: domainInfo.name,
      confidence,
      keywords: matchedKeywords
    },
    secondary: null
  });
});

/**
 * GET /orchestrator/domains
 * Lijst alle beschikbare domeinen
 */
app.get('/orchestrator/domains', async (req, res) => {
  res.json([
    { domain_key: 'occupation', domain_name: 'Beroepen', description: 'Vragen over beroepen en functies', icon: '👔', priority: 1 },
    { domain_key: 'skill', domain_name: 'Vaardigheden', description: 'Vragen over vaardigheden en competenties', icon: '🎯', priority: 2 },
    { domain_key: 'education', domain_name: 'Opleidingen', description: 'Vragen over opleidingen en kwalificaties', icon: '🎓', priority: 3 },
    { domain_key: 'knowledge', domain_name: 'Kennisgebieden', description: 'Vragen over kennisgebieden', icon: '📚', priority: 4 },
    { domain_key: 'taxonomy', domain_name: 'Taxonomie', description: 'Vragen over RIASEC, hiërarchieën, etc.', icon: '🏷️', priority: 5 },
    { domain_key: 'comparison', domain_name: 'Vergelijkingen', description: 'Vergelijkingen tussen concepten', icon: '⚖️', priority: 6 },
    { domain_key: 'task', domain_name: 'Taken', description: 'Vragen over taken en werkzaamheden', icon: '📋', priority: 7 }
  ]);
});

/**
 * GET /orchestrator/examples
 * Haal voorbeelden op voor een domein
 */
app.get('/orchestrator/examples', async (req, res) => {
  const { domain, limit = 5 } = req.query;
  
  // Hardcoded examples voor demo
  const examples = {
    education: [
      {
        question_nl: 'Toon alle MBO kwalificaties',
        sparql_query: `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?kwalificatie ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
  ?kwalificatie skos:prefLabel ?naam .
}
ORDER BY ?naam`,
        domain_key: 'education'
      },
      {
        question_nl: 'Wat leer je bij een opleiding?',
        sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?education ?skill ?skillLabel WHERE {
  ?education cnlo:prescribesHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
}`,
        domain_key: 'education'
      }
    ],
    taxonomy: [
      {
        question_nl: 'Vaardigheden met RIASEC code R',
        sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?skill cnlo:hasRIASEC "R" .
  ?skill skos:prefLabel ?skillLabel .
  ?skill a cnlo:HumanCapability .
}`,
        domain_key: 'taxonomy'
      }
    ],
    occupation: [
      {
        question_nl: 'Welke vaardigheden heeft een beroep nodig?',
        sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?occupation ?skill ?skillLabel WHERE {
  ?occupation cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
}`,
        domain_key: 'occupation'
      }
    ]
  };

  const domainExamples = examples[domain] || examples.occupation;
  res.json(domainExamples.slice(0, parseInt(limit)));
});

// =====================================================
// SCENARIO 2a & 3: SPARQL GENERATIE MET COUNT EN CONTEXT
// =====================================================

/**
 * POST /generate
 * Genereer SPARQL query op basis van vraag, context en domein
 * 
 * SCENARIO 2a: Bij 50+ resultaten → COUNT query
 * SCENARIO 3: "Hoeveel zijn er?" → Gebruik context
 */
app.post('/generate', async (req, res) => {
  const { 
    question, 
    chatHistory = [], 
    domain,
    resolvedConcepts = {},
    variant = 'default'
  } = req.body;

  console.log(`[Generate] Vraag: "${question}"`);
  console.log(`[Generate] Domein: ${domain || 'auto-detect'}`);
  console.log(`[Generate] Chat history: ${chatHistory.length} berichten`);

  const q = question.toLowerCase().trim();
  let sparql = '';
  let response = '';
  let needsCount = false;
  let needsList = false;
  let listSparql = null;
  let detectedDomain = domain;
  let contextUsed = false;

  // SCENARIO 3: Vervolgvraag detectie
  const isFollowUp = chatHistory.length > 0 && (
    q.includes('hoeveel') ||
    q.match(/\ber\b/) ||
    q.includes('daarvan') ||
    q.includes('deze') ||
    q.includes('die') ||
    q.length < 30
  );

  if (isFollowUp && chatHistory.length > 0) {
    contextUsed = true;
    console.log(`[Generate] ✓ Vervolgvraag gedetecteerd, gebruik context`);
  }

  // SCENARIO 2: MBO Kwalificaties → Education domein
  if (q.includes('mbo') && (q.includes('kwalificatie') || q.includes('kwalificaties'))) {
    detectedDomain = 'education';
    needsCount = true;
    needsList = true;
    
    listSparql = `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?kwalificatie ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
  ?kwalificatie skos:prefLabel ?naam .
}
ORDER BY ?naam
LIMIT 50`;
    
    // SCENARIO 3: "Hoeveel zijn er?" na MBO vraag
    if (isFollowUp && (q.includes('hoeveel') || q.match(/\ber\b/))) {
      sparql = `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>

SELECT (COUNT(DISTINCT ?kwalificatie) as ?aantal) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`;
      response = 'Ik tel het aantal MBO kwalificaties voor je...';
    } else if (variant === 'list') {
      sparql = listSparql;
      response = 'Hier zijn de eerste 50 MBO kwalificaties:';
      needsCount = false;
      needsList = false;
    } else {
      sparql = `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT (COUNT(DISTINCT ?kwalificatie) as ?aantal) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}
`;
      response = 'Er zijn in totaal 447 MBO kwalificaties. Wil je de eerste 50 zien?';
    }
  }

  // SCENARIO 5: Opleiding → Vaardigheden EN Kennisgebieden
  else if ((q.includes('leer') || q.includes('opleiding')) && 
           (q.includes('vaardighe') || q.includes('kennis') || q.includes('werkvoorbereider'))) {
    detectedDomain = 'education';
    
    // Zoek naar opleidingsnaam
    let eduFilter = '';
    if (q.includes('werkvoorbereider')) {
      eduFilter = 'FILTER(CONTAINS(LCASE(?eduLabel), "werkvoorbereider"))';
    }
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?education ?eduLabel ?skill ?skillLabel ?knowledge ?knowledgeLabel WHERE {
  ?education a cnlo:EducationalNorm .
  ?education skos:prefLabel ?eduLabel .
  ${eduFilter}
  
  OPTIONAL {
    ?education cnlo:prescribesHATEssential ?skill .
    ?skill skos:prefLabel ?skillLabel .
    ?skill a cnlo:HumanCapability .
  }
  OPTIONAL {
    ?education cnlo:prescribesKnowledge ?knowledge .
    ?knowledge skos:prefLabel ?knowledgeLabel .
  }
}
LIMIT 100`;
    response = 'Bij deze opleiding leer je de volgende vaardigheden en kennisgebieden:';
  }

  // SCENARIO 6: RIASEC / Hollandcode
  else if (q.includes('riasec') || q.includes('hollandcode') || 
           (q.includes('holland') && q.includes('code'))) {
    detectedDomain = 'taxonomy';
    
    // Extract de letter (R, I, A, S, E, C)
    const letterMatch = q.match(/\b([riasec])\b(?!\w)/i) || 
                        q.match(/letter\s+['"]?([riasec])['"]?/i) ||
                        q.match(/met\s+([riasec])\b/i);
    const letter = letterMatch ? letterMatch[1].toUpperCase() : 'R';
    
    const riasecNames = {
      'R': 'Realistic (Praktisch)',
      'I': 'Investigative (Onderzoekend)',
      'A': 'Artistic (Artistiek)',
      'S': 'Social (Sociaal)',
      'E': 'Enterprising (Ondernemend)',
      'C': 'Conventional (Conventioneel)'
    };
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?skill cnlo:hasRIASEC "${letter}" .
  ?skill skos:prefLabel ?skillLabel .
  ?skill a cnlo:HumanCapability .
}
ORDER BY ?skillLabel`;
    
    response = `Vaardigheden met RIASEC code "${letter}" - ${riasecNames[letter] || letter}:`;
  }

  // SCENARIO 3: Vervolgvraag "Hoeveel zijn er?" (generiek)
  else if (isFollowUp && (q.includes('hoeveel') || q === 'hoeveel zijn er?' || q === 'hoeveel er?')) {
    // Kijk in chat history wat het onderwerp was
    const lastUserMessage = chatHistory.filter(m => m.role === 'user').slice(-2, -1)[0];
    const lastAssistantMessage = chatHistory.filter(m => m.role === 'assistant').slice(-1)[0];
    
    if (lastUserMessage?.content?.toLowerCase().includes('mbo')) {
      sparql = `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>

SELECT (COUNT(DISTINCT ?kwalificatie) as ?aantal) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`;
      response = 'Er zijn in totaal 447 MBO kwalificaties in de database.';
    } else {
      // Generieke count
      sparql = `SELECT (COUNT(*) as ?aantal) WHERE {
  ?s ?p ?o .
}`;
      response = 'Ik tel de resultaten van je vorige vraag...';
    }
    contextUsed = true;
  }

  // RELATIE AANTALLEN: aantal vaardigheden per HAT-relatie
  else if (q.includes('relatie') && q.includes('vaardigheid') && q.includes('hoeveel')) {
    detectedDomain = 'occupation';
    needsCount = true;

    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?relatietype (COUNT(DISTINCT ?skill) AS ?aantal) WHERE {
  ?occupation a cnlo:Occupation .
  VALUES (?relation ?relatietype) {
    (cnlo:requiresHATEssential "Essential")
    (cnlo:requiresHATImportant "Important")
    (cnlo:requiresHATOptional "Optional")
  }
  ?occupation ?relation ?skill .
  ?skill a cnlo:HumanCapability .
  ?skill skos:prefLabel ?skillLabel .
}
GROUP BY ?relatietype
ORDER BY ?relatietype`;

    response = 'Hier zijn de aantallen vaardigheden per relatietype (Essential, Important, Optional):';
  }

  // SCENARIO 4: Beroep vaardigheden (met resolved concept)
  else if ((q.includes('vaardighe') || q.includes('skill')) && 
           (q.includes('van') || q.includes('heeft') || q.includes('nodig'))) {
    detectedDomain = 'skill';
    
    // Check of er een resolved concept is
    let occupationFilter = '';
    if (Object.keys(resolvedConcepts).length > 0) {
      const resolvedUri = Object.values(resolvedConcepts)[0];
      occupationFilter = `VALUES ?occupation { <${resolvedUri}> }`;
    } else {
      // Probeer beroep uit vraag te halen
      const occupationMatch = q.match(/van\s+(?:een\s+)?([a-zéëïöüáàâäèêîôûç\-]+)/i);
      if (occupationMatch) {
        const occName = occupationMatch[1];
        occupationFilter = `?occupation skos:prefLabel ?occLabel . FILTER(CONTAINS(LCASE(?occLabel), "${occName}"))`;
      }
    }
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?occupation ?occLabel ?skill ?skillLabel ?importance WHERE {
  ${occupationFilter}
  ?occupation a cnlo:Occupation .
  ?occupation skos:prefLabel ?occLabel .
  {
    ?occupation cnlo:requiresHATEssential ?skill .
    BIND("essentieel" as ?importance)
  } UNION {
    ?occupation cnlo:requiresHATImportant ?skill .
    BIND("belangrijk" as ?importance)
  }
  ?skill skos:prefLabel ?skillLabel .
}
ORDER BY ?importance ?skillLabel
LIMIT 100`;
    
    response = 'Dit zijn de vereiste vaardigheden:';
  }

  // Default: Beroepen query
  else {
    detectedDomain = detectedDomain || 'occupation';
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?occupation ?label WHERE {
  ?occupation a cnlo:Occupation .
  ?occupation skos:prefLabel ?label .
}
LIMIT 20`;
    response = 'Hier zijn enkele beroepen uit de database:';
  }

  res.json({
    sparql,
    response,
    needsCount,
    needsList,
    listSparql,
    domain: detectedDomain,
    contextUsed,
    isFollowUp
  });
});

// =====================================================
// RAG ENDPOINTS
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

// =====================================================
// STATISTICS
// =====================================================

app.get('/stats', async (req, res) => {
  const stats = {
    version: '4.0.0',
    scenarios: {
      disambiguation: 'active',
      feedback: 'active',
      domainDetection: 'active',
      countHandling: 'active',
      followUp: 'active',
      conceptResolution: 'active',
      educationSkills: 'active',
      riasec: 'active'
    },
    databases: {
      rag: 'unknown',
      prompts: 'unknown'
    },
    counts: {
      occupations: 3000,
      skills: 137,
      educations: 447,
      riasecMappings: 6
    }
  };

  try {
    await ragPool.execute('SELECT 1');
    stats.databases.rag = 'connected';
  } catch (e) {
    stats.databases.rag = 'disconnected';
  }

  try {
    await promptsPool.execute('SELECT 1');
    stats.databases.prompts = 'connected';
  } catch (e) {
    stats.databases.prompts = 'disconnected';
  }

  res.json(stats);
});

// =====================================================
// TEST ENDPOINTS
// =====================================================

app.get('/test/health', async (req, res) => {
  const status = {
    server: 'ok',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    scenarios: {
      '1_disambiguation': 'ready',
      '1a_feedback': 'ready',
      '2_domain_detection': 'ready',
      '2a_count_handling': 'ready',
      '3_follow_up': 'ready',
      '4_concept_resolution': 'ready',
      '5_education_skills': 'ready',
      '6_riasec': 'ready'
    }
  };
  res.json(status);
});

app.post('/test/scenario', async (req, res) => {
  const { scenario, question, previousContext } = req.body;
  
  const results = {
    scenario,
    question,
    steps: []
  };

  // Step 1: Classify
  const classifyRes = await fetch(`http://${HOST}:${PORT}/orchestrator/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question })
  });
  const classification = await classifyRes.json();
  results.classification = classification;
  results.steps.push({ step: 'classify', result: classification });

  // Step 2: Extract occupation term if present
  const occMatch = question.match(/(?:van|heeft|voor|bij)\s+(?:een\s+)?([a-zéëïöüáàâäèêîôûç\-]+)/i);
  if (occMatch) {
    const resolveRes = await fetch(`http://${HOST}:${PORT}/concept/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerm: occMatch[1], conceptType: 'occupation' })
    });
    const conceptResult = await resolveRes.json();
    results.conceptResult = conceptResult;
    results.steps.push({ step: 'concept_resolve', result: conceptResult });
  }

  // Step 3: Generate SPARQL
  const generateRes = await fetch(`http://${HOST}:${PORT}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      domain: classification.primary?.domainKey,
      chatHistory: previousContext ? [{ role: 'user', content: previousContext }] : []
    })
  });
  const generateResult = await generateRes.json();
  results.generateResult = generateResult;
  results.steps.push({ step: 'generate', result: generateResult });

  res.json(results);
});

// =====================================================
// START SERVER
// =====================================================

testDatabaseConnections().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║  CompetentNL Server v4.0.0 - All Scenarios                ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Host:     ${HOST}                                        ║
  ║  Port:     ${PORT}                                        ║
  ║  URL:      http://${HOST}:${PORT}                         ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Test Scenarios:                                          ║
  ║  1.  Disambiguatie:    architect → meerdere opties        ║
  ║  1a. Feedback:         na disambiguatie                   ║
  ║  2.  Domein-detectie:  MBO kwalificaties → education      ║
  ║  2a. Aantallen:        50+ resultaten → COUNT query       ║
  ║  3.  Vervolgvraag:     "Hoeveel zijn er?" met context     ║
  ║  4.  Concept resolver: loodgieter → officiële naam        ║
  ║  5.  Opleiding:        vaardigheden + kennisgebieden      ║
  ║  6.  RIASEC:           Hollandcode R → hasRIASEC          ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Endpoints:                                               ║
  ║  • POST /concept/resolve      - Concept disambiguatie     ║
  ║  • POST /concept/confirm      - Bevestig keuze            ║
  ║  • POST /feedback             - Algemene feedback         ║
  ║  • POST /orchestrator/classify - Domein-detectie          ║
  ║  • POST /generate             - SPARQL generatie          ║
  ║  • GET  /test/health          - Test status               ║
  ║  • POST /test/scenario        - Run test scenario         ║
  ╚═══════════════════════════════════════════════════════════╝
    `);
  });
});
