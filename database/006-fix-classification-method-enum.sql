-- ============================================================================
-- Fix classification_method ENUM in cv_extractions table
-- ============================================================================
--
-- Issue: The column was created with ENUM('rules', 'local_db', 'llm', 'manual')
-- but the code uses values ('exact', 'fuzzy', 'semantic', 'llm', 'manual')
--
-- This migration updates the ENUM to include all required values.
-- ============================================================================

-- Update the ENUM to include all possible values
ALTER TABLE cv_extractions
MODIFY COLUMN classification_method
ENUM('exact', 'fuzzy', 'semantic', 'llm', 'manual', 'rules', 'local_db') NULL
COMMENT 'Methode waarmee classificatie is bepaald';

-- Verify the change
SELECT COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'cv_extractions'
  AND COLUMN_NAME = 'classification_method';
