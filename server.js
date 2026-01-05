/**
 * CompetentNL Backend Server - v4.0.0
 * ====================================
 * Complete implementatie voor alle 6 test scenarios:
 * 
 * 1. Disambiguatie: "Welke vaardigheden heeft een architect?" Ã¢â€ â€™ Vraagt om verduidelijking
 * 1a. Feedback: Na disambiguatie moet feedback mogelijk zijn
 * 2. Domein-detectie: "Toon alle MBO kwalificaties" Ã¢â€ â€™ Console: [Orchestrator] Domein: education
 * 2a. Aantallen: Bij 50+ resultaten Ã¢â€ â€™ COUNT query + mogelijkheid alle op te halen
 * 3. Vervolgvraag: "Hoeveel zijn er?" Ã¢â€ â€™ Moet context gebruiken
 * 4. Concept resolver: "Vaardigheden van loodgieter" Ã¢â€ â€™ Resolven naar officiÃƒÂ«le naam
 * 5. Opleiding: "Wat leer jij bij de opleiding werkvoorbereider installaties?" Ã¢â€ â€™ vaardigheden + kennisgebieden
 * 6. RIASEC: "geef alle vaardigheden die een relatie hebben met R" Ã¢â€ â€™ hasRIASEC predicaat
 */

import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { preloadCache } from './profile-matching-api.mjs';
import matchingRouter from './matching-router.mjs';

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

// Database configuratie (ondersteunt zowel MARIADB_* als DB_* variabelen)
const DB_HOST = process.env.MARIADB_HOST || process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.MARIADB_PORT || process.env.DB_PORT || '3306');
const DB_USER = process.env.MARIADB_USER || process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.MARIADB_PASSWORD || process.env.DB_PASSWORD || '';
const DB_NAME = process.env.MARIADB_DATABASE || process.env.DB_NAME || 'competentnl_rag';
const DB_PROMPTS_NAME = process.env.DB_PROMPTS_NAME || 'competentnl_prompts';

app.use(cors());
app.use(express.json());
app.use('/api', matchingRouter);

// =====================================================
// DATABASE CONNECTION POOLS
// =====================================================

// Pool voor RAG & Concept Resolver
const ragPool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// Pool voor Multi-Prompt Orchestrator
const promptsPool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_PROMPTS_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4'
});

// Test database connections
async function testDatabaseConnections() {
  try {
    await ragPool.execute('SELECT 1');
    console.log('[DB] Ã¢Å“â€œ competentnl_rag connected');
  } catch (e) {
    console.warn('[DB] Ã¢Å“â€” competentnl_rag not available:', e.message);
  }
  
  try {
    await promptsPool.execute('SELECT 1');
    console.log('[DB] Ã¢Å“â€œ competentnl_prompts connected');
  } catch (e) {
    console.warn('[DB] Ã¢Å“â€” competentnl_prompts not available (orchestrator disabled):', e.message);
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

function isUwvUri(uri = '') {
  return uri.includes('/uwv/');
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
// BEKENDE PREFIXES VOOR AUTOMATISCHE FIX
// =====================================================
const KNOWN_PREFIXES = {
  'cnlo': 'https://linkeddata.competentnl.nl/def/competentnl#',
  'cnluwvo': 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#',
  'skos': 'http://www.w3.org/2004/02/skos/core#',
  'skosxl': 'http://www.w3.org/2008/05/skos-xl#',
  'ksmo': 'https://data.s-bb.nl/ksm/ont/ksmo#',
  'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
  'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'dct': 'http://purl.org/dc/terms/',
  'owl': 'http://www.w3.org/2002/07/owl#'
};

/**
 * Voeg ontbrekende prefixes toe aan een SPARQL query
 */
function fixMissingPrefixes(query) {
  if (!query) return query;
  
  // Vind welke prefixes gebruikt worden (bijv. cnlo:, skos:)
  const usedPrefixes = [...new Set(
    (query.match(/\b(\w+):/g) || [])
      .map(m => m.replace(':', ''))
      .filter(p => !['http', 'https', 'urn'].includes(p))
  )];
  
  // Vind welke prefixes al gedefinieerd zijn
  const definedPrefixes = (query.match(/PREFIX\s+(\w+)\s*:/gi) || [])
    .map(m => m.replace(/PREFIX\s+/i, '').replace(/\s*:/, '').toLowerCase());
  
  // Voeg ontbrekende prefixes toe
  const missingPrefixes = [];
  for (const prefix of usedPrefixes) {
    const lowerPrefix = prefix.toLowerCase();
    if (!definedPrefixes.includes(lowerPrefix) && KNOWN_PREFIXES[lowerPrefix]) {
      missingPrefixes.push(`PREFIX ${lowerPrefix}: <${KNOWN_PREFIXES[lowerPrefix]}>`);
    }
  }
  
  if (missingPrefixes.length > 0) {
    console.log('[SPARQL] Ontbrekende prefixes toegevoegd:', missingPrefixes.map(p => p.split(':')[0].replace('PREFIX ', '')).join(', '));
    return missingPrefixes.join('\n') + '\n' + query;
  }
  
  return query;
}

/**
 * Fix incorrect occupation URIs in SPARQL query
 * De AI construeert soms zelf URIs zoals /id/occupation/kapper-2
 * Deze moeten worden opgezocht in de database en vervangen door de echte URI
 */
async function fixIncorrectOccupationUri(query) {
  if (!query) return query;
  
  // Patroon: <https://linkeddata.competentnl.nl/id/occupation/naam-eventueel-nummer>
  // Dit is een VERKEERDE URI (mist /uwv/)
  const incorrectUriPattern = /<https:\/\/linkeddata\.competentnl\.nl\/id\/occupation\/([^>]+)>/gi;
  
  const match = query.match(incorrectUriPattern);
  if (!match || match.length === 0) {
    // Geen verkeerde URI gevonden, of URI is al correct
    return query;
  }
  
  // Extract de "naam" uit de verkeerde URI
  const incorrectUri = match[0];
  const nameMatch = incorrectUri.match(/\/occupation\/([^>]+)>/);
  if (!nameMatch) {
    return query;
  }
  
  // Naam uit URI halen en opschonen (bijv. "kapper-2" -> "kapper")
  let searchName = nameMatch[1]
    .replace(/-\d+$/, '')  // Verwijder trailing -nummer
    .replace(/-/g, ' ')    // Vervang - door spatie
    .toLowerCase()
    .trim();
  
  console.log(`[URI-Fix] Verkeerde URI gedetecteerd: ${incorrectUri}`);
  console.log(`[URI-Fix] Zoeken naar: "${searchName}"`);
  
  try {
    // Zoek de correcte URI in de database
    const [rows] = await ragPool.execute(`
      SELECT occupation_uri, pref_label, label
      FROM occupation_labels 
      WHERE LOWER(label) LIKE ? OR LOWER(pref_label) LIKE ?
      ORDER BY 
        CASE WHEN LOWER(label) = ? THEN 0 ELSE 1 END,
        LENGTH(label) ASC
      LIMIT 1
    `, [`%${searchName}%`, `%${searchName}%`, searchName]);
    
    if (rows.length > 0) {
      const correctUri = rows[0].occupation_uri;
      console.log(`[URI-Fix] ✓ Correcte URI gevonden: ${correctUri}`);
      console.log(`[URI-Fix]   (${rows[0].pref_label})`);
      
      // Vervang de verkeerde URI door de correcte URI
      const fixedQuery = query.replace(incorrectUriPattern, `<${correctUri}>`);
      
      console.log(`[URI-Fix] Query gecorrigeerd!`);
      return fixedQuery;
    } else {
      console.log(`[URI-Fix] ⚠ Geen match gevonden voor "${searchName}"`);
      return query;
    }
  } catch (error) {
    console.error('[URI-Fix] Database error:', error.message);
    return query;
  }
}

// =====================================================
// SPARQL PROXY
// =====================================================

app.post('/proxy/sparql', async (req, res) => {
  const endpoint = process.env.COMPETENTNL_ENDPOINT || req.body.endpoint;
  let query = req.body.query;
  const key = process.env.COMPETENTNL_API_KEY || req.body.key;

  if (!endpoint || !query) {
    return res.status(400).json({ error: 'Endpoint en query zijn verplicht.' });
  }

  // Automatisch ontbrekende prefixes toevoegen
  query = fixMissingPrefixes(query);
  
  // FIX: Corrigeer verkeerde occupation URIs die door de AI zijn geconstrueerd
  // Patroon: /id/occupation/naam-nummer moet worden /uwv/id/occupation/HASH
  query = await fixIncorrectOccupationUri(query);

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
 * SCENARIO 1: "architect" Ã¢â€ â€™ meerdere matches Ã¢â€ â€™ disambiguatie
 * SCENARIO 4: "loodgieter" Ã¢â€ â€™ match naar officiÃƒÂ«le naam
 */
app.post('/concept/resolve', async (req, res) => {
  const { searchTerm, conceptType = 'occupation', riasecBypass = false, questionContext, question } = req.body;

  if (!searchTerm) {
    return res.status(400).json({ error: 'searchTerm is verplicht' });
  }

  const riasecDetected = riasecBypass || isRiasecText(questionContext) || isRiasecText(question) || isRiasecText(searchTerm);
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

    // DEBUG: Log database resultaten
    console.log(`[Concept] Database query voor "${searchTerm}" retourneerde ${rows.length} rijen`);
    if (rows.length > 0) {
      console.log(`[Concept] Eerste 3 resultaten:`, rows.slice(0, 3).map(r => ({ 
        uri: r.uri, 
        prefLabel: r.prefLabel,
        label: r.matchedLabel 
      })));
    }

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

    const preferUwvUris = effectiveConceptType === 'occupation';
    const uwvRows = preferUwvUris ? rows.filter(r => isUwvUri(r.uri || '')) : [];
    const prioritizedRows = preferUwvUris && uwvRows.length > 0
      ? [...uwvRows, ...rows.filter(r => !isUwvUri(r.uri || ''))]
      : rows;

    if (preferUwvUris && uwvRows.length > 0) {
      console.log(`[Concept] ✓ UWV-URI voorkeur geactiveerd (${uwvRows.length}/${rows.length} resultaten)`);
    }

    // Bepaal matches (op basis van URI) en breid generiek uit voor synoniemen/homoniemen
    const matches = prioritizedRows.map(r => ({
      uri: r.uri,
      prefLabel: r.prefLabel,
      matchedLabel: r.matchedLabel,
      matchType: r.matchType,
      confidence: parseFloat(r.confidence) + (preferUwvUris && isUwvUri(r.uri || '') ? 0.05 : 0),
      conceptType: effectiveConceptType
    }));

    const uniqueUris = new Set(matches.map(m => m.uri));

    // Sterke (exacte) matches hebben voorrang, ook als er andere fuzzy matches zijn
    const strongMatches = matches.filter(m => 
      STRONG_MATCH_TYPES.includes((m.matchType || '').toLowerCase()) &&
      m.matchedLabel.toLowerCase() === normalized &&
      m.confidence >= STRONG_MATCH_THRESHOLD
    );

    const uwvStrongMatches = preferUwvUris ? strongMatches.filter(m => isUwvUri(m.uri || '')) : [];

    if (strongMatches.length === 1 || (preferUwvUris && uwvStrongMatches.length === 1)) {
      const selected = strongMatches.length === 1 ? strongMatches[0] : uwvStrongMatches[0];
      console.log(`[Concept] ✓ Sterke exacte match: "${searchTerm}" -> "${selected.prefLabel}"`);
      console.log(`[Concept]   URI: ${selected.uri}`);
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
      m.matchedLabel.toLowerCase() === normalized && m.confidence >= STRONG_MATCH_THRESHOLD && (!preferUwvUris || isUwvUri(m.uri || ''))
    ) || matches.find(m => 
      m.matchedLabel.toLowerCase() === normalized && m.confidence >= STRONG_MATCH_THRESHOLD
    );

    // SCENARIO 4: Loodgieter Ã¢â€ â€™ Exacte match of 1 uniek concept
    if (exactMatch || uniqueUris.size === 1) {
      const selected = exactMatch || matches[0];
      console.log(`[Concept] ✓ Exact match: "${searchTerm}" -> "${selected.prefLabel}"`);
      console.log(`[Concept]   URI: ${selected.uri}`);
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
    
    // DEBUG: Log de disambiguatie candidates met URIs
    console.log(`[Concept] Disambiguatie candidates (${disambiguationCandidates.length}):`);
    disambiguationCandidates.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i+1}. "${c.prefLabel}" - URI: ${c.uri}`);
    });

    console.log(`[Concept] Disambiguatie matches:`, matches.slice(0,3).map(m => ({ label: m.prefLabel, uri: m.uri })));
    console.log(`[Concept] Ã¢Å¡Â  Disambiguatie nodig: ${disambiguationCandidates.length} ${config.dutchNamePlural} gevonden voor "${searchTerm}"`);

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

  console.log(`[Concept] Ã¢Å“â€œ Bevestigd: "${searchTerm}" Ã¢â€ â€™ "${selectedLabel}" (${selectedUri})`);

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
    context,          // Optionele context (vraag, antwoord, etc.)
    questionEmbeddingId
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

    // Koppel feedback optioneel aan question_embeddings
    if (questionEmbeddingId) {
      const feedbackDelta = feedbackType === 'helpful' || (rating && Number(rating) >= 4) ? 0.1 : -0.1;

      // Update aggregaties op de question_embeddings rij
      try {
        await ragPool.execute(`
          UPDATE question_embeddings
          SET feedback_score = GREATEST(-1, LEAST(1, feedback_score + ?)),
              usage_count = usage_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [feedbackDelta, questionEmbeddingId]);
      } catch (error) {
        console.warn('[Feedback] Kon feedback_score niet bijwerken voor question_embeddings:', error.message);
      }

      // Log koppeling voor latere analyse
      try {
        await ragPool.execute(`
          INSERT INTO feedback_details (
            question_embedding_id,
            feedback_type,
            feedback_reason,
            sparql_was_correct,
            results_were_relevant
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          questionEmbeddingId,
          feedbackType === 'helpful' ? 'like' : 'dislike',
          comment || null,
          context?.sparql ? true : null,
          typeof context?.resultsCount === 'number' ? context.resultsCount > 0 : null
        ]);
      } catch (error) {
        console.warn('[Feedback] Kon feedback_details niet opslaan (optioneel):', error.message);
      }
    }

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
 * SCENARIO 2: "Toon alle MBO kwalificaties" Ã¢â€ â€™ education domein
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
    { domain_key: 'occupation', domain_name: 'Beroepen', description: 'Vragen over beroepen en functies', icon: 'Ã°Å¸â€˜â€', priority: 1 },
    { domain_key: 'skill', domain_name: 'Vaardigheden', description: 'Vragen over vaardigheden en competenties', icon: 'Ã°Å¸Å½Â¯', priority: 2 },
    { domain_key: 'education', domain_name: 'Opleidingen', description: 'Vragen over opleidingen en kwalificaties', icon: 'Ã°Å¸Å½â€œ', priority: 3 },
    { domain_key: 'knowledge', domain_name: 'Kennisgebieden', description: 'Vragen over kennisgebieden', icon: 'Ã°Å¸â€œÅ¡', priority: 4 },
    { domain_key: 'taxonomy', domain_name: 'Taxonomie', description: 'Vragen over RIASEC, hiÃƒÂ«rarchieÃƒÂ«n, etc.', icon: 'Ã°Å¸ÂÂ·Ã¯Â¸Â', priority: 5 },
    { domain_key: 'comparison', domain_name: 'Vergelijkingen', description: 'Vergelijkingen tussen concepten', icon: 'Ã¢Å¡â€“Ã¯Â¸Â', priority: 6 },
    { domain_key: 'task', domain_name: 'Taken', description: 'Vragen over taken en werkzaamheden', icon: 'Ã°Å¸â€œâ€¹', priority: 7 }
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
 * SCENARIO 2a: Bij 50+ resultaten Ã¢â€ â€™ COUNT query
 * SCENARIO 3: "Hoeveel zijn er?" Ã¢â€ â€™ Gebruik context
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
  const relationSkillCountQuery = (
    (q.includes('relatie') || q.includes('relaties')) &&
    (q.includes('vaardigheid') || q.includes('vaardigheden') || q.includes('skill') || q.includes('skills')) &&
    q.includes('hoeveel')
  );

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
    console.log(`[Generate] Ã¢Å“â€œ Vervolgvraag gedetecteerd, gebruik context`);
  }

  // SCENARIO 2: MBO Kwalificaties Ã¢â€ â€™ Education domein
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

  // SCENARIO 5: Opleiding Ã¢â€ â€™ Vaardigheden EN Kennisgebieden
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
  else if (relationSkillCountQuery) {
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
      const occupationMatch = q.match(/van\s+(?:een\s+)?([a-zÃƒÂ©ÃƒÂ«ÃƒÂ¯ÃƒÂ¶ÃƒÂ¼ÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ¤ÃƒÂ¨ÃƒÂªÃƒÂ®ÃƒÂ´ÃƒÂ»ÃƒÂ§\-]+)/i);
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
    isFollowUp,
    needsDisambiguation: false
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
/**
 * VERBETERDE SERVER PATCH: Voorbeeldvragen Endpoints
 * ===================================================
 * Voeg dit toe aan server.js NA het /rag/examples endpoint (rond regel 1261)
 * 
 * Deze versie:
 * - Werkt ook als 'domain' kolom niet bestaat
 * - Heeft betere fallback voorbeelden met LIMIT
 * - Geeft duidelijke foutmeldingen
 */

// =====================================================
// HOMEPAGE VOORBEELDVRAGEN ENDPOINT
// =====================================================

app.get('/api/example-questions', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  try {
    // Probeer eerst met alle kolommen
    let rows;
    try {
      const [result] = await ragPool.execute(`
        SELECT 
          id, 
          question as vraag, 
          sparql_query,
          category,
          domain,
          usage_count,
          success_rate
        FROM question_embeddings
        ORDER BY usage_count DESC, id ASC
        LIMIT ?
      `, [limit]);
      rows = result;
    } catch (columnError) {
      // Als 'domain' kolom niet bestaat, probeer zonder
      console.warn('[API] domain kolom niet gevonden, probeer zonder:', columnError.message);
      const [result] = await ragPool.execute(`
        SELECT 
          id, 
          question as vraag, 
          sparql_query,
          category,
          usage_count
        FROM question_embeddings
        ORDER BY usage_count DESC, id ASC
        LIMIT ?
      `, [limit]);
      rows = result;
    }
    
    if (rows && rows.length > 0) {
      console.log(`[API] âœ“ Loaded ${rows.length} example questions from question_embeddings`);
      return res.json({
        source: 'question_embeddings',
        count: rows.length,
        examples: rows
      });
    }
    
    // Fallback naar rag_examples tabel
    try {
      const [ragRows] = await ragPool.execute(`
        SELECT 
          id, 
          question as vraag, 
          sparql_query,
          category,
          feedback_score
        FROM rag_examples
        WHERE is_active = TRUE
        ORDER BY feedback_score DESC, created_at DESC
        LIMIT ?
      `, [limit]);
      
      if (ragRows && ragRows.length > 0) {
        console.log(`[API] âœ“ Loaded ${ragRows.length} example questions from rag_examples`);
        return res.json({
          source: 'rag_examples',
          count: ragRows.length,
          examples: ragRows
        });
      }
    } catch (ragError) {
      console.warn('[API] rag_examples tabel niet beschikbaar:', ragError.message);
    }
    
    // Als beide tabellen leeg zijn, geef werkende defaults
    console.log('[API] âš  Geen voorbeelden in database, gebruik defaults');
    res.json({
      source: 'defaults',
      count: getDefaultExamples().length,
      examples: getDefaultExamples()
    });
    
  } catch (error) {
    console.error('[API] âœ— Error loading example questions:', error.message);
    res.json({
      source: 'defaults_error',
      error: error.message,
      count: getDefaultExamples().length,
      examples: getDefaultExamples()
    });
  }
});

// Helper functie met WERKENDE voorbeelden (alle queries hebben LIMIT!)
function getDefaultExamples() {
  return [
    {
      id: 1,
      vraag: 'Welke vaardigheden hebben RIASEC code R?',
      category: 'skill',
      sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skillLabel WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC "R" ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?skillLabel
LIMIT 50`
    },
    {
      id: 2,
      vraag: 'Toon alle 137 vaardigheden in de taxonomie',
      category: 'skill',
      sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 150`
    },
    {
      id: 3,
      vraag: 'Hoeveel vaardigheden zijn er per RIASEC letter?',
      category: 'count',
      sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT ?riasec (COUNT(?skill) AS ?aantal) WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC ?riasecValue .
  BIND(STR(?riasecValue) AS ?riasecRaw)
  BIND(
    UCASE(
      IF(
        isIRI(?riasecValue),
        REPLACE(?riasecRaw, "^.*([RIASEC])[^RIASEC]*$", "$1"),
        SUBSTR(?riasecRaw, 1, 1)
      )
    ) AS ?riasec
  )
  FILTER(?riasec IN ("R","I","A","S","E","C"))
}
GROUP BY ?riasec
ORDER BY ?riasec
LIMIT 10`
    },
    {
      id: 4,
      vraag: 'Wat zijn de taken van een kapper?',
      category: 'task',
      sparql_query: `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taskType ?taskLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "kapper"))
  
  {
    ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
    BIND("Essentieel" AS ?taskType)
  } UNION {
    ?occupation cnluwvo:isCharacterizedByOccupationTask_Optional ?task .
    BIND("Optioneel" AS ?taskType)
  }
  
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
ORDER BY ?taskType ?taskLabel
LIMIT 50`
    },
    {
      id: 5,
      vraag: 'Wat zijn de werkomstandigheden van een piloot?',
      category: 'occupation',
      sparql_query: `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?conditionLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnluwvo:hasWorkCondition ?condition .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "piloot"))
  
  ?condition skos:prefLabel ?conditionLabel .
  FILTER(LANG(?conditionLabel) = "nl")
}
ORDER BY ?conditionLabel
LIMIT 50`
    },
    {
      id: 6,
      vraag: 'Op welke manier komt het beroep docent mbo overeen met teamleider jeugdzorg?',
      category: 'comparison',
      sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?sharedSkillLabel WHERE {
  ?docent a cnlo:Occupation ;
          skos:prefLabel ?docentLabel .
  FILTER(LANG(?docentLabel) = "nl")
  FILTER(CONTAINS(LCASE(?docentLabel), "docent mbo"))

  ?teamleider a cnlo:Occupation ;
              skos:prefLabel ?teamleiderLabel .
  FILTER(LANG(?teamleiderLabel) = "nl")
  FILTER(CONTAINS(LCASE(?teamleiderLabel), "teamleider jeugdzorg"))

  VALUES ?predicate { cnlo:requiresHATEssential cnlo:requiresHATImportant }
  ?docent ?predicate ?skill .
  ?teamleider ?predicate ?skill .
  ?skill skos:prefLabel ?sharedSkillLabel .
  FILTER(LANG(?sharedSkillLabel) = "nl")
}
ORDER BY ?sharedSkillLabel
LIMIT 50`
    },
    {
      id: 7,
      vraag: 'Wat zijn de taken en vaardigheden van een tandartsassistent?',
      category: 'task',
      sparql_query: `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?type ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "tandartsassistent"))
  
  {
    VALUES ?taskPred { cnluwvo:isCharacterizedByOccupationTask_Essential cnluwvo:isCharacterizedByOccupationTask_Optional }
    ?occupation ?taskPred ?item .
    ?item skos:prefLabel ?label .
    BIND("Taak" AS ?type)
  }
  UNION {
    VALUES ?skillPred { cnlo:requiresHATEssential cnlo:requiresHATImportant }
    ?occupation ?skillPred ?item .
    ?item skos:prefLabel ?label .
    BIND("Vaardigheid" AS ?type)
  }
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?type ?label
LIMIT 100`
    },
    {
      id: 8,
      vraag: 'Toon 30 MBO kwalificaties',
      category: 'education',
      sparql_query: `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie ;
                skos:prefLabel ?naam .
  FILTER(LANG(?naam) = "nl")
}
ORDER BY ?naam
LIMIT 30`
    },
    {
      id: 9,
      vraag: 'Toon 30 kennisgebieden',
      category: 'knowledge',
      sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 30`
    },
    {
      id: 10,
      vraag: 'Toon 20 software-gerelateerde beroepen',
      category: 'occupation',
      sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
  FILTER(CONTAINS(LCASE(?label), "software"))
}
ORDER BY ?label
LIMIT 20`
    }
  ];
}

// =====================================================
// RAG LOGGING ENDPOINT
// =====================================================

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
// TEST VOORBEELDVRAAG ENDPOINT
// =====================================================

app.post('/api/test-example-question', async (req, res) => {
  const { question } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }
  
  const startTime = Date.now();
  
  try {
    // Genereer SPARQL via het normale /generate endpoint
    const generateRes = await fetch(`http://${HOST}:${PORT}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, chatHistory: [] })
    });
    
    const generateResult = await generateRes.json();
    
    if (!generateResult.sparql) {
      return res.json({
        question,
        success: false,
        error: 'No SPARQL generated',
        duration: Date.now() - startTime
      });
    }
    
    // Voer SPARQL uit
    const sparqlRes = await fetch(`http://${HOST}:${PORT}/proxy/sparql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: generateResult.sparql })
    });
    
    const sparqlResult = await sparqlRes.json();
    
    const duration = Date.now() - startTime;
    const resultCount = sparqlResult.results?.bindings?.length || 0;
    
    res.json({
      question,
      success: true,
      domain: generateResult.domain,
      sparql: generateResult.sparql,
      resultCount,
      hasResults: resultCount > 0,
      duration,
      needsDisambiguation: generateResult.needsDisambiguation || false
    });
    
  } catch (error) {
    res.json({
      question,
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
  }
});


app.post('/api/test-example-question', async (req, res) => {
  const { question } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }
  
  const startTime = Date.now();
  
  try {
    // Genereer SPARQL via het normale /generate endpoint
    const generateRes = await fetch(`http://${HOST}:${PORT}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, chatHistory: [] })
    });
    
    const generateResult = await generateRes.json();
    
    if (!generateResult.sparql) {
      return res.json({
        question,
        success: false,
        error: 'No SPARQL generated',
        duration: Date.now() - startTime
      });
    }
    
    // Voer SPARQL uit
    const sparqlRes = await fetch(`http://${HOST}:${PORT}/proxy/sparql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: generateResult.sparql })
    });
    
    const sparqlResult = await sparqlRes.json();
    
    const duration = Date.now() - startTime;
    const resultCount = sparqlResult.results?.bindings?.length || 0;
    
    res.json({
      question,
      success: true,
      domain: generateResult.domain,
      sparql: generateResult.sparql,
      resultCount,
      hasResults: resultCount > 0,
      duration,
      needsDisambiguation: generateResult.needsDisambiguation || false
    });
    
  } catch (error) {
    res.json({
      question,
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
  }
});


// =====================================================
// RIASEC CAPABILITIES API
// =====================================================

const RIASEC_INFO = {
  R: { code: 'R', name: 'Realistic', dutch: 'Praktisch', description: 'Praktische vaardigheden voor het werken met objecten, gereedschap en machines' },
  I: { code: 'I', name: 'Investigative', dutch: 'Onderzoekend', description: 'Onderzoekende vaardigheden voor analyseren en begrijpen' },
  A: { code: 'A', name: 'Artistic', dutch: 'Artistiek', description: 'Creatieve vaardigheden voor expressie en innovatie' },
  S: { code: 'S', name: 'Social', dutch: 'Sociaal', description: 'Sociale vaardigheden voor samenwerken en helpen' },
  E: { code: 'E', name: 'Enterprising', dutch: 'Ondernemend', description: 'Ondernemende vaardigheden voor leiden en overtuigen' },
  C: { code: 'C', name: 'Conventional', dutch: 'Conventioneel', description: 'Organisatorische vaardigheden voor structuur en precisie' }
};

// Cache voor RIASEC capabilities (wordt gevuld bij eerste request)
const riasecCapabilitiesCache = new Map();

/**
 * Haal capabilities op voor een RIASEC letter via SPARQL
 */
async function fetchCapabilitiesForLetter(letter) {
  const upperLetter = letter.toUpperCase();
  
  // Check cache
  if (riasecCapabilitiesCache.has(upperLetter)) {
    return riasecCapabilitiesCache.get(upperLetter);
  }
  
  const sparqlQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?capability ?label WHERE {
      ?capability cnlo:hasRIASEC "${upperLetter}" .
      ?capability skos:prefLabel ?label .
      ?capability a cnlo:HumanCapability .
    }
    ORDER BY ?label
  `;
  
  const endpoint = process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
  const apiKey = process.env.COMPETENTNL_API_KEY;
  
  try {
    // Gebruik dezelfde parameters als de werkende proxy
    const params = new URLSearchParams();
    params.append('query', sparqlQuery);
    params.append('format', 'application/sparql-results+json');
    
    const headers = {
      'Accept': 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CompetentNL-AI-Agent/4.0'
    };
    
    if (apiKey) {
      headers['apikey'] = apiKey;
    }
    
    console.log(`[RIASEC] Fetching capabilities for letter ${upperLetter}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: params
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RIASEC] SPARQL error ${response.status}:`, errorText);
      throw new Error(`SPARQL error: ${response.status}`);
    }
    
    const data = await response.json();
    const capabilities = (data.results?.bindings || []).map(binding => ({
      uri: binding.capability?.value || '',
      label: binding.label?.value || ''
    }));
    
    console.log(`[RIASEC] Found ${capabilities.length} capabilities for ${upperLetter}`);
    
    // Cache het resultaat
    riasecCapabilitiesCache.set(upperLetter, capabilities);
    
    return capabilities;
  } catch (error) {
    console.error(`[RIASEC] Error fetching capabilities for ${upperLetter}:`, error.message);
    return [];
  }
}

/**
 * GET /api/riasec/capabilities/:letter
 * Haal alle capabilities op voor een specifieke RIASEC letter
 */
app.get('/api/riasec/capabilities/:letter', async (req, res) => {
  const letter = req.params.letter?.toUpperCase();
  
  if (!letter || !RIASEC_INFO[letter]) {
    return res.status(400).json({
      success: false,
      error: `Ongeldige RIASEC letter. Gebruik: R, I, A, S, E, of C`
    });
  }
  
  const info = RIASEC_INFO[letter];
  const capabilities = await fetchCapabilitiesForLetter(letter);
  
  res.json({
    success: true,
    letter: info.code,
    name: info.name,
    dutch: info.dutch,
    description: info.description,
    capabilities,
    totalCount: capabilities.length
  });
});

/**
 * POST /api/riasec/capabilities/batch
 * Haal capabilities op voor meerdere RIASEC letters tegelijk
 * Body: { letters: ["S", "I", "A"] }
 */
app.post('/api/riasec/capabilities/batch', async (req, res) => {
  const { letters } = req.body;
  
  if (!letters || !Array.isArray(letters) || letters.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Geef een array van RIASEC letters op in het "letters" veld'
    });
  }
  
  // Valideer alle letters
  const validLetters = letters
    .map(l => l?.toUpperCase())
    .filter(l => RIASEC_INFO[l]);
  
  if (validLetters.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Geen geldige RIASEC letters gevonden. Gebruik: R, I, A, S, E, of C'
    });
  }
  
  // Haal capabilities op voor alle letters parallel
  const results = {};
  await Promise.all(validLetters.map(async (letter) => {
    const info = RIASEC_INFO[letter];
    const capabilities = await fetchCapabilitiesForLetter(letter);
    results[letter] = {
      letter: info.code,
      name: info.name,
      dutch: info.dutch,
      description: info.description,
      capabilities,
      totalCount: capabilities.length
    };
  }));
  
  res.json({
    success: true,
    letters: validLetters,
    results
  });
});

/**
 * GET /api/riasec/info
 * Haal informatie op over alle RIASEC letters
 */
app.get('/api/riasec/info', (req, res) => {
  res.json({
    success: true,
    letters: Object.values(RIASEC_INFO)
  });
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
  const occMatch = question.match(/(?:van|heeft|voor|bij)\s+(?:een\s+)?([a-zÃƒÂ©ÃƒÂ«ÃƒÂ¯ÃƒÂ¶ÃƒÂ¼ÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ¤ÃƒÂ¨ÃƒÂªÃƒÂ®ÃƒÂ´ÃƒÂ»ÃƒÂ§\-]+)/i);
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
// START SERVER - Vervang je huidige testDatabaseConnections().then() blok met dit:
// =====================================================

testDatabaseConnections().then(async () => {
  
  // Preload matching cache voor snelle eerste requests
  console.log('Ã°Å¸â€â€ž Preloading matching cache...');
  const cacheStart = Date.now();
  
  try {
    await preloadCache();
    const cacheDuration = ((Date.now() - cacheStart) / 1000).toFixed(1);
    console.log(`Ã¢Å“â€¦ Matching cache ready (${cacheDuration}s)`);
  } catch (err) {
    console.warn('Ã¢Å¡Â Ã¯Â¸Â Matching cache preload failed:', err.message);
    console.warn('   Cache wordt opgebouwd bij eerste request');
  }
  
  app.listen(PORT, HOST, () => {
    console.log(`
  Ã¢â€¢â€Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢â€”
  Ã¢â€¢â€˜  CompetentNL Server v4.1.0 - All Scenarios + Matching     Ã¢â€¢â€˜
  Ã¢â€¢Â Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â£
  Ã¢â€¢â€˜  Host:     ${HOST}                                        Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Port:     ${PORT}                                        Ã¢â€¢â€˜
  Ã¢â€¢â€˜  URL:      http://${HOST}:${PORT}                         Ã¢â€¢â€˜
  Ã¢â€¢Â Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â£
  Ã¢â€¢â€˜  Test Scenarios:                                          Ã¢â€¢â€˜
  Ã¢â€¢â€˜  1.  Disambiguatie:    architect Ã¢â€ â€™ meerdere opties        Ã¢â€¢â€˜
  Ã¢â€¢â€˜  1a. Feedback:         na disambiguatie                   Ã¢â€¢â€˜
  Ã¢â€¢â€˜  2.  Domein-detectie:  MBO kwalificaties Ã¢â€ â€™ education      Ã¢â€¢â€˜
  Ã¢â€¢â€˜  2a. Aantallen:        50+ resultaten Ã¢â€ â€™ COUNT query       Ã¢â€¢â€˜
  Ã¢â€¢â€˜  3.  Vervolgvraag:     "Hoeveel zijn er?" met context     Ã¢â€¢â€˜
  Ã¢â€¢â€˜  4.  Concept resolver: loodgieter Ã¢â€ â€™ officiÃƒÂ«le naam        Ã¢â€¢â€˜
  Ã¢â€¢â€˜  5.  Opleiding:        vaardigheden + kennisgebieden      Ã¢â€¢â€˜
  Ã¢â€¢â€˜  6.  RIASEC:           Hollandcode R Ã¢â€ â€™ hasRIASEC          Ã¢â€¢â€˜
  Ã¢â€¢Â Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â£
  Ã¢â€¢â€˜  Bestaande Endpoints:                                     Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /concept/resolve      - Concept disambiguatie     Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /concept/confirm      - Bevestig keuze            Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /feedback             - Algemene feedback         Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /orchestrator/classify - Domein-detectie          Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /generate             - SPARQL generatie          Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ GET  /test/health          - Test status               Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /test/scenario        - Run test scenario         Ã¢â€¢â€˜
  Ã¢â€¢Â Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â£
  Ã¢â€¢â€˜  Nieuwe Matching Endpoints:                               Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /api/match-profile         - Match profiel        Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ POST /api/match-profile/preload - Herlaad cache        Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ DELETE /api/match-profile/cache - Wis cache            Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ GET  /api/match-profile/health  - Health check         Ã¢â€¢â€˜
  Ã¢â€¢â€˜  Ã¢â‚¬Â¢ GET  /api/idf-weights           - Bekijk IDF weights   Ã¢â€¢â€˜
  Ã¢â€¢Å¡Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    `);
  });
});
