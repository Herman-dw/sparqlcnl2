/**
 * Concept Resolver Service - v2.0.0
 * ==================================
 * Generieke resolver voor alle CompetentNL concepttypes:
 * - Beroepen (Occupations)
 * - Opleidingen (EducationalNorms)
 * - Vaardigheden (HumanCapabilities)
 * - Kennisgebieden (KnowledgeAreas)
 * - Taken (Tasks)
 * - Werkomstandigheden (WorkingConditions)
 * 
 * Met automatische disambiguatie wanneer er meerdere matches zijn.
 */

// Concept types
export type ConceptType = 
  | 'occupation' 
  | 'education' 
  | 'capability' 
  | 'knowledge' 
  | 'task' 
  | 'workingCondition';

// Match resultaat
export interface ConceptMatch {
  uri: string;
  prefLabel: string;
  matchedLabel: string;
  matchType: 'exact' | 'synonym' | 'contains' | 'fuzzy';
  confidence: number;
  conceptType: ConceptType;
}

// Resolve resultaat
export interface ConceptResolveResult {
  found: boolean;
  exact: boolean;
  searchTerm: string;
  conceptType: ConceptType;
  matches: ConceptMatch[];
  needsDisambiguation: boolean;
  disambiguationQuestion?: string;
}

// Disambiguatie status voor een sessie
export interface DisambiguationState {
  pending: boolean;
  originalQuestion: string;
  searchTerm: string;
  conceptType: ConceptType;
  options: ConceptMatch[];
  resolvedConcepts: Map<string, ConceptMatch>; // term -> gekozen match
}

// Configuratie per concept type
interface ConceptConfig {
  table: string;
  labelColumn: string;
  prefLabelColumn: string;
  uriColumn: string;
  sparqlClass: string;
  dutchName: string;
  dutchNamePlural: string;
  disambiguationThreshold: number; // max matches voordat we doorvragen
  patterns: RegExp[]; // patterns om dit type te detecteren in vraag
}

export const CONCEPT_CONFIGS: Record<ConceptType, ConceptConfig> = {
  occupation: {
    table: 'occupation_labels',
    labelColumn: 'label',
    prefLabelColumn: 'pref_label',
    uriColumn: 'occupation_uri',
    sparqlClass: 'cnlo:Occupation',
    dutchName: 'beroep',
    dutchNamePlural: 'beroepen',
    disambiguationThreshold: 5,
    patterns: [
      /(?:beroep|functie|werk|job|vak)\s+(?:van\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
      /(?:als|voor|bij)\s+(?:een\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-]+?)(?:\s|$|\?)/i,
      /([a-zA-Zéëïöüáàâäèêîôûç\-]+)(?:er|eur|ist|ant|ent|aar|man|vrouw|meester|arts|kundige)(?:\s|$|\?)/i,
    ]
  },
  education: {
    table: 'education_labels',
    labelColumn: 'label',
    prefLabelColumn: 'pref_label',
    uriColumn: 'education_uri',
    sparqlClass: 'cnlo:EducationalNorm',
    dutchName: 'opleiding',
    dutchNamePlural: 'opleidingen',
    disambiguationThreshold: 5,
    patterns: [
      /(?:opleiding|studie|cursus|diploma|certificaat|kwalificatie)\s+(?:voor\s+|tot\s+|in\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
      /(?:mbo|hbo|wo|vmbo|bachelor|master)\s+([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ]
  },
  capability: {
    table: 'capability_labels',
    labelColumn: 'label',
    prefLabelColumn: 'pref_label',
    uriColumn: 'capability_uri',
    sparqlClass: 'cnlo:HumanCapability',
    dutchName: 'vaardigheid',
    dutchNamePlural: 'vaardigheden',
    disambiguationThreshold: 5,
    patterns: [
      /(?:vaardigheid|skill|competentie|kunnen)\s+(?:van\s+|voor\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
      /(?:kan|kunnen|kundig\s+in)\s+([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ]
  },
  knowledge: {
    table: 'knowledge_labels',
    labelColumn: 'label',
    prefLabelColumn: 'pref_label',
    uriColumn: 'knowledge_uri',
    sparqlClass: 'cnlo:KnowledgeArea',
    dutchName: 'kennisgebied',
    dutchNamePlural: 'kennisgebieden',
    disambiguationThreshold: 5,
    patterns: [
      /(?:kennis|kennisgebied|vakgebied|domein)\s+(?:van\s+|over\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
      /(?:weten\s+over|expertise\s+in)\s+([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ]
  },
  task: {
    table: 'task_labels',
    labelColumn: 'label',
    prefLabelColumn: 'pref_label',
    uriColumn: 'task_uri',
    sparqlClass: 'cnluwvo:Task',
    dutchName: 'taak',
    dutchNamePlural: 'taken',
    disambiguationThreshold: 5,
    patterns: [
      /(?:taak|taken|werkzaamheid|activiteit)\s+(?:van\s+|voor\s+)?([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ]
  },
  workingCondition: {
    table: 'workingcondition_labels',
    labelColumn: 'label',
    prefLabelColumn: 'pref_label',
    uriColumn: 'condition_uri',
    sparqlClass: 'cnluwvo:WorkingCondition',
    dutchName: 'werkomstandigheid',
    dutchNamePlural: 'werkomstandigheden',
    disambiguationThreshold: 5,
    patterns: [
      /(?:werkomstandigheid|arbeidsomstandigheid|werkplek|werkomgeving)\s+([a-zA-Zéëïöüáàâäèêîôûç\-\s]+)/i,
    ]
  }
};

/**
 * Genereer een disambiguatie vraag
 */
export const generateDisambiguationQuestion = (
  searchTerm: string,
  matches: ConceptMatch[],
  conceptType: ConceptType
): string => {
  const config = CONCEPT_CONFIGS[conceptType];
  const options = matches.slice(0, 10); // Max 10 opties tonen
  
  let question = `Ik vond meerdere ${config.dutchNamePlural} die overeenkomen met "${searchTerm}". Welke bedoel je?\n\n`;
  
  options.forEach((match, index) => {
    question += `${index + 1}. **${match.prefLabel}**`;
    if (match.matchedLabel !== match.prefLabel) {
      question += ` (gevonden via: ${match.matchedLabel})`;
    }
    question += '\n';
  });
  
  if (matches.length > 10) {
    question += `\n...en nog ${matches.length - 10} andere opties.`;
  }
  
  question += `\nTyp het nummer of de naam van je keuze, of verfijn je zoekopdracht.`;
  
  return question;
};

/**
 * Check of een antwoord een selectie is uit de disambiguatie opties
 */
export const parseDisambiguationAnswer = (
  answer: string,
  options: ConceptMatch[]
): ConceptMatch | null => {
  const trimmed = answer.trim();
  
  // Check of het een nummer is
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    return options[num - 1];
  }
  
  // Check of het een (deel van) de naam is
  const answerLower = trimmed.toLowerCase();
  for (const option of options) {
    if (option.prefLabel.toLowerCase() === answerLower ||
        option.prefLabel.toLowerCase().includes(answerLower) ||
        option.matchedLabel.toLowerCase() === answerLower) {
      return option;
    }
  }
  
  return null;
};

/**
 * Bepaal of disambiguatie nodig is
 */
export const needsDisambiguation = (
  matches: ConceptMatch[],
  conceptType: ConceptType
): boolean => {
  if (matches.length === 0) return false;
  if (matches.length === 1) return false;
  
  const config = CONCEPT_CONFIGS[conceptType];
  
  // Als er een exacte match is, geen disambiguatie nodig
  const hasExactMatch = matches.some(m => m.matchType === 'exact' && m.confidence >= 0.95);
  if (hasExactMatch) return false;
  
  // Als alle matches naar hetzelfde concept wijzen, geen disambiguatie nodig
  const uniqueUris = new Set(matches.map(m => m.uri));
  if (uniqueUris.size === 1) return false;
  
  // Als er meer dan threshold unieke concepten zijn, disambiguatie nodig
  return uniqueUris.size > 1 && matches.length > config.disambiguationThreshold;
};

/**
 * Normaliseer tekst voor matching
 */
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};
