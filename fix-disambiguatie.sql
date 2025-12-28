-- ============================================================
-- FIX: Meerdere architecten toevoegen voor disambiguatie test
-- ============================================================
-- Probleem: Test 1 faalt omdat er maar 1 architect in de database staat
-- Oplossing: Voeg meerdere architect-types toe met dezelfde zoekterm "Architect"
-- ============================================================

USE competentnl_rag;

-- Eerst kijken wat er nu in staat
SELECT * FROM occupation_labels WHERE label LIKE '%rchitect%';

-- Verwijder bestaande architect entries om duplicaten te voorkomen
DELETE FROM occupation_labels WHERE label LIKE '%rchitect%';

-- Voeg meerdere architecten toe met VERSCHILLENDE URI's maar DEZELFDE zoekterm "Architect"
-- Dit triggert disambiguatie omdat meerdere unieke beroepen matchen
INSERT INTO occupation_labels (occupation_uri, pref_label, label, label_type, language) VALUES
-- Bouwkundig architect
('https://linkeddata.competentnl.nl/id/occupation/architect-bouwkunde', 'Architect bouwkunde', 'Architect', 'prefLabel', 'nl'),
('https://linkeddata.competentnl.nl/id/occupation/architect-bouwkunde', 'Architect bouwkunde', 'Bouwkundig architect', 'altLabel', 'nl'),

-- Software/IT architect  
('https://linkeddata.competentnl.nl/id/occupation/architect-software', 'Software architect', 'Architect', 'altLabel', 'nl'),
('https://linkeddata.competentnl.nl/id/occupation/architect-software', 'Software architect', 'IT architect', 'altLabel', 'nl'),
('https://linkeddata.competentnl.nl/id/occupation/architect-software', 'Software architect', 'Solution architect', 'altLabel', 'nl'),

-- Interieurarchitect
('https://linkeddata.competentnl.nl/id/occupation/architect-interieur', 'Interieurarchitect', 'Architect', 'altLabel', 'nl'),
('https://linkeddata.competentnl.nl/id/occupation/architect-interieur', 'Interieurarchitect', 'Binnenhuisarchitect', 'altLabel', 'nl'),

-- Landschapsarchitect
('https://linkeddata.competentnl.nl/id/occupation/architect-landschap', 'Landschapsarchitect', 'Architect', 'altLabel', 'nl'),
('https://linkeddata.competentnl.nl/id/occupation/architect-landschap', 'Landschapsarchitect', 'Tuinarchitect', 'altLabel', 'nl'),

-- Enterprise architect
('https://linkeddata.competentnl.nl/id/occupation/architect-enterprise', 'Enterprise architect', 'Architect', 'altLabel', 'nl'),
('https://linkeddata.competentnl.nl/id/occupation/architect-enterprise', 'Enterprise architect', 'Bedrijfsarchitect', 'altLabel', 'nl');

-- Verificatie: toon alle architecten
SELECT occupation_uri, pref_label, label, label_type 
FROM occupation_labels 
WHERE label LIKE '%rchitect%'
ORDER BY occupation_uri, label_type;

-- Tel hoeveel UNIEKE beroepen matchen op "Architect"
SELECT COUNT(DISTINCT occupation_uri) as aantal_unieke_architecten
FROM occupation_labels 
WHERE LOWER(label) = 'architect';

-- Dit moet 5 zijn (bouwkunde, software, interieur, landschap, enterprise)
-- Dan triggert de disambiguatie correct!

SELECT '✅ Fix toegepast! Voer nu opnieuw uit: node test-runner.mjs --scenario=1' as status;
