-- Database Migratie: CV Classification Step 6
-- Versie: 005
-- Datum: 2026-02-03
-- Beschrijving: Toevoegen van Step 6 voor CNL taxonomie classificatie

USE competentnl_rag;

-- ============================================================================
-- 1. Update step_name ENUM to include 'classify' for Step 6
-- ============================================================================

ALTER TABLE cv_processing_steps
MODIFY COLUMN step_name ENUM(
    'extract',        -- Stap 1: Tekst Extractie
    'detect_pii',     -- Stap 2: PII Detectie
    'anonymize',      -- Stap 3: Anonimisering Preview
    'parse',          -- Stap 4: Structuur Parsing
    'finalize',       -- Stap 5: Privacy & Werkgevers
    'classify'        -- Stap 6: CNL Taxonomie Classificatie
) NOT NULL;

-- Update comment on step_number to reflect 6 steps
ALTER TABLE cv_processing_steps
MODIFY COLUMN step_number INT NOT NULL COMMENT '1-6 for the wizard steps';

-- ============================================================================
-- 2. Add CNL classification columns to cv_extractions
-- ============================================================================

-- Ensure matched_cnl_uri exists
ALTER TABLE cv_extractions
ADD COLUMN IF NOT EXISTS matched_cnl_uri VARCHAR(500) NULL
COMMENT 'CompetentNL URI van het geclassificeerde concept';

ALTER TABLE cv_extractions
ADD COLUMN IF NOT EXISTS matched_cnl_label VARCHAR(255) NULL
COMMENT 'Label van het geclassificeerde CNL concept';

ALTER TABLE cv_extractions
ADD COLUMN IF NOT EXISTS classification_method ENUM('exact', 'fuzzy', 'semantic', 'llm', 'manual') NULL
COMMENT 'Methode waarmee classificatie is bepaald';

ALTER TABLE cv_extractions
ADD COLUMN IF NOT EXISTS alternative_matches JSON NULL
COMMENT 'Alternatieve matches met confidence scores';

ALTER TABLE cv_extractions
ADD COLUMN IF NOT EXISTS classification_confirmed BOOLEAN DEFAULT FALSE
COMMENT 'Gebruiker heeft classificatie bevestigd';

ALTER TABLE cv_extractions
ADD COLUMN IF NOT EXISTS classified_at DATETIME NULL
COMMENT 'Tijdstip van classificatie';

-- ============================================================================
-- 3. Create CNL concept embeddings cache table (for semantic matching)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cnl_concept_embeddings (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Concept identification
    concept_uri VARCHAR(500) NOT NULL,
    concept_type ENUM('occupation', 'education', 'capability', 'knowledge', 'task', 'workingCondition') NOT NULL,
    pref_label VARCHAR(500) NOT NULL COMMENT 'Label tekst (kan prefLabel of altLabel zijn)',
    label_type ENUM('pref', 'alt') DEFAULT 'pref' COMMENT 'Type label: pref=officieel, alt=synoniem/alternatieve naam',

    -- Embedding data
    embedding BLOB NOT NULL COMMENT 'Binary vector embedding (384 dimensions float32)',
    embedding_model VARCHAR(100) DEFAULT 'all-MiniLM-L6-v2',

    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Unique per URI+label combinatie (één concept kan meerdere labels hebben)
    UNIQUE KEY unique_concept_label (concept_uri, pref_label),
    INDEX idx_concept_type (concept_type),
    INDEX idx_pref_label (pref_label),
    INDEX idx_label_type (label_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Cached embeddings voor CNL concepten inclusief synoniemen (semantic matching)';

-- Fix voor bestaande tabellen: verwijder oude unique key en voeg correcte toe
-- (Deze statements zijn veilig als de constraints al correct zijn)
ALTER TABLE cnl_concept_embeddings
MODIFY COLUMN pref_label VARCHAR(500) NOT NULL
COMMENT 'Label tekst (kan prefLabel of altLabel zijn)';

-- Verwijder foute unique key indien aanwezig (alleen op concept_uri)
-- en voeg correcte composite key toe (op concept_uri + pref_label)
-- Dit wordt afgehandeld door het setup script

-- ============================================================================
-- 4. Classification feedback/correction tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS cv_classification_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,

    extraction_id INT NOT NULL,
    cv_id INT NOT NULL,

    -- Original classification
    original_uri VARCHAR(500) NULL,
    original_label VARCHAR(255) NULL,
    original_method ENUM('exact', 'fuzzy', 'semantic', 'llm', 'manual') NULL,
    original_confidence DECIMAL(3,2) NULL,

    -- User correction
    corrected_uri VARCHAR(500) NOT NULL,
    corrected_label VARCHAR(255) NOT NULL,

    -- Feedback details
    feedback_type ENUM('confirmed', 'corrected', 'rejected', 'added') NOT NULL,
    user_notes TEXT NULL,

    -- Audit
    session_id VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (extraction_id) REFERENCES cv_extractions(id) ON DELETE CASCADE,
    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,

    INDEX idx_extraction_id (extraction_id),
    INDEX idx_cv_id (cv_id),
    INDEX idx_feedback_type (feedback_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tracking van gebruikersfeedback op CNL classificaties voor model verbetering';

-- ============================================================================
-- 5. View: Classification Statistics
-- ============================================================================

CREATE OR REPLACE VIEW v_classification_stats AS
SELECT
    section_type,
    classification_method,
    COUNT(*) as total,
    AVG(confidence_score) as avg_confidence,
    SUM(CASE WHEN classification_confirmed = TRUE THEN 1 ELSE 0 END) as confirmed_count,
    SUM(CASE WHEN matched_cnl_uri IS NOT NULL THEN 1 ELSE 0 END) as classified_count,
    SUM(CASE WHEN needs_review = TRUE THEN 1 ELSE 0 END) as needs_review_count
FROM cv_extractions
GROUP BY section_type, classification_method;

-- ============================================================================
-- 6. View: CV Classification Summary
-- ============================================================================

CREATE OR REPLACE VIEW v_cv_classification_summary AS
SELECT
    cv.id as cv_id,
    cv.file_name,
    cv.session_id,
    COUNT(ext.id) as total_items,
    SUM(CASE WHEN ext.matched_cnl_uri IS NOT NULL THEN 1 ELSE 0 END) as classified_items,
    SUM(CASE WHEN ext.needs_review = TRUE THEN 1 ELSE 0 END) as review_needed,
    SUM(CASE WHEN ext.classification_confirmed = TRUE THEN 1 ELSE 0 END) as confirmed_items,
    AVG(ext.confidence_score) as avg_confidence,
    GROUP_CONCAT(DISTINCT ext.classification_method) as methods_used
FROM user_cvs cv
LEFT JOIN cv_extractions ext ON cv.id = ext.cv_id
WHERE cv.deleted_at IS NULL
GROUP BY cv.id;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT
    'cv_extractions columns' as check_type,
    COUNT(*) as column_count
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'competentnl_rag'
  AND TABLE_NAME = 'cv_extractions'
  AND COLUMN_NAME IN ('matched_cnl_uri', 'matched_cnl_label', 'classification_method', 'alternative_matches', 'classification_confirmed');

SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'competentnl_rag'
  AND TABLE_NAME IN ('cnl_concept_embeddings', 'cv_classification_feedback');

COMMIT;
