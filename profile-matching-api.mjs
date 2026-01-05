/**
 * Profile Matching API - v1.1.0
 * =============================
 * API endpoint voor profiel-naar-beroep matching met IDF-gewogen scores.
 * 
 * Gebaseerd op: voorstel-matching-algoritme.md
 * 
 * BELANGRIJKE WIJZIGING v1.1.0:
 * - Gebruikt simpele SPARQL queries (endpoint ondersteunt geen complexe UNIONs)
 * - Cachet beroepsvereisten lokaal
 * - Veel snellere matching na eerste load
 * 
 * Gebruik:
 *   POST /api/match-profile
 *   Body: { skills: [...], knowledge: [...], tasks: [...] }
 * 
 * Of als standalone module:
 *   import { matchProfile } from './profile-matching-api.mjs';
 *   const results = await matchProfile({ skills: [...] });
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

// ============================================================
// CONFIGURATIE
// ============================================================

// BELANGRIJK: Gebruik sparql.competentnl.nl, NIET linkeddata.competentnl.nl/sparql
const SPARQL_ENDPOINT = process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
const API_KEY = process.env.COMPETENTNL_API_KEY || '';

const DB_CONFIG = {
  host: process.env.MARIADB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MARIADB_PORT || process.env.DB_PORT || '3306'),
  user: process.env.MARIADB_USER || process.env.DB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || process.env.DB_NAME || 'competentnl_rag',
  charset: 'utf8mb4'
};

// Matching gewichten (uit voorstel-matching-algoritme.md sectie 3.1)
const WEIGHTS = {
  skills: 0.50,      // α - vaardigheden (hoofdindicator)
  knowledge: 0.30,   // β - kennisgebieden (domeinspecifiek)
  tasks: 0.20        // γ - taken (concrete werkzaamheden)
};

// Relevantie multiplicatoren (uit sectie 3.3)
const RELEVANCE_WEIGHTS = {
  essential: 1.0,
  important: 0.4,
  somewhat: 0.2,
  optional: 0.2  // Voor taken
};

// Default IDF voor items zonder bekende IDF
const DEFAULT_IDF = 0.5;

// Maximum aantal resultaten
const MAX_RESULTS = 50;

// ============================================================
// CACHE VOOR BEROEPSVEREISTEN
// ============================================================

// In-memory cache voor beroepsvereisten
let occupationRequirementsCache = null;
let cacheLoadTime = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 uur

// ============================================================
// DATABASE CONNECTION POOL
// ============================================================

let connectionPool = null;

async function getConnection() {
  if (!connectionPool) {
    connectionPool = mysql.createPool({
      ...DB_CONFIG,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return connectionPool;
}

// ============================================================
// SPARQL HELPER
// ============================================================

async function executeSparql(query) {
  const params = new URLSearchParams();
  params.append('query', query);
  params.append('format', 'application/sparql-results+json');

  const headers = {
    'Accept': 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'CompetentNL-Matching-API/1.1'
  };
  
  if (API_KEY) {
    headers['apikey'] = API_KEY;
  }

  const response = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers,
    body: params
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SPARQL error ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.results?.bindings || [];
}

// ============================================================
// IDF WEIGHTS OPHALEN
// ============================================================

/**
 * Haalt IDF gewichten op uit de database
 * @returns {Map<string, {uri: string, label: string, idf: number}>}
 */
async function getIdfWeights() {
  const pool = await getConnection();
  const [rows] = await pool.execute(`
    SELECT skill_uri, skill_label, idf_weight 
    FROM skill_idf_weights
  `);
  
  const idfMap = new Map();
  
  for (const row of rows) {
    const data = {
      uri: row.skill_uri,
      label: row.skill_label,
      idf: parseFloat(row.idf_weight)
    };
    
    // Index op URI
    idfMap.set(row.skill_uri, data);
    // Index op label (lowercase) voor flexibele lookup
    idfMap.set(row.skill_label.toLowerCase(), data);
  }
  
  return idfMap;
}

// ============================================================
// CONCEPT RESOLUTION (Labels naar URIs)
// ============================================================

/**
 * Resolveert labels naar URIs via de database
 */
async function resolveLabelsToUris(labels, conceptType) {
  if (!labels || labels.length === 0) return new Map();
  
  const pool = await getConnection();
  const resolved = new Map();
  
  const tableConfig = {
    capability: { table: 'capability_labels', uriColumn: 'capability_uri' },
    skill: { table: 'capability_labels', uriColumn: 'capability_uri' },
    knowledge: { table: 'knowledge_labels', uriColumn: 'knowledge_uri' },
    task: { table: 'task_labels', uriColumn: 'task_uri' }
  };
  
  const config = tableConfig[conceptType];
  if (!config) return resolved;
  
  for (const label of labels) {
    const normalized = label.toLowerCase().trim();
    
    // Probeer exacte match
    const [exactRows] = await pool.execute(`
      SELECT ${config.uriColumn} as uri, pref_label
      FROM ${config.table}
      WHERE LOWER(label) = ? OR LOWER(pref_label) = ?
      LIMIT 1
    `, [normalized, normalized]);
    
    if (exactRows.length > 0) {
      resolved.set(label, {
        uri: exactRows[0].uri,
        prefLabel: exactRows[0].pref_label
      });
    } else {
      // Probeer fuzzy match
      const [fuzzyRows] = await pool.execute(`
        SELECT ${config.uriColumn} as uri, pref_label
        FROM ${config.table}
        WHERE LOWER(label) LIKE ? OR LOWER(pref_label) LIKE ?
        ORDER BY LENGTH(label) ASC
        LIMIT 1
      `, [`%${normalized}%`, `%${normalized}%`]);
      
      if (fuzzyRows.length > 0) {
        resolved.set(label, {
          uri: fuzzyRows[0].uri,
          prefLabel: fuzzyRows[0].pref_label
        });
      }
    }
  }
  
  return resolved;
}

// ============================================================
// BEROEPSVEREISTEN OPHALEN (SIMPELE QUERIES)
// ============================================================

/**
 * Haalt alle skill-occupation koppelingen op via simpele SPARQL query
 * Gebruikt 3 aparte queries per relevantie niveau om complexe UNIONs te vermijden
 */
async function fetchSkillOccupationLinks() {
  console.log('   📥 Fetching skill-occupation links...');
  
  const results = [];
  
  // Query per relevantie niveau (vermijdt UNION problemen)
  const relevanceLevels = [
    { predicate: 'cnlo:requiresHATEssential', relevance: 'essential' },
    { predicate: 'cnlo:requiresHATImportant', relevance: 'important' },
    { predicate: 'cnlo:requiresHATSomewhat', relevance: 'somewhat' }
  ];
  
  for (const level of relevanceLevels) {
    const query = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?occ ?occLabel ?skill ?skillLabel
      WHERE {
        ?occ a cnlo:Occupation ;
             skos:prefLabel ?occLabel ;
             ${level.predicate} ?skill .
        FILTER(LANG(?occLabel) = "nl")
        
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?skillLabel .
        FILTER(LANG(?skillLabel) = "nl")
      }
    `;
    
    try {
      const bindings = await executeSparql(query);
      console.log(`      ${level.relevance}: ${bindings.length} links`);
      
      for (const row of bindings) {
        results.push({
          occ: row.occ,
          occLabel: row.occLabel,
          skill: row.skill,
          skillLabel: row.skillLabel,
          relevance: { value: level.relevance }
        });
      }
    } catch (error) {
      console.error(`      ⚠️ Error fetching ${level.relevance}: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Haalt alle knowledge-occupation koppelingen op
 */
async function fetchKnowledgeOccupationLinks() {
  console.log('   📥 Fetching knowledge-occupation links...');
  
  const results = [];
  
  const relevanceLevels = [
    { predicate: 'cnlo:requiresHATEssential', relevance: 'essential' },
    { predicate: 'cnlo:requiresHATImportant', relevance: 'important' },
    { predicate: 'cnlo:requiresHATSomewhat', relevance: 'somewhat' }
  ];
  
  for (const level of relevanceLevels) {
    const query = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?occ ?occLabel ?knowledge ?knowledgeLabel
      WHERE {
        ?occ a cnlo:Occupation ;
             skos:prefLabel ?occLabel ;
             ${level.predicate} ?knowledge .
        FILTER(LANG(?occLabel) = "nl")
        
        ?knowledge a cnlo:KnowledgeArea ;
                   skos:prefLabel ?knowledgeLabel .
        FILTER(LANG(?knowledgeLabel) = "nl")
      }
    `;
    
    try {
      const bindings = await executeSparql(query);
      console.log(`      ${level.relevance}: ${bindings.length} links`);
      
      for (const row of bindings) {
        results.push({
          occ: row.occ,
          occLabel: row.occLabel,
          knowledge: row.knowledge,
          knowledgeLabel: row.knowledgeLabel,
          relevance: { value: level.relevance }
        });
      }
    } catch (error) {
      console.error(`      ⚠️ Error fetching ${level.relevance}: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Bouwt de complete cache van beroepsvereisten
 */
async function buildOccupationRequirementsCache() {
  console.log('\n🔄 Building occupation requirements cache...');
  const startTime = Date.now();
  
  const occupationsMap = new Map();
  
  // Haal skill koppelingen op
  const skillLinks = await fetchSkillOccupationLinks();
  console.log(`   Total skill links: ${skillLinks.length}`);
  
  for (const row of skillLinks) {
    const occUri = row.occ?.value;
    const occLabel = row.occLabel?.value;
    
    if (!occUri) continue;
    
    if (!occupationsMap.has(occUri)) {
      occupationsMap.set(occUri, {
        uri: occUri,
        label: occLabel,
        skills: [],
        knowledge: [],
        tasks: []
      });
    }
    
    occupationsMap.get(occUri).skills.push({
      uri: row.skill?.value,
      label: row.skillLabel?.value,
      relevance: row.relevance?.value || 'somewhat'
    });
  }
  
  // Haal knowledge koppelingen op
  const knowledgeLinks = await fetchKnowledgeOccupationLinks();
  console.log(`   Total knowledge links: ${knowledgeLinks.length}`);
  
  for (const row of knowledgeLinks) {
    const occUri = row.occ?.value;
    
    if (!occUri) continue;
    
    // Maak beroep aan als het nog niet bestaat
    if (!occupationsMap.has(occUri)) {
      occupationsMap.set(occUri, {
        uri: occUri,
        label: row.occLabel?.value,
        skills: [],
        knowledge: [],
        tasks: []
      });
    }
    
    occupationsMap.get(occUri).knowledge.push({
      uri: row.knowledge?.value,
      label: row.knowledgeLabel?.value,
      relevance: row.relevance?.value || 'somewhat'
    });
  }
  
  const duration = Date.now() - startTime;
  console.log(`   ✅ Cache built: ${occupationsMap.size} occupations in ${duration}ms\n`);
  
  return occupationsMap;
}

/**
 * Haalt de gecachete beroepsvereisten op (of bouwt cache als nodig)
 */
async function getOccupationRequirements() {
  // Check of cache nog geldig is
  if (occupationRequirementsCache && cacheLoadTime) {
    const cacheAge = Date.now() - cacheLoadTime;
    if (cacheAge < CACHE_TTL) {
      return occupationRequirementsCache;
    }
  }
  
  // Bouw nieuwe cache
  occupationRequirementsCache = await buildOccupationRequirementsCache();
  cacheLoadTime = Date.now();
  
  return occupationRequirementsCache;
}

// ============================================================
// SCORE BEREKENING
// ============================================================

/**
 * Berekent de gewogen coverage score voor één dimensie
 */
function calculateDimensionScore(profileUris, requirements, idfMap, useIdf = true) {
  if (!requirements || requirements.length === 0) {
    return { score: 0, matched: [], gaps: [], totalWeight: 0, matchedWeight: 0 };
  }
  
  let totalWeight = 0;
  let matchedWeight = 0;
  const matched = [];
  const gaps = [];
  
  for (const req of requirements) {
    const relevanceWeight = RELEVANCE_WEIGHTS[req.relevance] || 0.2;
    const idf = useIdf 
      ? (idfMap.get(req.uri)?.idf || idfMap.get(req.label?.toLowerCase())?.idf || DEFAULT_IDF) 
      : 1.0;
    const weight = idf * relevanceWeight;
    
    totalWeight += weight;
    
    if (profileUris.has(req.uri)) {
      matchedWeight += weight;
      matched.push({
        uri: req.uri,
        label: req.label,
        relevance: req.relevance,
        idf: useIdf ? idf : undefined,
        weight: weight
      });
    } else {
      gaps.push({
        uri: req.uri,
        label: req.label,
        relevance: req.relevance,
        idf: useIdf ? idf : undefined,
        weight: weight
      });
    }
  }
  
  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  
  return { score, matched, gaps, totalWeight, matchedWeight };
}

/**
 * Berekent de totale matchingscore voor een beroep
 */
function calculateMatchScore(skillScore, knowledgeScore, taskScore) {
  return (
    WEIGHTS.skills * skillScore.score +
    WEIGHTS.knowledge * knowledgeScore.score +
    WEIGHTS.tasks * taskScore.score
  );
}

// ============================================================
// MAIN MATCHING FUNCTIE
// ============================================================

/**
 * Match een profiel tegen alle relevante beroepen
 * 
 * @param {Object} profile - Het profiel om te matchen
 * @param {string[]} profile.skills - Lijst van vaardigheden (labels of URIs)
 * @param {string[]} profile.knowledge - Lijst van kennisgebieden (labels of URIs)
 * @param {string[]} profile.tasks - Lijst van taken (labels of URIs)
 * @param {Object} options - Opties
 * @param {number} options.limit - Maximum aantal resultaten (default: 50)
 * @param {number} options.minScore - Minimum score voor resultaten (default: 0.1)
 * @param {boolean} options.includeGaps - Of gap-analyse meegenomen moet worden (default: true)
 * @param {boolean} options.includeMatched - Of matched items meegenomen moet worden (default: true)
 * 
 * @returns {Promise<MatchResult>}
 */
export async function matchProfile(profile, options = {}) {
  const startTime = Date.now();
  
  const {
    limit = MAX_RESULTS,
    minScore = 0.1,
    includeGaps = true,
    includeMatched = true
  } = options;
  
  // Validatie
  if (!profile || (!profile.skills?.length && !profile.knowledge?.length && !profile.tasks?.length)) {
    return {
      success: false,
      error: 'Profiel moet minstens één skill, kennisgebied of taak bevatten',
      matches: [],
      meta: { executionTime: Date.now() - startTime }
    };
  }
  
  try {
    // 1. Haal IDF gewichten op
    const idfMap = await getIdfWeights();
    
    // 2. Resolveer labels naar URIs
    const skillsInput = profile.skills || [];
    const knowledgeInput = profile.knowledge || [];
    const tasksInput = profile.tasks || [];
    
    const isUri = (s) => s.startsWith('http://') || s.startsWith('https://');
    
    const resolvedSkills = new Map();
    const resolvedKnowledge = new Map();
    const resolvedTasks = new Map();
    
    // Resolveer skills
    for (const item of skillsInput) {
      if (isUri(item)) {
        resolvedSkills.set(item, { uri: item, prefLabel: item });
      }
    }
    const skillLabels = skillsInput.filter(s => !isUri(s));
    if (skillLabels.length > 0) {
      const resolved = await resolveLabelsToUris(skillLabels, 'skill');
      resolved.forEach((v, k) => resolvedSkills.set(k, v));
    }
    
    // Resolveer knowledge
    for (const item of knowledgeInput) {
      if (isUri(item)) {
        resolvedKnowledge.set(item, { uri: item, prefLabel: item });
      }
    }
    const knowledgeLabels = knowledgeInput.filter(s => !isUri(s));
    if (knowledgeLabels.length > 0) {
      const resolved = await resolveLabelsToUris(knowledgeLabels, 'knowledge');
      resolved.forEach((v, k) => resolvedKnowledge.set(k, v));
    }
    
    // Resolveer tasks
    for (const item of tasksInput) {
      if (isUri(item)) {
        resolvedTasks.set(item, { uri: item, prefLabel: item });
      }
    }
    const taskLabels = tasksInput.filter(s => !isUri(s));
    if (taskLabels.length > 0) {
      const resolved = await resolveLabelsToUris(taskLabels, 'task');
      resolved.forEach((v, k) => resolvedTasks.set(k, v));
    }
    
    // Maak sets van URIs voor snelle lookup
    const profileSkillUris = new Set(Array.from(resolvedSkills.values()).map(r => r.uri));
    const profileKnowledgeUris = new Set(Array.from(resolvedKnowledge.values()).map(r => r.uri));
    const profileTaskUris = new Set(Array.from(resolvedTasks.values()).map(r => r.uri));
    
    // Resolved profile info
    const resolvedProfile = {
      skills: Array.from(resolvedSkills.entries()).map(([input, resolved]) => ({
        input,
        resolved: resolved.prefLabel,
        uri: resolved.uri
      })),
      knowledge: Array.from(resolvedKnowledge.entries()).map(([input, resolved]) => ({
        input,
        resolved: resolved.prefLabel,
        uri: resolved.uri
      })),
      tasks: Array.from(resolvedTasks.entries()).map(([input, resolved]) => ({
        input,
        resolved: resolved.prefLabel,
        uri: resolved.uri
      }))
    };
    
    // 3. Haal beroepsvereisten op (uit cache)
    const occupations = await getOccupationRequirements();
    
    // 4. Bereken scores voor elk beroep
    const matches = [];
    
    for (const [occUri, occ] of occupations) {
      // Skip beroepen zonder overlap
      const hasSkillOverlap = occ.skills.some(s => profileSkillUris.has(s.uri));
      const hasKnowledgeOverlap = occ.knowledge.some(k => profileKnowledgeUris.has(k.uri));
      const hasTaskOverlap = occ.tasks.some(t => profileTaskUris.has(t.uri));
      
      if (!hasSkillOverlap && !hasKnowledgeOverlap && !hasTaskOverlap) {
        continue;
      }
      
      // Bereken dimensie scores
      const skillScore = calculateDimensionScore(
        profileSkillUris,
        occ.skills,
        idfMap,
        true // Gebruik IDF voor skills
      );
      
      const knowledgeScore = calculateDimensionScore(
        profileKnowledgeUris,
        occ.knowledge,
        idfMap,
        false // Geen IDF voor knowledge
      );
      
      const taskScore = calculateDimensionScore(
        profileTaskUris,
        occ.tasks,
        idfMap,
        false // Geen IDF voor tasks
      );
      
      // Bereken totale score
      const totalScore = calculateMatchScore(skillScore, knowledgeScore, taskScore);
      
      // Filter op minimum score
      if (totalScore < minScore) continue;
      
      const match = {
        occupation: {
          uri: occUri,
          label: occ.label
        },
        score: Math.round(totalScore * 1000) / 1000,
        breakdown: {
          skills: {
            score: Math.round(skillScore.score * 1000) / 1000,
            weight: WEIGHTS.skills,
            matchedCount: skillScore.matched.length,
            totalCount: occ.skills.length
          },
          knowledge: {
            score: Math.round(knowledgeScore.score * 1000) / 1000,
            weight: WEIGHTS.knowledge,
            matchedCount: knowledgeScore.matched.length,
            totalCount: occ.knowledge.length
          },
          tasks: {
            score: Math.round(taskScore.score * 1000) / 1000,
            weight: WEIGHTS.tasks,
            matchedCount: taskScore.matched.length,
            totalCount: occ.tasks.length
          }
        }
      };
      
      // Voeg gaps toe
      if (includeGaps) {
        match.gaps = {
          skills: skillScore.gaps
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 10)
            .map(g => ({ label: g.label, relevance: g.relevance, idf: g.idf })),
          knowledge: knowledgeScore.gaps
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 5)
            .map(g => ({ label: g.label, relevance: g.relevance })),
          tasks: taskScore.gaps
            .slice(0, 5)
            .map(g => ({ label: g.label, relevance: g.relevance }))
        };
      }
      
      // Voeg matched items toe
      if (includeMatched) {
        match.matched = {
          skills: skillScore.matched.map(m => ({ label: m.label, relevance: m.relevance })),
          knowledge: knowledgeScore.matched.map(m => ({ label: m.label, relevance: m.relevance })),
          tasks: taskScore.matched.map(m => ({ label: m.label, relevance: m.relevance }))
        };
      }
      
      matches.push(match);
    }
    
    // 5. Sorteer op score en limiteer
    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, limit);
    
    return {
      success: true,
      matches: topMatches,
      meta: {
        executionTime: Date.now() - startTime,
        totalCandidates: occupations.size,
        matchedCandidates: matches.length,
        returnedMatches: topMatches.length,
        resolvedProfile,
        weights: WEIGHTS,
        cacheInfo: {
          cached: !!cacheLoadTime,
          cacheAge: cacheLoadTime ? Date.now() - cacheLoadTime : null
        }
      }
    };
    
  } catch (error) {
    console.error('Match profile error:', error);
    return {
      success: false,
      error: error.message,
      matches: [],
      meta: { executionTime: Date.now() - startTime }
    };
  }
}

// ============================================================
// EXPRESS ROUTE HANDLER
// ============================================================

export async function handleMatchProfile(req, res) {
  try {
    const profile = req.body;
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'Request body is verplicht'
      });
    }
    
    const options = {
      limit: parseInt(req.query.limit) || 50,
      minScore: parseFloat(req.query.minScore) || 0.1,
      includeGaps: req.query.includeGaps !== 'false',
      includeMatched: req.query.includeMatched !== 'false'
    };
    
    const result = await matchProfile(profile, options);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    return res.json(result);
    
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// ============================================================
// CACHE MANAGEMENT
// ============================================================

/**
 * Laad de cache vooraf (voor betere performance bij eerste request)
 */
export async function preloadCache() {
  console.log('Preloading occupation requirements cache...');
  await getOccupationRequirements();
  console.log('Cache preloaded successfully');
}

/**
 * Wis de cache (forceer refresh bij volgende request)
 */
export function clearCache() {
  occupationRequirementsCache = null;
  cacheLoadTime = null;
  console.log('Cache cleared');
}

// ============================================================
// CLI TEST MODUS
// ============================================================

async function runTest() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Profile Matching API v1.1.0 - Test');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`SPARQL Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`API Key: ${API_KEY ? '✅ Configured' : '❌ Not set'}\n`);
  
  // Test profiel
  const testProfile = {
    skills: [
      'Verzorgen',
      'Verplegen', 
      'Aandacht en begrip tonen',
      'Communiceren'
    ],
    knowledge: [
      'Gezondheidszorg'
    ],
    tasks: []
  };
  
  console.log('Test profiel:');
  console.log('  Skills:', testProfile.skills.join(', '));
  console.log('  Knowledge:', testProfile.knowledge.join(', '));
  console.log('');
  
  const result = await matchProfile(testProfile, { limit: 10, includeGaps: true });
  
  if (!result.success) {
    console.error('❌ Error:', result.error);
    process.exit(1);
  }
  
  console.log(`✅ ${result.matches.length} matches gevonden in ${result.meta.executionTime}ms`);
  console.log(`   (${result.meta.totalCandidates} beroepen geëvalueerd)\n`);
  
  console.log('Top 10 matches:');
  console.log('─'.repeat(70));
  
  for (let i = 0; i < result.matches.length; i++) {
    const match = result.matches[i];
    const scoreBar = '█'.repeat(Math.round(match.score * 20)) + '░'.repeat(20 - Math.round(match.score * 20));
    
    console.log(`\n${i + 1}. ${match.occupation.label}`);
    console.log(`   Score: [${scoreBar}] ${(match.score * 100).toFixed(1)}%`);
    console.log(`   Breakdown: Skills ${(match.breakdown.skills.score * 100).toFixed(0)}% (${match.breakdown.skills.matchedCount}/${match.breakdown.skills.totalCount}) | ` +
                `Knowledge ${(match.breakdown.knowledge.score * 100).toFixed(0)}% | ` +
                `Tasks ${(match.breakdown.tasks.score * 100).toFixed(0)}%`);
    
    if (match.gaps?.skills?.length > 0) {
      const topGaps = match.gaps.skills.slice(0, 3).map(g => g.label).join(', ');
      console.log(`   Top gaps: ${topGaps}`);
    }
  }
  
  console.log('\n');
  
  // Cleanup
  if (connectionPool) {
    await connectionPool.end();
  }
}

// Run test als direct uitgevoerd
const isMainModule = process.argv[1]?.endsWith('profile-matching-api.mjs');
if (isMainModule) {
  runTest().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
