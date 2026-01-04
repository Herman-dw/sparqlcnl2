/**
 * fix-voorbeeldvragen.mjs
 * =======================
 * Voegt voorbeeldvragen toe aan de database
 * 
 * Gebruik: node fix-voorbeeldvragen.mjs
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

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'competentnl_rag',
  charset: 'utf8mb4'
};

const VOORBEELDVRAGEN = [
  {
    question: 'Welke vaardigheden heeft een loodgieter?',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?skillLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "loodgieter") || CONTAINS(LCASE(?occLabel), "installatiemonteur"))
  ?occupation cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?skillLabel
LIMIT 50`,
    category: 'skill',
    domain: 'occupation'
  },
  {
    question: 'Hoeveel beroepen zijn er in de database?',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT (COUNT(DISTINCT ?occupation) AS ?aantalBeroepen) WHERE {
  ?occupation a cnlo:Occupation .
}
LIMIT 1`,
    category: 'count',
    domain: 'occupation'
  },
  {
    question: 'Toon 20 software beroepen',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
  FILTER(CONTAINS(LCASE(?label), "software"))
}
ORDER BY ?label
LIMIT 20`,
    category: 'occupation',
    domain: 'occupation'
  },
  {
    question: 'Toon 30 MBO kwalificaties',
    sparql_query: `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie ;
                skos:prefLabel ?naam .
  FILTER(LANG(?naam) = "nl")
}
ORDER BY ?naam
LIMIT 30`,
    category: 'education',
    domain: 'education'
  },
  {
    question: 'Welke vaardigheden hebben RIASEC code R?',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skillLabel WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC "R" ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?skillLabel
LIMIT 50`,
    category: 'skill',
    domain: 'skill'
  },
  {
    question: 'Hoeveel vaardigheden per RIASEC letter?',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT ?riasec (COUNT(?skill) AS ?aantal) WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC ?riasec .
}
GROUP BY ?riasec
ORDER BY ?riasec
LIMIT 10`,
    category: 'count',
    domain: 'skill'
  },
  {
    question: 'Toon alle 137 vaardigheden',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 150`,
    category: 'skill',
    domain: 'skill'
  },
  {
    question: 'Toon 30 kennisgebieden',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 30`,
    category: 'knowledge',
    domain: 'knowledge'
  },
  {
    question: 'Welke taken heeft een timmerman?',
    sparql_query: `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taskLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "timmerman"))
  ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
ORDER BY ?taskLabel
LIMIT 30`,
    category: 'task',
    domain: 'task'
  },
  {
    question: 'Toon 25 beroepen alfabetisch',
    sparql_query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 25`,
    category: 'occupation',
    domain: 'occupation'
  }
];

async function main() {
  console.log('');
  console.log('============================================');
  console.log('  CompetentNL: Voorbeeldvragen Toevoegen');
  console.log('============================================');
  console.log('');

  let connection;
  
  try {
    console.log('[1/5] Verbinden met database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('      ✓ Verbonden met', dbConfig.database);

    // Stap 2: Check of domain kolom bestaat, zo niet, voeg toe
    console.log('[2/5] Controleren tabelstructuur...');
    try {
      await connection.execute('SELECT domain FROM question_embeddings LIMIT 1');
      console.log('      ✓ domain kolom bestaat al');
    } catch (e) {
      console.log('      → domain kolom toevoegen...');
      await connection.execute('ALTER TABLE question_embeddings ADD COLUMN domain VARCHAR(50) DEFAULT NULL');
      console.log('      ✓ domain kolom toegevoegd');
    }

    // Stap 3: Leeg de tabel
    console.log('[3/5] Bestaande voorbeelden verwijderen...');
    await connection.execute('DELETE FROM question_embeddings');
    console.log('      ✓ Tabel geleegd');

    // Stap 3b: Maak embedding kolom optioneel (als die bestaat)
    console.log('      → embedding kolom optioneel maken...');
    try {
      await connection.execute('ALTER TABLE question_embeddings MODIFY COLUMN embedding BLOB DEFAULT NULL');
      console.log('      ✓ embedding kolom is nu optioneel');
    } catch (e) {
      // Kolom bestaat misschien niet of is al optioneel
      console.log('      → embedding kolom overgeslagen:', e.message.substring(0, 50));
    }

    // Stap 4: Voeg nieuwe voorbeelden toe
    console.log('[4/5] Nieuwe voorbeeldvragen toevoegen...');
    
    for (const vraag of VOORBEELDVRAGEN) {
      await connection.execute(
        'INSERT INTO question_embeddings (question, sparql_query, category, domain, embedding) VALUES (?, ?, ?, ?, NULL)',
        [vraag.question, vraag.sparql_query, vraag.category, vraag.domain]
      );
      console.log(`      ✓ "${vraag.question.substring(0, 40)}..."`);
    }

    // Stap 5: Controleer resultaat
    console.log('[5/5] Resultaat controleren...');
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM question_embeddings');
    const count = rows[0].count;
    
    console.log('');
    console.log('============================================');
    console.log(`  ✓ SUCCES! ${count} voorbeeldvragen toegevoegd`);
    console.log('============================================');
    console.log('');
    console.log('Test nu in je browser:');
    console.log('  http://localhost:3001/api/example-questions');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('✗ FOUT:', error.message);
    console.error('');
    
    if (error.code === 'ECONNREFUSED') {
      console.error('  MySQL/MariaDB draait niet. Start XAMPP en probeer opnieuw.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('  Verkeerde database credentials. Check .env.local');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('  Database "competentnl_rag" bestaat niet.');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
