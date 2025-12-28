-- ============================================================
-- CompetentNL Database Schema v3.0.0 - COMPLETE
-- ============================================================
-- Dit script maakt ALLEEN de structuur aan (lege tabellen)
-- Data wordt gesynchroniseerd via sync-all-concepts.mjs
-- 
-- Gebruik: 
--   1. Eerst dit script voor structuur
--   2. Dan: node sync-all-concepts.mjs voor data
-- ============================================================

-- ============================================================
-- DATABASE 1: competentnl_rag
-- ============================================================

CREATE DATABASE IF NOT EXISTS competentnl_rag 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE competentnl_rag;

-- ============================================================
-- CONCEPT LABEL TABELLEN (gevuld door sync script)
-- ============================================================

-- Beroepen
CREATE TABLE IF NOT EXISTS occupation_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    occupation_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500),
    label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel', 'specialization') DEFAULT 'prefLabel',
    language VARCHAR(10) DEFAULT 'nl',
    source VARCHAR(50) DEFAULT 'sparql_sync',
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_label (label(100)),
    INDEX idx_label_normalized (label_normalized(100)),
    INDEX idx_uri (occupation_uri(100)),
    INDEX idx_pref_label (pref_label(100)),
    UNIQUE KEY unique_label (occupation_uri(255), label(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opleidingen
CREATE TABLE IF NOT EXISTS education_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    education_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500),
    label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel') DEFAULT 'prefLabel',
    language VARCHAR(10) DEFAULT 'nl',
    source VARCHAR(50) DEFAULT 'sparql_sync',
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_label (label(100)),
    INDEX idx_label_normalized (label_normalized(100)),
    INDEX idx_uri (education_uri(100)),
    UNIQUE KEY unique_label (education_uri(255), label(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vaardigheden
CREATE TABLE IF NOT EXISTS capability_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    capability_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500),
    label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel') DEFAULT 'prefLabel',
    language VARCHAR(10) DEFAULT 'nl',
    source VARCHAR(50) DEFAULT 'sparql_sync',
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_label (label(100)),
    INDEX idx_label_normalized (label_normalized(100)),
    INDEX idx_uri (capability_uri(100)),
    UNIQUE KEY unique_label (capability_uri(255), label(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kennisgebieden
CREATE TABLE IF NOT EXISTS knowledge_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    knowledge_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500),
    label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel') DEFAULT 'prefLabel',
    language VARCHAR(10) DEFAULT 'nl',
    source VARCHAR(50) DEFAULT 'sparql_sync',
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_label (label(100)),
    INDEX idx_label_normalized (label_normalized(100)),
    INDEX idx_uri (knowledge_uri(100)),
    UNIQUE KEY unique_label (knowledge_uri(255), label(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Taken
CREATE TABLE IF NOT EXISTS task_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500),
    label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel') DEFAULT 'prefLabel',
    language VARCHAR(10) DEFAULT 'nl',
    source VARCHAR(50) DEFAULT 'sparql_sync',
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_label (label(100)),
    INDEX idx_label_normalized (label_normalized(100)),
    INDEX idx_uri (task_uri(100)),
    UNIQUE KEY unique_label (task_uri(255), label(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Werkomstandigheden
CREATE TABLE IF NOT EXISTS workingcondition_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workingcondition_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500),
    label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel') DEFAULT 'prefLabel',
    language VARCHAR(10) DEFAULT 'nl',
    source VARCHAR(50) DEFAULT 'sparql_sync',
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_label (label(100)),
    INDEX idx_label_normalized (label_normalized(100)),
    INDEX idx_uri (workingcondition_uri(100)),
    UNIQUE KEY unique_label (workingcondition_uri(255), label(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SYNONIEMEN & MAPPING TABELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS concept_synonyms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    synonym VARCHAR(255) NOT NULL,
    synonym_normalized VARCHAR(255) NOT NULL,
    concept_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    concept_type ENUM('occupation', 'education', 'capability', 'knowledge', 'task', 'workingcondition') NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.90,
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_synonym (synonym_normalized(100)),
    INDEX idx_type (concept_type),
    UNIQUE KEY unique_synonym (synonym_normalized(100), concept_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS occupation_synonyms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    synonym VARCHAR(255) NOT NULL,
    synonym_normalized VARCHAR(255),
    occupation_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.90,
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_synonym (synonym(100)),
    UNIQUE KEY unique_synonym (synonym(100), occupation_uri(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LOGGING & ANALYTICS TABELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS concept_search_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    search_term VARCHAR(255) NOT NULL,
    search_term_normalized VARCHAR(255),
    concept_type VARCHAR(50),
    found_exact BOOLEAN DEFAULT FALSE,
    found_fuzzy BOOLEAN DEFAULT FALSE,
    results_count INT DEFAULT 0,
    disambiguation_shown BOOLEAN DEFAULT FALSE,
    user_confirmed BOOLEAN DEFAULT FALSE,
    selected_concept_uri VARCHAR(500),
    selected_label VARCHAR(500),
    response_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_search_term (search_term_normalized(100)),
    INDEX idx_session (session_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS occupation_search_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    search_term VARCHAR(255) NOT NULL,
    found BOOLEAN DEFAULT FALSE,
    match_count INT DEFAULT 0,
    selected_uri VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_search (search_term(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS query_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    question TEXT NOT NULL,
    detected_domain VARCHAR(50),
    resolved_concepts JSON,
    generated_sparql TEXT,
    result_count INT DEFAULT 0,
    execution_time_ms INT DEFAULT 0,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_domain (detected_domain),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- FEEDBACK TABELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS user_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    message_id VARCHAR(100),
    question TEXT,
    sparql_query TEXT,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    feedback_type ENUM('helpful', 'not_helpful', 'incorrect', 'general') DEFAULT 'general',
    comment TEXT,
    context_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_rating (rating),
    INDEX idx_type (feedback_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedback_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    feedback_id INT,
    detail_type VARCHAR(50),
    detail_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_feedback (feedback_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CONVERSATIE LOGGING
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    message_id VARCHAR(100) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    text_content TEXT NOT NULL,
    sparql TEXT,
    results_json JSON,
    status ENUM('pending', 'success', 'error') DEFAULT 'success',
    feedback ENUM('like', 'dislike', 'none') DEFAULT 'none',
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_session_message (session_id, message_id),
    INDEX idx_session_created (session_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DISAMBIGUATIE TABELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS disambiguation_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    search_term VARCHAR(255) NOT NULL,
    concept_type VARCHAR(50),
    options_shown JSON,
    selected_option INT,
    selected_uri VARCHAR(500),
    selected_label VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_term (search_term(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS concept_selections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    search_term VARCHAR(255) NOT NULL,
    concept_type VARCHAR(50) DEFAULT 'occupation',
    selected_uri VARCHAR(500) NOT NULL,
    selected_label VARCHAR(500) NOT NULL,
    selection_count INT DEFAULT 1,
    last_selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_selection (search_term(100), selected_uri(255)),
    INDEX idx_search_term (search_term(100)),
    INDEX idx_count (selection_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- RAG / EMBEDDINGS TABELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS question_embeddings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    question_normalized VARCHAR(500),
    sparql_query TEXT NOT NULL,
    embedding BLOB,
    category VARCHAR(50),
    domain VARCHAR(50),
    usage_count INT DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 100.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_domain (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_concepts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    concept_type VARCHAR(50) NOT NULL,
    concept_uri VARCHAR(500) NOT NULL,
    concept_label VARCHAR(255) NOT NULL,
    description TEXT,
    related_predicates JSON,
    example_queries JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (concept_type),
    INDEX idx_label (concept_label(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_missing_occupations AS
SELECT 
    search_term,
    COUNT(*) as search_count,
    MAX(created_at) as last_searched
FROM occupation_search_log
WHERE found = FALSE
GROUP BY search_term
HAVING COUNT(*) >= 2
ORDER BY search_count DESC;

CREATE OR REPLACE VIEW v_missing_concepts AS
SELECT 
    search_term,
    concept_type,
    COUNT(*) as search_count,
    MAX(created_at) as last_searched
FROM concept_search_log
WHERE found_exact = FALSE AND found_fuzzy = FALSE AND results_count = 0
GROUP BY search_term, concept_type
HAVING COUNT(*) >= 2
ORDER BY search_count DESC;

CREATE OR REPLACE VIEW v_popular_disambiguations AS
SELECT 
    concept_type,
    selected_label,
    selected_concept_uri,
    COUNT(*) as selection_count
FROM concept_search_log
WHERE disambiguation_shown = TRUE AND user_confirmed = TRUE AND selected_concept_uri IS NOT NULL
GROUP BY concept_type, selected_label, selected_concept_uri
ORDER BY selection_count DESC;

CREATE OR REPLACE VIEW v_problem_queries AS
SELECT 
    question,
    detected_domain,
    error_message,
    COUNT(*) as error_count,
    MAX(created_at) as last_error
FROM query_logs
WHERE success = FALSE
GROUP BY question, detected_domain, error_message
ORDER BY error_count DESC
LIMIT 100;

CREATE OR REPLACE VIEW v_top_examples AS
SELECT 
    question,
    sparql_query,
    category,
    domain,
    usage_count,
    success_rate
FROM question_embeddings
ORDER BY usage_count DESC, success_rate DESC
LIMIT 50;

-- ============================================================
-- DATABASE 2: competentnl_prompts
-- ============================================================

CREATE DATABASE IF NOT EXISTS competentnl_prompts 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE competentnl_prompts;

-- ============================================================
-- ORCHESTRATOR TABELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS prompt_domains (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_key VARCHAR(50) NOT NULL UNIQUE,
    domain_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '📁',
    priority INT DEFAULT 50,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_key (domain_key),
    INDEX idx_priority (priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classification_keywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    keyword_normalized VARCHAR(100) NOT NULL,
    weight DECIMAL(3,2) DEFAULT 1.00,
    is_exclusive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
    INDEX idx_keyword (keyword_normalized),
    INDEX idx_domain (domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domain_example_queries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    question_nl TEXT NOT NULL,
    sparql_query TEXT NOT NULL,
    query_pattern VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
    INDEX idx_domain (domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domain_prompts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    prompt_type VARCHAR(50) DEFAULT 'system',
    prompt_text TEXT NOT NULL,
    version INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
    INDEX idx_domain (domain_id),
    INDEX idx_type (prompt_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domain_schema_elements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    element_type VARCHAR(50) NOT NULL,
    element_uri VARCHAR(500),
    element_label VARCHAR(255) NOT NULL,
    description TEXT,
    usage_example TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES prompt_domains(id) ON DELETE CASCADE,
    INDEX idx_domain (domain_id),
    INDEX idx_type (element_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orchestrator_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS query_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    question TEXT,
    detected_domains JSON,
    selected_domain VARCHAR(50),
    sparql_query TEXT,
    execution_time_ms INT,
    result_count INT,
    success BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_domain (selected_domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DEFAULT DATA: Domeinen
-- ============================================================

INSERT IGNORE INTO prompt_domains (domain_key, domain_name, description, icon, priority) VALUES
('occupation', 'Beroepen', 'Vragen over beroepen, functies en werkzaamheden', '👷', 100),
('skill', 'Vaardigheden', 'Vragen over competenties en vaardigheden', '🎯', 90),
('education', 'Opleidingen', 'Vragen over opleidingen, kwalificaties en onderwijs', '🎓', 85),
('knowledge', 'Kennisgebieden', 'Vragen over kennisdomeinen en expertisegebieden', '📚', 80),
('task', 'Taken', 'Vragen over taken en werkzaamheden', '✅', 70),
('taxonomy', 'Taxonomie', 'Vragen over classificaties, RIASEC, hiërarchieën', '🏷️', 60),
('comparison', 'Vergelijking', 'Vergelijkingsvragen tussen concepten', '⚖️', 50);

-- ============================================================
-- DEFAULT DATA: Keywords
-- ============================================================

INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive) VALUES
-- Education (domain 3)
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'mbo', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'hbo', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'wo', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'opleiding', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'kwalificatie', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'mbo kwalificatie', 1.5, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'education'), 'leer', 0.8, FALSE),

-- Occupation (domain 1)
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'beroep', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'occupation'), 'functie', 0.9, FALSE),

-- Skill (domain 2)
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'vaardigheid', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'vaardigheden', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'), 'competentie', 1.0, FALSE),

-- Knowledge (domain 4)
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'kennis', 1.0, FALSE),
((SELECT id FROM prompt_domains WHERE domain_key = 'knowledge'), 'kennisgebied', 1.2, TRUE),

-- Taxonomy (domain 6)
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'riasec', 1.5, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'hollandcode', 1.5, TRUE),
((SELECT id FROM prompt_domains WHERE domain_key = 'taxonomy'), 'holland code', 1.5, TRUE);

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_active_prompts AS
SELECT 
    pd.domain_key,
    pd.domain_name,
    dp.prompt_type,
    dp.prompt_text,
    dp.version
FROM prompt_domains pd
JOIN domain_prompts dp ON pd.id = dp.domain_id
WHERE pd.is_active = TRUE AND dp.is_active = TRUE;

CREATE OR REPLACE VIEW v_domain_stats AS
SELECT 
    pd.domain_key,
    pd.domain_name,
    COUNT(DISTINCT ck.id) as keyword_count,
    COUNT(DISTINCT deq.id) as example_count
FROM prompt_domains pd
LEFT JOIN classification_keywords ck ON pd.id = ck.domain_id
LEFT JOIN domain_example_queries deq ON pd.id = deq.domain_id
GROUP BY pd.id, pd.domain_key, pd.domain_name;

-- ============================================================
-- DONE
-- ============================================================

SELECT '✅ Database schema v3.0.0 aangemaakt!' as status;
SELECT 'Nu uitvoeren: node sync-all-concepts.mjs' as next_step;
