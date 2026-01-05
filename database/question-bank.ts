export type QuestionCategory =
  | 'occupation'
  | 'capability'
  | 'knowledge'
  | 'education'
  | 'task'
  | 'comparison'
  | 'count'
  | 'general';

export interface QuestionEntry {
  question: string;
  sparql: string;
  category: QuestionCategory;
}

const PREFIXES = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX esco: <http://data.europa.eu/esco/model#>
PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
`;

const escapeTerm = (term: string) => term.toLowerCase().replace(/"/g, '\\"');

const featuredExampleQuestions: QuestionEntry[] = [
  {
    question: 'Welke vaardigheden hebben RIASEC code R?',
    sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skillLabel WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC "R" ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?skillLabel
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Toon alle 137 vaardigheden in de taxonomie',
    sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 150`,
    category: 'capability'
  },
  {
    question: 'Hoeveel vaardigheden zijn er per RIASEC letter?',
    sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT ?riasec (COUNT(DISTINCT ?skill) AS ?aantal) WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC ?riasecValue .
  BIND(STR(?riasecValue) AS ?riasecRaw)
  BIND(
    UCASE(
      IF(
        isIRI(?riasecValue),
        REPLACE(?riasecRaw, "^.*([RIASEC])[^RIASEC]*$", "$1"),
        SUBSTR(?riasecRaw, 1, 1)
      )
    ) AS ?riasec
  )
  FILTER(?riasec IN ("R","I","A","S","E","C"))
}
GROUP BY ?riasec
ORDER BY ?riasec
LIMIT 10`,
    category: 'count'
  },
  {
    question: 'Wat zijn de taken van een kapper?',
    sparql: `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taskType ?taskLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "kapper"))
  {
    ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
    BIND("Essentieel" AS ?taskType)
  }
  UNION {
    ?occupation cnluwvo:isCharacterizedByOccupationTask_Optional ?task .
    BIND("Optioneel" AS ?taskType)
  }
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
ORDER BY ?taskType ?taskLabel
LIMIT 50`,
    category: 'task'
  },
  {
    question: 'Wat zijn de werkomstandigheden van een piloot?',
    sparql: `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?conditionLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnluwvo:hasWorkCondition ?condition .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "piloot"))
  ?condition skos:prefLabel ?conditionLabel .
  FILTER(LANG(?conditionLabel) = "nl")
}
ORDER BY ?conditionLabel
LIMIT 50`,
    category: 'occupation'
  },
  {
    question: 'Op welke manier komt het beroep docent mbo overeen met teamleider jeugdzorg?',
    sparql: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?sharedSkillLabel WHERE {
  ?docent a cnlo:Occupation ;
          skos:prefLabel ?docentLabel .
  FILTER(LANG(?docentLabel) = "nl")
  FILTER(CONTAINS(LCASE(?docentLabel), "docent mbo"))

  ?teamleider a cnlo:Occupation ;
              skos:prefLabel ?teamleiderLabel .
  FILTER(LANG(?teamleiderLabel) = "nl")
  FILTER(CONTAINS(LCASE(?teamleiderLabel), "teamleider jeugdzorg"))

  VALUES ?predicate { cnlo:requiresHATEssential cnlo:requiresHATImportant }
  ?docent ?predicate ?skill .
  ?teamleider ?predicate ?skill .
  ?skill skos:prefLabel ?sharedSkillLabel .
  FILTER(LANG(?sharedSkillLabel) = "nl")
}
ORDER BY ?sharedSkillLabel
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Wat zijn de taken en vaardigheden van een tandartsassistent?',
    sparql: `PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?type ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "tandartsassistent"))
  {
    VALUES ?taskPred { cnluwvo:isCharacterizedByOccupationTask_Essential cnluwvo:isCharacterizedByOccupationTask_Optional }
    ?occupation ?taskPred ?item .
    ?item skos:prefLabel ?label .
    BIND("Taak" AS ?type)
  }
  UNION {
    VALUES ?skillPred { cnlo:requiresHATEssential cnlo:requiresHATImportant }
    ?occupation ?skillPred ?item .
    ?item skos:prefLabel ?label .
    BIND("Vaardigheid" AS ?type)
  }
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?type ?label
LIMIT 100`,
    category: 'task'
  }
];

const buildOccupationSkillQuestion = (term: string): QuestionEntry => ({
  question: `Welke vaardigheden zijn essentieel of belangrijk voor een ${term}?`,
  sparql: `${PREFIXES}
SELECT DISTINCT ?occupation ?occLabel ?importance ?skill ?skillLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "${escapeTerm(term)}"))
  {
    ?occupation cnlo:requiresHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?occupation cnlo:requiresHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
  category: 'capability'
});

const buildOccupationTaskQuestion = (term: string): QuestionEntry => ({
  question: `Welke taken zijn essentieel of optioneel voor een ${term}?`,
  sparql: `${PREFIXES}
SELECT DISTINCT ?occupation ?occLabel ?taskType ?task ?taskLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "${escapeTerm(term)}"))
  {
    ?occupation cnluwv:isCharacterizedByOccupationTask_Essential ?task .
    BIND("Essentieel" AS ?taskType)
  }
  UNION
  {
    ?occupation cnluwv:isCharacterizedByOccupationTask_Optional ?task .
    BIND("Optioneel" AS ?taskType)
  }
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(LANG(?taskLabel) = "nl")
}
LIMIT 50`,
  category: 'task'
});

const buildWorkConditionQuestion = (term: string): QuestionEntry => ({
  question: `Welke werkomstandigheden horen bij beroepen in de ${term}?`,
  sparql: `${PREFIXES}
SELECT DISTINCT ?occupation ?occLabel ?condition ?conditionLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnluwvo:hasWorkCondition ?condition .
  ?condition skos:prefLabel ?conditionLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "${escapeTerm(term)}"))
  FILTER(LANG(?occLabel) = "nl")
  FILTER(LANG(?conditionLabel) = "nl")
}
LIMIT 50`,
  category: 'occupation'
});

const buildOccupationSearchQuestion = (term: string): QuestionEntry => ({
  question: `Toon beroepen met ${term} in de naam.`,
  sparql: `${PREFIXES}
SELECT DISTINCT ?occupation ?occLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "${escapeTerm(term)}"))
  FILTER(LANG(?occLabel) = "nl")
}
LIMIT 50`,
  category: 'occupation'
});

const buildSkillToOccupationQuestion = (skillTerm: string): QuestionEntry => ({
  question: `Welke beroepen vragen om ${skillTerm} als vaardigheid?`,
  sparql: `${PREFIXES}
SELECT DISTINCT ?occupation ?occLabel ?skill ?skillLabel ?importance
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "${escapeTerm(skillTerm)}"))
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  {
    ?occupation cnlo:requiresHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?occupation cnlo:requiresHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  FILTER(LANG(?occLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
  category: 'capability'
});

const occupationSkillTerms = [
  'verpleegkundige',
  'software ontwikkelaar',
  'data analist',
  'elektricien',
  'timmerman',
  'kapper',
  'accountant',
  'projectmanager',
  'monteur',
  'loodgieter',
  'kok',
  'bakker',
  'docent',
  'marketing specialist',
  'chauffeur',
  'jurist',
  'fysiotherapeut',
  'apothekersassistent',
  'tandarts',
  'laborant',
  'operator',
  'toezichthouder',
  'veiligheidskundige',
  'psycholoog',
  'architect'
];

const occupationTaskTerms = [
  'verpleegkundige',
  'brandweerman',
  'onderwijsassistent',
  'kapper',
  'timmerman',
  'kok',
  'koerier',
  'operator',
  'loodgieter',
  'projectmanager',
  'accountmanager',
  'laborant',
  'monteur',
  'data analist',
  'politieagent'
];

const workConditionTerms = [
  'bouw',
  'zorg',
  'kantoor',
  'laboratorium',
  'logistiek',
  'horeca',
  'chemie',
  'buiten',
  'maritiem',
  'onderwijs'
];

const occupationSearchThemes = [
  'duurzaam',
  'cyber',
  'zorg',
  'techniek',
  'logistiek',
  'veiligheid',
  'financieel',
  'creatief',
  'groen',
  'management'
];

const skillToOccupationTerms = [
  'leidinggeven',
  'analyseren',
  'plannen',
  'communicatie',
  'sales',
  'klantgericht',
  'creativiteit',
  'probleemoplossend',
  'stressbestendig',
  'nauwkeurig',
  'praktisch inzicht',
  'veiligheid',
  'programmeren',
  'data',
  'beheer',
  'budgetteren',
  'training',
  'advies',
  'onderzoek',
  'kwaliteit'
];

const occupationSkillQuestions = occupationSkillTerms.map(
  buildOccupationSkillQuestion
);
const occupationTaskQuestions = occupationTaskTerms.map(
  buildOccupationTaskQuestion
);
const workConditionQuestions = workConditionTerms.map(
  buildWorkConditionQuestion
);
const occupationSearchQuestions = occupationSearchThemes.map(
  buildOccupationSearchQuestion
);
const skillToOccupationQuestions = skillToOccupationTerms.map(
  buildSkillToOccupationQuestion
);

const skillMetaQuestions: QuestionEntry[] = [
  {
    question: 'Welke vaardigheden hebben RIASEC code S?',
    sparql: `${PREFIXES}
SELECT ?skill ?skillLabel ?notation ?riasec
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel ;
         skos:notation ?notation ;
         cnlo:hasRIASEC ?riasec .
  FILTER(CONTAINS(LCASE(STR(?riasec)), "s"))
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden vallen onder RIASEC code R?',
    sparql: `${PREFIXES}
SELECT ?skill ?skillLabel ?notation ?riasec
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel ;
         skos:notation ?notation ;
         cnlo:hasRIASEC ?riasec .
  FILTER(CONTAINS(LCASE(STR(?riasec)), "r"))
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden hebben een ESCO match?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?matchType ?escoSkill
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  VALUES ?matchType { cnlo:closeMatchESCO cnlo:broadMatchESCO cnlo:exactMatchESCO cnlo:narrowMatchESCO }
  ?skill ?matchType ?escoSkill .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden hebben een O*NET koppeling?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?onetCode
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel ;
         cnlo:closeMatchONET ?onetCode .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke subvaardigheden horen bij communiceren?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?child ?childLabel ?parent
WHERE {
  ?parent a cnlo:HumanCapability ;
          skos:prefLabel ?parentLabel .
  FILTER(CONTAINS(LCASE(?parentLabel), "communic"))
  ?child skos:broader ?parent ;
         skos:prefLabel ?childLabel .
  FILTER(LANG(?childLabel) = "nl")
}
ORDER BY ?childLabel
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden hebben een notatie die start met 100?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?notation
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel ;
         skos:notation ?notation .
  FILTER(STRSTARTS(STR(?notation), "100"))
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden hebben altLabels?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?alt
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel ;
         skos:altLabel ?alt .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden hebben een definitie met veiligheid?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?definition
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel ;
         skos:definition ?definition .
  FILTER(CONTAINS(LCASE(?definition), "veilig"))
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden worden vaak als essentieel en belangrijk tegelijk gekoppeld?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel (COUNT(DISTINCT ?occ) AS ?occurrences)
WHERE {
  ?occ a cnlo:Occupation ;
       cnlo:requiresHATEssential ?skill ;
       cnlo:requiresHATImportant ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
GROUP BY ?skill ?skillLabel
ORDER BY DESC(?occurrences)
LIMIT 50`,
    category: 'capability'
  },
  {
    question: 'Welke vaardigheden zijn gekoppeld aan meerdere beroepen in de zorg?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel (COUNT(DISTINCT ?occupation) AS ?occCount)
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occLabel), "zorg") || CONTAINS(LCASE(?occLabel), "verpleeg"))
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
GROUP BY ?skill ?skillLabel
ORDER BY DESC(?occCount)
LIMIT 50`,
    category: 'capability'
  }
];

const knowledgeAreaQuestions: QuestionEntry[] = [
  {
    question: 'Toon alle kennisgebieden met notatie.',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?notation
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:notation ?notation }
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden gaan over bouw?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?notation
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:notation ?notation }
  FILTER(CONTAINS(LCASE(?label), "bouw"))
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden horen bij zorg?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?notation
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:notation ?notation }
  FILTER(CONTAINS(LCASE(?label), "zorg"))
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben een ISCED koppeling?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?isced
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:broadMatch ?isced . FILTER(CONTAINS(STR(?isced), "isced")) }
  FILTER(LANG(?label) = "nl")
}
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben een bredere relatie?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?broader ?broaderLabel
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label ;
        skos:broader ?broader .
  ?broader skos:prefLabel ?broaderLabel .
  FILTER(LANG(?label) = "nl")
  FILTER(LANG(?broaderLabel) = "nl")
}
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben onderliggende subgebieden?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?narrower ?narrowerLabel
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label ;
        skos:narrower ?narrower .
  ?narrower skos:prefLabel ?narrowerLabel .
  FILTER(LANG(?label) = "nl")
  FILTER(LANG(?narrowerLabel) = "nl")
}
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben notatie die start met 200.01?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?notation
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label ;
        skos:notation ?notation .
  FILTER(STRSTARTS(STR(?notation), "200.01"))
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben een definitie beschikbaar?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?definition
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label ;
        skos:definition ?definition .
  FILTER(LANG(?label) = "nl")
}
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden bevatten het woord energie?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?notation
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:notation ?notation }
  FILTER(CONTAINS(LCASE(?label), "energie"))
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?notation
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben meerdere bredere begrippen?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label (COUNT(DISTINCT ?broader) AS ?broaderCount)
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label ;
        skos:broader ?broader .
  FILTER(LANG(?label) = "nl")
}
GROUP BY ?area ?label
HAVING(COUNT(DISTINCT ?broader) > 1)
ORDER BY DESC(?broaderCount)
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben een altLabel?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?alt
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label ;
        skos:altLabel ?alt .
  FILTER(LANG(?label) = "nl")
}
LIMIT 50`,
    category: 'knowledge'
  },
  {
    question: 'Welke kennisgebieden hebben een brede match naar externe schema’s?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?area ?label ?match
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label ;
        skos:broadMatch ?match .
  FILTER(LANG(?label) = "nl")
}
LIMIT 50`,
    category: 'knowledge'
  }
];

const educationSearchQuestions: QuestionEntry[] = [
  {
    question: 'Welke opleidingsnormen gaan over verpleegkunde?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "verpleeg"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen gaan over techniek?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "techniek"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen horen bij zorg en welzijn?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "zorg") || CONTAINS(LCASE(?eduLabel), "welzijn"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen richten zich op logistiek?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "logist"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen gaan over bouw of infra?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "bouw") || CONTAINS(LCASE(?eduLabel), "infra"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen gaan over financieel beheer?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "financ") || CONTAINS(LCASE(?eduLabel), "boekhoud"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen gaan over hospitality?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "horeca") || CONTAINS(LCASE(?eduLabel), "gastvrij"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen richten zich op ICT of software?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "ict") || CONTAINS(LCASE(?eduLabel), "software"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen hebben notaties beschikbaar?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?notation
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel ;
             skos:notation ?notation .
}
ORDER BY ?notation
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke MBO kwalificaties horen bij zorg?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?kwalificatie ?label
WHERE {
  ?kwalificatie a ksmo:MboKwalificatie ;
                skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "zorg"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke MBO kwalificaties horen bij techniek?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?kwalificatie ?label
WHERE {
  ?kwalificatie a ksmo:MboKwalificatie ;
                skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "techniek"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke MBO keuzedelen hebben metaal of bouw in de titel?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?keuzedeel ?label
WHERE {
  ?keuzedeel a ksmo:MboKeuzedeel ;
             skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "metaal") || CONTAINS(LCASE(?label), "bouw"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke MBO keuzedelen gaan over zorg of welzijn?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?keuzedeel ?label
WHERE {
  ?keuzedeel a ksmo:MboKeuzedeel ;
             skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "zorg") || CONTAINS(LCASE(?label), "welzijn"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen gaan over data of analyse?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "data") || CONTAINS(LCASE(?eduLabel), "analyse"))
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingsnormen gaan over veiligheid of toezicht?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "veilig") || CONTAINS(LCASE(?eduLabel), "toezicht"))
}
LIMIT 50`,
    category: 'education'
  }
];

const educationSkillQuestions: QuestionEntry[] = [
  {
    question: 'Welke vaardigheden schrijft de opleiding verpleegkunde voor?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "verpleeg"))
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke vaardigheden leren ICT opleidingsnormen aan?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "ict") || CONTAINS(LCASE(?eduLabel), "software"))
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke vaardigheden horen bij logistieke opleidingen?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "logist"))
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingen schrijven communicatievaardigheden voor?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "communic"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingen leren leidinggeven?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "leiding"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingen leren omgaan met veiligheid?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "veilig"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingen hebben essentiële vaardigheden rond klantgerichtheid?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?skill ?skillLabel
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "klant"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel ;
             cnlo:prescribesHATEssential ?skill .
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingen hebben belangrijke vaardigheden rond planning?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?skill ?skillLabel
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "planning") || CONTAINS(LCASE(?skillLabel), "plannen"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel ;
             cnlo:prescribesHATImportant ?skill .
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingen schrijven digitale vaardigheden voor?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "digitaal") || CONTAINS(LCASE(?skillLabel), "ict"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  },
  {
    question: 'Welke opleidingen leren projectmatig werken?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?importance ?skill ?skillLabel
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?skillLabel), "project"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  {
    ?education cnlo:prescribesHATEssential ?skill .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?education cnlo:prescribesHATImportant ?skill .
    BIND("Belangrijk" AS ?importance)
  }
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'education'
  }
];

const comparisonQuestions: QuestionEntry[] = [
  {
    question:
      'Welke vaardigheden delen kapper en schoonheidsspecialist als essentieel?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?occ1Label ?occ2Label
WHERE {
  ?occ1 a cnlo:Occupation ;
        skos:prefLabel ?occ1Label ;
        cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occ1Label), "kapper"))
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?occ2Label ;
        cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occ2Label), "schoonheidsspecialist"))
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke taken delen verpleegkundige en verzorgende?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?task ?taskLabel ?occ1Label ?occ2Label
WHERE {
  ?occ1 a cnlo:Occupation ;
        skos:prefLabel ?occ1Label ;
        cnluwv:isCharacterizedByOccupationTask_Essential ?task .
  FILTER(CONTAINS(LCASE(?occ1Label), "verpleeg"))
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?occ2Label ;
        cnluwv:isCharacterizedByOccupationTask_Essential ?task .
  FILTER(CONTAINS(LCASE(?occ2Label), "verzorg"))
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke vaardigheden zijn uniek voor data analisten vergeleken met data engineers?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel
WHERE {
  ?engineer a cnlo:Occupation ;
            skos:prefLabel ?engineerLabel ;
            cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?engineerLabel), "data engineer"))
  FILTER NOT EXISTS {
    ?analyst a cnlo:Occupation ;
             skos:prefLabel ?analystLabel ;
             cnlo:requiresHATEssential ?skill .
    FILTER(CONTAINS(LCASE(?analystLabel), "data analist"))
  }
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question:
      'Welke vaardigheden komen overeen tussen softwareontwikkelaars en systeembeheerders?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?importance
WHERE {
  {
    ?occ1 a cnlo:Occupation ;
          skos:prefLabel ?label1 ;
          cnlo:requiresHATEssential ?skill .
    FILTER(CONTAINS(LCASE(?label1), "software"))
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?occ1 a cnlo:Occupation ;
          skos:prefLabel ?label1 ;
          cnlo:requiresHATImportant ?skill .
    FILTER(CONTAINS(LCASE(?label1), "software"))
    BIND("Belangrijk" AS ?importance)
  }
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?label2 .
  FILTER(CONTAINS(LCASE(?label2), "systeembeheer"))
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke opleidingen overlappen met de vaardigheden van verpleegkundigen?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?education ?eduLabel ?skill ?skillLabel
WHERE {
  ?occ a cnlo:Occupation ;
       skos:prefLabel ?occLabel ;
       cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occLabel), "verpleeg"))
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel ;
             cnlo:prescribesHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?eduLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question:
      'Welke beroepen delen essentiële vaardigheden met elektrotechniek opleidingen?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?occupation ?occLabel ?skill ?skillLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel ;
             cnlo:prescribesHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?eduLabel), "elektro"))
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke taken zijn optioneel bij de ene maar essentieel bij de andere functie?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?task ?taskLabel ?essentialOcc ?optionalOcc
WHERE {
  ?essentialOcc a cnlo:Occupation ;
                skos:prefLabel ?essentialLabel ;
                cnluwv:isCharacterizedByOccupationTask_Essential ?task .
  ?optionalOcc a cnlo:Occupation ;
               skos:prefLabel ?optionalLabel ;
               cnluwv:isCharacterizedByOccupationTask_Optional ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke vaardigheden verschillen tussen timmerman en metselaar?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel
WHERE {
  ?timmerman a cnlo:Occupation ;
             skos:prefLabel ?timmerLabel ;
             cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?timmerLabel), "timmerman"))
  FILTER NOT EXISTS {
    ?metselaar a cnlo:Occupation ;
               skos:prefLabel ?metselLabel ;
               cnlo:requiresHATEssential ?skill .
    FILTER(CONTAINS(LCASE(?metselLabel), "metselaar"))
  }
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke vaardigheden delen verpleegkundige en fysiotherapeut?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel ?importance
WHERE {
  {
    ?occ1 a cnlo:Occupation ;
          skos:prefLabel ?occ1Label ;
          cnlo:requiresHATEssential ?skill .
    FILTER(CONTAINS(LCASE(?occ1Label), "verpleeg"))
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?occ1 a cnlo:Occupation ;
          skos:prefLabel ?occ1Label ;
          cnlo:requiresHATImportant ?skill .
    FILTER(CONTAINS(LCASE(?occ1Label), "verpleeg"))
    BIND("Belangrijk" AS ?importance)
  }
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?occ2Label .
  FILTER(CONTAINS(LCASE(?occ2Label), "fysio"))
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke skills delen data analisten en business analisten?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel
WHERE {
  ?occ1 a cnlo:Occupation ;
        skos:prefLabel ?occ1Label ;
        cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occ1Label), "data analist"))
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?occ2Label ;
        cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occ2Label), "business analist"))
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question: 'Welke vaardigheden zijn gemeenschappelijk voor kok en bakker?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel
WHERE {
  ?occ1 a cnlo:Occupation ;
        skos:prefLabel ?occ1Label ;
        cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occ1Label), "kok"))
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?occ2Label ;
        cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?occ2Label), "bakker"))
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  },
  {
    question:
      'Welke vaardigheden hebben beroepen in cyberbeveiliging gemeen met forensisch onderzoek?',
    sparql: `${PREFIXES}
SELECT DISTINCT ?skill ?skillLabel
WHERE {
  ?cyber a cnlo:Occupation ;
         skos:prefLabel ?cyberLabel ;
         cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?cyberLabel), "cyber") || CONTAINS(LCASE(?cyberLabel), "security"))
  ?forensic a cnlo:Occupation ;
            skos:prefLabel ?forensicLabel ;
            cnlo:requiresHATEssential ?skill .
  FILTER(CONTAINS(LCASE(?forensicLabel), "forens"))
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 50`,
    category: 'comparison'
  }
];

const countQuestions: QuestionEntry[] = [
  {
    question: 'Hoeveel beroepen zijn er in totaal?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?occupation) AS ?aantal)
WHERE {
  ?occupation a cnlo:Occupation .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel vaardigheden zijn er in de knowledge graph?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?skill) AS ?aantal)
WHERE {
  ?skill a cnlo:HumanCapability .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel kennisgebieden zijn er?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?area) AS ?aantal)
WHERE {
  ?area a cnlo:KnowledgeArea .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel opleidingsnormen zijn er?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?education) AS ?aantal)
WHERE {
  ?education a cnlo:EducationalNorm .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel taken zijn er gekoppeld als essentieel?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?task) AS ?aantal)
WHERE {
  ?occupation a cnlo:Occupation ;
              cnluwv:isCharacterizedByOccupationTask_Essential ?task .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel taken zijn er gekoppeld als optioneel?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?task) AS ?aantal)
WHERE {
  ?occupation a cnlo:Occupation ;
              cnluwv:isCharacterizedByOccupationTask_Optional ?task .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel vaardigheden hebben een ESCO match?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?skill) AS ?aantal)
WHERE {
  ?skill a cnlo:HumanCapability .
  ?skill ?matchType ?escoSkill .
  VALUES ?matchType { cnlo:closeMatchESCO cnlo:broadMatchESCO cnlo:exactMatchESCO cnlo:narrowMatchESCO }
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel beroepen hebben een werkomstandigheid gekoppeld?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?occupation) AS ?aantal)
WHERE {
  ?occupation a cnlo:Occupation ;
              cnluwvo:hasWorkCondition ?condition .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel MBO kwalificaties zijn er?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?kwalificatie) AS ?aantal)
WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel vaardigheden hebben RIASEC informatie?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?skill) AS ?aantal)
WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC ?riasec .
}`,
    category: 'count'
  },
  {
    question: 'Hoeveel kennisgebieden hebben een ISCED koppeling?',
    sparql: `${PREFIXES}
SELECT (COUNT(DISTINCT ?area) AS ?aantal)
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:broadMatch ?isced .
  FILTER(CONTAINS(STR(?isced), "isced"))
}`,
    category: 'count'
  }
];

export const FEATURED_EXAMPLE_QUESTIONS = featuredExampleQuestions;

export const QUESTION_BANK: QuestionEntry[] = [
  ...featuredExampleQuestions,
  ...occupationSkillQuestions,
  ...occupationTaskQuestions,
  ...workConditionQuestions,
  ...occupationSearchQuestions,
  ...skillToOccupationQuestions,
  ...skillMetaQuestions,
  ...knowledgeAreaQuestions,
  ...educationSearchQuestions,
  ...educationSkillQuestions,
  ...comparisonQuestions,
  ...countQuestions
];

export const QUESTION_BANK_COUNT = QUESTION_BANK.length;

const EXPECTED_QUESTION_BANK_COUNT = 157;

if (QUESTION_BANK_COUNT !== EXPECTED_QUESTION_BANK_COUNT) {
  console.warn(
    `⚠️ QUESTION_BANK_COUNT=${QUESTION_BANK_COUNT} (expected ${EXPECTED_QUESTION_BANK_COUNT} for full coverage)`
  );
}
