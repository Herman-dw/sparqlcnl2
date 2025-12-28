/**
 * Gemini Service met Multi-Prompt Orchestrator
 * =============================================
 * Vervangt de oude geminiService.ts met dynamische prompt assembly
 */

import { GoogleGenAI } from "@google/genai";
import { createPromptOrchestrator, PromptOrchestrator, AssembledPrompt } from './promptOrchestrator';

const MODEL_NAME = "gemini-2.0-flash";

// Singleton orchestrator
let orchestrator: PromptOrchestrator | null = null;

/**
 * Initialiseer de orchestrator (lazy loading)
 */
async function getOrchestrator(): Promise<PromptOrchestrator> {
  if (!orchestrator) {
    console.log('[GeminiService] Orchestrator initialiseren...');
    orchestrator = await createPromptOrchestrator();
    console.log('[GeminiService] Orchestrator klaar!');
  }
  return orchestrator;
}

/**
 * Chat message type voor context
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sparql?: string;
}

/**
 * Fix common SPARQL issues
 */
function fixSparqlQuery(sparql: string): string {
  // Verwijder markdown code blocks
  sparql = sparql.replace(/```sparql/gi, '').replace(/```/g, '').trim();
  
  // Verwijder FROM clauses
  sparql = sparql.replace(/FROM\s+<[^>]+>\s*/gi, '');
  
  // Verwijder eventuele uitleg voor of na de query
  const prefixMatch = sparql.match(/PREFIX/i);
  if (prefixMatch && prefixMatch.index && prefixMatch.index > 0) {
    sparql = sparql.substring(prefixMatch.index);
  }
  
  // Verwijder tekst na de laatste }
  const lastBrace = sparql.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < sparql.length - 1) {
    const afterBrace = sparql.substring(lastBrace + 1).trim();
    // Check of er nog LIMIT of ORDER BY is
    if (!afterBrace.match(/^(LIMIT|ORDER|OFFSET)/i)) {
      sparql = sparql.substring(0, lastBrace + 1);
    }
  }
  
  return sparql.trim();
}

/**
 * Genereer SPARQL query met de orchestrator
 */
export async function generateSparql(
  userQuery: string,
  chatHistory: ChatMessage[] = []
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const orch = await getOrchestrator();
  
  // Bepaal of dit een vervolgvraag is
  const isFollowUp = chatHistory.length > 0;
  
  // Bouw context van eerdere berichten
  let previousContext = '';
  if (isFollowUp) {
    const lastUserMsg = chatHistory.filter(m => m.role === 'user').pop();
    const lastAssistantMsg = chatHistory.filter(m => m.role === 'assistant').pop();
    
    if (lastUserMsg) {
      previousContext = `Vorige vraag: ${lastUserMsg.content}`;
    }
    if (lastAssistantMsg?.sparql) {
      previousContext += `\nVorige query: ${lastAssistantMsg.sparql}`;
    }
  }
  
  // Laat de orchestrator de prompt assembleren
  const assembled: AssembledPrompt = await orch.orchestrate(
    userQuery, 
    isFollowUp, 
    previousContext
  );
  
  console.log(`[GeminiService] Domein: ${assembled.metadata.primaryDomain}`);
  console.log(`[GeminiService] Voorbeelden: ${assembled.metadata.exampleCount}`);
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: assembled.fullPrompt,
      config: {
        temperature: 0.1,
      },
    });

    let sparql = response.text || '';
    sparql = fixSparqlQuery(sparql);
    
    // Log de query voor tracking
    try {
      await orch.logQuery({
        sessionId: 'web-session', // TODO: echte session ID
        question: userQuery,
        domains: assembled.domains,
        sparqlQuery: sparql
      });
    } catch (logError) {
      console.warn('[GeminiService] Query logging mislukt:', logError);
    }
    
    return sparql;
  } catch (error: any) {
    console.error("Gemini SPARQL Generation Error:", error);
    throw new Error(`AI kon geen SPARQL genereren: ${error.message}`);
  }
}

/**
 * Genereer een COUNT query van een SELECT query
 */
export function generateCountQuery(selectQuery: string): string {
  let countQuery = selectQuery
    .replace(/LIMIT\s+\d+/gi, '')
    .replace(/OFFSET\s+\d+/gi, '')
    .replace(/ORDER\s+BY\s+[^\n]+/gi, '');
  
  const selectMatch = countQuery.match(/SELECT\s+(DISTINCT\s+)?(\?[\w]+)/i);
  
  if (selectMatch) {
    const distinct = selectMatch[1] ? 'DISTINCT ' : '';
    const firstVar = selectMatch[2];
    
    countQuery = countQuery.replace(
      /SELECT\s+(DISTINCT\s+)?[^W]+WHERE/i,
      `SELECT (COUNT(${distinct}${firstVar}) AS ?total) WHERE`
    );
  }
  
  return countQuery.trim();
}

/**
 * Genereer query met hogere LIMIT
 */
export function generateExpandedQuery(originalQuery: string, newLimit: number): string {
  let expanded = originalQuery.replace(/LIMIT\s+\d+/gi, `LIMIT ${newLimit}`);
  
  if (!expanded.toUpperCase().includes('LIMIT')) {
    expanded = expanded.trim() + `\nLIMIT ${newLimit}`;
  }
  
  return expanded;
}

/**
 * Samenvatting van resultaten genereren
 */
export async function summarizeResults(
  question: string, 
  results: any[], 
  totalCount?: number
): Promise<string> {
  if (!results || results.length === 0) {
    return "Ik heb de database bevraagd, maar er zijn geen resultaten gevonden die voldoen aan je criteria.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const dataSnippet = JSON.stringify(results.slice(0, 5));
  const hasMore = totalCount && totalCount > results.length;
  
  const prompt = `
    Vraag van gebruiker: "${question}"
    Aantal resultaten getoond: ${results.length}
    ${totalCount ? `Totaal aantal resultaten: ${totalCount}` : ''}
    Data voorbeeld (eerste 5 rijen): ${dataSnippet}
    
    Geef een vriendelijke, professionele samenvatting in het Nederlands van wat er gevonden is.
    ${hasMore ? `Vermeld dat er in totaal ${totalCount} resultaten zijn en dat de gebruiker kan klikken om alles te zien.` : ''}
    Houd de samenvatting kort (2-3 zinnen) en verwijs naar de tabel voor details.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });

    return response.text || "Resultaten gevonden. Zie de tabel voor details.";
  } catch (error) {
    console.error("Summary generation error:", error);
    
    const examples = results.slice(0, 3).map(r => {
      return r.label || r.occLabel || r.skillLabel || r.prefLabel || Object.values(r)[0];
    }).filter(Boolean).join(", ");
    
    let fallback = `Gevonden: ${results.length} resultaten. Voorbeelden: ${examples}.`;
    if (hasMore) {
      fallback += ` Er zijn in totaal ${totalCount} resultaten.`;
    }
    
    return fallback;
  }
}

/**
 * Krijg statistieken van de orchestrator
 */
export async function getOrchestratorStats(): Promise<any> {
  const orch = await getOrchestrator();
  return orch.getStats();
}

/**
 * Clear orchestrator cache
 */
export async function clearOrchestratorCache(): Promise<void> {
  const orch = await getOrchestrator();
  orch.clearCache();
}

export { ChatMessage };
