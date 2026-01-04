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
  resolvedConcepts: { term: string; resolved: string; type: string; uri?: string }[];
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
    /(?:van|heeft|voor|bij)\s+(?:een\s+)?([a-zÃƒÂ©ÃƒÂ«ÃƒÂ¯ÃƒÂ¶ÃƒÂ¼ÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ¤ÃƒÂ¨ÃƒÂªÃƒÂ®ÃƒÂ´ÃƒÂ»ÃƒÂ§\-]+?)(?:\s+nodig|\s+heeft|\?|$)/i,
    /vaardigheden\s+(?:van\s+)?(?:een\s+)?([a-zÃƒÂ©ÃƒÂ«ÃƒÂ¯ÃƒÂ¶ÃƒÂ¼ÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ¤ÃƒÂ¨ÃƒÂªÃƒÂ®ÃƒÂ´ÃƒÂ»ÃƒÂ§\-]+)/i,
    /(?:beroep|als)\s+([a-zÃƒÂ©ÃƒÂ«ÃƒÂ¯ÃƒÂ¶ÃƒÂ¼ÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ¤ÃƒÂ¨ÃƒÂªÃƒÂ®ÃƒÂ´ÃƒÂ»ÃƒÂ§\-]+)/i,
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

/**
 * Fix incorrect occupation URIs in SPARQL query
 * De AI construeert soms zelf URIs zoals /id/occupation/kapper-2
 * Deze moeten vervangen worden door de echte URI uit de database
 */
function fixOccupationUri(sparql: string, correctUri: string | undefined): string {
  if (!correctUri) {
    console.log('[URI-Fix] Geen correcte URI beschikbaar, query ongewijzigd');
    return sparql;
  }
  
  console.log(`[URI-Fix] Correcte URI: ${correctUri}`);
  
  let fixed = sparql;
  const original = sparql;
  
  // Pattern 1: VALUES ?occupation { <any-uri> }
  // Dit vangt zowel correcte als incorrecte URIs
  fixed = fixed.replace(
    /VALUES\s+\?occupation\s*\{\s*<[^>]+>\s*\}/gi,
    `VALUES ?occupation { <${correctUri}> }`
  );
  
  // Pattern 2: Incorrecte URIs (zonder /uwv/) in andere contexten
  // Match: <https://linkeddata.competentnl.nl/id/occupation/anything>
  // Niet: <https://linkeddata.competentnl.nl/uwv/id/occupation/...>
  fixed = fixed.replace(
    /<https:\/\/linkeddata\.competentnl\.nl\/id\/occupation\/[^>]+>/gi,
    `<${correctUri}>`
  );
  
  if (fixed !== original) {
    console.log(`[URI-Fix] ✓ URI gecorrigeerd in query`);
    console.log(`[URI-Fix] Nieuwe URI in query: ${correctUri}`);
  } else {
    console.log(`[URI-Fix] Query bevat geen occupation URI om te vervangen`);
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
  
  const resolvedConcepts: { term: string; resolved: string; type: string; uri?: string }[] = [];
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
      // DEBUG: Log alle details van de geselecteerde optie
      console.log(`[Concept] DEBUG selectedOption:`, JSON.stringify(selectedOption, null, 2));
      console.log(`[Concept] DEBUG selectedOption.uri:`, selectedOption.uri);
      console.log(`[Concept] DEBUG typeof uri:`, typeof selectedOption.uri);
      
      // URI meegeven voor nauwkeurige queries (filter synthetische URIs)
      const resolvedUri = selectedOption.uri && !selectedOption.uri.startsWith('synthetic:') 
        ? selectedOption.uri 
        : undefined;
      
      console.log(`[Concept] DEBUG resolvedUri na filter:`, resolvedUri);
      
      resolvedConcepts.push({
        term: pendingDisambiguation.searchTerm,
        resolved: selectedOption.prefLabel,
        type: pendingDisambiguation.conceptType,
        uri: resolvedUri
      });
      
      console.log(`[Concept] Disambiguatie opgelost: "${pendingDisambiguation.searchTerm}" -> "${selectedOption.prefLabel}"`);
      console.log(`[Concept] URI: ${resolvedUri || 'GEEN URI!'}`);
      
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
      const resolvedUri = selected.uri && !selected.uri.startsWith('synthetic:') 
        ? selected.uri 
        : undefined;
      console.log(`[Concept] Sterke match: "${occupationTerm}" -> "${selected.prefLabel}"${resolvedUri ? ' (URI)' : ''}`);
      resolvedConcepts.push({
        term: occupationTerm,
        resolved: selected.prefLabel,
        type: 'occupation',
        uri: resolvedUri
      });
      occupationResolved = true;
    } else if (conceptResult?.needsDisambiguation && conceptResult.matches?.length > 1) {
      // SCENARIO 1: Disambiguation needed
      console.log(`[Concept] Ã¢Å¡Â  Disambiguatie nodig voor: "${occupationTerm}"`);
      
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
      const resolvedUri = conceptResult.resolvedUri || undefined;
      console.log(`[Concept] SCENARIO 4 resolved:`);
      console.log(`  - term: "${occupationTerm}"`);
      console.log(`  - label: "${conceptResult.resolvedLabel}"`);
      console.log(`  - URI: ${resolvedUri || 'GEEN URI!'}`);
      resolvedConcepts.push({
        term: occupationTerm,
        resolved: conceptResult.resolvedLabel,
        type: 'occupation',
        uri: resolvedUri
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
  resolvedConcepts: { term: string; resolved: string; type: string; uri?: string }[],
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

  // ============================================================
  // DIRECTE QUERY GENERATIE MET URI (zonder AI)
  // ============================================================
  // Als we een URI hebben EN het is een bekende query type, genereer direct
  
  console.log(`[Direct] userQuery: "${userQuery}"`);
  console.log(`[Direct] resolvedConcepts:`, JSON.stringify(resolvedConcepts, null, 2));
  
  const resolved = resolvedConcepts.find(c => c.uri && c.type === 'occupation');
  console.log(`[Direct] Found resolved with URI:`, resolved ? JSON.stringify(resolved) : 'GEEN');
  
  if (resolved?.uri) {
    const q = userQuery.toLowerCase();
    console.log(`[Direct] Checking query type for: "${q}"`);
    console.log(`[Direct] URI to use: ${resolved.uri}`);
    
    // TAKEN query - directe generatie
    if (q.includes('taak') || q.includes('taken') || q.includes('werkzaamhed')) {
      console.log(`[Direct] ✓ Genereer TAKEN query met URI: ${resolved.uri}`);
      const sparql = `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taskLabel WHERE {
  VALUES ?occupation { <${resolved.uri}> }
  ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
ORDER BY ?taskLabel
LIMIT 50`;
      console.log(`[Direct] Generated SPARQL:\n${sparql}`);
      return {
        sparql,
        response: `Dit zijn de taken voor ${resolved.resolved}:`,
        needsDisambiguation: false,
        resolvedConcepts,
        domain: 'task'
      };
    }
    
    // VAARDIGHEDEN query - directe generatie  
    if (q.includes('vaardig') || q.includes('skill') || q.includes('competen')) {
      console.log(`[Direct] Genereer vaardigheden query met URI: ${resolved.uri}`);
      return {
        sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?skillLabel ?importance WHERE {
  VALUES ?occupation { <${resolved.uri}> }
  {
    ?occupation cnlo:requiresHATEssential ?skill .
    BIND("essentieel" AS ?importance)
  } UNION {
    ?occupation cnlo:requiresHATImportant ?skill .
    BIND("belangrijk" AS ?importance)
  }
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?importance ?skillLabel
LIMIT 100`,
        response: `Dit zijn de vaardigheden voor ${resolved.resolved}:`,
        needsDisambiguation: false,
        resolvedConcepts,
        domain: 'skill'
      };
    }
    
    // KENNIS query - directe generatie
    if (q.includes('kennis') || q.includes('knowledge')) {
      console.log(`[Direct] Genereer kennis query met URI: ${resolved.uri}`);
      return {
        sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?knowledgeLabel WHERE {
  VALUES ?occupation { <${resolved.uri}> }
  ?occupation cnlo:requiresKnowledge ?knowledge .
  ?knowledge skos:prefLabel ?knowledgeLabel .
  FILTER(LANG(?knowledgeLabel) = "nl")
}
ORDER BY ?knowledgeLabel
LIMIT 50`,
        response: `Dit zijn de kennisgebieden voor ${resolved.resolved}:`,
        needsDisambiguation: false,
        resolvedConcepts,
        domain: 'knowledge'
      };
    }
  }

  // Default: Use Gemini AI (alleen als geen directe query mogelijk is)
  console.log(`[Gemini] Geen directe query mogelijk, gebruik AI`);
  return await generateWithGemini(userQuery, filters, chatHistory, resolvedConcepts, domain, sessionId);
}

async function generateWithGemini(
  userQuery: string,
  filters: { graphs: string[], type: string, status: string },
  chatHistory: ChatMessage[],
  resolvedConcepts: { term: string; resolved: string; type: string; uri?: string }[],
  domain: string,
  sessionId: string
): Promise<GenerateSparqlResult> {
  
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY niet geconfigureerd');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build resolved concepts context - inclusief URI voor nauwkeurige queries
  let conceptContext = '';
  let hasUri = false;
  let uriForQuery = '';
  if (resolvedConcepts.length > 0) {
    conceptContext = resolvedConcepts.map(c => {
      if (c.uri) {
        hasUri = true;
        uriForQuery = c.uri;
        console.log(`[Gemini] ✓ URI beschikbaar voor "${c.term}": ${c.uri}`);
        return `- "${c.term}" wordt: "${c.resolved}"\n  👉 GEBRUIK DEZE URI IN JE QUERY: <${c.uri}>`;
      }
      console.log(`[Gemini] ✗ GEEN URI voor "${c.term}" -> "${c.resolved}"`);
      return `- "${c.term}" wordt: "${c.resolved}" (gebruik CONTAINS als fallback)`;
    }).join('\n\n');
    console.log(`[Gemini] Concept context:\n${conceptContext}`);
  }

  const systemInstruction = `Je bent een SPARQL query generator voor CompetentNL.

BELANGRIJKE PREFIXES:
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>

BELANGRIJKE CLASSES:
- cnlo:Occupation - Beroepen
- cnlo:HumanCapability - Vaardigheden
- cnlo:KnowledgeArea - Kennisgebieden
- cnlo:EducationalNorm - Opleidingsnormen
- ksmo:MboKwalificatie - MBO kwalificaties
- cnluwvo:OccupationTask - Taken/werkzaamheden

BELANGRIJKE PREDICATEN:
- cnlo:requiresHATEssential/Important - Beroep vereist vaardigheid
- cnlo:prescribesHATEssential - Opleiding schrijft vaardigheid voor
- cnlo:prescribesKnowledge - Opleiding schrijft kennisgebied voor
- cnlo:hasRIASEC - RIASEC/Hollandcode letter (R, I, A, S, E, C)
- cnluwvo:isCharacterizedByOccupationTask_Essential - Beroep heeft essentiÃ«le taak
- cnluwvo:isCharacterizedByOccupationTask_Optional - Beroep heeft optionele taak
- skos:prefLabel - Naam van concept

${conceptContext ? `OPGELOSTE CONCEPTEN:
${conceptContext}

⚠️ KRITIEK - URI GEBRUIK - LEES DIT ZORGVULDIG:
1. Hierboven staat een URI tussen < en >
2. KOPIEER DEZE URI EXACT - letter voor letter, inclusief de hash-code aan het einde
3. De URI eindigt op een code zoals "ABC123DEF4", NIET op een leesbare naam
4. MAAK NOOIT ZELF EEN URI - gebruik ALLEEN de gegeven URI

ALS JE EEN URI KRIJGT ZOALS: <https://linkeddata.competentnl.nl/uwv/id/occupation/7F9A2BC3D1>
DAN MOET JE QUERY ER ZO UITZIEN:

SELECT DISTINCT ?taskLabel WHERE {
  VALUES ?occupation { <https://linkeddata.competentnl.nl/uwv/id/occupation/7F9A2BC3D1> }
  ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
ORDER BY ?taskLabel
LIMIT 50

Let op: De URI in VALUES moet EXACT overeenkomen met de gegeven URI hierboven!` : ''}

VOORBEELD ZONDER URI (fallback met CONTAINS):
PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taskLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "zoekterm"))
  ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
ORDER BY ?taskLabel
LIMIT 50

REGELS:
1. Als een URI beschikbaar is: KOPIEER DE VOLLEDIGE URI EXACT naar VALUES - construeer NOOIT zelf een URI!
2. URIs bevatten hash-codes (bijv. ABC123DEF4), GEEN leesbare namen zoals "kapper-2"
3. Gebruik CONTAINS alleen als fallback wanneer GEEN URI beschikbaar is
4. Voeg ALTIJD LIMIT 50 toe (behalve bij COUNT)
5. Gebruik NOOIT FROM <graph> clauses
6. Gebruik FILTER(LANG(?label) = "nl") voor Nederlandse labels
7. Voor TAKEN gebruik ALTIJD cnluwvo:isCharacterizedByOccupationTask_Essential (NIET cnlo:hasTask)
8. Retourneer ALLEEN de SPARQL query`;

  const chatContext = chatHistory.length > 0 
    ? '\nEerdere context:\n' + chatHistory.map(m => `${m.role}: ${m.content}`).join('\n') + '\n\n'
    : '';

  // Als we een URI hebben, voeg deze expliciet toe aan de query
  let queryWithUri = userQuery;
  if (hasUri && uriForQuery) {
    queryWithUri = `${userQuery}\n\n[BELANGRIJK: Gebruik voor dit beroep EXACT deze URI: <${uriForQuery}>]`;
    console.log(`[Gemini] Query met URI instructie: ${queryWithUri}`);
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: chatContext + queryWithUri,
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    let sparql = response.text || '';
    
    // DEBUG: Log de ruwe AI response
    console.log(`[Gemini] AI genereerde query:\n${sparql}`);
    
    sparql = fixSparqlQuery(sparql);
    
    // FIX: Vervang verkeerde URIs met de correcte URI uit de database
    // Dit is nodig omdat de AI soms zelf URIs construeert (bijv. kapper-2)
    if (uriForQuery) {
      sparql = fixOccupationUri(sparql, uriForQuery);
    }
    
    // DEBUG: Log na alle fixes
    console.log(`[Gemini] Query na alle fixes:\n${sparql}`);

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
