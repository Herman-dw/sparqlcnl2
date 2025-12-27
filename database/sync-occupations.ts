/**
 * Sync Occupation Labels
 * ======================
 * Haalt alle occupation labels (prefLabel, altLabel, specialisaties) 
 * uit de CompetentNL SPARQL endpoint en slaat ze op in MariaDB.
 * 
 * Gebruik:
 *   npx ts-node database/sync-occupations.ts
 */

import mysql from 'mysql2/promise';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SPARQL_ENDPOINT = process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
const API_KEY = process.env.COMPETENTNL_API_KEY || '';

const DB_CONFIG = {
  host: process.env.MARIADB_HOST || 'localhost',
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || 'competentnl_rag'
};

// Normaliseer tekst voor zoeken
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .replace(/[^a-z0-9\s]/g, '')      // Remove special chars
    .replace(/\s+/g, ' ')              // Normalize spaces
    .trim();
}

async function executeSparql(query: string): Promise<any[]> {
  const params = new URLSearchParams();
  params.append('query', query);
  params.append('format', 'application/sparql-results+json');

  const headers: any = {
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
    throw new Error(`SPARQL error: ${response.status}`);
  }

  const data: any = await response.json();
  return data.results?.bindings || [];
}

async function syncOccupations() {
  console.log('\n🔄 Starting Occupation Labels Sync...\n');
  
  const connection = await mysql.createConnection(DB_CONFIG);
  console.log('📊 Connected to MariaDB');

  try {
    // 1. Haal alle prefLabels op
    console.log('\n📥 Fetching prefLabels...');
    const prefLabelQuery = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?occupation ?prefLabel
      WHERE {
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?prefLabel .
      }
    `;
    
    const prefLabels = await executeSparql(prefLabelQuery);
    console.log(`  Found ${prefLabels.length} occupations with prefLabel`);

    // 2. Haal alle altLabels op
    console.log('\n📥 Fetching altLabels...');
    const altLabelQuery = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
      
      SELECT DISTINCT ?occupation ?prefLabel ?altLabel
      WHERE {
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?prefLabel .
        {
          ?occupation skos:altLabel ?altLabel .
        }
        UNION
        {
          ?occupation skosxl:altLabel/skosxl:literalForm ?altLabel .
        }
      }
    `;
    
    const altLabels = await executeSparql(altLabelQuery);
    console.log(`  Found ${altLabels.length} altLabels`);

    // 3. Haal specialisaties op
    console.log('\n📥 Fetching specializations...');
    const specializationQuery = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?occupation ?prefLabel ?specLabel
      WHERE {
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?prefLabel ;
                    cnluwv:specialization ?spec .
        ?spec skos:prefLabel ?specLabel .
      }
    `;
    
    let specializations: any[] = [];
    try {
      specializations = await executeSparql(specializationQuery);
      console.log(`  Found ${specializations.length} specializations`);
    } catch (e) {
      console.log('  No specializations found (or different predicate used)');
    }

    // 4. Clear existing data
    console.log('\n🗑️  Clearing existing occupation_labels...');
    await connection.execute('DELETE FROM occupation_labels WHERE source = "sparql"');

    // 5. Insert prefLabels
    console.log('\n💾 Inserting prefLabels...');
    let insertCount = 0;
    
    for (const row of prefLabels) {
      const uri = row.occupation?.value;
      const label = row.prefLabel?.value;
      
      if (!uri || !label) continue;
      
      await connection.execute(`
        INSERT INTO occupation_labels 
        (occupation_uri, pref_label, label, label_normalized, label_type, source)
        VALUES (?, ?, ?, ?, 'prefLabel', 'sparql')
        ON DUPLICATE KEY UPDATE usage_count = usage_count
      `, [uri, label, label, normalize(label)]);
      
      insertCount++;
    }
    console.log(`  Inserted ${insertCount} prefLabels`);

    // 6. Insert altLabels
    console.log('\n💾 Inserting altLabels...');
    insertCount = 0;
    
    for (const row of altLabels) {
      const uri = row.occupation?.value;
      const prefLabel = row.prefLabel?.value;
      const altLabel = row.altLabel?.value;
      
      if (!uri || !prefLabel || !altLabel) continue;
      
      await connection.execute(`
        INSERT INTO occupation_labels 
        (occupation_uri, pref_label, label, label_normalized, label_type, source)
        VALUES (?, ?, ?, ?, 'altLabel', 'sparql')
        ON DUPLICATE KEY UPDATE usage_count = usage_count
      `, [uri, prefLabel, altLabel, normalize(altLabel)]);
      
      insertCount++;
    }
    console.log(`  Inserted ${insertCount} altLabels`);

    // 7. Insert specializations
    if (specializations.length > 0) {
      console.log('\n💾 Inserting specializations...');
      insertCount = 0;
      
      for (const row of specializations) {
        const uri = row.occupation?.value;
        const prefLabel = row.prefLabel?.value;
        const specLabel = row.specLabel?.value;
        
        if (!uri || !prefLabel || !specLabel) continue;
        
        await connection.execute(`
          INSERT INTO occupation_labels 
          (occupation_uri, pref_label, label, label_normalized, label_type, source)
          VALUES (?, ?, ?, ?, 'specialization', 'sparql')
          ON DUPLICATE KEY UPDATE usage_count = usage_count
        `, [uri, prefLabel, specLabel, normalize(specLabel)]);
        
        insertCount++;
      }
      console.log(`  Inserted ${insertCount} specializations`);
    }

    // 8. Show stats
    const [stats] = await connection.execute(`
      SELECT 
        label_type,
        COUNT(*) as count
      FROM occupation_labels
      GROUP BY label_type
    `);
    
    console.log('\n📊 Final Statistics:');
    console.table(stats);

    // 9. Show some examples
    const [examples] = await connection.execute(`
      SELECT pref_label, label, label_type
      FROM occupation_labels
      WHERE label != pref_label
      ORDER BY RAND()
      LIMIT 10
    `);
    
    console.log('\n📝 Example mappings (label → prefLabel):');
    console.table(examples);

  } finally {
    await connection.end();
    console.log('\n✅ Sync completed!\n');
  }
}

// Run
syncOccupations().catch(console.error);
