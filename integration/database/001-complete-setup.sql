-- ============================================================
-- CompetentNL Multi-Prompt System - Complete Setup
-- ============================================================
-- MariaDB 10.5+ compatible
-- 
-- Voer uit met:
-- "C:\Program Files\MariaDB 11.8\bin\mysql" -u root -p < database/001-complete-setup.sql
-- ============================================================

-- Database aanmaken
CREATE DATABASE IF NOT EXISTS competentnl_prompts 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE competentnl_prompts;

-- ============================================================
-- DOMEIN DEFINITIES
-- ============================================================

DROP TABLE IF EXISTS query_log;
DROP TABLE IF EXISTS prompt_versions;
DROP TABLE IF EXISTS classification_keywords;
DROP TABLE IF EXISTS domain_example_queries;
DROP TABLE IF EXISTS domain_schema_elements;
DROP TABLE IF EXISTS domain_prompts;
DROP TABLE IF EXISTS orchestrator_config;
DROP TABLE IF EXISTS prompt_domains;

CREATE TABLE prompt_domains (
  id INT PRIMARY KEY AUTO_INCREMENT,
  domain_key VARCHAR(50) UNIQUE NOT NULL COMMENT 'Unieke key zoals: occupation, skill, knowledge',
  domain_name VARCHAR(100) NOT NULL COMMENT 'Nederlandse naam',
  description TEXT COMMENT 'Beschrijving van het domein',
  icon VARCHAR(50) COMMENT 'Emoji of icon code',
  priority INT DEFAULT 0 COMMENT 'Hogere prioriteit = eerder gekozen bij gelijke scores',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- ORCHESTRATOR CONFIG
-- ============================================================

CREATE TABLE orchestrator_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  config_key VARCHAR(50) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- PROMPTS PER DOMEIN
-- ============================================================

CREATE TABLE domain_prompts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  domain_id INT NOT NULL,
  prompt_type ENUM(
    'system',
    'context',
    'examples',
    'rules',
    'validation',
    'error_recovery'
  ) NOT NULL,
  prompt_name VARCHAR(100) COMMENT 'Beschrijvende naam',
  prompt_content TEXT NOT NULL,
  prompt_order INT DEFAULT 0 COMMENT 'Volgorde binnen het type',
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  performance_score DECIMAL(5,2) DEFAULT NULL COMMENT 'Gemeten effectiviteit 0-100',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
  INDEX idx_domain_type (domain_id, prompt_type, is_active)
) ENGINE=InnoDB;

-- ============================================================
-- SCHEMA ELEMENTEN PER DOMEIN
-- ============================================================

CREATE TABLE domain_schema_elements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  domain_id INT NOT NULL,
  element_type ENUM('class', 'predicate', 'prefix', 'graph') NOT NULL,
  element_uri VARCHAR(500) NOT NULL,
  prefix_short VARCHAR(20) COMMENT 'Korte prefix zoals cnlo:',
  local_name VARCHAR(100) COMMENT 'Lokale naam zoals Occupation',
  label_nl VARCHAR(200) COMMENT 'Nederlandse label',
  label_en VARCHAR(200) COMMENT 'Engelse label',
  description_nl TEXT COMMENT 'Nederlandse beschrijving',
  usage_notes TEXT COMMENT 'Wanneer te gebruiken',
  example_sparql TEXT COMMENT 'Voorbeeld SPARQL fragment',
  importance ENUM('essential', 'important', 'optional') DEFAULT 'important',
  instance_count INT DEFAULT NULL COMMENT 'Aantal instanties in de graph',
  FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
  INDEX idx_domain_element (domain_id, element_type),
  INDEX idx_uri (element_uri(255))
) ENGINE=InnoDB;

-- ============================================================
-- VOORBEELD QUERIES MET FULLTEXT SEARCH
-- ============================================================

CREATE TABLE domain_example_queries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  domain_id INT NOT NULL,
  question_nl TEXT NOT NULL COMMENT 'Nederlandse vraag',
  question_variations JSON COMMENT 'Array van alternatieve formuleringen',
  sparql_query TEXT NOT NULL,
  explanation TEXT COMMENT 'Uitleg waarom deze query werkt',
  query_pattern VARCHAR(50) COMMENT 'Pattern type: search, count, compare, list, detail',
  difficulty ENUM('basic', 'intermediate', 'advanced') DEFAULT 'basic',
  
  -- Statistieken
  usage_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  last_used_at TIMESTAMP NULL,
  avg_response_time_ms INT DEFAULT NULL,
  
  is_verified BOOLEAN DEFAULT FALSE COMMENT 'Handmatig geverifieerd als correct',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
  INDEX idx_domain_pattern (domain_id, query_pattern),
  INDEX idx_difficulty (difficulty),
  FULLTEXT idx_question_ft (question_nl)
) ENGINE=InnoDB;

-- ============================================================
-- CLASSIFICATIE KEYWORDS
-- ============================================================

CREATE TABLE classification_keywords (
  id INT PRIMARY KEY AUTO_INCREMENT,
  domain_id INT NOT NULL,
  keyword VARCHAR(100) NOT NULL COMMENT 'Keyword of phrase',
  keyword_normalized VARCHAR(100) AS (LOWER(TRIM(keyword))) STORED,
  weight DECIMAL(3,2) DEFAULT 1.00 COMMENT 'Gewicht 0.00-1.00',
  is_exclusive BOOLEAN DEFAULT FALSE COMMENT 'Als TRUE: alleen dit domein',
  is_negative BOOLEAN DEFAULT FALSE COMMENT 'Als TRUE: sluit dit domein uit',
  
  FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
  INDEX idx_keyword (keyword_normalized),
  UNIQUE KEY uk_domain_keyword (domain_id, keyword_normalized)
) ENGINE=InnoDB;

-- ============================================================
-- QUERY LOG MET FEEDBACK
-- ============================================================

CREATE TABLE query_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(100) COMMENT 'Browser session ID',
  question_original TEXT NOT NULL,
  question_normalized TEXT COMMENT 'Genormaliseerde vraag',
  
  -- Classificatie
  detected_domains JSON COMMENT 'Array van {domain_key, confidence}',
  selected_domain_id INT,
  classification_method ENUM('keyword', 'ai', 'hybrid', 'fallback') DEFAULT 'hybrid',
  
  -- Gegenereerde query
  sparql_query TEXT,
  query_valid BOOLEAN DEFAULT NULL,
  validation_errors JSON,
  
  -- Resultaten
  result_count INT DEFAULT NULL,
  execution_time_ms INT DEFAULT NULL,
  error_message TEXT,
  
  -- Feedback
  user_feedback ENUM('positive', 'negative', 'none') DEFAULT 'none',
  feedback_comment TEXT,
  
  -- Context
  is_followup BOOLEAN DEFAULT FALSE,
  parent_query_id INT DEFAULT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (selected_domain_id) REFERENCES prompt_domains(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_query_id) REFERENCES query_log(id) ON DELETE SET NULL,
  INDEX idx_session (session_id),
  INDEX idx_feedback (user_feedback),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_domain_stats AS
SELECT 
  d.domain_key,
  d.domain_name,
  COUNT(DISTINCT dp.id) as prompt_count,
  COUNT(DISTINCT dse.id) as schema_element_count,
  COUNT(DISTINCT deq.id) as example_query_count,
  COUNT(DISTINCT ck.id) as keyword_count,
  (SELECT COUNT(*) FROM query_log ql WHERE ql.selected_domain_id = d.id) as total_queries,
  (SELECT COUNT(*) FROM query_log ql WHERE ql.selected_domain_id = d.id AND ql.user_feedback = 'positive') as positive_feedback
FROM prompt_domains d
LEFT JOIN domain_prompts dp ON d.id = dp.domain_id AND dp.is_active = TRUE
LEFT JOIN domain_schema_elements dse ON d.id = dse.domain_id
LEFT JOIN domain_example_queries deq ON d.id = deq.domain_id AND deq.is_active = TRUE
LEFT JOIN classification_keywords ck ON d.id = ck.domain_id
WHERE d.is_active = TRUE
GROUP BY d.id;

CREATE OR REPLACE VIEW v_active_prompts AS
SELECT 
  d.domain_key,
  d.domain_name,
  dp.prompt_type,
  dp.prompt_name,
  dp.prompt_content,
  dp.prompt_order,
  dp.version,
  dp.performance_score
FROM domain_prompts dp
JOIN prompt_domains d ON dp.domain_id = d.id
WHERE dp.is_active = TRUE AND d.is_active = TRUE
ORDER BY d.priority DESC, dp.prompt_type, dp.prompt_order;

-- ============================================================
-- SEED DATA: DOMEINEN
-- ============================================================

INSERT INTO prompt_domains (domain_key, domain_name, description, icon, priority) VALUES
('occupation', 'Beroepen', 
 'Alles over beroepen: zoeken, vergelijken, details opvragen. Bevat 3.263 beroepen met labels, definities, en koppelingen naar vaardigheden en kennisgebieden.',
 '👔', 100),
('skill', 'Vaardigheden', 
 'HumanCapabilities in een 3-niveau hiërarchie (137 items). Bevat zowel soft skills als technische vaardigheden, met RIASEC en O*NET mappings.',
 '🎯', 90),
('knowledge', 'Kennisgebieden', 
 'KnowledgeAreas (361 items) georganiseerd in een hiërarchische structuur met notaties en ISCED-F mappings naar internationale onderwijsclassificaties.',
 '📚', 80),
('education', 'Opleidingen', 
 'EducationalNorms (1.856 items), MBO kwalificaties (447) en keuzedelen (1.292). Gekoppeld aan vaardigheden en kennisgebieden.',
 '🎓', 70),
('task', 'Taken', 
 'OccupationTasks (4.613 items) - concrete werkzaamheden die bij beroepen horen. Essentiële en optionele taken per beroep.',
 '📋', 60),
('taxonomy', 'Classificaties', 
 'Externe taxonomie mappings: ISCO (internationale beroepsclassificatie), ESCO (Europees), O*NET (Amerikaans), BRC (Nederlands).',
 '🏷️', 50),
('comparison', 'Vergelijkingen', 
 'Cross-domein vergelijkingen tussen beroepen, vaardigheden, of opleidingen. Combineert meerdere domeinen.',
 '⚖️', 40);

-- ============================================================
-- SEED DATA: ORCHESTRATOR CONFIG
-- ============================================================

INSERT INTO orchestrator_config (config_key, config_value, description) VALUES
('system_prompt', 
'Je bent een expert SPARQL query generator voor de CompetentNL knowledge graph.
Je taak is om Nederlandse vragen over beroepen, vaardigheden en opleidingen te vertalen naar correcte SPARQL queries.

BELANGRIJKE REGELS:
1. Retourneer ALLEEN de SPARQL query, geen uitleg of markdown
2. Gebruik NOOIT "FROM <graph>" clauses
3. Voeg ALTIJD "LIMIT 50" toe aan SELECT queries (behalve COUNT)
4. Begin direct met PREFIX declaraties
5. Gebruik FILTER(CONTAINS(LCASE(?var), "zoekterm")) voor tekstzoeken
6. Prefereer skos:prefLabel boven rdfs:label',
'Basis system prompt voor alle domeinen'),

('classification_prompt',
'Analyseer de volgende vraag en bepaal welk domein het beste past.

Domeinen:
- occupation: Vragen over beroepen, functies, jobs
- skill: Vragen over vaardigheden, competenties, kunnen
- knowledge: Vragen over kennisgebieden, vakkennis, expertise
- education: Vragen over opleidingen, diploma''s, certificaten
- task: Vragen over taken, werkzaamheden, activiteiten
- taxonomy: Vragen over classificaties, ISCO, ESCO codes
- comparison: Vragen die dingen vergelijken

Vraag: {question}

Antwoord met JSON: {"primary": "domein_key", "secondary": "domein_key of null", "confidence": 0.0-1.0}',
'Prompt voor AI-gebaseerde classificatie'),

('default_prefixes',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>',
'Standaard PREFIX declaraties'),

('max_examples_per_query', '3', 'Maximum aantal voorbeelden in prompt'),
('similarity_threshold', '0.7', 'Minimum cosine similarity voor RAG matches'),
('keyword_confidence_threshold', '0.6', 'Minimum confidence voor keyword-only classificatie');

-- ============================================================
-- SEED DATA: CLASSIFICATIE KEYWORDS
-- ============================================================

-- OCCUPATION keywords
INSERT INTO classification_keywords (domain_id, keyword, weight, is_exclusive) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'beroep', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'beroepen', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'functie', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'functies', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'job', 0.85, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'werk', 0.70, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'werken als', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'occupation', 0.95, TRUE);

-- SKILL keywords  
INSERT INTO classification_keywords (domain_id, keyword, weight, is_exclusive) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'vaardigheid', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'vaardigheden', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'skill', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'skills', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'competentie', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'competenties', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'kunnen', 0.70, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'capability', 0.90, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'humancapability', 1.00, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'riasec', 0.95, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'nodig voor', 0.70, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'essentieel', 0.60, FALSE);

-- KNOWLEDGE keywords
INSERT INTO classification_keywords (domain_id, keyword, weight, is_exclusive) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'kennisgebied', 1.00, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'kennisgebieden', 1.00, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'vakgebied', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'expertise', 0.80, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'kennis', 0.75, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'knowledgearea', 1.00, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'isced', 0.95, TRUE);

-- EDUCATION keywords
INSERT INTO classification_keywords (domain_id, keyword, weight, is_exclusive) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'opleiding', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'opleidingen', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'studie', 0.85, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'diploma', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'mbo', 0.95, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'hbo', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'kwalificatie', 0.95, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'keuzedeel', 1.00, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'nlqf', 0.95, TRUE);

-- TASK keywords
INSERT INTO classification_keywords (domain_id, keyword, weight, is_exclusive) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'taak', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'taken', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'werkzaamheid', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'werkzaamheden', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'activiteit', 0.75, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'doet een', 0.85, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'task'), 'occupationtask', 1.00, TRUE);

-- TAXONOMY keywords
INSERT INTO classification_keywords (domain_id, keyword, weight, is_exclusive) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'isco', 1.00, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'esco', 1.00, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'onet', 0.95, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'brc', 0.90, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'classificatie', 0.85, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'taxonomie', 0.90, TRUE);

-- COMPARISON keywords
INSERT INTO classification_keywords (domain_id, keyword, weight, is_exclusive) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'), 'vergelijk', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'), 'vergelijken', 1.00, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'), 'verschil', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'), 'overeenkomst', 0.90, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'), 'versus', 0.95, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'comparison'), 'gemeenschappelijk', 0.85, FALSE);

-- ============================================================
-- KLAAR!
-- ============================================================
SELECT 'Database setup voltooid!' as status;
SELECT domain_key, domain_name, priority FROM prompt_domains ORDER BY priority DESC;
