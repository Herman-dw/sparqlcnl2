/**
 * SPARQL Validator Service
 * ========================
 * Valideert SPARQL queries voordat ze uitgevoerd worden.
 * Controleert syntax, prefixes, en CompetentNL-specifieke regels.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixedQuery?: string;
}

// Bekende prefixes in CompetentNL
const KNOWN_PREFIXES: Record<string, string> = {
  'cnlo': 'https://linkeddata.competentnl.nl/def/competentnl#',
  'cnluwv': 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#',
  'skos': 'http://www.w3.org/2004/02/skos/core#',
  'skosxl': 'http://www.w3.org/2008/05/skos-xl#',
  'esco': 'http://data.europa.eu/esco/model#',
  'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
  'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'dct': 'http://purl.org/dc/terms/',
  'prov': 'http://www.w3.org/ns/prov#',
  'owl': 'http://www.w3.org/2002/07/owl#'
};

// Bekende predicates per klasse
const VALID_PREDICATES: Record<string, string[]> = {
  'cnlo:Occupation': [
    'skos:prefLabel', 'skos:definition', 'skos:notation',
    'skosxl:prefLabel', 'skosxl:altLabel',
    'cnlo:requiresHATEssential', 'cnlo:requiresHATImportant', 'cnlo:requiresHATSomewhat',
    'cnluwv:isCharacterizedByOccupationTask_Essential', 'cnluwv:isCharacterizedByOccupationTask_Optional',
    'cnluwv:hasContentStatus', 'cnluwv:specialization'
  ],
  'cnlo:HumanCapability': [
    'skos:prefLabel', 'skos:definition', 'skos:notation', 'skos:broader', 'skos:narrower',
    'cnlo:closeMatchESCO', 'cnlo:broadMatchESCO', 'cnlo:exactMatchESCO', 'cnlo:narrowMatchESCO',
    'cnlo:hasRIASEC', 'cnlo:closeMatchONET'
  ],
  'cnlo:KnowledgeArea': [
    'skos:prefLabel', 'skos:definition', 'skos:notation', 'skos:broader', 'skos:narrower',
    'skos:broadMatch'
  ],
  'cnlo:EducationalNorm': [
    'skos:prefLabel', 'skos:definition', 'skos:notation',
    'cnlo:prescribesHATEssential', 'cnlo:prescribesHATImportant', 'cnlo:prescribesHATSomewhat'
  ]
};

/**
 * Valideer een SPARQL query
 */
export const validateSparqlQuery = (query: string): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Null/undefined check
  if (!query || typeof query !== 'string') {
    return {
      valid: false,
      errors: ['Query is leeg of ongeldig'],
      warnings: []
    };
  }
  
  const upperQuery = query.toUpperCase();
  
  // 1. Check voor verboden FROM clauses
  if (/FROM\s+</.test(query)) {
    errors.push("FROM <graph> clauses zijn niet toegestaan bij de CompetentNL API");
  }
  
  // 2. Check voor INSERT/UPDATE/DELETE (alleen lezen toegestaan)
  if (/\b(INSERT|DELETE|UPDATE|DROP|CLEAR|CREATE)\b/i.test(query)) {
    errors.push("Alleen lees-queries (SELECT, ASK, DESCRIBE, CONSTRUCT) zijn toegestaan");
  }
  
  // 3. Check voor LIMIT bij SELECT queries
  if (upperQuery.includes('SELECT') && !upperQuery.includes('LIMIT')) {
    if (!upperQuery.includes('COUNT(') && !upperQuery.includes('COUNT (')) {
      warnings.push("SELECT queries zouden een LIMIT moeten hebben om performance te garanderen");
    }
  }
  
  // 4. Check voor WHERE clause bij SELECT
  if (upperQuery.includes('SELECT') && !upperQuery.includes('WHERE')) {
    errors.push("SELECT query mist een WHERE clause");
  }
  
  // 5. Check gebruikte prefixes
  const usedPrefixes = extractUsedPrefixes(query);
  const definedPrefixes = extractDefinedPrefixes(query);
  
  for (const prefix of usedPrefixes) {
    if (!definedPrefixes.includes(prefix) && !['a'].includes(prefix)) {
      if (KNOWN_PREFIXES[prefix]) {
        warnings.push(`Prefix '${prefix}' wordt gebruikt maar niet gedefinieerd. Voeg toe: PREFIX ${prefix}: <${KNOWN_PREFIXES[prefix]}>`);
      } else {
        errors.push(`Onbekende prefix '${prefix}' wordt gebruikt maar niet gedefinieerd`);
      }
    }
  }
  
  // 6. Check voor lege query
  if (!query.trim()) {
    errors.push("Query is leeg");
  }
  
  // 7. Check voor gebalanceerde haakjes
  const openBraces = (query.match(/{/g) || []).length;
  const closeBraces = (query.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Ongebalanceerde accolades: ${openBraces} { vs ${closeBraces} }`);
  }
  
  // 8. Check voor gebalanceerde quotes
  const doubleQuotes = (query.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) {
    errors.push("Ongebalanceerde aanhalingstekens");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Probeer een query automatisch te repareren
 */
export const fixSparqlQuery = (query: string | undefined | null): string => {
  // Null/undefined check
  if (!query || typeof query !== 'string') {
    console.error('[Validator] fixSparqlQuery received invalid input:', query);
    return '';
  }
  
  let fixed = query;
  
  // 1. Verwijder markdown code blocks
  fixed = fixed.replace(/```sparql\s*/gi, '');
  fixed = fixed.replace(/```\s*/g, '');
  
  // 2. Verwijder FROM clauses
  fixed = fixed.replace(/FROM\s+<[^>]+>\s*/gi, '');
  
  // 3. Voeg ontbrekende prefixes toe
  const usedPrefixes = extractUsedPrefixes(fixed);
  const definedPrefixes = extractDefinedPrefixes(fixed);
  
  const missingPrefixes: string[] = [];
  for (const prefix of usedPrefixes) {
    if (!definedPrefixes.includes(prefix) && KNOWN_PREFIXES[prefix]) {
      missingPrefixes.push(`PREFIX ${prefix}: <${KNOWN_PREFIXES[prefix]}>`);
    }
  }
  
  if (missingPrefixes.length > 0) {
    fixed = missingPrefixes.join('\n') + '\n' + fixed;
  }
  
  // 4. Voeg LIMIT toe indien nodig
  const upper = fixed.toUpperCase();
  if (upper.includes('SELECT') && !upper.includes('LIMIT') && 
      !upper.includes('COUNT(') && !upper.includes('COUNT (')) {
    fixed = fixed.trim() + '\nLIMIT 50';
  }
  
  // 5. Trim whitespace
  fixed = fixed.trim();
  
  return fixed;
};

/**
 * Extract prefixes die gebruikt worden in de query
 */
const extractUsedPrefixes = (query: string): string[] => {
  if (!query) return [];
  const matches = query.match(/\b(\w+):/g) || [];
  const prefixes = [...new Set(matches.map(m => m.replace(':', '')))];
  // Filter out things that look like URIs
  return prefixes.filter(p => !['http', 'https', 'urn'].includes(p));
};

/**
 * Extract prefixes die gedefinieerd zijn in de query
 */
const extractDefinedPrefixes = (query: string): string[] => {
  if (!query) return [];
  const matches = query.match(/PREFIX\s+(\w+)\s*:/gi) || [];
  return matches.map(m => m.replace(/PREFIX\s+/i, '').replace(/\s*:/, '').toLowerCase());
};

/**
 * Valideer en fix in één stap
 */
export const validateAndFix = (query: string | any): { query: string; validation: ValidationResult } => {
  // Handle case where query is an object (from new geminiService)
  let queryString = query;
  if (query && typeof query === 'object' && query.sparql) {
    queryString = query.sparql;
  }
  
  // Eerst fixen
  const fixedQuery = fixSparqlQuery(queryString);
  
  // Dan valideren
  const validation = validateSparqlQuery(fixedQuery);
  
  return {
    query: fixedQuery,
    validation
  };
};
