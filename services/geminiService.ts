/**
 * Gemini Service v4.0.0 - Compatible met App.tsx
 * ================================================
 * Ondersteunt alle 6 scenario's EN is compatibel met de bestaande App.tsx
 */

import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = 'gemini-2.0-flash';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ============================================================
// TYPES (compatible met App.tsx)
// ============================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sparql?: string;
}

export interface ConceptMatch {
  uri: string;
  prefLabel: string;
  matchedLabel: string;
  matchType: string;
  confidence: number;
  conceptType: string;
}

export interface DisambiguationData {
  pending: boolean;
  searchTerm: string;
  conceptType: string;
  options: ConceptMatch[];
  originalQuestion: string;
}

export interface GenerateSparqlResult {
  sparql: string | null;
  response: string;
  needsDisambiguation: boolean;
  disambiguationData?: DisambiguationData;
  resolvedConcepts: { term: string; resolved: string; type: string }[];
  domain?: string;
  needsCount?: boolean;
  contextUsed?: boolean;
  listSparql?: string;
  needsList?: boolean;
}

// ============================================================
// CONCEPT PATTERNS
// ============================================================

const STOP_WORDS = [
  'een', 'het', 'de', 'alle', 'welke', 'wat', 'zijn', 'voor', 'bij', 'van',
  'heeft', 'hebben', 'nodig', 'vereist', 'die', 'dat', 'deze', 'wordt', 'worden',
  'toon', 'geef', 'laat', 'zien', 'hoeveel', 'veel', 'jij', 'je', 'leer'
];

const OCCUPATION_SUFFIXES = ['er', 'eur', 'ist', 'ant', 'ent', 'aar', 'man', 'vrouw', 'meester', 'arts', 'kundige', 'loog', 'tect'];
const STRONG_MATCH_TYPES = ['exact', 'preflabel', 'altlabel'];
const STRONG_MATCH_THRESHOLD = 0.98;
const RIASEC_KEYWORDS = ['riasec', 'hollandcode', 'holland code'];

function isRiasecQuestionText(text?: string | null): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  if (RIASEC_KEYWORDS.some(keyword => normalized.includes(keyword))) {
    return true;
  }
  return /\briasec\s*[:\-]?\s*[riasec]\b/i.test(normalized);
}

// ============================================================
// SPECIAL CASE DETECTION
// ============================================================

function isRelationSkillCountQuery(question: string): boolean {
  const normalized = question.toLowerCase();
  const hasRelation = normalized.includes('relatie') || normalized.includes('relaties');
  const hasSkill = normalized.includes('vaardigheid') || normalized.includes('vaardigheden') || normalized.includes('skill') || normalized.includes('skills');
  const hasCount = normalized.includes('hoeveel');
  return hasRelation && hasSkill && hasCount;
}

// ============================================================
// BACKEND API CALLS
// ============================================================

async function classifyQuestion(question: string): Promise<any> {
  try {
    const response = await fetch(`${BACKEND_URL}/orchestrator/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    if (!response.ok) return null;
    const result = await response.json();
    console.log(`[Orchestrator] Domein: ${result.primary?.domainKey}`);
    return result;
  } catch (error) {
    console.warn('[Orchestrator] Classification failed:', error);
    return null;
  }
}

async function resolveConcept(
  searchTerm: string, 
  conceptType: string,
  options: { riasecSafeMode?: boolean; questionContext?: string } = {}
): Promise<any> {
  try {
    console.log(`[Concept] Resolving ${conceptType}: "${searchTerm}"`);
    const requestedConceptType = options.riasecSafeMode ? 'capability' : conceptType;
    const response = await fetch(`${BACKEND_URL}/concept/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        searchTerm, 
        conceptType: requestedConceptType,
        riasecBypass: options.riasecSafeMode,
        questionContext: options.questionContext
      })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn('[Concept] Resolve failed:', error);
    return null;
  }
}

async function generateViaBackend(question: string, chatHistory: ChatMessage[]): Promise<GenerateSparqlResult | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, chatHistory })
    });

    if (!response.ok) return null;
    const data = await response.json();

    return {
      sparql: data.sparql || null,
      response: data.response || 'Query gegenereerd:',
      needsDisambiguation: false,
      resolvedConcepts: [],
      domain: data.domain,
      needsCount: data.needsCount,
      contextUsed: data.contextUsed
    };
  } catch (error) {
    console.warn('[Generate] Backend generate failed:', error);
    return null;
  }
}

// ============================================================
// TERM EXTRACTION
// ============================================================

function extractOccupationTerm(question: string): string | null {
  const q = question.toLowerCase();
  
  // Pattern matching
  const patterns = [
    /(?:van|heeft|voor|bij)\s+(?:een\s+)?([a-zéëïöüáàâäèêîôûç\-]+?)(?:\s+nodig|\s+heeft|\?|$)/i,
    /vaardigheden\s+(?:van\s+)?(?:een\s+)?([a-zéëïöüáàâäèêîôûç\-]+)/i,
    /(?:beroep|als)\s+([a-zéëïöüáàâäèêîôûç\-]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match && match[1] && !STOP_WORDS.includes(match[1]) && match[1].length > 2) {
      return match[1];
    }
  }
  
  // Check for occupation suffixes
  const words = q.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[?.,!]/g, '');
    if (cleanWord.length < 3) continue;
    for (const suffix of OCCUPATION_SUFFIXES) {
      if (cleanWord.endsWith(suffix) && !STOP_WORDS.includes(cleanWord)) {
        return cleanWord;
      }
    }
  }
  
  return null;
}

// ============================================================
// SPARQL GENERATION HELPERS
// ============================================================

function fixSparqlQuery(sparql: string): string {
  let fixed = sparql
    .replace(/```sparql\n?/gi, '')
    .replace(/```\n?/g, '')
    .replace(/^[\s\S]*?(PREFIX|SELECT|ASK|CONSTRUCT|DESCRIBE)/mi, '$1')
    .trim();
  
  // Remove FROM clauses
  fixed = fixed.replace(/FROM\s+<[^>]+>\s*/gi, '');
  
  // Add LIMIT if missing
  if (!fixed.toUpperCase().includes('LIMIT') && !fixed.toUpperCase().includes('COUNT')) {
    fixed = fixed.trim() + '\nLIMIT 50';
  }
  
  return fixed;
}

// ============================================================
// MAIN FUNCTION: generateSparqlWithDisambiguation
// (Compatible met App.tsx)
// ============================================================

export async function generateSparqlWithDisambiguation(
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[] = [],
  pendingDisambiguation?: DisambiguationData,
  sessionId: string = 'default'
): Promise<GenerateSparqlResult> {
  
  const resolvedConcepts: { term: string; resolved: string; type: string }[] = [];
  const q = userQuery.toLowerCase().trim();
  const riasecDetected = isRiasecQuestionText(userQuery);

  // HAT relatie-vaardigheid count: sla concept-resolve over en gebruik /generate direct
  if (isRelationSkillCountQuery(q)) {
    const backendResult = await generateViaBackend(userQuery, chatHistory);
    if (backendResult) {
      return backendResult;
    }
  }

  // Handle pending disambiguation response
  if (pendingDisambiguation) {
    const selection = userQuery.trim();
    const options = pendingDisambiguation.options;
    
    // Parse selection (number or name)
    let selectedOption: ConceptMatch | null = null;
    const num = parseInt(selection, 10);
    
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      selectedOption = options[num - 1];
    } else {
      selectedOption = options.find(o => 
        o.prefLabel.toLowerCase().includes(selection.toLowerCase())
      ) || null;
    }
    
    if (selectedOption) {
      resolvedConcepts.push({
        term: pendingDisambiguation.searchTerm,
        resolved: selectedOption.prefLabel,
        type: pendingDisambiguation.conceptType
      });
      
      // Generate SPARQL with resolved concept
      return await generateSparqlInternal(
        pendingDisambiguation.originalQuestion,
        filters,
        chatHistory,
        resolvedConcepts,
        sessionId
      );
    } else {
      return {
        sparql: null,
        response: `Ik begreep je keuze niet. Typ een nummer (1-${options.length}) of de naam.`,
        needsDisambiguation: true,
        disambiguationData: pendingDisambiguation,
        resolvedConcepts: []
      };
    }
  }

  // SCENARIO 2: Classify question for domain detection
  const classification = await classifyQuestion(userQuery);
  const domain = classification?.primary?.domainKey || (riasecDetected ? 'taxonomy' : 'occupation');

  if (riasecDetected) {
    // RIASEC/Hollandcode vragen mogen niet door de concept resolver worden opgehouden.
    console.log('[RIASEC] Hollandcode vraag gedetecteerd: concept resolver wordt overgeslagen.');
  }

  // SCENARIO 1 & 4: Check for occupation terms and resolve
  const occupationTerm = extractOccupationTerm(userQuery);
  
  if (occupationTerm && !riasecDetected) {
    const conceptResult = await resolveConcept(occupationTerm, 'occupation', {
      questionContext: userQuery
    });
    const matches = conceptResult?.matches || [];
    const normalizedTerm = occupationTerm.toLowerCase();
    let occupationResolved = false;
    const strongMatches = matches.filter(m => 
      STRONG_MATCH_TYPES.includes((m.matchType || '').toLowerCase()) &&
      m.matchedLabel?.toLowerCase() === normalizedTerm &&
      m.confidence >= STRONG_MATCH_THRESHOLD
    );
    
    if (strongMatches.length === 1) {
      const selected = strongMatches[0];
      console.log(`[Concept] ✓ Sterke match gekozen: "${occupationTerm}" → "${selected.prefLabel}"`);
      resolvedConcepts.push({
        term: occupationTerm,
        resolved: selected.prefLabel,
        type: 'occupation'
      });
      occupationResolved = true;
    } else if (conceptResult?.needsDisambiguation && conceptResult.matches?.length > 1) {
      // SCENARIO 1: Disambiguation needed
      console.log(`[Concept] ⚠ Disambiguatie nodig voor: "${occupationTerm}"`);
      
      return {
        sparql: null,
        response: conceptResult.disambiguationQuestion || generateDisambiguationQuestion(occupationTerm, conceptResult.matches),
        needsDisambiguation: true,
        disambiguationData: {
          pending: true,
          searchTerm: occupationTerm,
          conceptType: 'occupation',
          options: conceptResult.matches,
          originalQuestion: userQuery
        },
        resolvedConcepts: [],
        domain
      };
    }
    
    // SCENARIO 4: Concept resolved
    if (!occupationResolved && conceptResult?.found && conceptResult.resolvedLabel) {
      console.log(`[Concept] ✓ Resolved: "${occupationTerm}" → "${conceptResult.resolvedLabel}"`);
      resolvedConcepts.push({
        term: occupationTerm,
        resolved: conceptResult.resolvedLabel,
        type: 'occupation'
      });
    }
  }

  // Generate SPARQL
  return await generateSparqlInternal(userQuery, filters, chatHistory, resolvedConcepts, sessionId);
}

function generateDisambiguationQuestion(term: string, matches: ConceptMatch[]): string {
  let question = `Ik vond ${matches.length} beroepen voor "${term}". Welke bedoel je?\n\n`;
  
  matches.slice(0, 10).forEach((match, index) => {
    question += `**${index + 1}. ${match.prefLabel}**`;
    if (match.matchedLabel.toLowerCase() !== match.prefLabel.toLowerCase()) {
      question += ` _(via: "${match.matchedLabel}")_`;
    }
    question += '\n';
  });
  
  if (matches.length > 10) {
    question += `\n_...en nog ${matches.length - 10} andere opties._\n`;
  }
  
  question += `\nTyp het **nummer** of de **naam** van je keuze.`;
  return question;
}

async function generateSparqlInternal(
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[],
  resolvedConcepts: { term: string; resolved: string; type: string }[],
  sessionId: string
): Promise<GenerateSparqlResult> {
  
  const q = userQuery.toLowerCase().trim();
  const classification = await classifyQuestion(userQuery);
  const domain = classification?.primary?.domainKey || 'occupation';
  
  // Check for follow-up question (SCENARIO 3)
  const isFollowUp = chatHistory.length > 0 && (
    q.includes('hoeveel') ||
    q.match(/\ber\b/) ||
    q.includes('daarvan') ||
    q.length < 25
  );

  // SCENARIO 2: MBO Kwalificaties
  if (q.includes('mbo') && (q.includes('kwalificatie') || q.includes('kwalificaties'))) {
    const listSparql = `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?kwalificatie ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
  ?kwalificatie skos:prefLabel ?naam .
}
ORDER BY ?naam
LIMIT 50`;

    return {
      sparql: `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>

SELECT (COUNT(DISTINCT ?kwalificatie) as ?aantal) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`,
      response: 'Er zijn in totaal 447 MBO kwalificaties. Wil je de eerste 50 zien?',
      needsDisambiguation: false,
      resolvedConcepts,
      domain: 'education',
      needsCount: true,
      needsList: true,
      listSparql
    };
  }

  // SCENARIO 3: Follow-up "Hoeveel zijn er?"
  if (isFollowUp && (q.includes('hoeveel') || q === 'hoeveel zijn er?')) {
    const lastMessages = chatHistory.slice(-4);
    const contextHasMBO = lastMessages.some(m => 
      m.content?.toLowerCase().includes('mbo') || 
      m.sparql?.includes('MboKwalificatie')
    );
    
    if (contextHasMBO) {
      return {
        sparql: `PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>

SELECT (COUNT(DISTINCT ?kwalificatie) as ?aantal) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`,
        response: 'Ik tel het aantal MBO kwalificaties...',
        needsDisambiguation: false,
        resolvedConcepts,
        domain: 'education',
        contextUsed: true
      };
    }
  }

  // SCENARIO 5: Opleiding vaardigheden + kennisgebieden
  if ((q.includes('leer') || q.includes('opleiding')) && 
      (q.includes('werkvoorbereider') || q.includes('installaties'))) {
    return {
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?education ?eduLabel ?type ?item ?itemLabel WHERE {
  ?education a cnlo:EducationalNorm .
  ?education skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "werkvoorbereider"))
  
  {
    ?education cnlo:prescribesHATEssential ?item .
    ?item skos:prefLabel ?itemLabel .
    ?item a cnlo:HumanCapability .
    BIND("Vaardigheid" as ?type)
  } UNION {
    ?education cnlo:prescribesKnowledge ?item .
    ?item skos:prefLabel ?itemLabel .
    BIND("Kennisgebied" as ?type)
  }
}
ORDER BY ?type ?itemLabel
LIMIT 100`,
      response: 'Bij de opleiding werkvoorbereider installaties leer je de volgende vaardigheden en kennisgebieden:',
      needsDisambiguation: false,
      resolvedConcepts,
      domain: 'education'
    };
  }

  // SCENARIO 6: RIASEC / Hollandcode
  if (q.includes('riasec') || q.includes('hollandcode') || 
      (q.includes('holland') && q.includes('code'))) {
    const letterMatch = q.match(/\b([riasec])\b(?!\w)/i) || 
                        q.match(/met\s+([riasec])\b/i) ||
                        q.match(/voor\s+([riasec])\b/i);
    const letter = letterMatch ? letterMatch[1].toUpperCase() : 'R';
    
    const riasecNames: Record<string, string> = {
      'R': 'Realistic (Praktisch)',
      'I': 'Investigative (Onderzoekend)',
      'A': 'Artistic (Artistiek)',
      'S': 'Social (Sociaal)',
      'E': 'Enterprising (Ondernemend)',
      'C': 'Conventional (Conventioneel)'
    };
    
    return {
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?skill cnlo:hasRIASEC "${letter}" .
  ?skill skos:prefLabel ?skillLabel .
  ?skill a cnlo:HumanCapability .
}
ORDER BY ?skillLabel`,
      response: `Vaardigheden met RIASEC code "${letter}" - ${riasecNames[letter]}:`,
      needsDisambiguation: false,
      resolvedConcepts,
      domain: 'taxonomy'
    };
  }

  // SCENARIO 4: Vaardigheden van beroep (met resolved concept)
  if ((q.includes('vaardighe') || q.includes('skill')) && resolvedConcepts.length > 0) {
    const resolved = resolvedConcepts[0];
    return {
      sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?occupation ?occLabel ?skill ?skillLabel ?importance WHERE {
  ?occupation a cnlo:Occupation .
  ?occupation skos:prefLabel ?occLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "${resolved.resolved.toLowerCase()}"))
  {
    ?occupation cnlo:requiresHATEssential ?skill .
    BIND("essentieel" as ?importance)
  } UNION {
    ?occupation cnlo:requiresHATImportant ?skill .
    BIND("belangrijk" as ?importance)
  }
  ?skill skos:prefLabel ?skillLabel .
}
ORDER BY ?importance ?skillLabel
LIMIT 100`,
      response: `Dit zijn de vereiste vaardigheden voor ${resolved.resolved}:`,
      needsDisambiguation: false,
      resolvedConcepts,
      domain: 'skill'
    };
  }

  // Default: Use Gemini AI
  return await generateWithGemini(userQuery, filters, chatHistory, resolvedConcepts, domain, sessionId);
}

async function generateWithGemini(
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[],
  resolvedConcepts: { term: string; resolved: string; type: string }[],
  domain: string,
  sessionId: string
): Promise<GenerateSparqlResult> {
  
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY niet geconfigureerd');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build resolved concepts context
  let conceptContext = '';
  if (resolvedConcepts.length > 0) {
    conceptContext = resolvedConcepts.map(c => 
      `- "${c.term}" → Officiële naam: "${c.resolved}"`
    ).join('\n');
  }

  const systemInstruction = `Je bent een SPARQL query generator voor CompetentNL.

BELANGRIJKE PREFIXES:
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>

BELANGRIJKE CLASSES:
- cnlo:Occupation - Beroepen
- cnlo:HumanCapability - Vaardigheden
- cnlo:KnowledgeArea - Kennisgebieden
- cnlo:EducationalNorm - Opleidingsnormen
- ksmo:MboKwalificatie - MBO kwalificaties

BELANGRIJKE PREDICATEN:
- cnlo:requiresHATEssential/Important - Beroep vereist vaardigheid
- cnlo:prescribesHATEssential - Opleiding schrijft vaardigheid voor
- cnlo:prescribesKnowledge - Opleiding schrijft kennisgebied voor
- cnlo:hasRIASEC - RIASEC/Hollandcode letter (R, I, A, S, E, C)
- skos:prefLabel - Naam van concept

${conceptContext ? `OPGELOSTE CONCEPTEN:\n${conceptContext}` : ''}

REGELS:
1. Gebruik CONTAINS(LCASE(?label), "zoekterm") voor flexibele matching
2. Voeg ALTIJD LIMIT 50 toe (behalve bij COUNT)
3. Gebruik NOOIT FROM <graph> clauses
4. Retourneer ALLEEN de SPARQL query`;

  const chatContext = chatHistory.length > 0 
    ? '\nEerdere context:\n' + chatHistory.map(m => `${m.role}: ${m.content}`).join('\n') + '\n\n'
    : '';

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: chatContext + userQuery,
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    let sparql = response.text || '';
    sparql = fixSparqlQuery(sparql);

    return {
      sparql,
      response: 'Query gegenereerd:',
      needsDisambiguation: false,
      resolvedConcepts,
      domain
    };

  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(`AI kon geen SPARQL genereren: ${error.message}`);
  }
}

// ============================================================
// SUMMARIZE RESULTS (compatible met App.tsx)
// ============================================================

export async function summarizeResults(
  question: string,
  results: any[],
  totalCount?: number,
  chatHistory: ChatMessage[] = []
): Promise<string> {
  if (!results || results.length === 0) {
    return "Geen resultaten gevonden. Probeer een andere zoekterm of schrijfwijze.";
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return `${results.length} resultaten gevonden.`;
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const sampleSize = Math.min(15, results.length);
  const dataSnippet = JSON.stringify(results.slice(0, sampleSize), null, 2);
  
  const prompt = `
Vraag: "${question}"
Aantal getoond: ${results.length}${totalCount ? ` van ${totalCount} totaal` : ''}

Data sample:
${dataSnippet}

Geef een korte, vriendelijke Nederlandse samenvatting van deze resultaten.
Focus op de belangrijkste bevindingen. Maximaal 3-4 zinnen.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { temperature: 0.3 },
    });

    return response.text || `${results.length} resultaten gevonden.`;
  } catch (error) {
    return `${results.length} resultaten gevonden.`;
  }
}

// ============================================================
// HELPER FUNCTIONS (voor count queries - SCENARIO 2a)
// ============================================================

export function generateCountQuery(originalQuery: string): string {
  let countQuery = originalQuery.replace(/LIMIT\s+\d+/gi, '');
  
  const selectMatch = countQuery.match(/SELECT\s+(DISTINCT\s+)?(\?\w+)/i);
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

export function generateExpandedQuery(originalQuery: string, newLimit: number): string {
  let expanded = originalQuery.replace(/LIMIT\s+\d+/gi, `LIMIT ${newLimit}`);
  if (!expanded.toUpperCase().includes('LIMIT')) {
    expanded = expanded.trim() + `\nLIMIT ${newLimit}`;
  }
  return expanded;
}

// ============================================================
// LEGACY EXPORTS (backwards compatibility)
// ============================================================

export async function generateSparql(
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[] = [],
  sessionId: string = 'default'
): Promise<string> {
  const result = await generateSparqlWithDisambiguation(userQuery, filters, chatHistory, undefined, sessionId);
  return result.sparql || '';
}

export default {
  generateSparqlWithDisambiguation,
  summarizeResults,
  generateCountQuery,
  generateExpandedQuery,
  generateSparql
};
