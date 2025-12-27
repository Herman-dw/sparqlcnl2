-- CompetentNL RAG Database Schema
-- ================================
-- MariaDB 10.5+ compatible (met JSON support)
-- Voor vector search gebruiken we cosine similarity op JSON arrays
--
-- Installatie:
-- 1. mysql -u root -p < database/schema.sql
-- 2. Of importeer via phpMyAdmin/HeidiSQL

CREATE DATABASE IF NOT EXISTS competentnl_rag
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE competentnl_rag;

-- ============================================
-- Tabel: question_embeddings
-- Slaat vragen op met hun embeddings voor RAG
-- ============================================
CREATE TABLE IF NOT EXISTS question_embeddings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- De originele vraag in natuurlijke taal
  question TEXT NOT NULL,
  
  -- De gegenereerde SPARQL query
  sparql_query TEXT NOT NULL,
  
  -- Vector embedding als JSON array (768 dimensies voor all-MiniLM-L6-v2)
  embedding JSON NOT NULL,
  
  -- Metadata
  category ENUM('occupation', 'capability', 'knowledge', 'education', 'task', 'comparison', 'count', 'general') DEFAULT 'general',
  
  -- Kwaliteitsindicatoren
  feedback_score FLOAT DEFAULT 0,  -- Gemiddelde feedback (-1 tot 1)
  usage_count INT DEFAULT 0,       -- Hoe vaak gebruikt als voorbeeld
  success_rate FLOAT DEFAULT 1.0,  -- Percentage succesvolle queries
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexen
  INDEX idx_category (category),
  INDEX idx_feedback (feedback_score),
  INDEX idx_usage (usage_count),
  
  -- Full-text search voor fallback
  FULLTEXT INDEX ft_question (question)
) ENGINE=InnoDB;

-- ============================================
-- Tabel: schema_concepts
-- Slaat schema concepten op met embeddings
-- ============================================
CREATE TABLE IF NOT EXISTS schema_concepts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Concept identificatie
  concept_type ENUM('class', 'property', 'prefix') NOT NULL,
  uri VARCHAR(500) NOT NULL,
  prefix VARCHAR(50),           -- bijv. 'cnlo'
  local_name VARCHAR(200),      -- bijv. 'Occupation'
  
  -- Labels en beschrijvingen
  label_nl VARCHAR(500),
  label_en VARCHAR(500),
  description_nl TEXT,
  description_en TEXT,
  
  -- Synoniemen als JSON array
  synonyms JSON,                -- ["beroep", "functie", "job"]
  
  -- Embedding van de beschrijving
  embedding JSON,
  
  -- Relaties (voor classes)
  example_values JSON,          -- ["Kapper", "Verpleegkundige"]
  related_properties JSON,      -- ["skos:prefLabel", "cnlo:requiresHATEssential"]
  
  -- Statistieken uit de knowledge graph
  instance_count INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE INDEX idx_uri (uri(255)),
  INDEX idx_type (concept_type),
  INDEX idx_prefix (prefix),
  FULLTEXT INDEX ft_labels (label_nl, label_en, description_nl)
) ENGINE=InnoDB;

-- ============================================
-- Tabel: query_logs
-- Logt alle queries voor analyse en verbetering
-- ============================================
CREATE TABLE IF NOT EXISTS query_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Session tracking
  session_id VARCHAR(100),
  
  -- De vraag en response
  user_question TEXT NOT NULL,
  generated_sparql TEXT,
  
  -- Resultaten
  result_count INT,
  execution_time_ms INT,
  had_error BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  
  -- RAG context
  similar_questions_used JSON,   -- IDs van gebruikte voorbeelden
  similarity_scores JSON,        -- Similarity scores
  
  -- Feedback
  user_feedback ENUM('like', 'dislike', 'none') DEFAULT 'none',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_session (session_id),
  INDEX idx_feedback (user_feedback),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================
-- Tabel: feedback_details
-- Gedetailleerde feedback voor verbetering
-- ============================================
CREATE TABLE IF NOT EXISTS feedback_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  query_log_id INT,
  question_embedding_id INT,
  
  feedback_type ENUM('like', 'dislike') NOT NULL,
  feedback_reason TEXT,          -- Optionele toelichting
  
  -- Voor learning: wat was er mis/goed?
  sparql_was_correct BOOLEAN,
  results_were_relevant BOOLEAN,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (query_log_id) REFERENCES query_logs(id) ON DELETE SET NULL,
  FOREIGN KEY (question_embedding_id) REFERENCES question_embeddings(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================
-- Views voor analyse
-- ============================================

-- Top performing voorbeelden
CREATE OR REPLACE VIEW v_top_examples AS
SELECT 
  id,
  question,
  category,
  feedback_score,
  usage_count,
  success_rate,
  (feedback_score * 0.4 + success_rate * 0.4 + LEAST(usage_count/100, 0.2)) as quality_score
FROM question_embeddings
WHERE feedback_score >= 0
ORDER BY quality_score DESC;

-- Problematische queries
CREATE OR REPLACE VIEW v_problem_queries AS
SELECT 
  ql.user_question,
  ql.generated_sparql,
  ql.error_message,
  COUNT(*) as occurrence_count
FROM query_logs ql
WHERE ql.had_error = TRUE OR ql.user_feedback = 'dislike'
GROUP BY ql.user_question, ql.generated_sparql, ql.error_message
ORDER BY occurrence_count DESC;

-- ============================================
-- Initiële data: basis voorbeelden
-- ============================================

-- Deze worden later gevuld via het seed script met echte embeddings
INSERT INTO question_embeddings (question, sparql_query, category, embedding) VALUES
('Welke vaardigheden heeft een kapper nodig?', 
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT DISTINCT ?occupation ?occLabel ?capability ?capLabel\nWHERE {\n  ?occupation a cnlo:Occupation ;\n              skos:prefLabel ?occLabel ;\n              cnlo:requiresHATEssential ?capability .\n  ?capability skos:prefLabel ?capLabel .\n  FILTER(CONTAINS(LCASE(?occLabel), "kapper"))\n}\nLIMIT 50',
 'capability',
 '[]'),  -- Placeholder, wordt gevuld door seed script

('Toon alle beroepen',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT DISTINCT ?occupation ?label\nWHERE {\n  ?occupation a cnlo:Occupation ;\n              skos:prefLabel ?label .\n}\nLIMIT 50',
 'occupation',
 '[]'),

('Toon alle human capabilities',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT DISTINCT ?capability ?label ?definition\nWHERE {\n  ?capability a cnlo:HumanCapability ;\n              skos:prefLabel ?label .\n  OPTIONAL { ?capability skos:definition ?definition }\n}\nLIMIT 50',
 'capability',
 '[]'),

('Welke taken horen bij een verpleegkundige?',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nPREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT DISTINCT ?occupation ?occLabel ?task ?taskLabel\nWHERE {\n  ?occupation a cnlo:Occupation ;\n              skos:prefLabel ?occLabel ;\n              cnluwv:isCharacterizedByOccupationTask_Essential ?task .\n  ?task skos:prefLabel ?taskLabel .\n  FILTER(CONTAINS(LCASE(?occLabel), "verpleeg"))\n}\nLIMIT 50',
 'task',
 '[]'),

('Hoeveel beroepen zijn er?',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nSELECT (COUNT(DISTINCT ?occupation) AS ?aantal)\nWHERE {\n  ?occupation a cnlo:Occupation .\n}',
 'count',
 '[]'),

('Vergelijk kapper en schoonheidsspecialist',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT DISTINCT ?capability ?capLabel ?occ1Label ?occ2Label\nWHERE {\n  ?occ1 a cnlo:Occupation ;\n        skos:prefLabel ?occ1Label ;\n        cnlo:requiresHATEssential ?capability .\n  ?occ2 a cnlo:Occupation ;\n        skos:prefLabel ?occ2Label ;\n        cnlo:requiresHATEssential ?capability .\n  ?capability skos:prefLabel ?capLabel .\n  FILTER(CONTAINS(LCASE(?occ1Label), "kapper"))\n  FILTER(CONTAINS(LCASE(?occ2Label), "schoonheidsspecialist"))\n  FILTER(?occ1 != ?occ2)\n}\nLIMIT 50',
 'comparison',
 '[]'),

('Toon alle kennisgebieden',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT DISTINCT ?area ?label ?definition\nWHERE {\n  ?area a cnlo:KnowledgeArea ;\n        skos:prefLabel ?label .\n  OPTIONAL { ?area skos:definition ?definition }\n}\nLIMIT 50',
 'knowledge',
 '[]'),

('Welke beroepen vereisen leidinggeven?',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT DISTINCT ?occupation ?occLabel\nWHERE {\n  ?capability a cnlo:HumanCapability ;\n              skos:prefLabel ?capLabel .\n  FILTER(CONTAINS(LCASE(?capLabel), "leidinggeven"))\n  ?occupation cnlo:requiresHATEssential ?capability ;\n              skos:prefLabel ?occLabel .\n}\nLIMIT 50',
 'occupation',
 '[]');

-- Schema concepten (basis)
INSERT INTO schema_concepts (concept_type, uri, prefix, local_name, label_nl, label_en, description_nl, synonyms, instance_count) VALUES
('class', 'https://linkeddata.competentnl.nl/def/competentnl#Occupation', 'cnlo', 'Occupation', 'Beroep', 'Occupation', 
 'Een beroep is een samenhangend geheel van arbeidstaken die voor de uitvoering een bepaalde vakkennis en -kunde vereisen.',
 '["beroep", "functie", "job", "werk", "professie", "vak"]', 3263),

('class', 'https://linkeddata.competentnl.nl/def/competentnl#HumanCapability', 'cnlo', 'HumanCapability', 'Vaardigheid', 'Human Capability',
 'Een vaardigheid die een individu handelingsbekwaam maakt om een specifieke taak binnen de context van een beroep of functie uit te voeren.',
 '["vaardigheid", "skill", "competentie", "bekwaamheid", "kunnen"]', 137),

('class', 'https://linkeddata.competentnl.nl/def/competentnl#KnowledgeArea', 'cnlo', 'KnowledgeArea', 'Kennisgebied', 'Knowledge Area',
 'Een duidelijk afgebakend cluster van vakspecifieke feiten, principes, theorieën en praktijken.',
 '["kennisgebied", "kennis", "vakgebied", "expertise", "domein"]', 361),

('class', 'https://linkeddata.competentnl.nl/def/competentnl#EducationalNorm', 'cnlo', 'EducationalNorm', 'Opleidingsnorm', 'Educational Norm',
 'Het geheel van bekwaamheden die een afgestudeerde van een beroepsopleiding kwalificeren.',
 '["opleiding", "opleidingsnorm", "kwalificatie", "diploma", "studie"]', 1856),

('property', 'https://linkeddata.competentnl.nl/def/competentnl#requiresHATEssential', 'cnlo', 'requiresHATEssential', 'vereist (essentieel)', 'requires essential',
 'Geeft aan dat voor een bepaald beroep een vaardigheid of kennis essentieel is.',
 '["vereist", "nodig", "essentieel", "moet hebben", "onmisbaar"]', 80237),

('property', 'https://linkeddata.competentnl.nl/def/competentnl#requiresHATImportant', 'cnlo', 'requiresHATImportant', 'vereist (belangrijk)', 'requires important',
 'Geeft aan dat voor een bepaald beroep een vaardigheid of kennis belangrijk is.',
 '["belangrijk", "relevant", "significant"]', 153554);

-- Toon resultaat
SELECT 'Database schema aangemaakt!' as status;
SELECT COUNT(*) as question_count FROM question_embeddings;
SELECT COUNT(*) as concept_count FROM schema_concepts;
