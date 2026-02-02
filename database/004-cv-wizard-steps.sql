-- Database Migratie: CV Parsing Wizard Steps Table
-- Versie: 004
-- Datum: 2026-02-02
-- Beschrijving: Tabellen voor stap-voor-stap CV verwerking met gebruikersbevestiging

USE competentnl_rag;

-- ============================================================================
-- 1. CV Processing Steps Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS cv_processing_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,

    -- Stap info
    step_number INT NOT NULL COMMENT '1-5 for the wizard steps',
    step_name ENUM(
        'extract',        -- Stap 1: Tekst Extractie
        'detect_pii',     -- Stap 2: PII Detectie
        'anonymize',      -- Stap 3: Anonimisering Preview
        'parse',          -- Stap 4: Structuur Parsing
        'finalize'        -- Stap 5: Privacy & Werkgevers
    ) NOT NULL,

    -- Status tracking
    status ENUM('pending', 'processing', 'completed', 'confirmed', 'failed') DEFAULT 'pending',
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    confirmed_at DATETIME NULL COMMENT 'When user confirmed this step',
    duration_ms INT NULL,

    -- Step-specifieke data (JSON)
    input_data JSON NULL COMMENT 'Data used as input for this step',
    output_data JSON NULL COMMENT 'Result of this step',

    -- User feedback per stap
    user_modifications JSON NULL COMMENT 'Changes made by user during confirmation',
    user_confirmed BOOLEAN DEFAULT FALSE,

    -- Error tracking
    error_message TEXT NULL,
    retry_count INT DEFAULT 0,

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,

    -- Unique constraint: 1 stap per cv per step_number
    UNIQUE KEY unique_cv_step (cv_id, step_number),

    INDEX idx_cv_id (cv_id),
    INDEX idx_step_name (step_name),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tracking voor stap-voor-stap CV verwerking met gebruikersbevestiging';

-- ============================================================================
-- 2. Add wizard_mode column to user_cvs
-- ============================================================================

ALTER TABLE user_cvs
ADD COLUMN IF NOT EXISTS wizard_mode BOOLEAN DEFAULT FALSE
COMMENT 'True if CV is being processed step-by-step via wizard';

ALTER TABLE user_cvs
ADD COLUMN IF NOT EXISTS current_wizard_step INT DEFAULT NULL
COMMENT 'Current step in wizard (1-5)';

ALTER TABLE user_cvs
ADD COLUMN IF NOT EXISTS wizard_started_at DATETIME NULL
COMMENT 'When wizard processing started';

-- ============================================================================
-- 3. PII Detection Details Table (voor stap 2 visualisatie)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cv_pii_detections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    step_id INT NULL COMMENT 'Link to cv_processing_steps',

    -- PII details
    pii_type ENUM('name', 'email', 'phone', 'address', 'date', 'organization', 'other') NOT NULL,
    original_text VARCHAR(500) NOT NULL COMMENT 'The detected PII text',
    start_position INT NOT NULL COMMENT 'Start position in original text',
    end_position INT NOT NULL COMMENT 'End position in original text',
    confidence_score FLOAT COMMENT 'Detection confidence 0-1',

    -- Anonimisering
    replacement_text VARCHAR(500) NULL COMMENT 'What it was replaced with (e.g., [NAAM], [EMAIL])',
    user_approved BOOLEAN DEFAULT TRUE COMMENT 'User confirmed this is PII',
    user_added BOOLEAN DEFAULT FALSE COMMENT 'User manually added this PII',

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,
    FOREIGN KEY (step_id) REFERENCES cv_processing_steps(id) ON DELETE SET NULL,

    INDEX idx_cv_id (cv_id),
    INDEX idx_pii_type (pii_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Gedetailleerde PII detecties voor wizard visualisatie';

-- ============================================================================
-- 4. View: Wizard Progress
-- ============================================================================

CREATE OR REPLACE VIEW v_cv_wizard_progress AS
SELECT
    cv.id as cv_id,
    cv.session_id,
    cv.file_name,
    cv.wizard_mode,
    cv.current_wizard_step,
    cv.processing_status,
    COUNT(DISTINCT cps.id) as total_steps,
    SUM(CASE WHEN cps.status = 'completed' OR cps.status = 'confirmed' THEN 1 ELSE 0 END) as completed_steps,
    SUM(CASE WHEN cps.user_confirmed = TRUE THEN 1 ELSE 0 END) as confirmed_steps,
    GROUP_CONCAT(
        CONCAT(cps.step_number, ':', cps.step_name, ':', cps.status)
        ORDER BY cps.step_number
        SEPARATOR ','
    ) as step_details,
    MAX(cps.updated_at) as last_activity
FROM user_cvs cv
LEFT JOIN cv_processing_steps cps ON cv.id = cps.cv_id
WHERE cv.deleted_at IS NULL
GROUP BY cv.id;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'competentnl_rag'
  AND TABLE_NAME IN ('cv_processing_steps', 'cv_pii_detections');

COMMIT;
