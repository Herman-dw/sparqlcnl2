/**
 * Seed Script - Genereer initiële embeddings
 * ==========================================
 * Dit script genereert embeddings voor alle voorbeeldvragen in de database.
 * 
 * Gebruik:
 *   npx ts-node database/seed-embeddings.ts
 *   of: node --loader ts-node/esm database/seed-embeddings.ts
 */

import mysql from 'mysql2/promise';
import { pipeline } from '@xenova/transformers';

// Database configuratie
const DB_CONFIG = {
  host: process.env.MARIADB_HOST || 'localhost',
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || 'competentnl_rag'
};

let embeddingPipeline: any = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('📥 Loading embedding model...');
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    console.log('✅ Model loaded');
  }
  return embeddingPipeline;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text.toLowerCase().trim(), {
    pooling: 'mean',
    normalize: true
  });
  return Array.from(output.data);
}

async function seedEmbeddings() {
  console.log('\n🌱 Starting embedding seed process...\n');
  
  // Connect to database
  const connection = await mysql.createConnection(DB_CONFIG);
  console.log('📊 Connected to MariaDB');
  
  try {
    // Get all questions without embeddings
    const [questions] = await connection.execute(`
      SELECT id, question 
      FROM question_embeddings 
      WHERE JSON_LENGTH(embedding) = 0 OR embedding = '[]'
    `);
    
    console.log(`\n📝 Found ${(questions as any[]).length} questions to process\n`);
    
    for (const row of questions as any[]) {
      console.log(`  Processing: "${row.question.substring(0, 50)}..."`);
      
      // Generate embedding
      const embedding = await generateEmbedding(row.question);
      
      // Update database
      await connection.execute(
        'UPDATE question_embeddings SET embedding = ? WHERE id = ?',
        [JSON.stringify(embedding), row.id]
      );
      
      console.log(`  ✅ Saved embedding (${embedding.length} dimensions)`);
    }
    
    // Also process schema concepts
    const [concepts] = await connection.execute(`
      SELECT id, label_nl, description_nl 
      FROM schema_concepts 
      WHERE embedding IS NULL OR JSON_LENGTH(embedding) = 0
    `);
    
    console.log(`\n📚 Found ${(concepts as any[]).length} concepts to process\n`);
    
    for (const row of concepts as any[]) {
      const text = `${row.label_nl} ${row.description_nl || ''}`;
      console.log(`  Processing: "${row.label_nl}"`);
      
      const embedding = await generateEmbedding(text);
      
      await connection.execute(
        'UPDATE schema_concepts SET embedding = ? WHERE id = ?',
        [JSON.stringify(embedding), row.id]
      );
      
      console.log(`  ✅ Saved embedding`);
    }
    
    // Verify
    const [stats] = await connection.execute(`
      SELECT 
        (SELECT COUNT(*) FROM question_embeddings WHERE JSON_LENGTH(embedding) > 0) as questions_with_embeddings,
        (SELECT COUNT(*) FROM schema_concepts WHERE JSON_LENGTH(embedding) > 0) as concepts_with_embeddings
    `);
    
    console.log('\n📊 Final Statistics:');
    console.log(`  Questions with embeddings: ${(stats as any[])[0].questions_with_embeddings}`);
    console.log(`  Concepts with embeddings: ${(stats as any[])[0].concepts_with_embeddings}`);
    
  } finally {
    await connection.end();
    console.log('\n✅ Seed process completed!\n');
  }
}

// Extra voorbeeldvragen toevoegen
async function addMoreExamples() {
  const connection = await mysql.createConnection(DB_CONFIG);
  
  const examples = [
    {
      question: 'Zoek beroepen met software in de naam',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?label
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "software"))
}
LIMIT 50`,
      category: 'occupation'
    },
    {
      question: 'Wat zijn de essentiële en belangrijke vaardigheden voor een leraar?',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?occLabel ?importance ?capability ?capLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "leraar") || CONTAINS(LCASE(?occLabel), "docent"))
  {
    ?occupation cnlo:requiresHATEssential ?capability .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?occupation cnlo:requiresHATImportant ?capability .
    BIND("Belangrijk" AS ?importance)
  }
  ?capability skos:prefLabel ?capLabel .
}
LIMIT 50`,
      category: 'capability'
    },
    {
      question: 'Welke opleidingen zijn er voor verpleegkundige?',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "verpleeg"))
}
LIMIT 50`,
      category: 'education'
    },
    {
      question: 'Geef me de ESCO matches voor vaardigheden',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?capability ?capLabel ?escoSkill ?escoLabel
WHERE {
  ?capability a cnlo:HumanCapability ;
              skos:prefLabel ?capLabel ;
              cnlo:closeMatchESCO ?escoSkill .
  ?escoSkill skos:prefLabel ?escoLabel .
  FILTER(LANG(?escoLabel) = "nl")
}
LIMIT 50`,
      category: 'capability'
    },
    {
      question: 'Hoeveel kennisgebieden zijn er?',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
SELECT (COUNT(DISTINCT ?area) AS ?aantal)
WHERE {
  ?area a cnlo:KnowledgeArea .
}`,
      category: 'count'
    },
    {
      question: 'Skills voor ICT beroepen',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?occLabel ?capability ?capLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnlo:requiresHATEssential ?capability .
  ?capability skos:prefLabel ?capLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "ict") || CONTAINS(LCASE(?occLabel), "software") || CONTAINS(LCASE(?occLabel), "developer"))
}
LIMIT 50`,
      category: 'capability'
    },
    {
      question: 'Wat moet een timmerman kunnen?',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?occLabel ?capability ?capLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnlo:requiresHATEssential ?capability .
  ?capability skos:prefLabel ?capLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "timmerman"))
}
LIMIT 50`,
      category: 'capability'
    },
    {
      question: 'Beroepen in de zorg',
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?label
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "zorg") || CONTAINS(LCASE(?label), "verpleeg") || CONTAINS(LCASE(?label), "arts"))
}
LIMIT 50`,
      category: 'occupation'
    }
  ];
  
  console.log('\n➕ Adding more example questions...\n');
  
  for (const ex of examples) {
    try {
      await connection.execute(`
        INSERT IGNORE INTO question_embeddings (question, sparql_query, category, embedding)
        VALUES (?, ?, ?, '[]')
      `, [ex.question, ex.sparql, ex.category]);
      console.log(`  Added: "${ex.question.substring(0, 40)}..."`);
    } catch (e) {
      // Ignore duplicates
    }
  }
  
  await connection.end();
}

// Main
async function main() {
  try {
    await addMoreExamples();
    await seedEmbeddings();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
