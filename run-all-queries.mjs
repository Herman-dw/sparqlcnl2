/**
 * CompetentNL Knowledge Graph Explorer (ES Module versie)
 * 
 * Dit script voert alle verkenningsqueries uit tegen het CompetentNL SPARQL endpoint
 * en slaat de resultaten op in een JSON bestand.
 * 
 * Gebruik:
 *   node run-all-queries.mjs
 * 
 * Vereisten:
 *   - .env.local bestand met COMPETENTNL_API_KEY
 * 
 * Output:
 *   - exploration-results.json (volledige resultaten)
 *   - exploration-summary.txt (leesbare samenvatting)
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Laad .env.local handmatig
function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local');
  const env = {};
  
  if (fs.existsSync(envPath)) {
    console.log(`✓ .env.local gevonden: ${envPath}`);
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      // Skip comments and empty lines
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        let key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    });
  } else {
    console.log(`⚠ .env.local niet gevonden op: ${envPath}`);
  }
  
  return env;
}

// Laad environment variables
const envLocal = loadEnvLocal();

// Configuratie
const CONFIG = {
  endpoint: envLocal.COMPETENTNL_ENDPOINT || process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl',
  apiKey: envLocal.COMPETENTNL_API_KEY || process.env.COMPETENTNL_API_KEY || '',
  timeout: 60000, // 60 seconden per query
  delayBetweenQueries: 500, // 0.5 seconde tussen queries
};

// Prefixes voor alle queries
const PREFIXES = `
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX esco: <http://data.europa.eu/esco/model#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
`;

// Alle queries georganiseerd per categorie
const QUERIES = {
  // ============================================
  // DEEL 1: STRUCTUUR ONTDEKKING
  // ============================================
  "1.1_named_graphs": {
    description: "Alle named graphs met aantal triples",
    query: `
      SELECT DISTINCT ?graph (COUNT(*) as ?tripleCount)
      WHERE { GRAPH ?graph { ?s ?p ?o } }
      GROUP BY ?graph
      ORDER BY DESC(?tripleCount)
    `
  },

  "1.2_all_classes": {
    description: "Alle classes (rdf:type) met aantal instanties",
    query: `
      SELECT ?class (COUNT(?s) as ?instances)
      WHERE { ?s rdf:type ?class }
      GROUP BY ?class
      ORDER BY DESC(?instances)
      LIMIT 100
    `
  },

  "1.3_classes_per_graph": {
    description: "Classes per named graph",
    query: `
      SELECT ?graph ?class (COUNT(?s) as ?instances)
      WHERE { 
        GRAPH ?graph { ?s rdf:type ?class }
      }
      GROUP BY ?graph ?class
      ORDER BY ?graph DESC(?instances)
      LIMIT 200
    `
  },

  "1.4_cnlo_predicates": {
    description: "Alle predicaten in CompetentNL namespace",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?s ?predicate ?o .
        FILTER(STRSTARTS(STR(?predicate), "https://linkeddata.competentnl.nl/def/competentnl"))
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "1.5_uwv_predicates": {
    description: "Alle predicaten in UWV namespace",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?s ?predicate ?o .
        FILTER(STRSTARTS(STR(?predicate), "https://linkeddata.competentnl.nl/def/uwv-ontology"))
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "1.6_skos_predicates": {
    description: "Gebruikte SKOS predicaten",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?s ?predicate ?o .
        FILTER(STRSTARTS(STR(?predicate), "http://www.w3.org/2004/02/skos/core"))
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "1.7_all_predicates": {
    description: "Alle predicaten (top 100)",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { ?s ?predicate ?o }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
      LIMIT 100
    `
  },

  // ============================================
  // DEEL 2: BEROEPEN (OCCUPATIONS)
  // ============================================
  "2.1_occupation_count": {
    description: "Totaal aantal beroepen",
    query: `
      SELECT (COUNT(DISTINCT ?occupation) as ?total)
      WHERE { ?occupation a cnlo:Occupation }
    `
  },

  "2.2_occupation_by_status": {
    description: "Beroepen per ContentStatus",
    query: `
      SELECT ?contentStatus (COUNT(?occupation) as ?count)
      WHERE { 
        ?occupation a cnlo:Occupation .
        OPTIONAL { ?occupation cnluwvo:hasContentStatus ?contentStatus }
      }
      GROUP BY ?contentStatus
      ORDER BY DESC(?count)
    `
  },

  "2.3_occupation_samples": {
    description: "Sample beroepen met labels",
    query: `
      SELECT ?occupation ?label ?definition
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?label .
        OPTIONAL { ?occupation skos:definition ?definition . FILTER(LANG(?definition) = "nl") }
        FILTER(LANG(?label) = "nl")
      }
      LIMIT 30
    `
  },

  "2.4_occupation_all_predicates": {
    description: "Alle predicaten gebruikt bij Occupations",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?occupation a cnlo:Occupation .
        ?occupation ?predicate ?o .
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "2.5_occupation_hierarchy": {
    description: "Beroepen hiërarchie (broader/narrower)",
    query: `
      SELECT ?occupation ?label ?broader ?broaderLabel
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?label ;
                    skos:broader ?broader .
        ?broader skos:prefLabel ?broaderLabel .
        FILTER(LANG(?label) = "nl")
        FILTER(LANG(?broaderLabel) = "nl")
      }
      LIMIT 50
    `
  },

  "2.6_occupation_synonyms": {
    description: "Beroepen met synoniemen (altLabel)",
    query: `
      SELECT ?occupation ?prefLabel (GROUP_CONCAT(?altLabel; separator=", ") as ?synonyms)
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?prefLabel ;
                    skos:altLabel ?altLabel .
        FILTER(LANG(?prefLabel) = "nl")
      }
      GROUP BY ?occupation ?prefLabel
      LIMIT 50
    `
  },

  "2.7_occupation_example_full": {
    description: "Één beroep volledig uitgewerkt (alle properties)",
    query: `
      SELECT ?predicate ?object
      WHERE { 
        ?occ a cnlo:Occupation ;
             skos:prefLabel ?label .
        FILTER(CONTAINS(LCASE(?label), "software"))
        ?occ ?predicate ?object .
      }
      LIMIT 100
    `
  },

  "2.8_occupation_uri_pattern": {
    description: "URI patronen voor beroepen",
    query: `
      SELECT (SAMPLE(?occupation) as ?exampleUri) 
             (COUNT(?occupation) as ?count)
      WHERE { 
        ?occupation a cnlo:Occupation .
      }
    `
  },

  // ============================================
  // DEEL 3: VAARDIGHEDEN (SKILLS/HUMANCAPABILITIES)
  // ============================================
  "3.1_skill_count": {
    description: "Totaal aantal vaardigheden",
    query: `
      SELECT (COUNT(DISTINCT ?skill) as ?total)
      WHERE { ?skill a cnlo:HumanCapability }
    `
  },

  "3.2_skill_samples": {
    description: "Sample vaardigheden met notatie",
    query: `
      SELECT ?skill ?label ?notation ?definition
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?label .
        OPTIONAL { ?skill skos:notation ?notation }
        OPTIONAL { ?skill skos:definition ?definition . FILTER(LANG(?definition) = "nl") }
        FILTER(LANG(?label) = "nl")
      }
      ORDER BY ?notation
      LIMIT 50
    `
  },

  "3.3_skill_all_predicates": {
    description: "Alle predicaten gebruikt bij HumanCapability",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?skill a cnlo:HumanCapability .
        ?skill ?predicate ?o .
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "3.4_skill_hierarchy": {
    description: "Vaardigheden hiërarchie (3 niveaus)",
    query: `
      SELECT ?skill ?label ?notation ?broader ?broaderLabel ?broaderNotation
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?label .
        OPTIONAL { ?skill skos:notation ?notation }
        OPTIONAL { 
          ?skill skos:broader ?broader . 
          ?broader skos:prefLabel ?broaderLabel .
          OPTIONAL { ?broader skos:notation ?broaderNotation }
          FILTER(LANG(?broaderLabel) = "nl")
        }
        FILTER(LANG(?label) = "nl")
      }
      ORDER BY ?notation
      LIMIT 150
    `
  },

  "3.5_skill_levels": {
    description: "Telling per hiërarchie niveau (op basis van notatie)",
    query: `
      SELECT ?level (COUNT(?skill) as ?count)
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:notation ?notation .
        BIND(STRLEN(?notation) - STRLEN(REPLACE(?notation, ".", "")) + 1 AS ?level)
      }
      GROUP BY ?level
      ORDER BY ?level
    `
  },

  "3.6_skill_riasec": {
    description: "Vaardigheden met RIASEC codes",
    query: `
      SELECT ?skill ?label ?riasec
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?label ;
               cnlo:hasRIASEC ?riasec .
        FILTER(LANG(?label) = "nl")
      }
      ORDER BY ?riasec ?label
      LIMIT 150
    `
  },

  "3.7_skill_esco_mapping": {
    description: "ESCO mappings voor vaardigheden",
    query: `
      SELECT ?skill ?label ?matchType ?escoUri
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?label .
        VALUES ?matchType { cnlo:closeMatchESCO cnlo:broadMatchESCO cnlo:exactMatchESCO cnlo:narrowMatchESCO }
        ?skill ?matchType ?escoUri .
        FILTER(LANG(?label) = "nl")
      }
      LIMIT 100
    `
  },

  "3.8_skill_onet_mapping": {
    description: "O*NET mappings voor vaardigheden",
    query: `
      SELECT ?skill ?label ?onetCode
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?label ;
               cnlo:closeMatchONET ?onetCode .
        FILTER(LANG(?label) = "nl")
      }
      LIMIT 100
    `
  },

  "3.9_skill_example_full": {
    description: "Één vaardigheid volledig uitgewerkt",
    query: `
      SELECT ?predicate ?object
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel "Samenwerken"@nl .
        ?skill ?predicate ?object .
      }
    `
  },

  // ============================================
  // DEEL 4: KENNISGEBIEDEN (KNOWLEDGE AREAS)
  // ============================================
  "4.1_knowledge_count": {
    description: "Totaal aantal kennisgebieden",
    query: `
      SELECT (COUNT(DISTINCT ?area) as ?total)
      WHERE { ?area a cnlo:KnowledgeArea }
    `
  },

  "4.2_knowledge_samples": {
    description: "Sample kennisgebieden",
    query: `
      SELECT ?area ?label ?notation ?definition
      WHERE { 
        ?area a cnlo:KnowledgeArea ;
              skos:prefLabel ?label .
        OPTIONAL { ?area skos:notation ?notation }
        OPTIONAL { ?area skos:definition ?definition . FILTER(LANG(?definition) = "nl") }
        FILTER(LANG(?label) = "nl")
      }
      ORDER BY ?notation
      LIMIT 50
    `
  },

  "4.3_knowledge_all_predicates": {
    description: "Alle predicaten gebruikt bij KnowledgeArea",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?area a cnlo:KnowledgeArea .
        ?area ?predicate ?o .
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "4.4_knowledge_hierarchy": {
    description: "Kennisgebieden hiërarchie",
    query: `
      SELECT ?area ?label ?notation ?broader ?broaderLabel ?broaderNotation
      WHERE { 
        ?area a cnlo:KnowledgeArea ;
              skos:prefLabel ?label .
        OPTIONAL { ?area skos:notation ?notation }
        OPTIONAL { 
          ?area skos:broader ?broader . 
          ?broader skos:prefLabel ?broaderLabel .
          OPTIONAL { ?broader skos:notation ?broaderNotation }
          FILTER(LANG(?broaderLabel) = "nl")
        }
        FILTER(LANG(?label) = "nl")
      }
      ORDER BY ?notation
      LIMIT 400
    `
  },

  "4.5_knowledge_isced_mapping": {
    description: "ISCED-F mappings voor kennisgebieden",
    query: `
      SELECT ?area ?label ?isced
      WHERE { 
        ?area a cnlo:KnowledgeArea ;
              skos:prefLabel ?label ;
              skos:broadMatch ?isced .
        FILTER(LANG(?label) = "nl")
      }
      LIMIT 100
    `
  },

  // ============================================
  // DEEL 5: BEROEP-SKILL RELATIES
  // ============================================
  "5.1_requires_predicates_usage": {
    description: "Gebruik van requires predicaten",
    query: `
      SELECT ?predicate (COUNT(*) as ?count)
      WHERE { 
        VALUES ?predicate { 
          cnlo:requiresHATEssential 
          cnlo:requiresHATImportant 
          cnlo:requiresHATSomewhat 
        }
        ?occupation ?predicate ?skill .
      }
      GROUP BY ?predicate
    `
  },

  "5.2_occupation_skill_links": {
    description: "Beroep-skill koppelingen (sample)",
    query: `
      SELECT ?occupation ?occLabel ?requiresType ?skill ?skillLabel
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?occLabel .
        VALUES ?requiresType { 
          cnlo:requiresHATEssential 
          cnlo:requiresHATImportant 
          cnlo:requiresHATSomewhat 
        }
        ?occupation ?requiresType ?skill .
        ?skill skos:prefLabel ?skillLabel .
        FILTER(LANG(?occLabel) = "nl")
        FILTER(LANG(?skillLabel) = "nl")
      }
      LIMIT 100
    `
  },

  "5.3_occupation_skill_counts": {
    description: "Aantal skills per beroep",
    query: `
      SELECT ?occLabel 
             (COUNT(DISTINCT ?essential) as ?essential)
             (COUNT(DISTINCT ?important) as ?important)
             (COUNT(DISTINCT ?somewhat) as ?somewhat)
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?occLabel .
        OPTIONAL { ?occupation cnlo:requiresHATEssential ?essential }
        OPTIONAL { ?occupation cnlo:requiresHATImportant ?important }
        OPTIONAL { ?occupation cnlo:requiresHATSomewhat ?somewhat }
        FILTER(LANG(?occLabel) = "nl")
      }
      GROUP BY ?occLabel
      HAVING (COUNT(DISTINCT ?essential) > 0 || COUNT(DISTINCT ?important) > 0)
      ORDER BY DESC(?essential)
      LIMIT 50
    `
  },

  "5.4_occupation_knowledge_links": {
    description: "Beroep-kennisgebied koppelingen",
    query: `
      SELECT ?occupation ?occLabel ?requiresType ?area ?areaLabel
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?occLabel .
        VALUES ?requiresType { 
          cnlo:requiresHATEssential 
          cnlo:requiresHATImportant 
          cnlo:requiresHATSomewhat 
        }
        ?occupation ?requiresType ?area .
        ?area a cnlo:KnowledgeArea ;
              skos:prefLabel ?areaLabel .
        FILTER(LANG(?occLabel) = "nl")
        FILTER(LANG(?areaLabel) = "nl")
      }
      LIMIT 50
    `
  },

  // ============================================
  // DEEL 6: TAKEN
  // ============================================
  "6.1_task_classes": {
    description: "Zoek naar task-gerelateerde classes",
    query: `
      SELECT DISTINCT ?type (COUNT(?s) as ?count)
      WHERE { 
        ?s rdf:type ?type .
        FILTER(
          CONTAINS(LCASE(STR(?type)), "task") || 
          CONTAINS(LCASE(STR(?type)), "taak")
        )
      }
      GROUP BY ?type
    `
  },

  "6.2_task_samples": {
    description: "Sample taken (indien beschikbaar)",
    query: `
      SELECT ?task ?label ?type
      WHERE { 
        { ?task a cnluwvo:Task } UNION { ?task a cnlo:Task }
        ?task skos:prefLabel ?label .
        ?task rdf:type ?type .
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
      LIMIT 30
    `
  },

  "6.3_task_predicates": {
    description: "Predicaten gebruikt bij taken",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        { ?task a cnluwvo:Task } UNION { ?task a cnlo:Task }
        ?task ?predicate ?o .
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "6.4_occupation_task_link": {
    description: "Beroep-taak koppelingen",
    query: `
      SELECT ?occupation ?occLabel ?task ?taskLabel
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?occLabel .
        { ?occupation cnluwvo:hasTask ?task } UNION { ?occupation cnlo:hasTask ?task }
        ?task skos:prefLabel ?taskLabel .
        FILTER(LANG(?occLabel) = "nl")
        FILTER(LANG(?taskLabel) = "nl" || LANG(?taskLabel) = "")
      }
      LIMIT 50
    `
  },

  // ============================================
  // DEEL 7: OPLEIDINGSNORMEN
  // ============================================
  "7.1_edunorm_count": {
    description: "Totaal aantal opleidingsnormen",
    query: `
      SELECT (COUNT(DISTINCT ?norm) as ?total)
      WHERE { ?norm a cnlo:EducationalNorm }
    `
  },

  "7.2_edunorm_samples": {
    description: "Sample opleidingsnormen",
    query: `
      SELECT ?norm ?label ?notation
      WHERE { 
        ?norm a cnlo:EducationalNorm ;
              skos:prefLabel ?label .
        OPTIONAL { ?norm skos:notation ?notation }
        FILTER(LANG(?label) = "nl" || LANG(?label) = "")
      }
      LIMIT 30
    `
  },

  "7.3_edunorm_all_predicates": {
    description: "Alle predicaten bij opleidingsnormen",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?norm a cnlo:EducationalNorm .
        ?norm ?predicate ?o .
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "7.4_prescribes_usage": {
    description: "Gebruik van prescribes predicaten",
    query: `
      SELECT ?predicate (COUNT(*) as ?count)
      WHERE { 
        VALUES ?predicate { 
          cnlo:prescribesHATEssential 
          cnlo:prescribesHATImportant 
          cnlo:prescribesHATSomewhat 
        }
        ?norm ?predicate ?skill .
      }
      GROUP BY ?predicate
    `
  },

  "7.5_edunorm_skill_links": {
    description: "Opleidingsnorm-skill koppelingen",
    query: `
      SELECT ?norm ?normLabel ?prescribesType ?skill ?skillLabel
      WHERE { 
        ?norm a cnlo:EducationalNorm ;
              skos:prefLabel ?normLabel .
        VALUES ?prescribesType { 
          cnlo:prescribesHATEssential 
          cnlo:prescribesHATImportant 
          cnlo:prescribesHATSomewhat 
        }
        ?norm ?prescribesType ?skill .
        ?skill skos:prefLabel ?skillLabel .
        FILTER(LANG(?normLabel) = "nl" || LANG(?normLabel) = "")
        FILTER(LANG(?skillLabel) = "nl")
      }
      LIMIT 50
    `
  },

  // ============================================
  // DEEL 8: WERKOMSTANDIGHEDEN
  // ============================================
  "8.1_workcondition_classes": {
    description: "Zoek werkomstandigheden classes",
    query: `
      SELECT DISTINCT ?type (COUNT(*) as ?count)
      WHERE { 
        ?s rdf:type ?type .
        FILTER(
          CONTAINS(LCASE(STR(?type)), "werk") || 
          CONTAINS(LCASE(STR(?type)), "condition") ||
          CONTAINS(LCASE(STR(?type)), "omstand") ||
          CONTAINS(LCASE(STR(?type)), "circumstance")
        )
      }
      GROUP BY ?type
    `
  },

  "8.2_workcondition_predicates": {
    description: "Werk-gerelateerde predicaten",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?s ?predicate ?o .
        FILTER(
          CONTAINS(LCASE(STR(?predicate)), "work") || 
          CONTAINS(LCASE(STR(?predicate)), "condition") ||
          CONTAINS(LCASE(STR(?predicate)), "physical")
        )
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "8.3_occupation_workconditions": {
    description: "Werkomstandigheden per beroep",
    query: `
      SELECT ?occupation ?occLabel ?predicate ?condition
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?occLabel ;
                    ?predicate ?condition .
        FILTER(CONTAINS(LCASE(STR(?predicate)), "condition") || CONTAINS(LCASE(STR(?predicate)), "work"))
        FILTER(LANG(?occLabel) = "nl")
      }
      LIMIT 30
    `
  },

  // ============================================
  // DEEL 9: SPECIALE ENTITEITEN
  // ============================================
  "9.1_reference_occupations": {
    description: "Referentieberoepen (UWV specifiek)",
    query: `
      SELECT ?occupation ?label ?type
      WHERE { 
        ?occupation a cnlo:Occupation ;
                    skos:prefLabel ?label ;
                    rdf:type ?type .
        FILTER(?type != cnlo:Occupation)
        FILTER(LANG(?label) = "nl")
      }
      LIMIT 50
    `
  },

  "9.2_specializations": {
    description: "Verbijzonderingen/specialisaties",
    query: `
      SELECT ?spec ?label ?broader ?broaderLabel
      WHERE { 
        ?spec skos:broader ?broader ;
              skos:prefLabel ?label .
        ?broader skos:prefLabel ?broaderLabel .
        FILTER(LANG(?label) = "nl")
        FILTER(LANG(?broaderLabel) = "nl")
      }
      LIMIT 50
    `
  },

  "9.3_concept_schemes": {
    description: "SKOS ConceptSchemes",
    query: `
      SELECT ?scheme ?label
      WHERE { 
        ?scheme a skos:ConceptScheme .
        OPTIONAL { ?scheme skos:prefLabel ?label }
      }
      LIMIT 20
    `
  },

  // ============================================
  // DEEL 10: URI PATRONEN & METADATA
  // ============================================
  "10.1_uri_patterns": {
    description: "URI patronen per class",
    query: `
      SELECT ?class (SAMPLE(?uri) as ?exampleUri) (COUNT(?uri) as ?count)
      WHERE { 
        ?uri rdf:type ?class .
        FILTER(STRSTARTS(STR(?uri), "https://linkeddata.competentnl.nl"))
      }
      GROUP BY ?class
      ORDER BY DESC(?count)
      LIMIT 30
    `
  },

  "10.2_provenance": {
    description: "Provenance informatie (prov:)",
    query: `
      SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
      WHERE { 
        ?s ?predicate ?o .
        FILTER(STRSTARTS(STR(?predicate), "http://www.w3.org/ns/prov"))
      }
      GROUP BY ?predicate
      ORDER BY DESC(?usage)
    `
  },

  "10.3_timestamps": {
    description: "Tijdstempel informatie",
    query: `
      SELECT ?type (COUNT(?s) as ?count) (MIN(?time) as ?earliest) (MAX(?time) as ?latest)
      WHERE { 
        ?s rdf:type ?type .
        { ?s prov:generatedAtTime ?time } UNION { ?s prov:invalidatedAtTime ?time }
      }
      GROUP BY ?type
      LIMIT 20
    `
  },

  // ============================================
  // DEEL 11: TAALBEHEERSING
  // ============================================
  "11.1_language_classes": {
    description: "Taal-gerelateerde classes",
    query: `
      SELECT DISTINCT ?type (COUNT(*) as ?count)
      WHERE { 
        ?s rdf:type ?type .
        FILTER(
          CONTAINS(LCASE(STR(?type)), "language") || 
          CONTAINS(LCASE(STR(?type)), "taal")
        )
      }
      GROUP BY ?type
    `
  },

  "11.2_language_proficiency": {
    description: "Taalbeheersing entiteiten",
    query: `
      SELECT ?entity ?label ?type
      WHERE { 
        ?entity rdf:type ?type ;
                skos:prefLabel ?label .
        FILTER(
          CONTAINS(LCASE(STR(?type)), "language") || 
          CONTAINS(LCASE(STR(?type)), "proficiency")
        )
      }
      LIMIT 30
    `
  },

  // ============================================
  // DEEL 12: DATAKWALITEIT
  // ============================================
  "12.1_missing_labels": {
    description: "Concepten zonder Nederlands label",
    query: `
      SELECT ?concept ?type (COUNT(*) as ?count)
      WHERE { 
        ?concept rdf:type ?type .
        FILTER NOT EXISTS { ?concept skos:prefLabel ?label . FILTER(LANG(?label) = "nl") }
        FILTER(STRSTARTS(STR(?concept), "https://linkeddata.competentnl.nl"))
      }
      GROUP BY ?concept ?type
      LIMIT 20
    `
  },

  "12.2_orphan_skills": {
    description: "Skills niet gekoppeld aan beroep of opleiding",
    query: `
      SELECT ?skill ?label
      WHERE { 
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?label .
        FILTER NOT EXISTS { 
          ?x cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?skill 
        }
        FILTER NOT EXISTS { 
          ?y cnlo:prescribesHATEssential|cnlo:prescribesHATImportant|cnlo:prescribesHATSomewhat ?skill 
        }
        FILTER(LANG(?label) = "nl")
      }
      LIMIT 30
    `
  },

  "12.3_duplicate_labels": {
    description: "Mogelijke duplicate labels",
    query: `
      SELECT ?label (COUNT(?s) as ?count) (GROUP_CONCAT(?s; separator=", ") as ?entities)
      WHERE { 
        ?s skos:prefLabel ?label .
        FILTER(LANG(?label) = "nl")
      }
      GROUP BY ?label
      HAVING (COUNT(?s) > 1)
      ORDER BY DESC(?count)
      LIMIT 20
    `
  }
};

// SPARQL uitvoering functie
async function executeSparql(query) {
  const fullQuery = PREFIXES + query;
  const params = new URLSearchParams();
  params.append('query', fullQuery);
  params.append('format', 'application/sparql-results+json');

  const headers = {
    'Accept': 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'CompetentNL-Explorer/1.0'
  };

  if (CONFIG.apiKey) {
    headers['apikey'] = CONFIG.apiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

  try {
    const response = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: headers,
      body: params,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Helper functie om resultaten te verwerken
function processResults(data) {
  if (data.boolean !== undefined) {
    return { type: 'boolean', value: data.boolean };
  }
  
  if (!data.results || !data.results.bindings) {
    return { type: 'empty', rows: [] };
  }

  const rows = data.results.bindings.map(binding => {
    const row = {};
    Object.keys(binding).forEach(key => {
      row[key] = binding[key].value;
    });
    return row;
  });

  return {
    type: 'bindings',
    variables: data.head.vars,
    rowCount: rows.length,
    rows: rows
  };
}

// Voortgangsindicator
function progressBar(current, total, width = 40) {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${current}/${total} (${Math.round(percent * 100)}%)`;
}

// Hoofdfunctie
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     CompetentNL Knowledge Graph Explorer                       ║');
  console.log('║     Verkenning van de SPARQL endpoint structuur                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Endpoint: ${CONFIG.endpoint}`);
  console.log(`API Key: ${CONFIG.apiKey ? '✓ Gevonden in .env.local (' + CONFIG.apiKey.substring(0, 8) + '...)' : '✗ Niet gevonden!'}`);
  console.log(`Aantal queries: ${Object.keys(QUERIES).length}`);
  console.log('');

  if (!CONFIG.apiKey) {
    console.log('⚠ WAARSCHUWING: Geen API key gevonden!');
    console.log('  Zorg dat .env.local bestaat met: COMPETENTNL_API_KEY=jouw-key');
    console.log('');
  }

  const results = {
    metadata: {
      endpoint: CONFIG.endpoint,
      timestamp: new Date().toISOString(),
      totalQueries: Object.keys(QUERIES).length,
      successCount: 0,
      errorCount: 0
    },
    queries: {}
  };

  const queryKeys = Object.keys(QUERIES);
  let summaryText = `CompetentNL Knowledge Graph Verkenning\n`;
  summaryText += `${'='.repeat(60)}\n`;
  summaryText += `Endpoint: ${CONFIG.endpoint}\n`;
  summaryText += `Tijdstip: ${results.metadata.timestamp}\n\n`;

  for (let i = 0; i < queryKeys.length; i++) {
    const key = queryKeys[i];
    const { description, query } = QUERIES[key];
    
    process.stdout.write(`\r${progressBar(i + 1, queryKeys.length)} ${key.padEnd(35)}`);

    const startTime = Date.now();
    
    try {
      const data = await executeSparql(query);
      const processed = processResults(data);
      const duration = Date.now() - startTime;

      results.queries[key] = {
        description,
        success: true,
        duration: duration,
        result: processed
      };
      results.metadata.successCount++;

      // Voeg toe aan samenvatting
      summaryText += `\n${'─'.repeat(60)}\n`;
      summaryText += `${key}: ${description}\n`;
      summaryText += `${'─'.repeat(60)}\n`;
      
      if (processed.type === 'boolean') {
        summaryText += `Resultaat: ${processed.value}\n`;
      } else if (processed.rowCount === 0) {
        summaryText += `Geen resultaten\n`;
      } else {
        summaryText += `Aantal rijen: ${processed.rowCount}\n`;
        if (processed.rows.length > 0) {
          summaryText += `Kolommen: ${processed.variables.join(', ')}\n`;
          summaryText += `Eerste resultaten:\n`;
          processed.rows.slice(0, 5).forEach((row, idx) => {
            const values = Object.values(row).map(v => 
              String(v).length > 50 ? String(v).substring(0, 47) + '...' : v
            );
            summaryText += `  ${idx + 1}. ${values.join(' | ')}\n`;
          });
          if (processed.rowCount > 5) {
            summaryText += `  ... en ${processed.rowCount - 5} meer\n`;
          }
        }
      }

    } catch (err) {
      const duration = Date.now() - startTime;
      results.queries[key] = {
        description,
        success: false,
        duration: duration,
        error: err.message
      };
      results.metadata.errorCount++;

      summaryText += `\n${'─'.repeat(60)}\n`;
      summaryText += `${key}: ${description}\n`;
      summaryText += `${'─'.repeat(60)}\n`;
      summaryText += `FOUT: ${err.message}\n`;
    }

    // Wacht even tussen queries
    if (i < queryKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenQueries));
    }
  }

  console.log('\n');
  console.log('─'.repeat(70));

  // Schrijf resultaten naar JSON
  const jsonFile = 'exploration-results.json';
  fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));
  console.log(`✓ Volledige resultaten opgeslagen in: ${jsonFile}`);

  // Schrijf samenvatting naar tekstbestand
  const summaryFile = 'exploration-summary.txt';
  summaryText += `\n${'='.repeat(60)}\n`;
  summaryText += `SAMENVATTING\n`;
  summaryText += `Succesvolle queries: ${results.metadata.successCount}\n`;
  summaryText += `Mislukte queries: ${results.metadata.errorCount}\n`;
  fs.writeFileSync(summaryFile, summaryText);
  console.log(`✓ Leesbare samenvatting opgeslagen in: ${summaryFile}`);

  // Toon samenvatting
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        RESULTATEN                              ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Succesvolle queries: ${String(results.metadata.successCount).padStart(3)}                                    ║`);
  console.log(`║  Mislukte queries:    ${String(results.metadata.errorCount).padStart(3)}                                    ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Toon een paar highlights
  console.log('HIGHLIGHTS:');
  
  const highlights = [
    '1.1_named_graphs',
    '2.1_occupation_count', 
    '3.1_skill_count',
    '4.1_knowledge_count',
    '7.1_edunorm_count'
  ];

  highlights.forEach(key => {
    if (results.queries[key] && results.queries[key].success) {
      const r = results.queries[key].result;
      if (r.rows && r.rows.length > 0) {
        console.log(`  ${QUERIES[key].description}:`);
        r.rows.slice(0, 3).forEach(row => {
          console.log(`    → ${Object.values(row).join(' = ')}`);
        });
      }
    }
  });

  console.log('');
  console.log('Stuur het bestand exploration-results.json naar Claude voor analyse!');
}

// Start
main().catch(err => {
  console.error('Fatale fout:', err);
  process.exit(1);
});
