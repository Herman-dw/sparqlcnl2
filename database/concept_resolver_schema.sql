-- =====================================================
-- CompetentNL Concept Resolver Schema - v2.0.0
-- =====================================================
-- Generieke disambiguatie voor alle concept types:
-- - Beroepen (Occupations)
-- - Opleidingen (EducationalNorms)  
-- - Vaardigheden (HumanCapabilities)
-- - Kennisgebieden (KnowledgeAreas)
-- - Taken (Tasks)
-- - Werkomstandigheden (WorkingConditions)
-- =====================================================

-- Bestaande occupation_labels tabel behouden (al gevuld)
-- We voegen nieuwe tabellen toe voor andere concept types

-- =====================================================
-- 1. OPLEIDINGEN (Educational Norms)
-- =====================================================
CREATE TABLE IF NOT EXISTS education_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    education_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500) NOT NULL,
    label_type ENUM('prefLabel', 'altLabel', 'specialization', 'synonym', 'abbreviation') DEFAULT 'prefLabel',
    source VARCHAR(100) DEFAULT 'sparql_sync',
    validated BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_edu_label_norm (label_normalized),
    INDEX idx_edu_uri (education_uri),
    INDEX idx_edu_pref (pref_label),
    FULLTEXT INDEX ft_edu_label (label, pref_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. VAARDIGHEDEN (Human Capabilities)
-- =====================================================
CREATE TABLE IF NOT EXISTS capability_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    capability_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500) NOT NULL,
    label_type ENUM('prefLabel', 'altLabel', 'specialization', 'synonym', 'abbreviation') DEFAULT 'prefLabel',
    source VARCHAR(100) DEFAULT 'sparql_sync',
    validated BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cap_label_norm (label_normalized),
    INDEX idx_cap_uri (capability_uri),
    INDEX idx_cap_pref (pref_label),
    FULLTEXT INDEX ft_cap_label (label, pref_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3. KENNISGEBIEDEN (Knowledge Areas)
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    knowledge_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500) NOT NULL,
    label_type ENUM('prefLabel', 'altLabel', 'specialization', 'synonym', 'abbreviation') DEFAULT 'prefLabel',
    source VARCHAR(100) DEFAULT 'sparql_sync',
    validated BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_know_label_norm (label_normalized),
    INDEX idx_know_uri (knowledge_uri),
    INDEX idx_know_pref (pref_label),
    FULLTEXT INDEX ft_know_label (label, pref_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. TAKEN (Tasks)
-- =====================================================
CREATE TABLE IF NOT EXISTS task_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500) NOT NULL,
    label_type ENUM('prefLabel', 'altLabel', 'specialization', 'synonym', 'abbreviation') DEFAULT 'prefLabel',
    source VARCHAR(100) DEFAULT 'sparql_sync',
    validated BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_task_label_norm (label_normalized),
    INDEX idx_task_uri (task_uri),
    INDEX idx_task_pref (pref_label),
    FULLTEXT INDEX ft_task_label (label, pref_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. WERKOMSTANDIGHEDEN (Working Conditions)
-- =====================================================
CREATE TABLE IF NOT EXISTS workingcondition_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    condition_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500) NOT NULL,
    label_type ENUM('prefLabel', 'altLabel', 'specialization', 'synonym', 'abbreviation') DEFAULT 'prefLabel',
    source VARCHAR(100) DEFAULT 'sparql_sync',
    validated BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_wc_label_norm (label_normalized),
    INDEX idx_wc_uri (condition_uri),
    INDEX idx_wc_pref (pref_label),
    FULLTEXT INDEX ft_wc_label (label, pref_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 6. GENERIEKE SYNONIEMEN TABEL (voor handmatige toevoegingen)
-- =====================================================
CREATE TABLE IF NOT EXISTS concept_synonyms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    synonym VARCHAR(500) NOT NULL,
    synonym_normalized VARCHAR(500) NOT NULL,
    concept_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    concept_type ENUM('occupation', 'education', 'capability', 'knowledge', 'task', 'workingCondition') NOT NULL,
    added_by VARCHAR(100) DEFAULT 'system',
    confidence DECIMAL(3,2) DEFAULT 0.90,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_synonym_type (synonym_normalized, concept_type),
    INDEX idx_syn_norm (synonym_normalized),
    INDEX idx_syn_type (concept_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 7. GENERIEKE ZOEK LOG (voor analytics en learning)
-- =====================================================
CREATE TABLE IF NOT EXISTS concept_search_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    search_term VARCHAR(500) NOT NULL,
    search_term_normalized VARCHAR(500) NOT NULL,
    concept_type ENUM('occupation', 'education', 'capability', 'knowledge', 'task', 'workingCondition') NOT NULL,
    found_exact BOOLEAN DEFAULT FALSE,
    found_fuzzy BOOLEAN DEFAULT FALSE,
    results_count INT DEFAULT 0,
    disambiguation_shown BOOLEAN DEFAULT FALSE,
    selected_concept_uri VARCHAR(500) NULL,
    selected_label VARCHAR(500) NULL,
    user_confirmed BOOLEAN DEFAULT FALSE,
    session_id VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_search_term (search_term_normalized),
    INDEX idx_search_type (concept_type),
    INDEX idx_search_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 8. DISAMBIGUATIE SESSIES (actieve keuze-dialogen)
-- =====================================================
CREATE TABLE IF NOT EXISTS disambiguation_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    original_question TEXT NOT NULL,
    search_term VARCHAR(500) NOT NULL,
    concept_type ENUM('occupation', 'education', 'capability', 'knowledge', 'task', 'workingCondition') NOT NULL,
    options_json TEXT NOT NULL,  -- JSON array van ConceptMatch objecten
    status ENUM('pending', 'resolved', 'cancelled', 'expired') DEFAULT 'pending',
    selected_uri VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    
    INDEX idx_disamb_session (session_id),
    INDEX idx_disamb_status (status),
    INDEX idx_disamb_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 9. VIEW: Niet-gevonden zoektermen (voor verbetering)
-- =====================================================
CREATE OR REPLACE VIEW v_missing_concepts AS
SELECT 
    search_term,
    concept_type,
    COUNT(*) as search_count,
    MAX(created_at) as last_searched
FROM concept_search_log
WHERE found_exact = FALSE 
  AND found_fuzzy = FALSE
  AND results_count = 0
GROUP BY search_term, concept_type
HAVING COUNT(*) >= 2
ORDER BY search_count DESC;

-- =====================================================
-- 10. VIEW: Vaak gekozen na disambiguatie (populaire concepten)
-- =====================================================
CREATE OR REPLACE VIEW v_popular_disambiguations AS
SELECT 
    concept_type,
    selected_label,
    selected_concept_uri,
    COUNT(*) as selection_count
FROM concept_search_log
WHERE disambiguation_shown = TRUE
  AND user_confirmed = TRUE
  AND selected_concept_uri IS NOT NULL
GROUP BY concept_type, selected_label, selected_concept_uri
ORDER BY selection_count DESC;

-- =====================================================
-- Enkele handmatige synoniemen als voorbeeld
-- =====================================================
INSERT IGNORE INTO concept_synonyms (synonym, synonym_normalized, concept_uri, pref_label, concept_type, confidence) VALUES
-- Beroepen
('dokter', 'dokter', 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARTS', 'Arts', 'occupation', 0.95),
('programmeur', 'programmeur', 'https://linkeddata.competentnl.nl/uwv/id/occupation/SOFTWAREDEV', 'Softwareontwikkelaar', 'occupation', 0.90),
('kapper', 'kapper', 'https://linkeddata.competentnl.nl/uwv/id/occupation/KAPPER', 'Kapper', 'occupation', 0.95),
-- Vaardigheden
('communiceren', 'communiceren', 'https://linkeddata.competentnl.nl/id/human-capability/COMM', 'Communicatieve vaardigheden', 'capability', 0.90),
('samenwerken', 'samenwerken', 'https://linkeddata.competentnl.nl/id/human-capability/TEAM', 'Samenwerking', 'capability', 0.90);

SELECT 'Schema v2.0.0 succesvol aangemaakt!' AS status;
