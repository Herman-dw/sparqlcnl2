-- ============================================================
-- CompetentNL: Voorbeeldvragen toevoegen
-- ============================================================
-- INSTRUCTIES:
-- 1. Open phpMyAdmin
-- 2. Klik links op database: competentnl_rag
-- 3. Klik bovenaan op tabblad "SQL"
-- 4. Kopieer ALLES hieronder en plak het
-- 5. Klik "Starten" of "Go"
-- ============================================================

-- Stap 1: Voeg domain kolom toe als die niet bestaat
ALTER TABLE question_embeddings ADD COLUMN IF NOT EXISTS domain VARCHAR(50) DEFAULT NULL;

-- Stap 2: Leeg de tabel
TRUNCATE TABLE question_embeddings;

-- Stap 3: Voeg 14 werkende voorbeeldvragen toe
INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Welke vaardigheden hebben RIASEC code R?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skillLabel WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC "R" ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?skillLabel
LIMIT 50',
'skill', 'skill');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon alle 137 vaardigheden in de taxonomie',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 150',
'skill', 'skill');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Hoeveel vaardigheden zijn er per RIASEC letter?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT ?riasec (COUNT(?skill) AS ?aantal) WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC ?riasecValue .
  BIND(UCASE(SUBSTR(STR(?riasecValue), 1, 1)) AS ?riasec)
  FILTER(?riasec IN ("R","I","A","S","E","C"))
}
GROUP BY ?riasec
ORDER BY ?riasec',
'count', 'skill');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Wat zijn de taken van een kapper?',
'PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
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
LIMIT 50',
'task', 'task');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Wat zijn de werkomstandigheden van een piloot?',
'PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
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
LIMIT 50',
'occupation', 'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Op welke manier komt het beroep docent mbo overeen met teamleider jeugdzorg?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
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
LIMIT 50',
'comparison', 'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Wat zijn de taken en vaardigheden van een tandartsassistent?',
'PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
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
LIMIT 100',
'task', 'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Welke vaardigheden heeft een loodgieter?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?skillLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "loodgieter") || CONTAINS(LCASE(?occLabel), "installatiemonteur"))
  ?occupation cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
ORDER BY ?skillLabel
LIMIT 50',
'skill', 'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Hoeveel beroepen zijn er in de database?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT (COUNT(DISTINCT ?occupation) AS ?aantalBeroepen) WHERE {
  ?occupation a cnlo:Occupation .
}
LIMIT 1',
'count', 'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon 30 MBO kwalificaties',
'PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie ;
                skos:prefLabel ?naam .
  FILTER(LANG(?naam) = "nl")
}
ORDER BY ?naam
LIMIT 30',
'education', 'education');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon 30 kennisgebieden',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 30',
'knowledge', 'knowledge');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Welke taken heeft een timmerman?',
'PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taskLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(CONTAINS(LCASE(?occLabel), "timmerman"))
  ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = "nl")
}
ORDER BY ?taskLabel
LIMIT 30',
'task', 'task');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon 20 software beroepen',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
  FILTER(CONTAINS(LCASE(?label), "software"))
}
ORDER BY ?label
LIMIT 20',
'occupation', 'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon 25 beroepen alfabetisch',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?label
LIMIT 25',
'occupation', 'occupation');

-- Stap 4: Controleer het resultaat
SELECT id, question, category, domain FROM question_embeddings ORDER BY id;
SELECT COUNT(*) as totaal FROM question_embeddings;
