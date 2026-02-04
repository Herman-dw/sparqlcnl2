-- Database Migratie: CV Job Worker Support
-- Versie: 006
-- Datum: 2026-02-04
-- Beschrijving: Voegt retry/backoff ondersteuning toe voor CV processing jobs

USE competentnl_rag;

-- ============================================================================
-- 1. Voeg retry kolommen toe aan user_cvs
-- ============================================================================

ALTER TABLE user_cvs
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0 COMMENT 'Aantal keer herstart na failure',
  ADD COLUMN IF NOT EXISTS last_retry_at DATETIME NULL COMMENT 'Timestamp van laatste retry poging',
  ADD COLUMN IF NOT EXISTS next_retry_at DATETIME NULL COMMENT 'Wanneer volgende retry gepland is';

-- Index voor worker queries
ALTER TABLE user_cvs
  ADD INDEX IF NOT EXISTS idx_retry (processing_status, next_retry_at, retry_count);

-- ============================================================================
-- 2. Voeg cv_deleted en gdpr_data_exported event types toe aan privacy_consent_logs
-- ============================================================================

ALTER TABLE privacy_consent_logs
  MODIFY COLUMN event_type ENUM(
    'pii_detected',
    'pii_anonymized',
    'employer_generalized',
    'user_consent_given',
    'user_consent_declined',
    'llm_call_made',
    'exact_data_shared',
    'cv_deleted',
    'gdpr_data_exported',
    'security_incident'
  ) NOT NULL;

-- ============================================================================
-- 3. Security Incidents Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NULL COMMENT 'Related CV if applicable',

    -- Incident details
    incident_type VARCHAR(100) NOT NULL COMMENT 'e.g., pii_sent_to_llm, unauthorized_access',
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    description TEXT NOT NULL,
    details JSON NULL COMMENT 'Additional structured details',

    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at DATETIME NULL,
    resolved_by VARCHAR(255) NULL,
    resolution_notes TEXT NULL,

    -- Audit
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE SET NULL,

    INDEX idx_incident_type (incident_type),
    INDEX idx_severity (severity),
    INDEX idx_resolved (resolved),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Security incident tracking voor audit en compliance';

COMMIT;
