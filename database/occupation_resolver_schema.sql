-- CompetentNL Occupation Resolver Schema
-- ======================================
-- Uitbreiding op de RAG database voor beroepen lookup
-- met synoniemen, altLabels en specialisaties

USE competentnl_rag;

-- ============================================
-- Tabel: occupation_labels
-- Alle mogelijke labels/namen voor beroepen
-- ============================================
CREATE TABLE IF NOT EXISTS occupation_labels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- De officiële occupation URI
  occupation_uri VARCHAR(500) NOT NULL,
  
  -- Het officiële prefLabel
  pref_label VARCHAR(500) NOT NULL,
  
  -- Het label dat we opslaan (kan prefLabel, altLabel, of specialisatie zijn)
  label VARCHAR(500) NOT NULL,
  label_normalized VARCHAR(500) NOT NULL,  -- lowercase, geen speciale tekens
  
  -- Type label
  label_type ENUM('prefLabel', 'altLabel', 'specialization', 'synonym', 'abbreviation') NOT NULL,
  
  -- Bron van dit label
  source ENUM('sparql', 'manual', 'ai_suggested') DEFAULT 'sparql',
  
  -- Is dit een gevalideerde match?
  validated BOOLEAN DEFAULT TRUE,
  
  -- Statistieken
  usage_count INT DEFAULT 0,
  last_used TIMESTAMP NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_label_normalized (label_normalized),
  INDEX idx_occupation_uri (occupation_uri(255)),
  INDEX idx_pref_label (pref_label(255)),
  INDEX idx_label_type (label_type),
  FULLTEXT INDEX ft_label (label, pref_label)
) ENGINE=InnoDB;

-- ============================================
-- Tabel: occupation_synonyms
-- Handmatig toegevoegde synoniemen
-- ============================================
CREATE TABLE IF NOT EXISTS occupation_synonyms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Het synoniem (wat gebruikers typen)
  synonym VARCHAR(500) NOT NULL,
  synonym_normalized VARCHAR(500) NOT NULL,
  
  -- Gekoppeld aan occupation
  occupation_uri VARCHAR(500) NOT NULL,
  pref_label VARCHAR(500) NOT NULL,
  
  -- Metadata
  added_by VARCHAR(100) DEFAULT 'system',
  confidence FLOAT DEFAULT 1.0,  -- 0-1, hoe zeker zijn we
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE INDEX idx_synonym_unique (synonym_normalized, occupation_uri(255)),
  INDEX idx_synonym (synonym_normalized),
  FULLTEXT INDEX ft_synonym (synonym)
) ENGINE=InnoDB;

-- ============================================
-- Tabel: occupation_search_log
-- Log van zoekopdrachten voor analyse
-- ============================================
CREATE TABLE IF NOT EXISTS occupation_search_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  search_term VARCHAR(500) NOT NULL,
  search_term_normalized VARCHAR(500) NOT NULL,
  
  -- Resultaat
  found_exact BOOLEAN DEFAULT FALSE,
  found_fuzzy BOOLEAN DEFAULT FALSE,
  results_count INT DEFAULT 0,
  
  -- Wat heeft de gebruiker gekozen?
  selected_occupation_uri VARCHAR(500) NULL,
  selected_pref_label VARCHAR(500) NULL,
  
  -- Was dit nuttig?
  user_confirmed BOOLEAN NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_search_term (search_term_normalized),
  INDEX idx_not_found (found_exact, found_fuzzy)
) ENGINE=InnoDB;

-- ============================================
-- View: Niet-gevonden zoektermen (voor verbetering)
-- ============================================
CREATE OR REPLACE VIEW v_missing_occupations AS
SELECT 
  search_term,
  COUNT(*) as search_count,
  MAX(created_at) as last_searched
FROM occupation_search_log
WHERE found_exact = FALSE AND found_fuzzy = FALSE
GROUP BY search_term
ORDER BY search_count DESC;

-- ============================================
-- Handmatige synoniemen toevoegen (voorbeelden)
-- ============================================
INSERT IGNORE INTO occupation_synonyms (synonym, synonym_normalized, occupation_uri, pref_label, confidence) VALUES
-- Loodgieter variaties
('loodgieter', 'loodgieter', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Installatiemonteur sanitair', 1.0),
('pijpfitter', 'pijpfitter', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Installatiemonteur sanitair', 0.9),

-- Kapper variaties
('kapper', 'kapper', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Kapper', 1.0),
('hairstylist', 'hairstylist', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Kapper', 0.9),
('coiffeur', 'coiffeur', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Kapper', 0.9),

-- IT variaties  
('programmeur', 'programmeur', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Softwareontwikkelaar', 1.0),
('developer', 'developer', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Softwareontwikkelaar', 1.0),
('coder', 'coder', 'https://linkeddata.competentnl.nl/id/occupation/PLACEHOLDER', 'Softwareontwikkelaar', 0.8);

SELECT 'Occupation resolver schema aangemaakt!' as status;
