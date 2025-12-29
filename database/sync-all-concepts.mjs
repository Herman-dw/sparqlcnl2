/**
 * sync-all-concepts.mjs - v3.2.0
 * ==============================
 * Synchroniseert ALLE concept types van CompetentNL SPARQL endpoint
 * naar de lokale MariaDB database.
 * 
 * Dit script haalt op:
 * - Occupations (Beroepen) + altLabels
 * - EducationalNorms (Opleidingen)
 * - HumanCapabilities (Vaardigheden)
 * - KnowledgeAreas (Kennisgebieden)
 * - Tasks (Taken)
 * - WorkingConditions (Werkomstandigheden)
 * - IDF Weights (uit idf-weights.json)
 * 
 * Gebruik:
 *   node sync-all-concepts.mjs
 *   node sync-all-concepts.mjs --type=occupation
 *   node sync-all-concepts.mjs --type=knowledge
 *   node sync-all-concepts.mjs --type=idf
 *   node sync-all-concepts.mjs --skip-clear
 *   node sync-all-concepts.mjs --skip-idf
 * 
 * Vereist: .env.local met COMPETENTNL_API_KEY
 * 
 * Changelog:
 *   v3.2.0 - UNION queries opgesplitst (fix voor SPARQL endpoint limitaties)
 *   v3.1.0 - IDF weights sync toegevoegd
 *   v3.0.0 - Initiële versie
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

// ============================================================
// CONFIGURATIE
// ============================================================

const SPARQL_ENDPOINT = process.env.COMPETENTNL_ENDPOINT || 'https://linkeddata.competentnl.nl/sparql';
const API_KEY = process.env.COMPETENTNL_API_KEY || '';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'competentnl_rag',
  charset: 'utf8mb4'
};

// IDF weights bestand - zoek in huidige map of parent directory
const IDF_WEIGHTS_LOCATIONS = [
  path.join(__dirname, 'idf-weights.json'),           // database/idf-weights.json
  path.join(__dirname, '..', 'idf-weights.json'),     // project root
  path.join(process.cwd(), 'idf-weights.json')        // working directory
];
const IDF_WEIGHTS_FILE = IDF_WEIGHTS_LOCATIONS.find(f => fs.existsSync(f)) || IDF_WEIGHTS_LOCATIONS[0];
const TOTAL_OCCUPATIONS = 3263;

// Parse args
const args = process.argv.slice(2);
const SPECIFIC_TYPE = args.find(a => a.startsWith('--type='))?.split('=')[1];
const SKIP_CLEAR = args.includes('--skip-clear');
const SKIP_IDF = args.includes('--skip-idf');

// ============================================================
// IDF CATEGORY KEYWORDS
// ============================================================

const CATEGORY_KEYWORDS = {
  DENKEN: [
    'analyseren', 'evalueren', 'onderzoeken', 'leren', 'plannen',
    'informatie', 'begrijpen', 'interpreteren', 'reflecteren',
    'kritisch', 'logisch', 'abstract', 'conceptueel'
  ],
  DOEN: [
    'bedienen', 'hanteren', 'verzorgen', 'vervaardigen', 'bewerken',
    'repareren', 'monteren', 'installeren', 'rijden', 'besturen',
    'verplegen', 'fysiek', 'motorisch', 'handmatig'
  ],
  VERBINDEN: [
    'communiceren', 'samenwerken', 'overleggen', 'adviseren',
    'onderhandelen', 'presenteren', 'netwerken', 'bemiddelen',
    'luisteren', 'aandacht', 'begrip', 'empathie', 'begeleiden'
  ],
  STUREN: [
    'coördineren', 'leiding', 'organiseren', 'delegeren',
    'managen', 'aansturen', 'beslissen', 'richting'
  ],
  CREËREN: [
    'ontwerpen', 'creëren', 'innoveren', 'ontwikkelen',
    'bedenken', 'vormgeven', 'creatief', 'artistiek', 'uitdrukken'
  ],
  ZIJN: [
    'zorgvuldig', 'flexibel', 'integer', 'stressbestendig',
    'nauwkeurig', 'betrouwbaar', 'verantwoordelijk', 'aanpassings'
  ]
};

// ============================================================
// CONCEPT CONFIGURATIES
// ============================================================

const CONCEPT_CONFIGS = [
  {
    name: 'Occupations (Beroepen) - prefLabels',
    type: 'occupation',
    table: 'occupation_labels',
    uriColumn: 'occupation_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:Occupation .
        ?uri skos:prefLabel ?prefLabel .
        BIND(?prefLabel AS ?label)
        BIND("prefLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Occupations (Beroepen) - altLabels',
    type: 'occupation',
    table: 'occupation_labels',
    uriColumn: 'occupation_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:Occupation .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skos:altLabel ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  },
  {
    name: 'Occupations (Beroepen) - skosxl altLabels',
    type: 'occupation',
    table: 'occupation_labels',
    uriColumn: 'occupation_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:Occupation .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skosxl:altLabel ?xlLabel .
        ?xlLabel skosxl:literalForm ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  },
  {
    name: 'Education (EducationalNorm) - prefLabels',
    type: 'education',
    table: 'education_labels',
    uriColumn: 'education_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:EducationalNorm .
        ?uri skos:prefLabel ?prefLabel .
        BIND(?prefLabel AS ?label)
        BIND("prefLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Education (EducationalNorm) - altLabels',
    type: 'education',
    table: 'education_labels',
    uriColumn: 'education_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:EducationalNorm .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skos:altLabel ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  },
  {
    name: 'Education (MboKwalificatie) - prefLabels',
    type: 'education',
    table: 'education_labels',
    uriColumn: 'education_uri',
    query: `
      PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a ksmo:MboKwalificatie .
        ?uri skos:prefLabel ?prefLabel .
        BIND(?prefLabel AS ?label)
        BIND("prefLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Education (MboKwalificatie) - altLabels',
    type: 'education',
    table: 'education_labels',
    uriColumn: 'education_uri',
    query: `
      PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a ksmo:MboKwalificatie .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skos:altLabel ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  },
  {
    name: 'Capabilities (Vaardigheden) - prefLabels',
    type: 'capability',
    table: 'capability_labels',
    uriColumn: 'capability_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:HumanCapability .
        ?uri skos:prefLabel ?prefLabel .
        BIND(?prefLabel AS ?label)
        BIND("prefLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Capabilities (Vaardigheden) - altLabels',
    type: 'capability',
    table: 'capability_labels',
    uriColumn: 'capability_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:HumanCapability .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skos:altLabel ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  },
  {
    name: 'Knowledge Areas (Kennisgebieden) - prefLabels',
    type: 'knowledge',
    table: 'knowledge_labels',
    uriColumn: 'knowledge_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:KnowledgeArea .
        ?uri skos:prefLabel ?prefLabel .
        BIND(?prefLabel AS ?label)
        BIND("prefLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Knowledge Areas (Kennisgebieden) - altLabels',
    type: 'knowledge',
    table: 'knowledge_labels',
    uriColumn: 'knowledge_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:KnowledgeArea .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skos:altLabel ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  },
  {
    name: 'Tasks (Taken) - prefLabels',
    type: 'task',
    table: 'task_labels',
    uriColumn: 'task_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:Task .
        ?uri skos:prefLabel ?prefLabel .
        BIND(?prefLabel AS ?label)
        BIND("prefLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Tasks (Taken) - altLabels',
    type: 'task',
    table: 'task_labels',
    uriColumn: 'task_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:Task .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skos:altLabel ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  },
  {
    name: 'Working Conditions (Werkomstandigheden) - prefLabels',
    type: 'workingcondition',
    table: 'workingcondition_labels',
    uriColumn: 'workingcondition_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:WorkingCondition .
        ?uri skos:prefLabel ?prefLabel .
        BIND(?prefLabel AS ?label)
        BIND("prefLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Working Conditions (Werkomstandigheden) - altLabels',
    type: 'workingcondition',
    table: 'workingcondition_labels',
    uriColumn: 'workingcondition_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:WorkingCondition .
        ?uri skos:prefLabel ?prefLabel .
        ?uri skos:altLabel ?label .
        BIND("altLabel" AS ?labelType)
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
      }
    `
  }
];

// ============================================================
// HELPERS
// ============================================================

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function determineCategory(skillLabel) {
  const lowerLabel = skillLabel.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerLabel.includes(keyword)) {
        return category;
      }
    }
  }
  
  return 'OVERIG';
}

async function executeSparql(query) {
  const params = new URLSearchParams();
  params.append('query', query);

  const headers = {
    'Accept': 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
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

async function ensureTableExists(connection, config) {
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${config.table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ${config.uriColumn} VARCHAR(500) NOT NULL,
      pref_label VARCHAR(500) NOT NULL,
      label VARCHAR(500) NOT NULL,
      label_normalized VARCHAR(500),
      label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel') DEFAULT 'prefLabel',
      language VARCHAR(10) DEFAULT 'nl',
      source VARCHAR(50) DEFAULT 'sparql_sync',
      usage_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_label (label(100)),
      INDEX idx_label_normalized (label_normalized(100)),
      INDEX idx_uri (${config.uriColumn}(100)),
      INDEX idx_pref_label (pref_label(100)),
      UNIQUE KEY unique_label (${config.uriColumn}(255), label(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
  
  await connection.execute(createSql);
}

async function ensureIdfTableExists(connection) {
  const createSql = `
    CREATE TABLE IF NOT EXISTS skill_idf_weights (
      skill_uri VARCHAR(500) PRIMARY KEY,
      skill_label VARCHAR(255),
      occupation_count INT,
      total_occupations INT DEFAULT 3263,
      idf_weight DECIMAL(8,4),
      skill_category VARCHAR(50),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      INDEX idx_skill_label (skill_label),
      INDEX idx_idf_weight (idf_weight),
      INDEX idx_skill_category (skill_category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
  
  await connection.execute(createSql);
}

async function syncConceptType(connection, config, clearedTables) {
  console.log(`\n📦 Syncing ${config.name}...`);
  
  let inserted = 0;
  let skipped = 0;
  
  try {
    // Ensure table exists
    await ensureTableExists(connection, config);
    
    // Clear existing data ONLY ONCE per table (unless --skip-clear)
    if (!SKIP_CLEAR && !clearedTables.has(config.table)) {
      await connection.execute(`DELETE FROM ${config.table} WHERE source = 'sparql_sync'`);
      console.log(`   🗑️  Cleared existing sparql_sync data`);
      clearedTables.add(config.table);
    }
    
    // Fetch from SPARQL
    console.log(`   📥 Fetching from SPARQL...`);
    const results = await executeSparql(config.query);
    console.log(`   Found ${results.length} labels`);
    
    // Insert each label
    const insertSql = `
      INSERT INTO ${config.table} 
      (${config.uriColumn}, pref_label, label, label_normalized, label_type, source)
      VALUES (?, ?, ?, ?, ?, 'sparql_sync')
      ON DUPLICATE KEY UPDATE usage_count = usage_count
    `;
    
    for (const row of results) {
      const uri = row.uri?.value;
      const prefLabel = row.prefLabel?.value;
      const label = row.label?.value;
      const labelType = row.labelType?.value || 'prefLabel';
      
      if (!uri || !prefLabel || !label) {
        skipped++;
        continue;
      }
      
      const normalized = normalize(label);
      if (normalized.length < 2) {
        skipped++;
        continue;
      }
      
      try {
        await connection.execute(insertSql, [
          uri,
          prefLabel,
          label,
          normalized,
          labelType
        ]);
        inserted++;
      } catch (err) {
        if (!err.message?.includes('Duplicate')) {
          // Only log non-duplicate errors
          if (skipped < 5) console.warn(`   ⚠️  ${err.message.substring(0, 100)}`);
        }
        skipped++;
      }
    }
    
    console.log(`   ✅ Inserted: ${inserted}, Skipped: ${skipped}`);
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
  
  return { inserted, skipped };
}

// ============================================================
// IDF WEIGHTS SYNC
// ============================================================

async function syncIdfWeights(connection) {
  console.log(`\n📦 Syncing IDF Weights (Vaardigheden gewichten)...`);
  
  let inserted = 0;
  let skipped = 0;
  
  try {
    // Check if JSON file exists
    if (!fs.existsSync(IDF_WEIGHTS_FILE)) {
      console.log(`   ⚠️  idf-weights.json niet gevonden`);
      console.log(`   ℹ️  Gezocht in:`);
      IDF_WEIGHTS_LOCATIONS.forEach(loc => console.log(`      - ${loc}`));
      console.log(`   ℹ️  Genereer eerst met: node calculate-idf-weights.js`);
      return { inserted: 0, skipped: 0 };
    }
    
    // Ensure table exists
    await ensureIdfTableExists(connection);
    
    // Read JSON file
    console.log(`   📥 Inlezen ${IDF_WEIGHTS_FILE}...`);
    const jsonContent = fs.readFileSync(IDF_WEIGHTS_FILE, 'utf-8');
    const skills = JSON.parse(jsonContent);
    console.log(`   Found ${skills.length} skills`);
    
    // Clear existing data (unless --skip-clear)
    if (!SKIP_CLEAR) {
      await connection.execute(`TRUNCATE TABLE skill_idf_weights`);
      console.log(`   🗑️  Cleared existing IDF data`);
    }
    
    // Insert SQL
    const insertSql = `
      INSERT INTO skill_idf_weights 
      (skill_uri, skill_label, occupation_count, total_occupations, idf_weight, skill_category)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        skill_label = VALUES(skill_label),
        occupation_count = VALUES(occupation_count),
        total_occupations = VALUES(total_occupations),
        idf_weight = VALUES(idf_weight),
        skill_category = VALUES(skill_category),
        updated_at = CURRENT_TIMESTAMP
    `;
    
    // Insert each skill
    for (const skill of skills) {
      const category = determineCategory(skill.label);
      
      try {
        await connection.execute(insertSql, [
          skill.uri,
          skill.label,
          skill.occupationCount,
          TOTAL_OCCUPATIONS,
          parseFloat(skill.idf.toFixed(4)),
          category
        ]);
        inserted++;
      } catch (err) {
        skipped++;
        if (skipped <= 3) {
          console.warn(`   ⚠️  ${err.message.substring(0, 100)}`);
        }
      }
    }
    
    console.log(`   ✅ Inserted: ${inserted}, Skipped: ${skipped}`);
    
    // Show stats
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        ROUND(AVG(idf_weight), 3) as avg_idf,
        ROUND(MAX(idf_weight), 3) as max_idf,
        ROUND(MIN(idf_weight), 3) as min_idf
      FROM skill_idf_weights
    `);
    
    if (stats[0]) {
      console.log(`   📊 Stats: ${stats[0].total} skills, IDF range: ${stats[0].min_idf} - ${stats[0].max_idf}, avg: ${stats[0].avg_idf}`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
  
  return { inserted, skipped };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   CompetentNL Concept Sync v3.2.0');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`API Key:  ${API_KEY ? '✅ Configured' : '❌ Not set'}`);
  console.log(`Database: ${DB_CONFIG.database}`);
  if (SPECIFIC_TYPE) console.log(`Type:     ${SPECIFIC_TYPE} only`);
  if (SKIP_CLEAR) console.log(`Mode:     Skip clear (append only)`);
  if (SKIP_IDF) console.log(`Mode:     Skip IDF weights sync`);
  
  let connection = null;
  
  try {
    // Connect to database
    console.log('\n🔌 Connecting to database...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('   ✅ Connected');
    
    // If only IDF requested
    if (SPECIFIC_TYPE === 'idf') {
      await syncIdfWeights(connection);
      console.log('\n✅ Done!\n');
      return;
    }
    
    // Filter configs if specific type requested
    let configs = CONCEPT_CONFIGS;
    if (SPECIFIC_TYPE) {
      configs = configs.filter(c => c.type === SPECIFIC_TYPE);
      if (configs.length === 0) {
        console.error(`❌ Unknown type: ${SPECIFIC_TYPE}`);
        console.log(`   Available: ${CONCEPT_CONFIGS.map(c => c.type).join(', ')}, idf`);
        process.exit(1);
      }
    }
    
    // Sync each concept type
    const totals = { inserted: 0, skipped: 0 };
    const clearedTables = new Set(); // Track which tables have been cleared
    
    for (const config of configs) {
      const result = await syncConceptType(connection, config, clearedTables);
      totals.inserted += result.inserted;
      totals.skipped += result.skipped;
    }
    
    // Sync IDF weights (unless skipped or specific type other than idf requested)
    if (!SKIP_IDF && !SPECIFIC_TYPE) {
      const idfResult = await syncIdfWeights(connection);
      totals.inserted += idfResult.inserted;
      totals.skipped += idfResult.skipped;
    }
    
    // Print summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   SYNC COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total inserted: ${totals.inserted}`);
    console.log(`Total skipped:  ${totals.skipped}`);
    
    // Show table counts (unique tables only)
    console.log('\n📊 Table counts:');
    const displayedTables = new Set();
    for (const config of configs) {
      if (displayedTables.has(config.table)) continue;
      displayedTables.add(config.table);
      try {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) as count FROM ${config.table}`
        );
        console.log(`   ${config.table}: ${rows[0].count} labels`);
      } catch (e) {
        console.log(`   ${config.table}: (table not found)`);
      }
    }
    
    // Show IDF count
    if (!SKIP_IDF && !SPECIFIC_TYPE) {
      try {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) as count FROM skill_idf_weights`
        );
        console.log(`   skill_idf_weights: ${rows[0].count} skills`);
      } catch (e) {
        console.log(`   skill_idf_weights: (table not found)`);
      }
    }
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
