-- ============================================================
-- CompetentNL Schema Concepts - JSON formaat
-- ============================================================

USE competentnl_rag;

-- ============================================================
-- KLASSEN toevoegen
-- ============================================================

INSERT IGNORE INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, instance_count, domain_hint, importance) VALUES
('class', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#OccupationTask', 'cnluwvo', 'OccupationTask', 
 'Beroepstaak', 'Occupation Task', 
 'Een taak/werkzaamheid die bij een beroep hoort. Kan essentieel of optioneel zijn.',
 '["taak", "taken", "werkzaamheid", "werkzaamheden", "activiteit", "activiteiten", "bezigheid", "opdracht"]', 
 4613, 'task', 'essential'),

('class', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#OccupationCircumstance', 'cnluwvo', 'OccupationCircumstance', 
 'Werkomstandigheid', 'Occupation Circumstance', 
 'Een werkomstandigheid/werkconditie bij een beroep.',
 '["werkomstandigheid", "werkomstandigheden", "werkconditie", "werkcondities", "arbeidsomstandigheden", "werkomgeving", "werkplek"]', 
 15, 'workcondition', 'essential'),

('class', 'https://data.s-bb.nl/ksm/ont/ksmo#MboKwalificatie', 'ksmo', 'MboKwalificatie', 
 'MBO Kwalificatie', 'MBO Qualification', 
 'Een MBO beroepskwalificatie uit het KSM.',
 '["mbo", "kwalificatie", "crebo", "beroepsopleiding", "vakdiploma"]', 
 447, 'education', 'important'),

('class', 'https://data.s-bb.nl/ksm/ont/ksmo#MboKeuzedeel', 'ksmo', 'MboKeuzedeel', 
 'MBO Keuzedeel', 'MBO Elective', 
 'Een keuzedeel binnen het MBO onderwijs.',
 '["keuzedeel", "keuzevak", "module", "specialisatie"]', 
 1292, 'education', 'important'),

('class', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#TaxonomyItemKernberoep', 'cnluwvo', 'TaxonomyItemKernberoep', 
 'Kernberoep', 'Core Occupation', 
 'Een kernberoep in de beroepenclassificatie.',
 '["kernberoep", "kernberoepen", "beroepsgroep", "beroepscategorie"]', 
 774, 'taxonomy', 'important');

SELECT 'Klassen toegevoegd' as status;

-- ============================================================
-- PREDICATEN voor VAARDIGHEDEN
-- ============================================================

INSERT IGNORE INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, instance_count, domain_hint, usage_example, importance) VALUES
('predicate', 'https://linkeddata.competentnl.nl/def/competentnl#requiresHATSomewhat', 'cnlo', 'requiresHATSomewhat', 
 'Vereist enigszins (vaardigheid)', 'Requires HAT Somewhat', 
 'Koppelt een beroep aan een minder belangrijke vaardigheid.',
 '["nice-to-have", "aanvullende skills", "extra competenties"]', 
 82518, 'skill', 
 '?occupation cnlo:requiresHATSomewhat ?skill .', 'important'),

('predicate', 'https://linkeddata.competentnl.nl/def/competentnl#prescribesHATEssential', 'cnlo', 'prescribesHATEssential', 
 'Schrijft voor essentieel (opleiding)', 'Prescribes HAT Essential', 
 'Koppelt een opleiding aan een essentiele vaardigheid.',
 '["leerdoel", "eindterm", "opleidingsdoel", "curriculum"]', 
 20114, 'education', 
 '?education cnlo:prescribesHATEssential ?skill .', 'essential');

SELECT 'Vaardigheid predicaten toegevoegd' as status;

-- ============================================================
-- PREDICATEN voor TAKEN
-- ============================================================

INSERT IGNORE INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, instance_count, domain_hint, usage_example, importance) VALUES
('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationTask_Essential', 'cnluwvo', 'isCharacterizedByOccupationTask_Essential', 
 'Heeft essentiele taak', 'Is Characterized By Essential Task', 
 'Koppelt een beroep aan een essentiele (kern)taak.',
 '["essentiele taken", "kerntaken", "hoofdtaken", "primaire werkzaamheden", "verplichte taken"]', 
 61195, 'task', 
 '?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .', 'essential'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationTask_Optional', 'cnluwvo', 'isCharacterizedByOccupationTask_Optional', 
 'Heeft optionele taak', 'Is Characterized By Optional Task', 
 'Koppelt een beroep aan een optionele/bijkomende taak.',
 '["optionele taken", "bijkomende taken", "secundaire werkzaamheden", "extra taken"]', 
 19658, 'task', 
 '?occupation cnluwvo:isCharacterizedByOccupationTask_Optional ?task .', 'essential');

SELECT 'Taak predicaten toegevoegd' as status;

-- ============================================================
-- PREDICATEN voor WERKOMSTANDIGHEDEN
-- ============================================================

INSERT IGNORE INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, instance_count, domain_hint, usage_example, importance) VALUES
('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#hasWorkCondition', 'cnluwvo', 'hasWorkCondition', 
 'Heeft werkomstandigheid', 'Has Work Condition', 
 'Algemeen predicaat voor werkomstandigheden bij een beroep.',
 '["werkomstandigheden", "werkcondities", "arbeidsomstandigheden", "werkplek", "werkomgeving"]', 
 NULL, 'workcondition', 
 '?occupation cnluwvo:hasWorkCondition ?condition .', 'essential'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationCircumstance_StronglyRelevant', 'cnluwvo', 'isCharacterizedByOccupationCircumstance_StronglyRelevant', 
 'Werkomstandigheid: sterk relevant', 'Circumstance: Strongly Relevant', 
 'De werkomstandigheid is zeer kenmerkend voor dit beroep.',
 '["typische werkomstandigheden", "kenmerkende condities"]', 
 7045, 'workcondition', 
 '?occupation cnluwvo:isCharacterizedByOccupationCircumstance_StronglyRelevant ?circumstance .', 'important'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationCircumstance_ReasonablyRelevant', 'cnluwvo', 'isCharacterizedByOccupationCircumstance_ReasonablyRelevant', 
 'Werkomstandigheid: redelijk relevant', 'Circumstance: Reasonably Relevant', 
 'De werkomstandigheid komt regelmatig voor bij dit beroep.',
 '["regelmatige werkomstandigheden", "vaak voorkomend"]', 
 16380, 'workcondition', 
 '?occupation cnluwvo:isCharacterizedByOccupationCircumstance_ReasonablyRelevant ?circumstance .', 'important'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationCircumstance_BarelyRelevant', 'cnluwvo', 'isCharacterizedByOccupationCircumstance_BarelyRelevant', 
 'Werkomstandigheid: nauwelijks relevant', 'Circumstance: Barely Relevant', 
 'De werkomstandigheid komt zelden voor bij dit beroep.',
 '["zeldzame werkomstandigheden", "incidenteel"]', 
 14873, 'workcondition', 
 '?occupation cnluwvo:isCharacterizedByOccupationCircumstance_BarelyRelevant ?circumstance .', 'useful'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationCircumstance_NotRelevant', 'cnluwvo', 'isCharacterizedByOccupationCircumstance_NotRelevant', 
 'Werkomstandigheid: niet relevant', 'Circumstance: Not Relevant', 
 'De werkomstandigheid is niet van toepassing.',
 '["niet van toepassing", "uitgesloten"]', 
 7370, 'workcondition', 
 '?occupation cnluwvo:isCharacterizedByOccupationCircumstance_NotRelevant ?circumstance .', 'useful'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationCircumstance_Yes', 'cnluwvo', 'isCharacterizedByOccupationCircumstance_Yes', 
 'Werkomstandigheid: ja', 'Circumstance: Yes', 
 'De werkomstandigheid is aanwezig (binair).',
 '["aanwezig", "van toepassing"]', 
 1127, 'workcondition', 
 '?occupation cnluwvo:isCharacterizedByOccupationCircumstance_Yes ?circumstance .', 'useful'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#isCharacterizedByOccupationCircumstance_No', 'cnluwvo', 'isCharacterizedByOccupationCircumstance_No', 
 'Werkomstandigheid: nee', 'Circumstance: No', 
 'De werkomstandigheid is niet aanwezig (binair).',
 '["niet aanwezig", "niet van toepassing"]', 
 2085, 'workcondition', 
 '?occupation cnluwvo:isCharacterizedByOccupationCircumstance_No ?circumstance .', 'useful');

SELECT 'Werkomstandigheden predicaten toegevoegd' as status;

-- ============================================================
-- TAXONOMIE en RIASEC predicaten
-- ============================================================

INSERT IGNORE INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, instance_count, domain_hint, usage_example, importance) VALUES
('predicate', 'https://linkeddata.competentnl.nl/def/competentnl#hasRIASEC', 'cnlo', 'hasRIASEC', 
 'Heeft RIASEC code', 'Has RIASEC Code', 
 'Koppelt een vaardigheid aan een RIASEC/Holland code letter.',
 '["riasec", "holland code", "persoonlijkheidstype", "interessetype", "beroepskeuze"]', 
 221, 'taxonomy', 
 '?skill cnlo:hasRIASEC ?riasecLetter .', 'essential'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#specialization', 'cnluwvo', 'specialization', 
 'Verbijzondering', 'Specialization', 
 'Koppelt een beroep aan een verbijzondering/specialisatie.',
 '["specialisatie", "verbijzondering", "variant"]', 
 21381, 'occupation', 
 '?occupation cnluwvo:specialization ?specName .', 'important'),

('predicate', 'https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#broadMatchTaxonomyItemKernberoep', 'cnluwvo', 'broadMatchTaxonomyItemKernberoep', 
 'Behoort tot kernberoep', 'Broad Match Core Occupation', 
 'Koppelt een specifiek beroep aan een kernberoep categorie.',
 '["kernberoep", "beroepsgroep", "classificatie"]', 
 3263, 'taxonomy', 
 '?occupation cnluwvo:broadMatchTaxonomyItemKernberoep ?kernberoep .', 'important');

SELECT 'Taxonomie predicaten toegevoegd' as status;

-- ============================================================
-- SKOS predicaten
-- ============================================================

INSERT IGNORE INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, instance_count, domain_hint, usage_example, importance) VALUES
('predicate', 'http://www.w3.org/2004/02/skos/core#prefLabel', 'skos', 'prefLabel', 
 'Voorkeursbenaming', 'Preferred Label', 
 'De officiele naam van een concept.',
 '["naam", "label", "benaming", "titel"]', 
 46169, 'general', 
 '?concept skos:prefLabel ?label . FILTER(LANG(?label) = "nl")', 'essential'),

('predicate', 'http://www.w3.org/2004/02/skos/core#altLabel', 'skos', 'altLabel', 
 'Alternatieve naam', 'Alternative Label', 
 'Een synoniem of alternatieve benaming.',
 '["synoniem", "alias", "ook bekend als"]', 
 100624, 'general', 
 '?concept skos:altLabel ?altNaam .', 'important'),

('predicate', 'http://www.w3.org/2004/02/skos/core#broader', 'skos', 'broader', 
 'Breder concept', 'Broader Concept', 
 'Koppelt aan een hierarchisch hoger concept.',
 '["parent", "bovenliggend", "categorie"]', 
 21301, 'taxonomy', 
 '?concept skos:broader ?parent .', 'important'),

('predicate', 'http://www.w3.org/2004/02/skos/core#narrower', 'skos', 'narrower', 
 'Smaller concept', 'Narrower Concept', 
 'Koppelt aan een hierarchisch lager concept.',
 '["child", "onderliggend", "subcategorie"]', 
 NULL, 'taxonomy', 
 '?concept skos:narrower ?child .', 'important'),

('predicate', 'http://www.w3.org/2004/02/skos/core#definition', 'skos', 'definition', 
 'Definitie', 'Definition', 
 'Een tekstuele beschrijving/definitie.',
 '["beschrijving", "omschrijving", "uitleg"]', 
 6025, 'general', 
 '?concept skos:definition ?def .', 'important'),

('predicate', 'http://www.w3.org/2004/02/skos/core#notation', 'skos', 'notation', 
 'Notatie/code', 'Notation', 
 'Een code of notatie voor het concept.',
 '["code", "nummer", "codering"]', 
 2981, 'taxonomy', 
 '?concept skos:notation ?code .', 'useful');

SELECT 'SKOS predicaten toegevoegd' as status;

-- ============================================================
-- Helper zoektermen
-- ============================================================

INSERT IGNORE INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, domain_hint, importance) VALUES
('property', 'helper:task-search', 'helper', 'task-search', 
 'Taken zoeken', 'Task Search', 
 'Helper voor taken. Gebruik cnluwvo:isCharacterizedByOccupationTask_Essential of _Optional.',
 '["wat doet", "werkzaamheden", "activiteiten", "dagelijkse taken", "beroepstaken"]', 
 'task', 'essential'),

('property', 'helper:workcondition-search', 'helper', 'workcondition-search', 
 'Werkomstandigheden zoeken', 'Work Condition Search', 
 'Helper voor werkomstandigheden.',
 '["waar werkt", "werkplek", "werktijden", "fysieke omstandigheden", "kantoor", "buiten werken"]', 
 'workcondition', 'essential'),

('property', 'helper:skill-search', 'helper', 'skill-search', 
 'Vaardigheden zoeken', 'Skill Search', 
 'Helper voor vaardigheden.',
 '["kan", "kunnen", "skills", "competenties", "bekwaamheden", "eisen", "vereisten"]', 
 'skill', 'essential'),

('property', 'helper:riasec-search', 'helper', 'riasec-search', 
 'RIASEC zoeken', 'RIASEC Search', 
 'Helper voor RIASEC/Holland code.',
 '["holland code", "persoonlijkheidstype", "beroepskeuzetest"]', 
 'taxonomy', 'important');

SELECT 'Helper zoektermen toegevoegd' as status;

-- ============================================================
-- Update bestaande records met domain_hint
-- ============================================================

UPDATE schema_concepts SET domain_hint = 'occupation', importance = 'essential'
WHERE uri LIKE '%Occupation%' AND concept_type = 'class' AND domain_hint IS NULL;

UPDATE schema_concepts SET domain_hint = 'skill', importance = 'essential'
WHERE uri LIKE '%Capability%' AND domain_hint IS NULL;

UPDATE schema_concepts SET domain_hint = 'skill', importance = 'essential'
WHERE uri LIKE '%requiresHAT%' AND domain_hint IS NULL;

UPDATE schema_concepts SET domain_hint = 'knowledge', importance = 'essential'
WHERE uri LIKE '%KnowledgeArea%' AND domain_hint IS NULL;

UPDATE schema_concepts SET domain_hint = 'education', importance = 'essential'
WHERE uri LIKE '%Educational%' AND domain_hint IS NULL;

SELECT 'Bestaande records geupdate' as status;

-- ============================================================
-- Keywords voor prompts database
-- ============================================================

USE competentnl_prompts;

INSERT IGNORE INTO prompt_domains (domain_key, domain_name, description, icon, priority) VALUES
('task', 'Taken', 'Vragen over beroepstaken en werkzaamheden', '?', 75),
('workcondition', 'Werkomstandigheden', 'Vragen over werkomstandigheden', '?', 65);

INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'taken', 1.2, FALSE FROM prompt_domains WHERE domain_key = 'task';
INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'taak', 1.0, FALSE FROM prompt_domains WHERE domain_key = 'task';
INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'werkzaamheden', 1.0, FALSE FROM prompt_domains WHERE domain_key = 'task';
INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'kerntaken', 1.5, TRUE FROM prompt_domains WHERE domain_key = 'task';

INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'werkomstandigheden', 1.5, TRUE FROM prompt_domains WHERE domain_key = 'workcondition';
INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'werkcondities', 1.5, TRUE FROM prompt_domains WHERE domain_key = 'workcondition';
INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'werkomgeving', 1.0, FALSE FROM prompt_domains WHERE domain_key = 'workcondition';
INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) 
SELECT id, 'werkplek', 0.9, FALSE FROM prompt_domains WHERE domain_key = 'workcondition';

SELECT 'Keywords toegevoegd' as status;

-- ============================================================
-- Verificatie
-- ============================================================

USE competentnl_rag;

SELECT 'RESULTAAT:' as info;

SELECT COUNT(*) as totaal_concepten FROM schema_concepts;

SELECT concept_type, COUNT(*) as aantal FROM schema_concepts GROUP BY concept_type ORDER BY aantal DESC;

SELECT COALESCE(domain_hint, 'NULL') as domein, COUNT(*) as aantal 
FROM schema_concepts GROUP BY domain_hint ORDER BY aantal DESC;

SELECT 'Taken en werkomstandigheden:' as info;
SELECT label_nl, concept_type, domain_hint 
FROM schema_concepts 
WHERE domain_hint IN ('task', 'workcondition')
ORDER BY domain_hint, concept_type;

SELECT 'KLAAR!' as status;
