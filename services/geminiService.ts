/**
 * Gemini Service met Concept Resolver & Disambiguatie - v2.0.0
 * ============================================================
 * AI service die:
 * 1. Concepten detecteert in vragen (beroepen, opleidingen, vaardigheden, etc.)
 * 2. Concepten oplost naar officiële labels via backend
 * 3. Bij meerdere matches: vraagt om verduidelijking
 * 4. SPARQL queries genereert met de juiste conceptnamen
 */

import { GoogleGenAI } from "@google/genai";
import { SCHEMA_DOCUMENTATION } from "../schema";

const MODEL_NAME = 'gemini-2.0-flash';
const SUMMARY_MODEL = 'gemini-2.0-flash';
const BACKEND_URL = process.env.RAG_BACKEND_URL || 'http://localhost:3001';

// Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sparql?: string;
  isDisambiguation?: boolean;
  disambiguationData?: DisambiguationData;
}

export interface ConceptMatch {
  uri: string;
  prefLabel: string;
  matchedLabel: string;
  matchType: string;
  confidence: number;
  conceptType: string;
}

export interface ConceptResolveResult {
  found: boolean;
  exact: boolean;
  searchTerm: string;
  conceptType: string;
  matches: ConceptMatch[];
  needsDisambiguation: boolean;
  disambiguationQuestion?: string;
  suggestion?: string;
}

export interface DisambiguationData {
  pending: boolean;
  searchTerm: string;
  conceptType: string;
  options: ConceptMatch[];
  originalQuestion: string;
}

export interface GenerateResult {
  sparql: string | null;
  response: string;
  needsDisambiguation: boolean;
  disambiguationData?: DisambiguationData;
  resolvedConcepts: { term: string; resolved: string; type: string }[];
}

// Concept type keywords for detection
const CONCEPT_PATTERNS = {
  occupation: {
    patterns: [
      /(?:beroep|functie|werk als|werkt als|job)\s+(?:van\s+)?(?:een\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+?)(?:\s+heeft|\s+nodig|\s+vereist|\?|$)/i,
      /(?:heeft|hebben)\s+(?:een\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-]+?)(?:\s+nodig|\s+vereist|\?|$)/i,
      /(?:voor|bij|van)\s+(?:een\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-]+?)(?:\s|$|\?)/i,
    ],
    suffixes: ['er', 'eur', 'ist', 'ant', 'ent', 'aar', 'man', 'vrouw', 'meester', 'arts', 'kundige', 'loog', 'tect']
  },
  education: {
    patterns: [
      /(?:opleiding|studie|cursus|diploma|certificaat|kwalificatie)\s+(?:voor\s+|tot\s+|in\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
      /(?:mbo|hbo|wo|vmbo|bachelor|master)\s+([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ],
    keywords: ['opleiding', 'studie', 'diploma', 'certificaat', 'kwalificatie', 'mbo', 'hbo', 'wo']
  },
  capability: {
    patterns: [
      /(?:vaardigheid|skill|competentie)\s+(?:van\s+|voor\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ],
    keywords: ['vaardigheid', 'vaardigheden', 'skill', 'skills', 'competentie', 'competenties']
  },
  knowledge: {
    patterns: [
      /(?:kennis|kennisgebied|vakgebied)\s+(?:van\s+|over\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ],
    keywords: ['kennis', 'kennisgebied', 'vakgebied', 'domein']
  }
};

const STOP_WORDS = ['een', 'het', 'de', 'alle', 'welke', 'wat', 'zijn', 'voor', 'bij', 'van', 
                    'heeft', 'hebben', 'nodig', 'vereist', 'die', 'dat', 'deze', 'wordt', 'worden'];

/**
 * Resolve a concept via backend
 */
const resolveConcept = async (
  searchTerm: string, 
  conceptType: string
): Promise<ConceptResolveResult | null> => {
  try {
    console.log(`[Concept] Resolving ${conceptType}: "${searchTerm}"`);
    
    const response = await fetch(`${BACKEND_URL}/concept/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerm, conceptType })
    });
    
    if (!response.ok) {
      console.warn(`[Concept] Resolve failed: ${response.status}`);
      return null;
    }
    
    const result = await response.json();
    console.log(`[Concept] Found ${result.matches?.length || 0} matches, needsDisambiguation: ${result.needsDisambiguation}`);
    return result;
    
  } catch (error) {
    console.warn('[Concept] Error resolving:', error);
    return null;
  }
};

/**
 * Confirm a user selection
 */
export const confirmConceptSelection = async (
  searchTerm: string,
  selectedUri: string,
  selectedLabel: string,
  conceptType: string
): Promise<void> => {
  try {
    await fetch(`${BACKEND_URL}/concept/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerm, selectedUri, selectedLabel, conceptType })
    });
  } catch (error) {
    console.warn('[Concept] Error confirming:', error);
  }
};

/**
 * Parse user's answer to disambiguation question
 */
export const parseDisambiguationAnswer = async (
  answer: string,
  options: ConceptMatch[]
): Promise<ConceptMatch | null> => {
  try {
    const response = await fetch(`${BACKEND_URL}/concept/parse-selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer, options })
    });
    
    const result = await response.json();
    return result.found ? result.selection : null;
    
  } catch (error) {
    // Fallback: local parsing
    const trimmed = answer.trim();
    const num = parseInt(trimmed, 10);
    
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      return options[num - 1];
    }
    
    const answerLower = trimmed.toLowerCase();
    for (const option of options) {
      if (option.prefLabel.toLowerCase().includes(answerLower)) {
        return option;
      }
    }
    
    return null;
  }
};

/**
 * Extract potential concept terms from a question
 */
const extractConceptTerms = (question: string): { term: string; type: string }[] => {
  console.log(`[Concept] Extracting terms from: "${question}"`);
  
  const terms: { term: string; type: string }[] = [];
  const questionLower = question.toLowerCase();
  
  // Check for occupation patterns first (most common)
  for (const pattern of CONCEPT_PATTERNS.occupation.patterns) {
    const match = questionLower.match(pattern);
    if (match && match[1]) {
      const term = match[1].trim();
      if (term.length > 2 && !STOP_WORDS.includes(term)) {
        terms.push({ term, type: 'occupation' });
      }
    }
  }
  
  // Check for occupation-like suffixes in words
  const words = question.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[?.,!]/g, '').toLowerCase();
    if (cleanWord.length > 4) {
      const hasSuffix = CONCEPT_PATTERNS.occupation.suffixes.some(
        suffix => cleanWord.endsWith(suffix)
      );
      if (hasSuffix && !STOP_WORDS.includes(cleanWord)) {
        const existing = terms.find(t => t.term.toLowerCase() === cleanWord);
        if (!existing) {
          terms.push({ term: cleanWord, type: 'occupation' });
        }
      }
    }
  }
  
  // Last word before ? is often the concept
  const lastWordMatch = question.match(/([a-zA-Zéëïöüáàâäèêîôûç\-]+)\s*\??$/);
  if (lastWordMatch) {
    const term = lastWordMatch[1].toLowerCase();
    if (term.length > 3 && !STOP_WORDS.includes(term)) {
      const existing = terms.find(t => t.term.toLowerCase() === term);
      if (!existing) {
        terms.push({ term, type: 'occupation' });
      }
    }
  }
  
  console.log(`[Concept] Extracted terms:`, terms);
  return terms;
};

/**
 * Fetch RAG examples
 */
const fetchRAGExamples = async (question: string, topK: number = 5): Promise<any[]> => {
  try {
    const response = await fetch(`${BACKEND_URL}/rag/examples?limit=${topK * 2}`);
    if (!response.ok) return [];
    
    const examples = await response.json();
    const questionLower = question.toLowerCase();
    const keywords = questionLower.split(/\s+/).filter(w => w.length > 3);
    
    const scored = examples.map((ex: any) => {
      const exLower = ex.question.toLowerCase();
      let matchScore = 0;
      keywords.forEach(kw => {
        if (exLower.includes(kw)) matchScore += 1;
      });
      matchScore += (ex.feedback_score + 1) * 0.5;
      return { ...ex, similarity: matchScore };
    });
    
    return scored.sort((a: any, b: any) => b.similarity - a.similarity).slice(0, topK);
  } catch (error) {
    return [];
  }
};

/**
 * Build chat context
 */
const buildChatContext = (history: ChatMessage[], maxMessages: number = 6): string => {
  if (history.length === 0) return '';
  
  const recentHistory = history.slice(-maxMessages);
  const contextParts = recentHistory.map(msg => {
    if (msg.role === 'user') {
      return `Gebruiker: ${msg.content}`;
    } else {
      let assistantMsg = `Assistent: ${msg.content.substring(0, 200)}`;
      if (msg.sparql) {
        assistantMsg += `\n[SPARQL: ${msg.sparql.substring(0, 100)}...]`;
      }
      return assistantMsg;
    }
  });
  
  return `\n## EERDERE CONVERSATIE\n${contextParts.join('\n\n')}\n\n## HUIDIGE VRAAG\n`;
};

/**
 * Fix SPARQL query
 */
const fixSparqlQuery = (query: string): string => {
  if (!query || typeof query !== 'string') return '';
  
  let fixed = query;
  fixed = fixed.replace(/```sparql/gi, '').replace(/```/g, '').trim();
  fixed = fixed.replace(/FROM\s+<[^>]+>\s*/gi, '');
  
  const upper = fixed.toUpperCase();
  if (upper.includes('SELECT') && !upper.includes('LIMIT') && 
      !upper.includes('COUNT(') && !upper.includes('COUNT (')) {
    fixed = fixed.trim() + '\nLIMIT 50';
  }
  
  return fixed.trim();
};

/**
 * Main function: Generate SPARQL with Concept Resolution & Disambiguation
 */
export const generateSparqlWithDisambiguation = async (
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[] = [],
  pendingDisambiguation?: DisambiguationData,
  sessionId: string = 'default'
): Promise<GenerateResult> => {
  
  // Check if this is an answer to a disambiguation question
  if (pendingDisambiguation?.pending) {
    const selectedOption = await parseDisambiguationAnswer(userQuery, pendingDisambiguation.options);
    
    if (selectedOption) {
      // User selected an option - confirm and continue with original question
      await confirmConceptSelection(
        pendingDisambiguation.searchTerm,
        selectedOption.uri,
        selectedOption.prefLabel,
        selectedOption.conceptType
      );
      
      console.log(`[Disambiguation] User selected: ${selectedOption.prefLabel}`);
      
      // Now generate SPARQL with the resolved concept
      const conceptContext = `
### OPGELOSTE ${pendingDisambiguation.conceptType.toUpperCase()}
- Zoekterm: "${pendingDisambiguation.searchTerm}"
- Gekozen: "${selectedOption.prefLabel}"
- URI: ${selectedOption.uri}

**GEBRUIK IN SPARQL:**
FILTER(CONTAINS(LCASE(?label), "${selectedOption.prefLabel.toLowerCase()}"))
OF: FILTER(?label = "${selectedOption.prefLabel}")
`;
      
      const sparql = await generateSparqlInternal(
        pendingDisambiguation.originalQuestion,
        filters,
        chatHistory,
        conceptContext,
        sessionId
      );
      
      return {
        sparql,
        response: '',
        needsDisambiguation: false,
        resolvedConcepts: [{
          term: pendingDisambiguation.searchTerm,
          resolved: selectedOption.prefLabel,
          type: selectedOption.conceptType
        }]
      };
    } else {
      // User didn't select a valid option
      return {
        sparql: null,
        response: `Ik herkende je keuze niet. Typ een nummer (1-${pendingDisambiguation.options.length}) of een (deel van de) naam.\n\n${generateOptionsText(pendingDisambiguation.options)}`,
        needsDisambiguation: true,
        disambiguationData: pendingDisambiguation,
        resolvedConcepts: []
      };
    }
  }
  
  // Normal flow: extract and resolve concepts
  const conceptTerms = extractConceptTerms(userQuery);
  let conceptContext = '';
  const resolvedConcepts: { term: string; resolved: string; type: string }[] = [];
  
  for (const { term, type } of conceptTerms) {
    const result = await resolveConcept(term, type);
    
    if (result) {
      if (result.needsDisambiguation && result.matches.length > 0) {
        // Multiple matches - need to ask user
        console.log(`[Disambiguation] Needed for "${term}" - ${result.matches.length} options`);
        
        return {
          sparql: null,
          response: result.disambiguationQuestion || generateDisambiguationQuestion(term, result.matches, type),
          needsDisambiguation: true,
          disambiguationData: {
            pending: true,
            searchTerm: term,
            conceptType: type,
            options: result.matches,
            originalQuestion: userQuery
          },
          resolvedConcepts: []
        };
      }
      
      if (result.found && result.matches.length > 0) {
        const bestMatch = result.matches[0];
        resolvedConcepts.push({
          term,
          resolved: bestMatch.prefLabel,
          type
        });
        
        conceptContext += `
### ${type.toUpperCase()} GEVONDEN
- Zoekterm: "${term}"
- Officiële naam: "${bestMatch.prefLabel}"
- Match type: ${bestMatch.matchType}

**GEBRUIK IN SPARQL:**
FILTER(CONTAINS(LCASE(?label), "${bestMatch.prefLabel.toLowerCase()}"))
`;
      }
    }
  }
  
  // Generate SPARQL
  const sparql = await generateSparqlInternal(userQuery, filters, chatHistory, conceptContext, sessionId);
  
  return {
    sparql,
    response: '',
    needsDisambiguation: false,
    resolvedConcepts
  };
};

/**
 * Generate disambiguation question text
 */
function generateDisambiguationQuestion(term: string, matches: ConceptMatch[], type: string): string {
  const typeNames: Record<string, string> = {
    occupation: 'beroepen',
    education: 'opleidingen',
    capability: 'vaardigheden',
    knowledge: 'kennisgebieden',
    task: 'taken',
    workingCondition: 'werkomstandigheden'
  };
  
  let question = `Ik vond ${matches.length} ${typeNames[type] || 'resultaten'} voor "${term}". Welke bedoel je?\n\n`;
  question += generateOptionsText(matches.slice(0, 10));
  
  if (matches.length > 10) {
    question += `\n_...en nog ${matches.length - 10} andere opties._\n`;
  }
  
  question += `\nTyp het **nummer** of de **naam** van je keuze.`;
  
  return question;
}

/**
 * Generate options text
 */
function generateOptionsText(options: ConceptMatch[]): string {
  return options.map((match, index) => {
    let text = `**${index + 1}. ${match.prefLabel}**`;
    if (match.matchedLabel.toLowerCase() !== match.prefLabel.toLowerCase()) {
      text += ` _(via: "${match.matchedLabel}")_`;
    }
    return text;
  }).join('\n');
}

/**
 * Internal SPARQL generation
 */
async function generateSparqlInternal(
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[],
  conceptContext: string,
  sessionId: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const ragExamples = await fetchRAGExamples(userQuery, 5);
  let examplesText = '';
  if (ragExamples.length > 0) {
    examplesText = ragExamples.map((ex, i) => 
      `### Voorbeeld ${i + 1}\nVraag: ${ex.question}\nQuery:\n${ex.sparql_query}`
    ).join('\n\n');
  }
  
  const chatContext = buildChatContext(chatHistory);
  
  const systemInstruction = `
Je bent een expert SPARQL query generator voor de CompetentNL knowledge graph.

${SCHEMA_DOCUMENTATION}

## OPGELOSTE CONCEPTEN
${conceptContext || 'Geen specifieke concepten gedetecteerd.'}

## VOORBEELDQUERIES (RAG)
${examplesText || 'Geen voorbeelden beschikbaar.'}

## KRITIEKE REGELS
1. ALS EEN CONCEPT HIERBOVEN IS OPGELOST: gebruik EXACT de "Officiële naam" in je FILTER
2. Gebruik CONTAINS(LCASE(?label), "naam in lowercase") voor flexibele matching
3. Retourneer ALLEEN de SPARQL query, geen uitleg
4. Gebruik NOOIT "FROM <graph>" clauses
5. Voeg ALTIJD "LIMIT 50" toe (behalve bij COUNT)
6. Begin direct met PREFIX
`;

  const fullPrompt = chatContext + userQuery;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: fullPrompt,
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    let sparql = response.text || '';
    sparql = fixSparqlQuery(sparql);
    
    // Log to RAG
    try {
      await fetch(`${BACKEND_URL}/rag/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question: userQuery,
          sparql,
          resultCount: 0,
          executionTimeMs: 0
        })
      });
    } catch (e) { /* ignore */ }
    
    return sparql;
    
  } catch (error: any) {
    console.error("Gemini SPARQL Generation Error:", error);
    throw new Error(`AI kon geen SPARQL genereren: ${error.message}`);
  }
}

/**
 * Legacy function for backwards compatibility
 */
export const generateSparql = async (
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[] = [],
  sessionId: string = 'default'
): Promise<string> => {
  const result = await generateSparqlWithDisambiguation(userQuery, filters, chatHistory, undefined, sessionId);
  return result.sparql || '';
};

/**
 * Summarize results
 */
export const summarizeResults = async (
  question: string,
  results: any[],
  totalCount?: number,
  chatHistory: ChatMessage[] = []
): Promise<string> => {
  if (!results || results.length === 0) {
    return "Geen resultaten gevonden. Dit kan komen doordat het concept niet precies zo in de database staat. Probeer een andere schrijfwijze.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const sampleSize = Math.min(15, results.length);
  const dataSnippet = JSON.stringify(results.slice(0, sampleSize), null, 2);
  
  const prompt = `
Vraag: "${question}"
Aantal getoond: ${results.length}${totalCount ? `, Totaal: ${totalCount}` : ''}
Data (eerste ${sampleSize}):
${dataSnippet}

Geef een beknopte Nederlandse samenvatting (3-5 zinnen):
- Direct antwoord op de vraag
- Noem 3-5 specifieke voorbeelden
- Verwijs naar de tabel en Excel export
`;

  try {
    const response = await ai.models.generateContent({
      model: SUMMARY_MODEL,
      contents: prompt,
      config: { temperature: 0.7 },
    });
    return response.text || "Hier zijn de resultaten.";
  } catch (error) {
    const examples = results.slice(0, 3).map(r => 
      r.label || r.occLabel || r.prefLabel || Object.values(r)[0]
    ).filter(Boolean).join(", ");
    
    return `Gevonden: ${results.length} resultaten. Voorbeelden: ${examples}.`;
  }
};

// Export types and utilities
export { ConceptMatch, ConceptResolveResult, DisambiguationData };
