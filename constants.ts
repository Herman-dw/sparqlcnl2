
import { SparqlExample, SchemaHint } from './types';

export const PREFIXES = `
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX esco: <http://data.europa.eu/esco/model#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
`;

export const GRAPH_OPTIONS = [
  { id: 'competentnl', label: 'CompetentNL Base', uri: 'https://linkeddata.competentnl.nl/graph/competentnl' },
  { id: 'cnl-humancapabilities', label: 'Human Capabilities', uri: 'https://linkeddata.competentnl.nl/graph/cnl-humancapabilities' },
  { id: 'cnl-knowledgeareas', label: 'Knowledge Areas', uri: 'https://linkeddata.competentnl.nl/graph/cnl-knowledgeareas' },
  { id: 'esco-v1.2.0-modified-subset', label: 'ESCO Subset', uri: 'https://linkeddata.competentnl.nl/graph/esco-v1.2.0-modified-subset' },
  { id: 'cnluwv4cnl', label: 'UWV 4 CNL', uri: 'https://linkeddata.competentnl.nl/graph/cnluwv4cnl' },
  { id: 'cnluwv4cnlo', label: 'UWV 4 CNL Ontology', uri: 'https://linkeddata.competentnl.nl/graph/cnluwv4cnlo' }
];

export const WHITELIST_PREDICATES = [
  'skos:prefLabel',
  'skos:definition',
  'skos:notation',
  'skos:broader',
  'skos:narrower',
  'skosxl:prefLabel',
  'skosxl:literalForm',
  'cnlo:broadMatchESCO',
  'cnlo:closeMatchESCO',
  'cnlo:exactMatchESCO',
  'cnlo:narrowMatchESCO',
  'cnluwvo:hasContentStatus',
  'cnlo:requiresHATImportant'
];

export const EXAMPLES: SparqlExample[] = [
  {
    vraag: "Toon ESCO-match relaties voor HumanCapability L3 met filters op ESCO prefLabel (NL).",
    query: `
${PREFIXES}
SELECT DISTINCT ?hc ?hcLabel ?predESCO ?escoSkill ?prefLabelESCO_skill
FROM <https://linkeddata.competentnl.nl/graph/cnl-humancapabilities>
FROM <https://linkeddata.competentnl.nl/graph/esco-v1.2.0-modified-subset>
WHERE {
  ?hc a cnlo:HumanCapability ;
      skos:prefLabel ?hcLabel .
  FILTER(STRSTARTS(STR(?hc), "https://linkeddata.competentnl.nl/id/human-capability/L3"))
  
  VALUES ?predESCO { cnlo:broadMatchESCO cnlo:closeMatchESCO cnlo:exactMatchESCO cnlo:narrowMatchESCO }
  ?hc ?predESCO ?escoSkill .
  
  ?escoSkill skos:prefLabel ?prefLabelESCO_skill .
  FILTER(LANG(?prefLabelESCO_skill) = "nl")
}
LIMIT 50
    `
  },
  {
    vraag: "Toon Occupations met ContentStatus_Current en hun 'requiresHATImportant' skills.",
    query: `
${PREFIXES}
SELECT ?occupation ?occLabel ?predCNL ?skill ?skillLabel ?skillNotation
FROM <https://linkeddata.competentnl.nl/graph/cnluwv4cnl>
FROM <https://linkeddata.competentnl.nl/graph/cnluwv4cnlo>
FROM <https://linkeddata.competentnl.nl/graph/competentnl>
FROM <https://linkeddata.competentnl.nl/graph/cnl-humancapabilities>
FROM <https://linkeddata.competentnl.nl/graph/cnl-knowledgeareas>
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnluwvo:hasContentStatus cnluwvo:ContentStatus_Current .
              
  VALUES ?predCNL { cnlo:requiresHATImportant }
  ?occupation ?predCNL ?skill .
  
  ?skill skos:prefLabel ?skillLabel ;
         skos:notation ?skillNotation .
}
ORDER BY ?occupation ?predCNL ?skillNotation
LIMIT 50
    `
  }
];

export const SCHEMA_HINTS: SchemaHint[] = [
  { prefix: 'cnlo', uri: 'https://linkeddata.competentnl.nl/def/competentnl#', description: 'Core CompetentNL ontology' },
  { prefix: 'cnluwvo', uri: 'https://linkeddata.competentnl.nl/def/uwv-ontology#', description: 'UWV specific ontology' },
  { prefix: 'skos', uri: 'http://www.w3.org/2004/02/skos/core#', description: 'Simple Knowledge Organization System' }
];
