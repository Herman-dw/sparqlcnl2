-- Cleanup test records
USE competentnl_rag;

DELETE FROM schema_concepts WHERE uri LIKE 'test:%';

SELECT 'Test records verwijderd. Eindresultaat:' as info;
SELECT COUNT(*) as totaal FROM schema_concepts;

SELECT concept_type, COUNT(*) as aantal FROM schema_concepts GROUP BY concept_type ORDER BY aantal DESC;
