/**
 * RAG Service - MariaDB Vector Search
 * ====================================
 * Retrieval Augmented Generation service die MariaDB gebruikt
 * voor het opslaan en ophalen van vraag-embeddings.
 */

import mysql from 'mysql2/promise';
import { generateEmbedding, cosineSimilarity } from './embeddingService';

// Database configuratie
const DB_CONFIG = {
  host: process.env.MARIADB_HOST || 'localhost',
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || 'competentnl_rag',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool: mysql.Pool | null = null;

/**
 * Initialiseer database connectie pool
 */
export const initDatabase = async (): Promise<void> => {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
    
    // Test connectie
    const connection = await pool.getConnection();
    console.log('[RAG DB] Connected to MariaDB');
    connection.release();
  }
};

/**
 * Sluit database connecties
 */
export const closeDatabase = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[RAG DB] Connection closed');
  }
};

/**
 * Interface voor vraag-embedding record
 */
export interface QuestionEmbedding {
  id: number;
  question: string;
  sparql_query: string;
  embedding: number[];
  category: string;
  feedback_score: number;
  usage_count: number;
  success_rate: number;
}

/**
 * Interface voor RAG zoekresultaat
 */
export interface RAGResult {
  id: number;
  question: string;
  sparql_query: string;
  category: string;
  similarity: number;
  feedback_score: number;
}

/**
 * Haal alle vraag-embeddings op uit de database
 */
export const getAllQuestionEmbeddings = async (): Promise<QuestionEmbedding[]> => {
  if (!pool) await initDatabase();
  
  const [rows] = await pool!.execute(`
    SELECT id, question, sparql_query, embedding, category, 
           feedback_score, usage_count, success_rate
    FROM question_embeddings
    WHERE JSON_LENGTH(embedding) > 0
    ORDER BY feedback_score DESC, usage_count DESC
  `);
  
  return (rows as any[]).map(row => ({
    ...row,
    embedding: typeof row.embedding === 'string' 
      ? JSON.parse(row.embedding) 
      : row.embedding
  }));
};

/**
 * Zoek vergelijkbare vragen met vector similarity
 */
export const findSimilarQuestions = async (
  userQuestion: string,
  topK: number = 5,
  minSimilarity: number = 0.4
): Promise<RAGResult[]> => {
  if (!pool) await initDatabase();
  
  // Genereer embedding voor de gebruikersvraag
  const queryEmbedding = await generateEmbedding(userQuestion);
  
  // Haal alle embeddings op
  const allEmbeddings = await getAllQuestionEmbeddings();
  
  // Filter op niet-lege embeddings en bereken similarity
  const results = allEmbeddings
    .filter(item => item.embedding && item.embedding.length > 0)
    .map(item => ({
      id: item.id,
      question: item.question,
      sparql_query: item.sparql_query,
      category: item.category,
      similarity: cosineSimilarity(queryEmbedding, item.embedding),
      feedback_score: item.feedback_score
    }))
    .filter(item => item.similarity >= minSimilarity)
    .sort((a, b) => {
      // Sorteer op combinatie van similarity en feedback
      const scoreA = a.similarity * 0.7 + (a.feedback_score + 1) * 0.15;
      const scoreB = b.similarity * 0.7 + (b.feedback_score + 1) * 0.15;
      return scoreB - scoreA;
    })
    .slice(0, topK);
  
  console.log(`[RAG] Found ${results.length} similar questions for: "${userQuestion.substring(0, 50)}..."`);
  
  return results;
};

/**
 * Voeg een nieuwe vraag-embedding toe
 */
export const addQuestionEmbedding = async (
  question: string,
  sparqlQuery: string,
  category: string = 'general'
): Promise<number> => {
  if (!pool) await initDatabase();
  
  // Genereer embedding
  const embedding = await generateEmbedding(question);
  
  const [result] = await pool!.execute(`
    INSERT INTO question_embeddings (question, sparql_query, embedding, category)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      sparql_query = VALUES(sparql_query),
      embedding = VALUES(embedding),
      updated_at = CURRENT_TIMESTAMP
  `, [question, sparqlQuery, JSON.stringify(embedding), category]);
  
  const insertId = (result as any).insertId;
  console.log(`[RAG] Added question embedding: ${insertId}`);
  
  return insertId;
};

/**
 * Update feedback score voor een vraag
 */
export const updateFeedback = async (
  questionId: number,
  feedback: 'like' | 'dislike'
): Promise<void> => {
  if (!pool) await initDatabase();
  
  const feedbackValue = feedback === 'like' ? 0.1 : -0.1;
  
  await pool!.execute(`
    UPDATE question_embeddings
    SET feedback_score = GREATEST(-1, LEAST(1, feedback_score + ?)),
        usage_count = usage_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [feedbackValue, questionId]);
};

/**
 * Log een query voor analyse
 */
export const logQuery = async (
  sessionId: string,
  userQuestion: string,
  generatedSparql: string,
  resultCount: number,
  executionTimeMs: number,
  similarQuestionsUsed: number[],
  similarityScores: number[],
  hadError: boolean = false,
  errorMessage?: string
): Promise<number> => {
  if (!pool) await initDatabase();
  
  const [result] = await pool!.execute(`
    INSERT INTO query_logs 
    (session_id, user_question, generated_sparql, result_count, execution_time_ms,
     similar_questions_used, similarity_scores, had_error, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    sessionId,
    userQuestion,
    generatedSparql,
    resultCount,
    executionTimeMs,
    JSON.stringify(similarQuestionsUsed),
    JSON.stringify(similarityScores),
    hadError,
    errorMessage || null
  ]);
  
  return (result as any).insertId;
};

/**
 * Update user feedback voor een gelogde query
 */
export const updateQueryFeedback = async (
  queryLogId: number,
  feedback: 'like' | 'dislike'
): Promise<void> => {
  if (!pool) await initDatabase();
  
  await pool!.execute(`
    UPDATE query_logs
    SET user_feedback = ?
    WHERE id = ?
  `, [feedback, queryLogId]);
};

/**
 * Haal schema concepten op voor context
 */
export const getRelevantConcepts = async (
  userQuestion: string,
  topK: number = 10
): Promise<any[]> => {
  if (!pool) await initDatabase();
  
  // Gebruik full-text search als fallback/aanvulling
  const [rows] = await pool!.execute(`
    SELECT concept_type, uri, prefix, local_name, label_nl, description_nl, 
           synonyms, instance_count,
           MATCH(label_nl, label_en, description_nl) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
    FROM schema_concepts
    WHERE MATCH(label_nl, label_en, description_nl) AGAINST(? IN NATURAL LANGUAGE MODE)
    ORDER BY relevance DESC
    LIMIT ?
  `, [userQuestion, userQuestion, topK]);
  
  return rows as any[];
};

/**
 * Bouw RAG context voor de AI prompt
 */
export const buildRAGContext = async (
  userQuestion: string,
  topK: number = 5
): Promise<{
  similarQuestions: RAGResult[];
  relevantConcepts: any[];
  contextText: string;
}> => {
  // Zoek vergelijkbare vragen
  const similarQuestions = await findSimilarQuestions(userQuestion, topK);
  
  // Zoek relevante schema concepten
  const relevantConcepts = await getRelevantConcepts(userQuestion, 10);
  
  // Bouw context tekst
  let contextText = '';
  
  if (similarQuestions.length > 0) {
    contextText += '\n## VERGELIJKBARE VRAGEN EN QUERIES\n';
    contextText += 'Hier zijn voorbeelden van vergelijkbare vragen met werkende SPARQL queries:\n\n';
    
    similarQuestions.forEach((q, i) => {
      contextText += `### Voorbeeld ${i + 1} (similarity: ${(q.similarity * 100).toFixed(1)}%)\n`;
      contextText += `Vraag: ${q.question}\n`;
      contextText += `Query:\n\`\`\`sparql\n${q.sparql_query}\n\`\`\`\n\n`;
    });
  }
  
  if (relevantConcepts.length > 0) {
    contextText += '\n## RELEVANTE SCHEMA CONCEPTEN\n';
    relevantConcepts.forEach(c => {
      contextText += `- ${c.prefix}:${c.local_name} (${c.label_nl}): ${c.description_nl?.substring(0, 100) || ''}\n`;
    });
  }
  
  return {
    similarQuestions,
    relevantConcepts,
    contextText
  };
};

/**
 * Health check voor database
 */
export const healthCheck = async (): Promise<boolean> => {
  try {
    if (!pool) await initDatabase();
    const [rows] = await pool!.execute('SELECT 1 as ok');
    return (rows as any[])[0]?.ok === 1;
  } catch (error) {
    console.error('[RAG DB] Health check failed:', error);
    return false;
  }
};

export default {
  initDatabase,
  closeDatabase,
  findSimilarQuestions,
  addQuestionEmbedding,
  updateFeedback,
  logQuery,
  updateQueryFeedback,
  buildRAGContext,
  healthCheck
};
