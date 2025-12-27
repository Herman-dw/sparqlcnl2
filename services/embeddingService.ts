/**
 * Embedding Service
 * =================
 * Genereert vector embeddings voor tekst met behulp van lokale modellen.
 * Gebruikt @xenova/transformers voor browser/Node.js compatibiliteit.
 * 
 * Model: all-MiniLM-L6-v2 (384 dimensies, snel en efficient)
 */

// Voor Node.js backend
import { pipeline } from '@xenova/transformers';

let embeddingPipeline: any = null;

/**
 * Initialiseer het embedding model (lazy loading)
 */
const getEmbeddingPipeline = async () => {
  if (!embeddingPipeline) {
    console.log('[Embeddings] Loading model all-MiniLM-L6-v2...');
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    console.log('[Embeddings] Model loaded successfully');
  }
  return embeddingPipeline;
};

/**
 * Genereer embedding voor een enkele tekst
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const pipe = await getEmbeddingPipeline();
  
  // Normaliseer de tekst
  const normalizedText = text.toLowerCase().trim();
  
  // Genereer embedding
  const output = await pipe(normalizedText, {
    pooling: 'mean',
    normalize: true
  });
  
  // Converteer naar gewone array
  return Array.from(output.data);
};

/**
 * Genereer embeddings voor meerdere teksten (batch)
 */
export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
  const embeddings: number[][] = [];
  
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }
  
  return embeddings;
};

/**
 * Bereken cosine similarity tussen twee vectoren
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
};

/**
 * Vind de meest vergelijkbare items
 */
export const findMostSimilar = (
  queryEmbedding: number[],
  candidates: { id: number; embedding: number[]; [key: string]: any }[],
  topK: number = 5,
  minSimilarity: number = 0.3
): { id: number; similarity: number; [key: string]: any }[] => {
  const results = candidates
    .map(candidate => ({
      ...candidate,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding)
    }))
    .filter(item => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
  
  return results;
};

/**
 * Pre-warm het model (optioneel, voor snellere eerste query)
 */
export const warmupModel = async (): Promise<void> => {
  await getEmbeddingPipeline();
  // Doe een dummy embedding om het model volledig te laden
  await generateEmbedding('warmup');
  console.log('[Embeddings] Model warmed up');
};

export default {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  findMostSimilar,
  warmupModel
};
