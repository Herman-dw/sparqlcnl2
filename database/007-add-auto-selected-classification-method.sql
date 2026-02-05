-- ============================================================================
-- Add 'auto_selected' to classification_method ENUM
-- ============================================================================
--
-- The quick upload flow auto-selects the best alternative when no confident
-- match is found. This needs a distinct classification_method value.
-- ============================================================================

ALTER TABLE cv_extractions
MODIFY COLUMN classification_method
ENUM('exact', 'fuzzy', 'semantic', 'llm', 'manual', 'rules', 'local_db', 'auto_selected') NULL
COMMENT 'Methode waarmee classificatie is bepaald';
