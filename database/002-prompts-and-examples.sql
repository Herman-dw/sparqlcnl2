-- ============================================================
-- CompetentNL Multi-Prompt System - Prompts & Examples
-- ============================================================
-- Voer uit NA 001-complete-setup.sql
-- ============================================================

USE competentnl_prompts;

-- ============================================================
-- DOMAIN PROMPTS
-- ============================================================

-- OCCUPATION PROMPTS
INSERT INTO domain_prompts (domain_id, prompt_type, prompt_name, prompt_content, prompt_order) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'system', 'Occupation Expert', 
'Je bent een expert in het bevragen van beroepen in de CompetentNL knowledge graph.

BESCHIKBARE DATA:
- 3.263 beroepen met Nederlandse labels en definities
- Elk beroep heeft een prefLabel (officiële naam) en vaak altLabels (synoniemen)
- Beroepen zijn gekoppeld aan vaardigheden, kennisgebieden en taken

BELANGRIJKE CLASSES:
- cnlo:Occupation - Hoofdclass voor beroepen
- cnluwv:Occupation - UWV-specifieke beroepsclass (zelfde instanties)

BELANGRIJKE PREDICATEN:
- skos:prefLabel - Officiële beroepsnaam
- skos:altLabel - Synoniemen
- skos:definition - Beschrijving van het beroep
- cnlo:requiresHATEssential - Essentiële vaardigheden
- cnlo:requiresHATImportant - Belangrijke vaardigheden', 1),

((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'rules', 'Occupation Rules',
'REGELS VOOR BEROEPEN QUERIES:

1. ZOEKEN OP NAAM:
   Gebruik altijd FILTER met CONTAINS en LCASE:
   FILTER(CONTAINS(LCASE(?label), "zoekterm"))

2. VAARDIGHEDEN OPHALEN:
   Voor essentiële: cnlo:requiresHATEssential
   Voor belangrijke: cnlo:requiresHATImportant
   
3. TAKEN OPHALEN:
   cnluwv:isCharacterizedByOccupationTask_Essential', 2);

-- SKILL PROMPTS
INSERT INTO domain_prompts (domain_id, prompt_type, prompt_name, prompt_content, prompt_order) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'system', 'Skill Expert',
'Je bent een expert in het bevragen van vaardigheden (HumanCapabilities) in CompetentNL.

BESCHIKBARE DATA:
- 137 HumanCapabilities in een 3-niveau hiërarchie
- Level 1: Hoofdcategorieën (bijv. "Sociale vaardigheden")
- Level 2: Subcategorieën
- Level 3: Specifieke vaardigheden (bijv. "Presenteren")

STRUCTUUR:
- Notatie format: 100.001.001 (niveau1.niveau2.niveau3)
- RIASEC codes: R(ealistisch), I(nvestigatief), A(rtistiek), S(ociaal), E(nterprising), C(onventioneel)

BELANGRIJKE PREDICATEN:
- skos:prefLabel - Naam van de vaardigheid
- skos:notation - Hiërarchische code
- skos:broader - Parent vaardigheid
- skos:narrower - Child vaardigheden
- cnlo:hasRIASEC - Holland code', 1),

((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'rules', 'Skill Rules',
'REGELS VOOR VAARDIGHEDEN QUERIES:

1. HIËRARCHIE NAVIGATIE:
   - Van algemeen naar specifiek: skos:narrower
   - Van specifiek naar algemeen: skos:broader
   
2. VAARDIGHEDEN VOOR EEN BEROEP:
   ?occupation cnlo:requiresHATEssential ?skill .
   ?skill skos:prefLabel ?skillLabel .', 2);

-- KNOWLEDGE PROMPTS
INSERT INTO domain_prompts (domain_id, prompt_type, prompt_name, prompt_content, prompt_order) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'system', 'Knowledge Expert',
'Je bent een expert in het bevragen van kennisgebieden (KnowledgeAreas) in CompetentNL.

BESCHIKBARE DATA:
- 361 kennisgebieden in een hiërarchische structuur
- Notatie format: 200.XXXX.XX
- Gekoppeld aan ISCED-F (internationale onderwijsclassificatie)

BELANGRIJKE CLASSES:
- cnlo:KnowledgeArea - Hoofdclass voor kennisgebieden

BELANGRIJKE PREDICATEN:
- skos:prefLabel - Naam van het kennisgebied
- skos:notation - Hiërarchische code
- cnlo:linkedToISCEDF - Link naar ISCED-F classificatie', 1);

-- EDUCATION PROMPTS
INSERT INTO domain_prompts (domain_id, prompt_type, prompt_name, prompt_content, prompt_order) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'system', 'Education Expert',
'Je bent een expert in het bevragen van opleidingen in CompetentNL.

BESCHIKBARE DATA:
- 1.856 EducationalNorms (opleidingsstandaarden)
- 447 MBO Kwalificaties (diploma programma''s)
- 1.292 MBO Keuzedelen (optionele modules)

BELANGRIJKE CLASSES:
- cnlo:EducationalNorm - Algemene opleidingsnorm
- ksmo:MboKwalificatie - MBO diploma kwalificatie
- ksmo:MboKeuzedeel - MBO keuzedeel

BELANGRIJKE PREDICATEN:
- skos:prefLabel - Naam van de opleiding
- cnlo:prescribesHATEssential - Vaardigheden die worden aangeleerd', 1);

-- TASK PROMPTS
INSERT INTO domain_prompts (domain_id, prompt_type, prompt_name, prompt_content, prompt_order) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'system', 'Task Expert',
'Je bent een expert in het bevragen van beroepstaken (OccupationTasks) in CompetentNL.

BESCHIKBARE DATA:
- 4.613 unieke taken
- Taken zijn gekoppeld aan beroepen als Essential of Optional

BELANGRIJKE CLASSES:
- cnluwv:OccupationTask - Een concrete taak/werkzaamheid

BELANGRIJKE PREDICATEN:
- skos:prefLabel - Beschrijving van de taak
- cnluwv:isCharacterizedByOccupationTask_Essential - Essentiële taak voor beroep
- cnluwv:isCharacterizedByOccupationTask_Optional - Optionele taak voor beroep', 1);

-- COMPARISON PROMPTS
INSERT INTO domain_prompts (domain_id, prompt_type, prompt_name, prompt_content, prompt_order) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'), 'system', 'Comparison Expert',
'Je bent een expert in het vergelijken van entiteiten in CompetentNL.

VERGELIJKINGSTYPEN:
1. Beroep vs Beroep - Gemeenschappelijke/verschillende vaardigheden
2. Vaardigheid vs Vaardigheid - Gerelateerde beroepen
3. Opleiding vs Beroep - Skill gaps

TECHNIEKEN:
- Dubbele patterns voor gemeenschappelijke items
- FILTER NOT EXISTS voor verschillen', 1);

-- ============================================================
-- SCHEMA ELEMENTEN
-- ============================================================

-- OCCUPATION schema elements
INSERT INTO domain_schema_elements (domain_id, element_type, element_uri, prefix_short, local_name, label_nl, description_nl, importance, instance_count) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'class', 'https://linkeddata.competentnl.nl/def/competentnl#Occupation', 'cnlo:', 'Occupation', 'Beroep', 'Hoofdclass voor alle beroepen', 'essential', 3263),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'predicate', 'http://www.w3.org/2004/02/skos/core#prefLabel', 'skos:', 'prefLabel', 'Voorkeurslabel', 'Officiële naam van het beroep', 'essential', NULL),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'predicate', 'http://www.w3.org/2004/02/skos/core#definition', 'skos:', 'definition', 'Definitie', 'Beschrijving van het beroep', 'important', NULL),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'predicate', 'https://linkeddata.competentnl.nl/def/competentnl#requiresHATEssential', 'cnlo:', 'requiresHATEssential', 'Vereist essentieel', 'Essentiële vaardigheden voor het beroep', 'essential', NULL);

-- SKILL schema elements
INSERT INTO domain_schema_elements (domain_id, element_type, element_uri, prefix_short, local_name, label_nl, description_nl, importance, instance_count) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'class', 'https://linkeddata.competentnl.nl/def/competentnl#HumanCapability', 'cnlo:', 'HumanCapability', 'Menselijke vaardigheid', 'Vaardigheden en competenties', 'essential', 137),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'predicate', 'http://www.w3.org/2004/02/skos/core#prefLabel', 'skos:', 'prefLabel', 'Voorkeurslabel', 'Naam van de vaardigheid', 'essential', NULL),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'predicate', 'http://www.w3.org/2004/02/skos/core#broader', 'skos:', 'broader', 'Breder', 'Parent in hiërarchie', 'important', NULL),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'predicate', 'https://linkeddata.competentnl.nl/def/competentnl#hasRIASEC', 'cnlo:', 'hasRIASEC', 'Heeft RIASEC', 'Holland code (R/I/A/S/E/C)', 'optional', NULL);

-- KNOWLEDGE schema elements
INSERT INTO domain_schema_elements (domain_id, element_type, element_uri, prefix_short, local_name, label_nl, description_nl, importance, instance_count) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'class', 'https://linkeddata.competentnl.nl/def/competentnl#KnowledgeArea', 'cnlo:', 'KnowledgeArea', 'Kennisgebied', 'Vakgebieden en expertises', 'essential', 361),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'predicate', 'http://www.w3.org/2004/02/skos/core#notation', 'skos:', 'notation', 'Notatie', 'Code zoals 200.0114.01', 'important', NULL);

-- EDUCATION schema elements
INSERT INTO domain_schema_elements (domain_id, element_type, element_uri, prefix_short, local_name, label_nl, description_nl, importance, instance_count) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'class', 'https://linkeddata.competentnl.nl/def/competentnl#EducationalNorm', 'cnlo:', 'EducationalNorm', 'Opleidingsnorm', 'Officiële opleidingsstandaarden', 'essential', 1856),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'class', 'https://data.s-bb.nl/ksm/ont/ksmo#MboKwalificatie', 'ksmo:', 'MboKwalificatie', 'MBO Kwalificatie', 'MBO diploma kwalificaties', 'essential', 447),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'predicate', 'https://linkeddata.competentnl.nl/def/competentnl#prescribesHATEssential', 'cnlo:', 'prescribesHATEssential', 'Schrijft essentieel voor', 'Vaardigheden die de opleiding leert', 'essential', NULL);

-- TASK schema elements
INSERT INTO domain_schema_elements (domain_id, element_type, element_uri, prefix_short, local_name, label_nl, description_nl, importance, instance_count) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'class', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#OccupationTask', 'cnluwv:', 'OccupationTask', 'Beroepstaak', 'Concrete werkzaamheden', 'essential', 4613),
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationTask_Essential', 'cnluwv:', 'isCharacterizedByOccupationTask_Essential', 'Heeft essentiële taak', 'Koppeling beroep naar essentiële taak', 'essential', NULL);

-- ============================================================
-- VOORBEELD QUERIES
-- ============================================================

-- OCCUPATION examples
INSERT INTO domain_example_queries (domain_id, question_nl, sparql_query, query_pattern, difficulty, is_verified) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'),
'Zoek beroepen met software in de naam',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?label ?definition
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  OPTIONAL { ?occupation skos:definition ?definition }
  FILTER(CONTAINS(LCASE(?label), "software"))
}
LIMIT 50',
'search', 'basic', TRUE),

((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'),
'Toon alle beroepen',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?occupation ?label
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
}
LIMIT 50',
'list', 'basic', TRUE),

((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'),
'Hoeveel beroepen zijn er in totaal?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
SELECT (COUNT(DISTINCT ?occupation) AS ?aantal)
WHERE {
  ?occupation a cnlo:Occupation .
}',
'count', 'basic', TRUE);

-- SKILL examples
INSERT INTO domain_example_queries (domain_id, question_nl, sparql_query, query_pattern, difficulty, is_verified) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'),
'Toon alle vaardigheden',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?skill ?label ?notation
WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  OPTIONAL { ?skill skos:notation ?notation }
}
ORDER BY ?notation
LIMIT 50',
'list', 'basic', TRUE),

((SELECT id FROM prompt_domains WHERE domain_key = 'skill'),
'Welke vaardigheden zijn nodig voor software engineer?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?skill ?skillLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "software engineer"))
}
LIMIT 50',
'search', 'intermediate', TRUE),

((SELECT id FROM prompt_domains WHERE domain_key = 'skill'),
'Welke vaardigheden heeft een kapper nodig?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?skill ?skillLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "kapper"))
}
LIMIT 50',
'search', 'intermediate', TRUE);

-- KNOWLEDGE examples
INSERT INTO domain_example_queries (domain_id, question_nl, sparql_query, query_pattern, difficulty, is_verified) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'),
'Toon alle kennisgebieden',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?area ?label ?notation
WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:notation ?notation }
}
ORDER BY ?notation
LIMIT 50',
'list', 'basic', TRUE);

-- EDUCATION examples
INSERT INTO domain_example_queries (domain_id, question_nl, sparql_query, query_pattern, difficulty, is_verified) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'education'),
'Toon alle MBO kwalificaties',
'PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?kwalificatie ?label
WHERE {
  ?kwalificatie a ksmo:MboKwalificatie ;
                skos:prefLabel ?label .
}
LIMIT 50',
'list', 'basic', TRUE);

-- TASK examples
INSERT INTO domain_example_queries (domain_id, question_nl, sparql_query, query_pattern, difficulty, is_verified) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'task'),
'Wat zijn de taken van een verpleegkundige?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?task ?taskLabel ?occLabel
WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel ;
              cnluwv:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "verpleeg"))
}
LIMIT 50',
'search', 'intermediate', TRUE);

-- COMPARISON examples
INSERT INTO domain_example_queries (domain_id, question_nl, sparql_query, query_pattern, difficulty, is_verified) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'),
'Vergelijk de vaardigheden van kapper en schoonheidsspecialist',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?skill ?skillLabel ?occ1Label ?occ2Label
WHERE {
  ?occ1 a cnlo:Occupation ;
        skos:prefLabel ?occ1Label ;
        cnlo:requiresHATEssential ?skill .
  ?occ2 a cnlo:Occupation ;
        skos:prefLabel ?occ2Label ;
        cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(CONTAINS(LCASE(?occ1Label), "kapper"))
  FILTER(CONTAINS(LCASE(?occ2Label), "schoonheidsspecialist"))
  FILTER(?occ1 != ?occ2)
}
LIMIT 50',
'compare', 'advanced', TRUE);

-- ============================================================
-- KLAAR!
-- ============================================================
SELECT 'Prompts en examples geladen!' as status;
SELECT d.domain_name, COUNT(deq.id) as examples 
FROM prompt_domains d 
LEFT JOIN domain_example_queries deq ON d.id = deq.domain_id 
GROUP BY d.id;
