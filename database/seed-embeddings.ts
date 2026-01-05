/**
 * Seed Script - Genereer initiële embeddings
 * ==========================================
 * Dit script genereert embeddings voor alle voorbeeldvragen in de database.
 * 
 * Gebruik:
 *   npm run seed-db
 *   of: node --loader ts-node/esm database/seed-embeddings.ts
 */

import mysql from 'mysql2/promise';
import { pipeline } from '@xenova/transformers';
import {
  FEATURED_EXAMPLE_QUESTIONS,
  QUESTION_BANK,
  QUESTION_BANK_COUNT
} from './question-bank.js';

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
      WHERE embedding IS NULL
        OR JSON_VALID(embedding) = 0
        OR (JSON_VALID(embedding) = 1 AND JSON_LENGTH(embedding) = 0)
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
      WHERE embedding IS NULL
        OR JSON_VALID(embedding) = 0
        OR (JSON_VALID(embedding) = 1 AND JSON_LENGTH(embedding) = 0)
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
async function syncQuestionBank() {
  const connection = await mysql.createConnection(DB_CONFIG);
  let inserted = 0;
  let updated = 0;
  const featuredQuestions = new Set(
    FEATURED_EXAMPLE_QUESTIONS.map((q) => q.question)
  );
  const FEATURED_USAGE_FLOOR = 25;

  console.log(`\n➕ Synchronizing ${QUESTION_BANK_COUNT} voorbeeldvragen...\n`);

  for (const entry of QUESTION_BANK) {
    const isFeatured = featuredQuestions.has(entry.question);
    const [existing] = await connection.execute(
      'SELECT id, usage_count FROM question_embeddings WHERE question = ?',
      [entry.question]
    );

    if ((existing as any[]).length > 0) {
      const targetId = (existing as any[])[0].id;
      const updateFields = ['sparql_query = ?', 'category = ?', 'updated_at = CURRENT_TIMESTAMP'];
      const params: (string | number)[] = [entry.sparql, entry.category];

      if (isFeatured) {
        updateFields.push('usage_count = GREATEST(COALESCE(usage_count, 0), ?)');
        params.push(FEATURED_USAGE_FLOOR);
      }

      params.push(targetId);
      await connection.execute(
        `
        UPDATE question_embeddings
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `,
        params
      );
      updated++;
    } else {
      if (isFeatured) {
        await connection.execute(
          `
          INSERT INTO question_embeddings (question, sparql_query, category, embedding, usage_count)
          VALUES (?, ?, ?, '[]', ?)
        `,
          [entry.question, entry.sparql, entry.category, FEATURED_USAGE_FLOOR]
        );
      } else {
        await connection.execute(
          `
          INSERT INTO question_embeddings (question, sparql_query, category, embedding)
          VALUES (?, ?, ?, '[]')
        `,
          [entry.question, entry.sparql, entry.category]
        );
      }
      inserted++;
    }
  }

  console.log(
    `✅ Question bank sync complete. Inserted: ${inserted}, Updated: ${updated}`
  );

  await connection.end();
}

// Main
async function main() {
  try {
    await syncQuestionBank();
    await seedEmbeddings();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
