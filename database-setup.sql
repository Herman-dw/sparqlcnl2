-- ============================================================
-- CompetentNL Database Setup v4.0.0
-- ============================================================
-- Dit script maakt de benodigde tabellen aan voor:
-- 1. Concept Resolver met disambiguatie
-- 2. Feedback systeem
-- 3. Query logging
-- 
-- Voer uit met: mysql -u root -p < database-setup.sql
-- ============================================================

-- Database 1: RAG & Concept Resolver
CREATE DATABASE IF NOT EXISTS competentnl_rag CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE competentnl_rag;

-- ============================================================
-- OCCUPATION LABELS (voor concept resolver)
-- ============================================================
CREATE TABLE IF NOT EXISTS occupation_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    occupation_uri VARCHAR(255) NOT NULL,
    pref_label VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    label_type ENUM('prefLabel', 'altLabel', 'hiddenLabel') DEFAULT 'prefLabel',
    language VARCHAR(10) DEFAULT 'nl',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_label (label(100)),
    INDEX idx_label_lower (label(100)),
    INDEX idx_pref_label (pref_label(100)),
    INDEX idx_uri (occupation_uri)
) ENGINE=InnoDB;

-- ============================================================
-- SAMPLE DATA: Beroepen met synoniemen
-- ============================================================
INSERT IGNORE INTO occupation_labels (occupation_uri, pref_label, label, label_type) VALUES
-- Architecten (voor disambiguatie test)
('https://linkeddata.competentnl.nl/id/occupation/architect-1', 'Architect bouwkunde', 'Architect', 'prefLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-1', 'Architect bouwkunde', 'Bouwkundig architect', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-2', 'Software architect', 'Architect', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-2', 'Software architect', 'IT architect', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-2', 'Software architect', 'Applicatie architect', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-3', 'Landschapsarchitect', 'Architect', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-3', 'Landschapsarchitect', 'Tuinarchitect', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-4', 'Interieurarchitect', 'Architect', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/architect-4', 'Interieurarchitect', 'Binnenhuisarchitect', 'altLabel'),

-- Loodgieter (voor exact match test)
('https://linkeddata.competentnl.nl/id/occupation/installateur-1', 'Installatiemonteur dakwerk, sanitair, verwarming, gas- en waterleiding', 'Loodgieter', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/installateur-1', 'Installatiemonteur dakwerk, sanitair, verwarming, gas- en waterleiding', 'Installatiemonteur sanitair', 'altLabel'),

-- Kapper (voor disambiguatie)
('https://linkeddata.competentnl.nl/id/occupation/kapper-1', 'Kapper', 'Kapper', 'prefLabel'),
('https://linkeddata.competentnl.nl/id/occupation/kapper-2', 'Dameskapper', 'Kapper', 'altLabel'),
('https://linkeddata.competentnl.nl/id/occupation/kapper-3', 'Herenkapper', 'Kapper', 'altLabel'),

-- Unieke beroepen (geen disambiguatie)
('https://linkeddata.competentnl.nl/id/occupation/huisarts', 'Huisarts', 'Huisarts', 'prefLabel'),
('https://linkeddata.competentnl.nl/id/occupation/tandarts', 'Tandarts', 'Tandarts', 'prefLabel'),
('https://linkeddata.competentnl.nl/id/occupation/bakker', 'Bakker', 'Bakker', 'prefLabel');

-- ============================================================
-- CONCEPT SELECTIONS (voor learning)
-- ============================================================
CREATE TABLE IF NOT EXISTS concept_selections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    search_term VARCHAR(255) NOT NULL,
    concept_type VARCHAR(50) DEFAULT 'occupation',
    selected_uri VARCHAR(255) NOT NULL,
    selected_label VARCHAR(255) NOT NULL,
    selection_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_selection (search_term, selected_uri),
    INDEX idx_search_term (search_term)
) ENGINE=InnoDB;

-- ============================================================
-- USER FEEDBACK (scenario 1a)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    message_id VARCHAR(100),
    rating INT,
    feedback_type ENUM('helpful', 'not_helpful', 'incorrect', 'suggestion', 'general') DEFAULT 'general',
    comment TEXT,
    context_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_feedback_type (feedback_type)
) ENGINE=InnoDB;

-- ============================================================
-- QUERY LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS query_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    question TEXT NOT NULL,
    generated_sparql TEXT,
    result_count INT DEFAULT 0,
    execution_time_ms INT DEFAULT 0,
    feedback_rating INT,
    feedback_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- RAG EXAMPLES
-- ============================================================
CREATE TABLE IF NOT EXISTS rag_examples (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    sparql_query TEXT NOT NULL,
    category VARCHAR(100),
    feedback_score INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert sample RAG examples
INSERT IGNORE INTO rag_examples (question, sparql_query, category) VALUES
('Welke vaardigheden heeft een beroep?', 
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?occupation cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
}', 'skill'),

('Toon alle MBO kwalificaties',
'PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?kwalificatie ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
  ?kwalificatie skos:prefLabel ?naam .
}
ORDER BY ?naam', 'education'),

('Vaardigheden met RIASEC code R',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?skill cnlo:hasRIASEC "R" .
  ?skill skos:prefLabel ?skillLabel .
}', 'taxonomy');

-- ============================================================
-- Database 2: Orchestrator Prompts (optioneel)
-- ============================================================
CREATE DATABASE IF NOT EXISTS competentnl_prompts CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE competentnl_prompts;

-- Prompt domains
CREATE TABLE IF NOT EXISTS prompt_domains (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_key VARCHAR(50) UNIQUE NOT NULL,
    domain_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10),
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO prompt_domains (domain_key, domain_name, description, icon, priority) VALUES
('occupation', 'Beroepen', 'Vragen over beroepen en functies', '👔', 1),
('skill', 'Vaardigheden', 'Vragen over vaardigheden en competenties', '🎯', 2),
('education', 'Opleidingen', 'Vragen over opleidingen en kwalificaties', '🎓', 3),
('knowledge', 'Kennisgebieden', 'Vragen over kennisgebieden', '📚', 4),
('taxonomy', 'Taxonomie', 'Vragen over RIASEC, hiërarchieën, etc.', '🏷️', 5),
('comparison', 'Vergelijkingen', 'Vergelijkingen tussen concepten', '⚖️', 6),
('task', 'Taken', 'Vragen over taken en werkzaamheden', '📋', 7);

-- Classification keywords
CREATE TABLE IF NOT EXISTS classification_keywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    keyword_normalized VARCHAR(100) NOT NULL,
    weight DECIMAL(3,2) DEFAULT 1.00,
    is_exclusive BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (domain_id) REFERENCES prompt_domains(id),
    INDEX idx_keyword (keyword_normalized)
) ENGINE=InnoDB;

-- Insert classification keywords
INSERT IGNORE INTO classification_keywords (domain_id, keyword_normalized, weight, is_exclusive)
SELECT id, 'mbo', 2.0, TRUE FROM prompt_domains WHERE domain_key = 'education'
UNION ALL
SELECT id, 'kwalificatie', 1.5, FALSE FROM prompt_domains WHERE domain_key = 'education'
UNION ALL
SELECT id, 'opleiding', 1.5, FALSE FROM prompt_domains WHERE domain_key = 'education'
UNION ALL
SELECT id, 'riasec', 2.0, TRUE FROM prompt_domains WHERE domain_key = 'taxonomy'
UNION ALL
SELECT id, 'hollandcode', 2.0, TRUE FROM prompt_domains WHERE domain_key = 'taxonomy'
UNION ALL
SELECT id, 'vaardighe', 1.5, FALSE FROM prompt_domains WHERE domain_key = 'skill'
UNION ALL
SELECT id, 'skill', 1.5, FALSE FROM prompt_domains WHERE domain_key = 'skill'
UNION ALL
SELECT id, 'beroep', 1.0, FALSE FROM prompt_domains WHERE domain_key = 'occupation';

-- Domain example queries
CREATE TABLE IF NOT EXISTS domain_example_queries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    question_nl TEXT NOT NULL,
    sparql_query TEXT NOT NULL,
    query_pattern VARCHAR(100),
    usage_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (domain_id) REFERENCES prompt_domains(id),
    FULLTEXT(question_nl)
) ENGINE=InnoDB;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Database setup completed!' as status;
