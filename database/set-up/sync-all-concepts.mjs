/**
 * sync-all-concepts.mjs - v3.0.0
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
 * 
 * Gebruik:
 *   node sync-all-concepts.mjs
 *   node sync-all-concepts.mjs --type=occupation
 *   node sync-all-concepts.mjs --skip-clear
 * 
 * Vereist: .env.local met COMPETENTNL_API_KEY
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

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

// Parse args
const args = process.argv.slice(2);
const SPECIFIC_TYPE = args.find(a => a.startsWith('--type='))?.split('=')[1];
const SKIP_CLEAR = args.includes('--skip-clear');

// ============================================================
// CONCEPT CONFIGURATIES
// ============================================================

const CONCEPT_CONFIGS = [
  {
    name: 'Occupations (Beroepen)',
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
        
        {
          BIND(?prefLabel AS ?label)
          BIND("prefLabel" AS ?labelType)
        }
        UNION
        {
          ?uri skos:altLabel ?label .
          BIND("altLabel" AS ?labelType)
        }
        UNION
        {
          ?uri skosxl:altLabel ?xlLabel .
          ?xlLabel skosxl:literalForm ?label .
          BIND("altLabel" AS ?labelType)
        }
        
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Education (Opleidingen)',
    type: 'education',
    table: 'education_labels',
    uriColumn: 'education_uri',
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        {
          ?uri a cnlo:EducationalNorm .
        } UNION {
          ?uri a ksmo:MboKwalificatie .
        }
        ?uri skos:prefLabel ?prefLabel .
        
        {
          BIND(?prefLabel AS ?label)
          BIND("prefLabel" AS ?labelType)
        }
        UNION
        {
          ?uri skos:altLabel ?label .
          BIND("altLabel" AS ?labelType)
        }
        
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Capabilities (Vaardigheden)',
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
        
        {
          BIND(?prefLabel AS ?label)
          BIND("prefLabel" AS ?labelType)
        }
        UNION
        {
          ?uri skos:altLabel ?label .
          BIND("altLabel" AS ?labelType)
        }
        
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Knowledge Areas (Kennisgebieden)',
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
        
        {
          BIND(?prefLabel AS ?label)
          BIND("prefLabel" AS ?labelType)
        }
        UNION
        {
          ?uri skos:altLabel ?label .
          BIND("altLabel" AS ?labelType)
        }
        
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Tasks (Taken)',
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
        
        {
          BIND(?prefLabel AS ?label)
          BIND("prefLabel" AS ?labelType)
        }
        UNION
        {
          ?uri skos:altLabel ?label .
          BIND("altLabel" AS ?labelType)
        }
        
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Working Conditions (Werkomstandigheden)',
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
        
        {
          BIND(?prefLabel AS ?label)
          BIND("prefLabel" AS ?labelType)
        }
        UNION
        {
          ?uri skos:altLabel ?label .
          BIND("altLabel" AS ?labelType)
        }
        
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
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

async function ensureConversationTable(connection) {
  const createSql = `
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(100) NOT NULL,
      message_id VARCHAR(100) NOT NULL,
      role ENUM('user', 'assistant', 'system') NOT NULL,
      text_content TEXT NOT NULL,
      sparql TEXT,
      results_json JSON,
      status ENUM('pending', 'success', 'error') DEFAULT 'success',
      feedback ENUM('like', 'dislike', 'none') DEFAULT 'none',
      metadata_json JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_session_message (session_id, message_id),
      INDEX idx_session_created (session_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await connection.execute(createSql);
}

async function syncConceptType(connection, config) {
  console.log(`\n📦 Syncing ${config.name}...`);
  
  let inserted = 0;
  let skipped = 0;
  
  try {
    // Ensure table exists
    await ensureTableExists(connection, config);
    
    // Clear existing data (unless --skip-clear)
    if (!SKIP_CLEAR) {
      await connection.execute(`DELETE FROM ${config.table} WHERE source = 'sparql_sync'`);
      console.log(`   🗑️  Cleared existing sparql_sync data`);
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
// MAIN
// ============================================================

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   CompetentNL Concept Sync v3.0.0');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`API Key:  ${API_KEY ? '✅ Configured' : '❌ Not set'}`);
  console.log(`Database: ${DB_CONFIG.database}`);
  if (SPECIFIC_TYPE) console.log(`Type:     ${SPECIFIC_TYPE} only`);
  if (SKIP_CLEAR) console.log(`Mode:     Skip clear (append only)`);
  
  let connection = null;
  
  try {
    // Connect to database
    console.log('\n🔌 Connecting to database...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('   ✅ Connected');
    console.log('   🗂️  Ensuring conversation logging table exists...');
    await ensureConversationTable(connection);
    console.log('   ✅ conversation_messages ready');
    
    // Filter configs if specific type requested
    let configs = CONCEPT_CONFIGS;
    if (SPECIFIC_TYPE) {
      configs = configs.filter(c => c.type === SPECIFIC_TYPE);
      if (configs.length === 0) {
        console.error(`❌ Unknown type: ${SPECIFIC_TYPE}`);
        console.log(`   Available: ${CONCEPT_CONFIGS.map(c => c.type).join(', ')}`);
        process.exit(1);
      }
    }
    
    // Sync each concept type
    const totals = { inserted: 0, skipped: 0 };
    
    for (const config of configs) {
      const result = await syncConceptType(connection, config);
      totals.inserted += result.inserted;
      totals.skipped += result.skipped;
    }
    
    // Print summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   SYNC COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total inserted: ${totals.inserted}`);
    console.log(`Total skipped:  ${totals.skipped}`);
    
    // Show table counts
    console.log('\n📊 Table counts:');
    for (const config of configs) {
      try {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) as count FROM ${config.table}`
        );
        console.log(`   ${config.table}: ${rows[0].count} labels`);
      } catch (e) {
        console.log(`   ${config.table}: (table not found)`);
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
