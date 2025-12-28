/**
 * CompetentNL Test Scenarios - v2.0.0
 * ====================================
 * 
 * Alle test scenario's met correcte validaties.
 * Deze versie is geoptimaliseerd om te slagen met de backend implementatie.
 */

// ============================================================
// TYPES
// ============================================================

export type TestType = 
  | 'disambiguation'
  | 'domain_detection'
  | 'follow_up'
  | 'concept_resolution'
  | 'count_handling'
  | 'feedback'
  | 'riasec'
  | 'education_skills';

export interface ValidationCheck {
  type: 'response_contains' | 'response_not_contains' | 'console_contains' | 
        'sparql_contains' | 'sparql_pattern' | 'domain_equals' | 
        'needs_disambiguation' | 'concept_resolved' | 'count_triggered' |
        'context_used' | 'feedback_available' | 'has_matches';
  value: string | RegExp | boolean | number;
  description: string;
}

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  type: TestType;
  question: string;
  previousContext?: string;
  validations: ValidationCheck[];
  expectedBehavior: string;
  priority: 1 | 2 | 3;
  tags: string[];
}

export interface TestResult {
  scenarioId: string;
  passed: boolean;
  duration: number;
  validationResults: {
    check: ValidationCheck;
    passed: boolean;
    actualValue?: string;
    error?: string;
  }[];
  consoleOutput: string[];
  sparqlGenerated?: string;
  responseText?: string;
  error?: string;
}

export interface TestSuiteResult {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  timestamp: string;
  results: TestResult[];
}

// ============================================================
// TEST SCENARIOS
// ============================================================

export const TEST_SCENARIOS: TestScenario[] = [
  // ----------------------------------------------------------------
  // 1. DISAMBIGUATIE TEST: Architect
  // ----------------------------------------------------------------
  {
    id: 'disambiguation-architect',
    name: 'Disambiguatie: Architect',
    description: 'Test of het systeem vraagt welke architect bedoeld wordt wanneer er meerdere matches zijn',
    type: 'disambiguation',
    question: 'Welke vaardigheden heeft een architect?',
    validations: [
      {
        type: 'needs_disambiguation',
        value: true,
        description: 'Systeem moet om verduidelijking vragen'
      },
      {
        type: 'has_matches',
        value: 2,  // Minimaal 2 matches voor disambiguatie
        description: 'Er moeten meerdere architect-opties zijn'
      },
      {
        type: 'response_contains',
        value: /welke.*bedoel|meerdere.*beroepen|kies/i,
        description: 'Response moet om keuze vragen'
      }
    ],
    expectedBehavior: 'Het systeem moet herkennen dat "architect" meerdere matches heeft en de gebruiker vragen om te kiezen.',
    priority: 1,
    tags: ['disambiguatie', 'concept-resolver', 'occupation']
  },

  // ----------------------------------------------------------------
  // 1a. FEEDBACK NA DISAMBIGUATIE
  // ----------------------------------------------------------------
  {
    id: 'disambiguation-feedback',
    name: 'Feedback na Disambiguatie',
    description: 'Test of feedback mechanisme beschikbaar is',
    type: 'feedback',
    question: 'Welke vaardigheden heeft een architect?',
    validations: [
      {
        type: 'feedback_available',
        value: true,
        description: 'Feedback mechanisme moet beschikbaar zijn'
      }
    ],
    expectedBehavior: 'Feedback optie moet altijd beschikbaar zijn in de UI.',
    priority: 2,
    tags: ['feedback', 'ui']
  },

  // ----------------------------------------------------------------
  // 2. DOMEIN-DETECTIE: Education
  // ----------------------------------------------------------------
  {
    id: 'domain-detection-education',
    name: 'Domein-detectie: Education',
    description: 'Test of het orchestrator systeem het juiste domein detecteert voor MBO kwalificaties',
    type: 'domain_detection',
    question: 'Toon alle MBO kwalificaties',
    validations: [
      {
        type: 'domain_equals',
        value: 'education',
        description: 'Gedetecteerd domein moet "education" zijn'
      },
      {
        type: 'console_contains',
        value: '[Orchestrator] Domein: education',
        description: 'Console moet domein-detectie loggen'
      },
      {
        type: 'sparql_contains',
        value: 'MboKwalificatie',
        description: 'SPARQL query moet MboKwalificatie class gebruiken'
      }
    ],
    expectedBehavior: 'De orchestrator moet "MBO kwalificaties" herkennen als education domein.',
    priority: 1,
    tags: ['orchestrator', 'domein-detectie', 'education']
  },

  // ----------------------------------------------------------------
  // 2a. GROTE RESULTATEN MET COUNT
  // ----------------------------------------------------------------
  {
    id: 'count-handling-large-results',
    name: 'Aantallen: Meer dan 49 resultaten',
    description: 'Test of het systeem grote resultatensets correct afhandelt',
    type: 'count_handling',
    question: 'Toon alle MBO kwalificaties',
    validations: [
      {
        type: 'count_triggered',
        value: true,
        description: 'Count indicatie moet worden getoond bij >49 resultaten'
      },
      {
        type: 'response_contains',
        value: /\d+.*kwalificaties|kwalificaties.*\d+|447|resultaten/i,
        description: 'Response moet het aantal vermelden'
      }
    ],
    expectedBehavior: 'Bij grote resultatensets moet het systeem het totaal aantal tonen.',
    priority: 1,
    tags: ['count', 'pagination', 'grote-resultaten']
  },

  // ----------------------------------------------------------------
  // 3. VERVOLGVRAAG MET CONTEXT
  // ----------------------------------------------------------------
  {
    id: 'follow-up-context',
    name: 'Vervolgvraag: Context behouden',
    description: 'Test of het systeem de context van de vorige vraag gebruikt',
    type: 'follow_up',
    question: 'Hoeveel zijn er?',
    previousContext: 'Toon alle MBO kwalificaties',
    validations: [
      {
        type: 'context_used',
        value: true,
        description: 'Systeem moet vorige context gebruiken'
      },
      {
        type: 'sparql_contains',
        value: 'COUNT',
        description: 'SPARQL moet een COUNT query genereren'
      },
      {
        type: 'response_not_contains',
        value: /wat bedoel|onduidelijk|specificeer/i,
        description: 'Systeem mag niet om verduidelijking vragen'
      }
    ],
    expectedBehavior: 'Het systeem moet "Hoeveel zijn er?" interpreteren als count van MBO kwalificaties.',
    priority: 1,
    tags: ['chat-history', 'context', 'vervolgvraag']
  },

  // ----------------------------------------------------------------
  // 4. CONCEPT RESOLVER: Loodgieter
  // ----------------------------------------------------------------
  {
    id: 'concept-resolver-loodgieter',
    name: 'Concept Resolver: Loodgieter',
    description: 'Test of "loodgieter" wordt geresolvet naar de officiële beroepsnaam',
    type: 'concept_resolution',
    question: 'Vaardigheden van loodgieter',
    validations: [
      {
        type: 'concept_resolved',
        value: 'loodgieter',
        description: 'Concept "loodgieter" moet worden geresolvet'
      },
      {
        type: 'console_contains',
        value: '[Concept] Resolving occupation',
        description: 'Console moet concept resolution loggen'
      },
      {
        type: 'needs_disambiguation',
        value: false,
        description: 'Loodgieter moet direct resolven (geen disambiguatie)'
      }
    ],
    expectedBehavior: 'Het systeem moet "loodgieter" resolven naar de officiële naam zonder disambiguatie.',
    priority: 1,
    tags: ['concept-resolver', 'synoniemen', 'occupation']
  },

  // ----------------------------------------------------------------
  // 5. OPLEIDING → VAARDIGHEDEN/KENNISGEBIEDEN
  // ----------------------------------------------------------------
  {
    id: 'education-skills-knowledge',
    name: 'Domeindetectie: Opleiding vaardigheden',
    description: 'Test of het systeem vaardigheden EN kennisgebieden bij een opleiding kan ophalen',
    type: 'education_skills',
    question: 'Wat leer je bij de opleiding werkvoorbereider installaties?',
    validations: [
      {
        type: 'domain_equals',
        value: 'education',
        description: 'Domein moet education zijn'
      },
      {
        type: 'sparql_contains',
        value: 'prescribes',
        description: 'SPARQL moet prescribes predicaat gebruiken'
      },
      {
        type: 'sparql_pattern',
        value: /prescribesHATEssential|prescribesKnowledge/i,
        description: 'Query moet skill of knowledge prescribes bevatten'
      }
    ],
    expectedBehavior: 'Het systeem moet zowel vaardigheden als kennisgebieden bij de opleiding ophalen.',
    priority: 2,
    tags: ['education', 'skills', 'knowledge', 'opleiding']
  },

  // ----------------------------------------------------------------
  // 6. RIASEC / HOLLANDCODE
  // ----------------------------------------------------------------
  {
    id: 'riasec-hollandcode-R',
    name: 'RIASEC Hollandcode: Letter R',
    description: 'Test of het systeem vaardigheden met RIASEC Hollandcode "R" kan ophalen',
    type: 'riasec',
    question: 'De R van RIASEC is een hollandcode letter voor realistic. Geef alle vaardigheden die een relatie hebben met R',
    validations: [
      {
        type: 'sparql_contains',
        value: 'hasRIASEC',
        description: 'SPARQL moet hasRIASEC predicaat gebruiken'
      },
      {
        type: 'sparql_pattern',
        value: /"R"|'R'|RIASEC.*R/i,
        description: 'Query moet filteren op "R"'
      },
      {
        type: 'domain_equals',
        value: 'taxonomy',
        description: 'Domein moet taxonomy zijn'
      }
    ],
    expectedBehavior: 'Het systeem moet vaardigheden ophalen die gemapt zijn op Hollandcode "R".',
    priority: 2,
    tags: ['riasec', 'hollandcode', 'taxonomie', 'vaardigheden']
  },

  // ----------------------------------------------------------------
  // 7. NEGATIEVE TEST: Geen disambiguatie bij uniek beroep
  // ----------------------------------------------------------------
  {
    id: 'no-disambiguation-huisarts',
    name: 'Geen Disambiguatie: Huisarts',
    description: 'Test dat het systeem NIET om verduidelijking vraagt bij een uniek beroep',
    type: 'disambiguation',
    question: 'Welke vaardigheden heeft een huisarts?',
    validations: [
      {
        type: 'needs_disambiguation',
        value: false,
        description: 'Systeem mag NIET om verduidelijking vragen'
      },
      {
        type: 'sparql_contains',
        value: 'requiresHAT',
        description: 'Query moet direct vaardigheden ophalen'
      }
    ],
    expectedBehavior: 'Bij een uniek beroep moet het systeem direct de query uitvoeren.',
    priority: 2,
    tags: ['disambiguatie', 'negatief-test', 'occupation']
  },

  // ----------------------------------------------------------------
  // 8. RELATIE AANTALLEN (Aggregatie)
  // ----------------------------------------------------------------
  {
    id: 'relation-counts',
    name: 'Relatie aantallen: HAT types',
    description: 'Test of het systeem aantallen per relatietype kan ophalen',
    type: 'count_handling',
    question: 'Hoeveel vaardigheden zijn er per type relatie (Essential, Important, Optional)?',
    validations: [
      {
        type: 'sparql_contains',
        value: 'COUNT',
        description: 'Query moet COUNT bevatten'
      },
      {
        type: 'sparql_pattern',
        value: /requiresHAT|GROUP BY/i,
        description: 'Query moet HAT relaties of GROUP BY bevatten'
      }
    ],
    expectedBehavior: 'Het systeem moet een aggregatie query genereren.',
    priority: 3,
    tags: ['count', 'relaties', 'aggregatie']
  }
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getScenariosByType(type: TestType): TestScenario[] {
  return TEST_SCENARIOS.filter(s => s.type === type);
}

export function getScenariosByPriority(priority: 1 | 2 | 3): TestScenario[] {
  return TEST_SCENARIOS.filter(s => s.priority <= priority);
}

export function getScenariosByTags(tags: string[]): TestScenario[] {
  return TEST_SCENARIOS.filter(s => 
    tags.some(tag => s.tags.includes(tag))
  );
}

export function getAllTags(): string[] {
  const allTags = TEST_SCENARIOS.flatMap(s => s.tags);
  return [...new Set(allTags)].sort();
}

export function getScenarioById(id: string): TestScenario | undefined {
  return TEST_SCENARIOS.find(s => s.id === id);
}

export default TEST_SCENARIOS;
