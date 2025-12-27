/**
 * Sync All Concepts - v2.0.0
 * ==========================
 * Synchroniseert alle concept types van CompetentNL SPARQL endpoint
 * naar de lokale MariaDB database voor snelle lookups en disambiguatie.
 * 
 * Concept types:
 * - Occupations (Beroepen)
 * - EducationalNorms (Opleidingen)
 * - HumanCapabilities (Vaardigheden)
 * - KnowledgeAreas (Kennisgebieden)
 * - Tasks (Taken)
 * - WorkingConditions (Werkomstandigheden)
 * 
 * Run: npx ts-node database/sync-all-concepts.ts
 */

import mysql from 'mysql2/promise';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const SPARQL_ENDPOINT = process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
const API_KEY = process.env.COMPETENTNL_API_KEY || '';

// Database config
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'competentnl_rag',
  charset: 'utf8mb4'
};

// Concept type configurations
interface ConceptSyncConfig {
  name: string;
  table: string;
  uriColumn: string;
  sparqlClass: string;
  graphs: string[];
  query: string;
}

const CONCEPT_CONFIGS: ConceptSyncConfig[] = [
  {
    name: 'Occupations (Beroepen)',
    table: 'occupation_labels',
    uriColumn: 'occupation_uri',
    sparqlClass: 'cnlo:Occupation',
    graphs: [
      'https://linkeddata.competentnl.nl/graph/cnluwv4cnl'
    ],
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
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
        
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'HumanCapabilities (Vaardigheden)',
    table: 'capability_labels',
    uriColumn: 'capability_uri',
    sparqlClass: 'cnlo:HumanCapability',
    graphs: [
      'https://linkeddata.competentnl.nl/graph/cnl-humancapabilities'
    ],
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
      
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
        
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'KnowledgeAreas (Kennisgebieden)',
    table: 'knowledge_labels',
    uriColumn: 'knowledge_uri',
    sparqlClass: 'cnlo:KnowledgeArea',
    graphs: [
      'https://linkeddata.competentnl.nl/graph/cnl-knowledgeareas'
    ],
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
        
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'Tasks (Taken)',
    table: 'task_labels',
    uriColumn: 'task_uri',
    sparqlClass: 'cnluwvo:Task',
    graphs: [
      'https://linkeddata.competentnl.nl/graph/cnluwv4cnl'
    ],
    query: `
      PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnluwvo:Task .
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
        
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  },
  {
    name: 'EducationalNorms (Opleidingen)',
    table: 'education_labels',
    uriColumn: 'education_uri',
    sparqlClass: 'cnlo:EducationalNorm',
    graphs: [
      'https://linkeddata.competentnl.nl/graph/competentnl'
    ],
    query: `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?uri ?prefLabel ?label ?labelType
      WHERE {
        ?uri a cnlo:EducationalNorm .
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
        
        FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
    `
  }
];

/**
 * Normalize text for matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Execute SPARQL query
 */
async function executeSparql(query: string): Promise<any[]> {
  const params = new URLSearchParams();
  params.append('query', query);
  params.append('format', 'application/sparql-results+json');

  const headers: Record<string, string> = {
    'Accept': 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'CompetentNL-Sync/2.0'
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
    const error = await response.text();
    throw new Error(`SPARQL error ${response.status}: ${error}`);
  }

  const data = await response.json() as any;
  return data.results?.bindings || [];
}

/**
 * Sync a single concept type
 */
async function syncConceptType(
  connection: mysql.Connection,
  config: ConceptSyncConfig
): Promise<{ inserted: number; skipped: number }> {
  console.log(`\n📦 Syncing ${config.name}...`);
  
  let inserted = 0;
  let skipped = 0;
  
  try {
    // Clear existing data
    await connection.execute(`DELETE FROM ${config.table} WHERE source = 'sparql_sync'`);
    
    // Fetch from SPARQL
    const results = await executeSparql(config.query);
    console.log(`   Found ${results.length} labels from SPARQL`);
    
    // Prepare insert statement
    const insertSql = `
      INSERT INTO ${config.table} 
      (${config.uriColumn}, pref_label, label, label_normalized, label_type, source)
      VALUES (?, ?, ?, ?, ?, 'sparql_sync')
      ON DUPLICATE KEY UPDATE usage_count = usage_count
    `;
    
    // Insert each label
    for (const row of results) {
      const uri = row.uri?.value;
      const prefLabel = row.prefLabel?.value;
      const label = row.label?.value;
      const labelType = row.labelType?.value || 'prefLabel';
      
      if (!uri || !prefLabel || !label) {
        skipped++;
        continue;
      }
      
      const normalized = normalizeText(label);
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
      } catch (err: any) {
        if (!err.message?.includes('Duplicate')) {
          console.warn(`   Warning: ${err.message}`);
        }
        skipped++;
      }
    }
    
    console.log(`   ✅ Inserted: ${inserted}, Skipped: ${skipped}`);
    
  } catch (error: any) {
    console.error(`   ❌ Error syncing ${config.name}: ${error.message}`);
  }
  
  return { inserted, skipped };
}

/**
 * Main sync function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   CompetentNL Concept Sync v2.0.0');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`API Key: ${API_KEY ? '✅ Configured' : '❌ Not set'}`);
  console.log(`Database: ${DB_CONFIG.database}`);
  
  let connection: mysql.Connection | null = null;
  
  try {
    // Connect to database
    console.log('\n🔌 Connecting to database...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('   ✅ Connected');
    
    // Sync each concept type
    const totals = { inserted: 0, skipped: 0 };
    
    for (const config of CONCEPT_CONFIGS) {
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
    for (const config of CONCEPT_CONFIGS) {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM ${config.table}`
      ) as any;
      console.log(`   ${config.table}: ${rows[0].count} labels`);
    }
    
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
