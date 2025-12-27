/**
 * CompetentNL Knowledge Graph Schema
 * ===================================
 * Gebaseerd op de officiële documentatie versie 1 (september 2025)
 * 
 * De Knowledge Graph van CompetentNL bestaat uit:
 * - Ontologie (conceptueel model)
 * - Data (instanties van die concepten)
 */

export const SCHEMA_DOCUMENTATION = `
## OVER COMPETENTNL

CompetentNL is een knowledge graph die beroepen, vaardigheden, kennisgebieden en 
opleidingsnormen aan elkaar koppelt. Het gebruikt semantisch web technologie (RDF, SPARQL, SKOS).

De data komt van:
- UWV (arbeidsmarktinformatie - beroepen en taken)
- SBB (middelbaar beroepsonderwijs - opleidingsnormen)

## BELANGRIJKE QUERY REGELS

1. Gebruik NOOIT "FROM <graph>" clauses - de API ondersteunt dit niet
2. Voeg ALTIJD "LIMIT 50" toe aan SELECT queries
3. Gebruik FILTER(CONTAINS(LCASE(?var), "zoekterm")) voor tekstzoeken
4. Labels zijn vaak in het Nederlands: FILTER(LANG(?label) = "nl")

## PREFIXES

PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX esco: <http://data.europa.eu/esco/model#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>

## HOOFDCONCEPTEN (Klassen)

### cnlo:Occupation (Beroep) - 3263 items
Een beroep is een samenhangend geheel van arbeidstaken die voor de uitvoering 
een bepaalde vakkennis en -kunde vereisen.

Eigenschappen:
- skos:prefLabel - Naam van het beroep ("Kapper"@nl)
- skos:definition - Beschrijving/definitie
- skosxl:altLabel - Alternatieve namen/synoniemen
- cnluwv:hasContentStatus - Status (Current, etc.)

### cnlo:HumanCapability (Vaardigheid) - 137 items
Een vaardigheid die een individu handelingsbekwaam maakt om een specifieke 
taak binnen de context van een beroep of functie uit te voeren.

Eigenschappen:
- skos:prefLabel - Naam ("Leidinggeven"@nl)
- skos:definition - Beschrijving
- skos:notation - Code

### cnlo:KnowledgeArea (Kennisgebied) - 361 items
Een duidelijk afgebakend cluster van vakspecifieke feiten, principes, theorieën 
en praktijken die nodig zijn voor een beroep.

Eigenschappen:
- skos:prefLabel - Naam
- skos:definition - Beschrijving

### cnlo:EducationalNorm (Opleidingsnorm) - 1856 items
Het geheel van bekwaamheden die een afgestudeerde van een beroepsopleiding 
kwalificeren voor het functioneren in een beroep.

Eigenschappen:
- skos:prefLabel - Naam
- skos:definition - Beschrijving
- skos:notation - Code

### cnluwv:OccupationTask (Beroepstaak) - 4613 items
Specifieke taken die bij een beroep horen.

Eigenschappen:
- skos:prefLabel - Naam van de taak

### esco:Skill (ESCO Vaardigheid) - 14257 items
Vaardigheden uit de Europese ESCO classificatie.

Eigenschappen:
- skos:prefLabel - Naam (meertalig)

## RELATIES

### Van Beroep naar Vaardigheid (requires)
- cnlo:requiresHATEssential - Essentiële vaardigheden (80.237 koppelingen)
- cnlo:requiresHATImportant - Belangrijke vaardigheden (153.554 koppelingen)  
- cnlo:requiresHATSomewhat - Enigszins belangrijke vaardigheden (82.518 koppelingen)

Voorbeeld: "Kapper" requiresHATEssential "Klantgerichtheid"

### Van Beroep naar Taak
- cnluwv:isCharacterizedByOccupationTask_Essential - Essentiële taken (61.195)
- cnluwv:isCharacterizedByOccupationTask_Optional - Optionele taken (19.658)

### Van Opleidingsnorm naar Vaardigheid (prescribes)
- cnlo:prescribesHATEssential - Essentieel voorgeschreven
- cnlo:prescribesHATImportant - Belangrijk voorgeschreven
- cnlo:prescribesHATSomewhat - Enigszins voorgeschreven

### Hiërarchische relaties
- skos:broader - Breder concept
- skos:narrower - Smaller concept
- cnluwv:specialization - Specialisatie van een beroep

### Mappings naar externe standaarden
- cnlo:closeMatchESCO - Koppeling naar ESCO skill
- cnlo:broadMatchESCO - Brede match met ESCO
- cnlo:exactMatchESCO - Exacte match met ESCO
- cnlo:narrowMatchESCO - Nauwe match met ESCO
- cnluwv:broadMatchTaxonomyItemESCOBeroep - Match met ESCO beroep
- cnluwv:broadMatchTaxonomyItemONETBeroep - Match met O*NET beroep

## HERBRUIKTE STANDAARDEN

Vanuit SKOS:
- skos:Concept, skos:ConceptScheme
- skos:prefLabel, skos:altLabel
- skos:notation, skos:definition, skos:scopeNote
- skos:broader, skos:narrower
- skos:broadMatch, skos:closeMatch

Vanuit PROV Ontology:
- prov:Entity
- prov:generatedAtTime, prov:invalidatedAtTime
`;

export const EXAMPLE_QUERIES = [
  {
    vraag: "Welke vaardigheden (skills) heeft een kapper nodig?",
    uitleg: "Zoekt beroepen met 'kapper' in de naam en hun essentiële vaardigheden",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?occLabel ?capability ?capLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnlo:requiresHATEssential ?capability .
  ?capability skos:prefLabel ?capLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "kapper"))
}
LIMIT 50`
  },
  {
    vraag: "Toon alle beroepen",
    uitleg: "Lijst van alle beroepen met hun labels",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?label
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
}
LIMIT 50`
  },
  {
    vraag: "Zoek beroepen met 'software' in de naam",
    uitleg: "Filtert beroepen op basis van een zoekterm",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?label
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "software"))
}
LIMIT 50`
  },
  {
    vraag: "Welke taken horen bij een verpleegkundige?",
    uitleg: "Zoekt de essentiële taken van een beroep",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?occLabel ?task ?taskLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnluwv:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "verpleeg"))
}
LIMIT 50`
  },
  {
    vraag: "Toon alle human capabilities / vaardigheden",
    uitleg: "Lijst van alle vaardigheden in CompetentNL",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?capability ?label ?definition
WHERE {
  ?capability a cnlo:HumanCapability ;
              skos:prefLabel ?label .
  OPTIONAL { ?capability skos:definition ?definition }
}
LIMIT 50`
  },
  {
    vraag: "Welke beroepen vereisen leidinggeven?",
    uitleg: "Zoekt beroepen die een specifieke vaardigheid vereisen",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?occLabel ?capability ?capLabel
WHERE {
  ?capability a cnlo:HumanCapability ;
              skos:prefLabel ?capLabel .
  FILTER(CONTAINS(LCASE(?capLabel), "leidinggeven"))
  ?occupation cnlo:requiresHATEssential ?capability ;
              skos:prefLabel ?occLabel .
}
LIMIT 50`
  },
  {
    vraag: "Wat zijn alle vaardigheden (essentieel en belangrijk) voor een leraar?",
    uitleg: "Combineert essentiële en belangrijke vaardigheden met UNION",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?occLabel ?importance ?capability ?capLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "leraar") || CONTAINS(LCASE(?occLabel), "docent"))
  {
    ?occupation cnlo:requiresHATEssential ?capability .
    BIND("Essentieel" AS ?importance)
  }
  UNION
  {
    ?occupation cnlo:requiresHATImportant ?capability .
    BIND("Belangrijk" AS ?importance)
  }
  ?capability skos:prefLabel ?capLabel .
}
LIMIT 50`
  },
  {
    vraag: "Toon alle kennisgebieden",
    uitleg: "Lijst van kennisgebieden in CompetentNL",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?area ?label ?definition
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:definition ?definition }
}
LIMIT 50`
  },
  {
    vraag: "Welke opleidingen leiden op tot verpleegkundige?",
    uitleg: "Zoekt opleidingsnormen gerelateerd aan een beroep",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?education ?eduLabel
WHERE {
  ?education a cnlo:EducationalNorm ;
             skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "verpleeg"))
}
LIMIT 50`
  },
  {
    vraag: "Wat zijn de ESCO-matches voor een specifieke vaardigheid?",
    uitleg: "Zoekt koppelingen tussen CompetentNL en ESCO",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?capability ?capLabel ?escoSkill ?escoLabel
WHERE {
  ?capability a cnlo:HumanCapability ;
              skos:prefLabel ?capLabel ;
              cnlo:closeMatchESCO ?escoSkill .
  ?escoSkill skos:prefLabel ?escoLabel .
  FILTER(LANG(?escoLabel) = "nl")
}
LIMIT 50`
  },
  {
    vraag: "Vergelijk twee beroepen op vaardigheden",
    uitleg: "Zoekt vaardigheden die beide beroepen gemeenschappelijk hebben",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?capability ?capLabel ?occ1Label ?occ2Label
WHERE {
  ?occ1 a cnlo:Occupation ;
        skos:prefLabel ?occ1Label ;
        cnlo:requiresHATEssential ?capability .
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?occ2Label ;
        cnlo:requiresHATEssential ?capability .
  ?capability skos:prefLabel ?capLabel .
  FILTER(CONTAINS(LCASE(?occ1Label), "kapper"))
  FILTER(CONTAINS(LCASE(?occ2Label), "schoonheidsspecialist"))
  FILTER(?occ1 != ?occ2)
}
LIMIT 50`
  },
  {
    vraag: "Hoeveel beroepen zijn er in totaal?",
    uitleg: "Telt het aantal beroepen",
    query: `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
SELECT (COUNT(DISTINCT ?occupation) AS ?aantal)
WHERE {
  ?occupation a cnlo:Occupation .
}`
  }
];

// Synoniemen en Nederlandse termen voor betere vraagherkenning
export const SYNONYMS = {
  // Concepten
  "beroep": ["occupation", "functie", "job", "werk", "professie", "vak"],
  "vaardigheid": ["skill", "capability", "competentie", "bekwaamheid", "human capability"],
  "kennisgebied": ["knowledge area", "kennis", "vakgebied", "expertise"],
  "opleiding": ["educational norm", "opleidingsnorm", "studie", "training", "kwalificatie"],
  "taak": ["task", "occupation task", "werkzaamheid", "activiteit"],
  
  // Relaties
  "nodig hebben": ["requires", "vereist", "heeft nodig", "moet kunnen"],
  "essentieel": ["essential", "cruciaal", "onmisbaar", "verplicht"],
  "belangrijk": ["important", "relevant", "significant"],
  
  // Acties
  "zoeken": ["vinden", "tonen", "laten zien", "geef", "welke"],
  "vergelijken": ["compare", "versus", "vs", "ten opzichte van"],
  "tellen": ["count", "hoeveel", "aantal"]
};

// Mapping van Nederlandse termen naar SPARQL predicates
export const PREDICATE_MAPPING = {
  "essentiële vaardigheden": "cnlo:requiresHATEssential",
  "belangrijke vaardigheden": "cnlo:requiresHATImportant", 
  "vaardigheden": "cnlo:requiresHATEssential",
  "skills": "cnlo:requiresHATEssential",
  "taken": "cnluwv:isCharacterizedByOccupationTask_Essential",
  "werkzaamheden": "cnluwv:isCharacterizedByOccupationTask_Essential"
};
