-- Database Migratie: CV Privacy Processing Tables
-- Versie: 003
-- Datum: 2026-01-13
-- Beschrijving: Tabellen voor privacy-first CV verwerking

USE competentnl_rag;

-- ============================================================================
-- 1. CV Documents Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_cvs (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Identificatie
    session_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NULL COMMENT 'Optioneel voor registered users',

    -- File metadata
    file_name VARCHAR(500) NOT NULL,
    file_size_kb INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Text content
    original_text_encrypted MEDIUMBLOB COMMENT 'AES-256 encrypted original CV',
    anonymized_text MEDIUMTEXT COMMENT 'PII-removed text',

    -- PII Tracking
    pii_detected JSON COMMENT 'Types of PII found: ["email", "phone", "name", "address"]',
    pii_count INT DEFAULT 0 COMMENT 'Total PII items detected',

    -- Processing status
    processing_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    processing_started_at DATETIME NULL,
    processing_completed_at DATETIME NULL,
    processing_duration_ms INT NULL,
    error_message TEXT NULL,

    -- Privacy risk assessment
    privacy_risk_score INT COMMENT '0-100, calculated by riskAssessment service',
    privacy_risk_level ENUM('low', 'medium', 'high', 'critical') NULL,
    allow_exact_data BOOLEAN DEFAULT FALSE COMMENT 'User consented to share exact employers',

    -- Relations
    created_profile_id INT NULL COMMENT 'Link to generated MatchProfile',

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL COMMENT 'Soft delete for GDPR compliance',

    -- Indexes
    INDEX idx_session (session_id),
    INDEX idx_status (processing_status),
    INDEX idx_upload_date (upload_date),
    INDEX idx_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='CV documents met encrypted originals en anonymized versions';

-- ============================================================================
-- 2. CV Extractions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS cv_extractions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,

    -- Section type
    section_type ENUM('experience', 'education', 'skill', 'summary') NOT NULL,

    -- Content (structured JSON)
    content JSON NOT NULL COMMENT 'Extracted structured data',
    /* Example for experience:
    {
      "job_title": "Software Engineer",
      "organization": "Google",
      "start_date": "2020",
      "end_date": "2022",
      "duration_years": 2,
      "description": "...",
      "extracted_skills": ["Python", "React"]
    }
    */

    -- Anonymization
    original_employer VARCHAR(500) NULL COMMENT 'Original employer name',
    generalized_employer VARCHAR(500) NULL COMMENT 'Generalized category',
    employer_sector VARCHAR(200) NULL,
    employer_is_identifying BOOLEAN DEFAULT FALSE,

    -- Classification results
    matched_cnl_uri VARCHAR(500) NULL COMMENT 'CNL occupation or education URI',
    matched_cnl_label VARCHAR(500) NULL,
    confidence_score FLOAT COMMENT '0.0 - 1.0',
    classification_method ENUM('rules', 'local_db', 'llm', 'manual') NULL,
    alternative_matches JSON COMMENT 'Other possible CNL matches',

    -- Review flags
    needs_review BOOLEAN DEFAULT FALSE,
    user_validated BOOLEAN DEFAULT FALSE,
    user_correction JSON NULL COMMENT 'User-provided corrections',

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,

    INDEX idx_cv_id (cv_id),
    INDEX idx_section_type (section_type),
    INDEX idx_needs_review (needs_review),
    INDEX idx_confidence (confidence_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Extracted and classified CV sections';

-- ============================================================================
-- 3. Privacy Consent Logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS privacy_consent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,

    -- Event type
    event_type ENUM(
        'pii_detected',
        'pii_anonymized',
        'employer_generalized',
        'user_consent_given',
        'user_consent_declined',
        'llm_call_made',
        'exact_data_shared'
    ) NOT NULL,

    -- PII details
    pii_types JSON COMMENT '["email", "phone", "name"]',
    pii_count INT DEFAULT 0,

    -- Employer details
    employers_original JSON NULL COMMENT 'Original employer names',
    employers_generalized JSON NULL COMMENT 'Generalized versions',
    risk_score FLOAT NULL COMMENT 'Re-identification risk (0-1)',

    -- Consent
    consent_given BOOLEAN NULL,
    consent_text TEXT NULL COMMENT 'Consent modal text shown to user',
    exact_data_shared BOOLEAN DEFAULT FALSE,

    -- LLM tracking
    llm_provider VARCHAR(100) NULL COMMENT 'e.g., "Gemini", "Local"',
    llm_data_sent JSON NULL COMMENT 'What data was sent to LLM (for audit)',
    llm_contained_pii BOOLEAN DEFAULT FALSE COMMENT 'Safety check',

    -- Audit
    ip_address VARCHAR(45) NULL COMMENT 'User IP for audit',
    user_agent TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,

    INDEX idx_cv_id (cv_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at),
    INDEX idx_llm_pii (llm_contained_pii)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit log voor privacy events en user consent';

-- ============================================================================
-- 4. Employer Categories (Reference Data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS employer_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Employer info
    employer_name VARCHAR(500) NOT NULL,
    category VARCHAR(500) NOT NULL COMMENT 'Generalized category',
    sector VARCHAR(200) NOT NULL,

    -- Risk flags
    is_identifying BOOLEAN DEFAULT FALSE COMMENT 'Is this employer identifying?',
    is_famous BOOLEAN DEFAULT FALSE COMMENT 'Is this a well-known company?',
    tier ENUM('exact', 'sector', 'generic') DEFAULT 'sector',

    -- Pattern matching
    pattern VARCHAR(500) NULL COMMENT 'Regex pattern for matching',

    -- Usage stats
    match_count INT DEFAULT 0 COMMENT 'How often matched in CVs',

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unique_employer (employer_name),
    INDEX idx_category (category),
    INDEX idx_sector (sector),
    INDEX idx_identifying (is_identifying)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Reference data voor employer generalisatie';

-- ============================================================================
-- 5. Processing Metrics (Analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cv_processing_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,

    -- Performance metrics
    step ENUM('upload', 'extract_text', 'detect_pii', 'anonymize', 'parse', 'classify', 'review') NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME NULL,
    duration_ms INT NULL,

    -- Status
    status ENUM('started', 'completed', 'failed') NOT NULL,
    error_message TEXT NULL,

    -- Metadata
    metadata JSON COMMENT 'Step-specific data',

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,

    INDEX idx_cv_id (cv_id),
    INDEX idx_step (step),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Performance monitoring en debugging';

-- ============================================================================
-- 6. User Feedback (Learning Loop)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cv_extraction_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    extraction_id INT NOT NULL,

    -- Feedback type
    feedback_type ENUM('correct', 'incorrect', 'missing', 'duplicate', 'other') NOT NULL,

    -- Details
    field_name VARCHAR(200) COMMENT 'Which field: "job_title", "employer", etc.',
    original_value TEXT,
    corrected_value TEXT,
    user_comment TEXT NULL,

    -- Impact
    was_llm_involved BOOLEAN DEFAULT FALSE COMMENT 'Was this field classified by LLM?',
    will_retrain BOOLEAN DEFAULT FALSE COMMENT 'Use for model retraining?',

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,
    FOREIGN KEY (extraction_id) REFERENCES cv_extractions(id) ON DELETE CASCADE,

    INDEX idx_cv_id (cv_id),
    INDEX idx_extraction_id (extraction_id),
    INDEX idx_feedback_type (feedback_type),
    INDEX idx_llm_involved (was_llm_involved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User feedback voor model verbetering';

-- ============================================================================
-- SEED DATA: Employer Categories
-- ============================================================================

INSERT INTO employer_categories (employer_name, category, sector, is_identifying, is_famous, tier) VALUES
-- Tech Giants
('Google', 'Groot internationaal tech bedrijf', 'ICT', TRUE, TRUE, 'exact'),
('Microsoft', 'Groot internationaal tech bedrijf', 'ICT', TRUE, TRUE, 'exact'),
('Apple', 'Groot internationaal tech bedrijf', 'ICT', TRUE, TRUE, 'exact'),
('Meta', 'Groot internationaal tech bedrijf', 'ICT', TRUE, TRUE, 'exact'),
('Amazon', 'Groot internationaal tech bedrijf', 'ICT', TRUE, TRUE, 'exact'),
('Netflix', 'Groot internationaal tech bedrijf', 'ICT', TRUE, TRUE, 'exact'),

-- AI Companies
('OpenAI', 'AI/ML startup', 'Kunstmatige Intelligentie', TRUE, TRUE, 'exact'),
('Anthropic', 'AI/ML startup', 'Kunstmatige Intelligentie', TRUE, TRUE, 'exact'),
('DeepMind', 'AI/ML onderzoekslab', 'Kunstmatige Intelligentie', TRUE, TRUE, 'exact'),

-- Dutch Tech
('Booking.com', 'Nederlands tech bedrijf', 'ICT', TRUE, TRUE, 'exact'),
('Adyen', 'Nederlands fintech bedrijf', 'Financiële technologie', TRUE, TRUE, 'exact'),
('Mollie', 'Nederlands fintech bedrijf', 'Financiële technologie', TRUE, TRUE, 'exact'),

-- Consulting (Big 4)
('Deloitte', 'Big 4 consultancy', 'Zakelijke dienstverlening', TRUE, TRUE, 'exact'),
('PwC', 'Big 4 consultancy', 'Zakelijke dienstverlening', TRUE, TRUE, 'exact'),
('EY', 'Big 4 consultancy', 'Zakelijke dienstverlening', TRUE, TRUE, 'exact'),
('KPMG', 'Big 4 consultancy', 'Zakelijke dienstverlening', TRUE, TRUE, 'exact'),

-- Banks
('ING', 'Nederlandse bank', 'Financiële dienstverlening', FALSE, TRUE, 'sector'),
('ABN AMRO', 'Nederlandse bank', 'Financiële dienstverlening', FALSE, TRUE, 'sector'),
('Rabobank', 'Nederlandse bank', 'Financiële dienstverlening', FALSE, TRUE, 'sector')

ON DUPLICATE KEY UPDATE
    category = VALUES(category),
    sector = VALUES(sector),
    is_identifying = VALUES(is_identifying),
    is_famous = VALUES(is_famous);

-- ============================================================================
-- VIEWS voor eenvoudige queries
-- ============================================================================

-- View: Complete CV overview
CREATE OR REPLACE VIEW v_cv_overview AS
SELECT
    cv.id,
    cv.session_id,
    cv.file_name,
    cv.upload_date,
    cv.processing_status,
    cv.privacy_risk_level,
    cv.pii_count,
    cv.allow_exact_data,
    COUNT(DISTINCT ex.id) as extraction_count,
    GROUP_CONCAT(DISTINCT ex.section_type) as sections_found,
    MAX(ex.confidence_score) as max_confidence,
    MIN(ex.confidence_score) as min_confidence,
    SUM(CASE WHEN ex.needs_review THEN 1 ELSE 0 END) as items_need_review
FROM user_cvs cv
LEFT JOIN cv_extractions ex ON cv.id = ex.cv_id
WHERE cv.deleted_at IS NULL
GROUP BY cv.id;

-- View: Privacy audit trail
CREATE OR REPLACE VIEW v_privacy_audit AS
SELECT
    cv.id as cv_id,
    cv.session_id,
    cv.upload_date,
    pcl.event_type,
    pcl.pii_types,
    pcl.consent_given,
    pcl.exact_data_shared,
    pcl.llm_provider,
    pcl.llm_contained_pii,
    pcl.created_at as event_timestamp
FROM user_cvs cv
JOIN privacy_consent_logs pcl ON cv.id = pcl.cv_id
WHERE cv.deleted_at IS NULL
ORDER BY pcl.created_at DESC;

-- ============================================================================
-- TRIGGERS voor automatische cleanup (GDPR)
-- ============================================================================

DELIMITER //

-- Trigger: Auto-delete oude CVs na 30 dagen
CREATE EVENT IF NOT EXISTS cleanup_old_cvs
ON SCHEDULE EVERY 1 DAY
DO
BEGIN
    -- Soft delete CVs older than 30 days
    UPDATE user_cvs
    SET deleted_at = NOW(),
        original_text_encrypted = NULL,
        anonymized_text = NULL
    WHERE upload_date < DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND deleted_at IS NULL;

    -- Log cleanup
    INSERT INTO privacy_consent_logs (cv_id, event_type, created_at)
    SELECT id, 'gdpr_auto_delete', NOW()
    FROM user_cvs
    WHERE deleted_at IS NOT NULL
      AND deleted_at >= DATE_SUB(NOW(), INTERVAL 1 DAY);
END //

DELIMITER ;

-- ============================================================================
-- GRANTS (adjust voor jouw user)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE, DELETE ON competentnl_rag.user_cvs TO 'competentnl_user'@'localhost';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON competentnl_rag.cv_extractions TO 'competentnl_user'@'localhost';
-- GRANT SELECT, INSERT ON competentnl_rag.privacy_consent_logs TO 'competentnl_user'@'localhost';
-- GRANT SELECT ON competentnl_rag.employer_categories TO 'competentnl_user'@'localhost';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check tables created
SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'competentnl_rag'
  AND TABLE_NAME LIKE 'user_cvs'
     OR TABLE_NAME LIKE 'cv_%'
     OR TABLE_NAME LIKE 'employer_%'
     OR TABLE_NAME LIKE 'privacy_%';

-- Check seed data
SELECT COUNT(*) as employer_categories_count FROM employer_categories;

COMMIT;
