-- =====================================================
-- Rijbewijzen en Chauffeurscertificaten voor CNL Classificatie
-- =====================================================
-- Uitputtende lijst van alle Nederlandse rijbewijzen, certificaten
-- en aanvullende kwalificaties voor professioneel transport.
--
-- Categorie: knowledge (kennisgebied)
-- Basis URI: https://linkeddata.competentnl.nl/local/id/knowledge/
-- =====================================================

-- Zorg dat de knowledge_labels tabel bestaat
CREATE TABLE IF NOT EXISTS knowledge_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    knowledge_uri VARCHAR(500) NOT NULL,
    pref_label VARCHAR(500) NOT NULL,
    label VARCHAR(500) NOT NULL,
    label_normalized VARCHAR(500) NOT NULL,
    label_type ENUM('prefLabel', 'altLabel', 'specialization', 'synonym', 'abbreviation') DEFAULT 'prefLabel',
    source VARCHAR(100) DEFAULT 'local_seed',
    validated BOOLEAN DEFAULT TRUE,
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
-- CATEGORIE AM - BROMFIETS
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- AM Basis
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-am', 'Rijbewijs AM', 'Rijbewijs AM', 'rijbewijs am', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-am', 'Rijbewijs AM', 'Bromfietsrijbewijs', 'bromfietsrijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-am', 'Rijbewijs AM', 'AM rijbewijs', 'am rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-am', 'Rijbewijs AM', 'Brommer rijbewijs', 'brommer rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-am', 'Rijbewijs AM', 'Scooterrijbewijs', 'scooterrijbewijs', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- CATEGORIE A - MOTOR
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- A1 (lichte motor)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a1', 'Rijbewijs A1', 'Rijbewijs A1', 'rijbewijs a1', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a1', 'Rijbewijs A1', 'Motorrijbewijs A1', 'motorrijbewijs a1', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a1', 'Rijbewijs A1', 'Lichte motorrijbewijs', 'lichte motorrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a1', 'Rijbewijs A1', 'A1 motor', 'a1 motor', 'abbreviation', 'local_seed'),

-- A2 (middelzware motor)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a2', 'Rijbewijs A2', 'Rijbewijs A2', 'rijbewijs a2', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a2', 'Rijbewijs A2', 'Motorrijbewijs A2', 'motorrijbewijs a2', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a2', 'Rijbewijs A2', 'Middelzwaar motorrijbewijs', 'middelzwaar motorrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a2', 'Rijbewijs A2', 'A2 motor', 'a2 motor', 'abbreviation', 'local_seed'),

-- A (volledige motor)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a', 'Rijbewijs A', 'Rijbewijs A', 'rijbewijs a', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a', 'Rijbewijs A', 'Motorrijbewijs', 'motorrijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a', 'Rijbewijs A', 'Groot motorrijbewijs', 'groot motorrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a', 'Rijbewijs A', 'Motor rijbewijs', 'motor rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-a', 'Rijbewijs A', 'Volledig motorrijbewijs', 'volledig motorrijbewijs', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- CATEGORIE B - PERSONENAUTO
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- B Basis
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b', 'Rijbewijs B', 'Rijbewijs B', 'rijbewijs b', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b', 'Rijbewijs B', 'Autorijbewijs', 'autorijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b', 'Rijbewijs B', 'Personenautorijbewijs', 'personenautorijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b', 'Rijbewijs B', 'PKW rijbewijs', 'pkw rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b', 'Rijbewijs B', 'B rijbewijs', 'b rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b', 'Rijbewijs B', 'Rijbewijs voor auto', 'rijbewijs voor auto', 'synonym', 'local_seed'),

-- B+ (auto met aanhanger, voorheen BE)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b-plus', 'Rijbewijs B+', 'Rijbewijs B+', 'rijbewijs b+', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b-plus', 'Rijbewijs B+', 'B+ rijbewijs', 'b+ rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-b-plus', 'Rijbewijs B+', 'Rijbewijs B met aanhanger', 'rijbewijs b met aanhanger', 'synonym', 'local_seed'),

-- BE (auto met zware aanhanger)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-be', 'Rijbewijs BE', 'Rijbewijs BE', 'rijbewijs be', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-be', 'Rijbewijs BE', 'Aanhangwagenrijbewijs', 'aanhangwagenrijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-be', 'Rijbewijs BE', 'BE rijbewijs', 'be rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-be', 'Rijbewijs BE', 'Rijbewijs auto met aanhanger', 'rijbewijs auto met aanhanger', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-be', 'Rijbewijs BE', 'Caravanrijbewijs', 'caravanrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-be', 'Rijbewijs BE', 'Rijbewijs voor caravan', 'rijbewijs voor caravan', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-be', 'Rijbewijs BE', 'Paardentrailer rijbewijs', 'paardentrailer rijbewijs', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- CATEGORIE C - VRACHTWAGEN
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- C1 (lichte vrachtwagen)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c1', 'Rijbewijs C1', 'Rijbewijs C1', 'rijbewijs c1', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c1', 'Rijbewijs C1', 'Lichte vrachtwagenrijbewijs', 'lichte vrachtwagenrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c1', 'Rijbewijs C1', 'C1 rijbewijs', 'c1 rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c1', 'Rijbewijs C1', 'Kleine vrachtwagenrijbewijs', 'kleine vrachtwagenrijbewijs', 'synonym', 'local_seed'),

-- C1E (lichte vrachtwagen met aanhanger)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c1e', 'Rijbewijs C1E', 'Rijbewijs C1E', 'rijbewijs c1e', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c1e', 'Rijbewijs C1E', 'C1E rijbewijs', 'c1e rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c1e', 'Rijbewijs C1E', 'Lichte vrachtwagen met aanhanger', 'lichte vrachtwagen met aanhanger', 'synonym', 'local_seed'),

-- C (zware vrachtwagen)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c', 'Rijbewijs C', 'Rijbewijs C', 'rijbewijs c', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c', 'Rijbewijs C', 'Vrachtwagenrijbewijs', 'vrachtwagenrijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c', 'Rijbewijs C', 'Groot rijbewijs', 'groot rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c', 'Rijbewijs C', 'C rijbewijs', 'c rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c', 'Rijbewijs C', 'Vrachtwagen rijbewijs', 'vrachtwagen rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c', 'Rijbewijs C', 'Truck rijbewijs', 'truck rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-c', 'Rijbewijs C', 'Zwaar rijbewijs', 'zwaar rijbewijs', 'synonym', 'local_seed'),

-- CE (vrachtwagen met aanhanger / trekker-oplegger)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-ce', 'Rijbewijs CE', 'Rijbewijs CE', 'rijbewijs ce', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-ce', 'Rijbewijs CE', 'CE rijbewijs', 'ce rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-ce', 'Rijbewijs CE', 'Trekker-oplegger rijbewijs', 'trekker oplegger rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-ce', 'Rijbewijs CE', 'Vrachtwagen met aanhanger', 'vrachtwagen met aanhanger', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-ce', 'Rijbewijs CE', 'Oplegger rijbewijs', 'oplegger rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-ce', 'Rijbewijs CE', 'Combinatie rijbewijs', 'combinatie rijbewijs', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- CATEGORIE D - BUS
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- D1 (kleine bus)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d1', 'Rijbewijs D1', 'Rijbewijs D1', 'rijbewijs d1', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d1', 'Rijbewijs D1', 'Kleine busrijbewijs', 'kleine busrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d1', 'Rijbewijs D1', 'D1 rijbewijs', 'd1 rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d1', 'Rijbewijs D1', 'Minibusrijbewijs', 'minibusrijbewijs', 'synonym', 'local_seed'),

-- D1E (kleine bus met aanhanger)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d1e', 'Rijbewijs D1E', 'Rijbewijs D1E', 'rijbewijs d1e', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d1e', 'Rijbewijs D1E', 'D1E rijbewijs', 'd1e rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d1e', 'Rijbewijs D1E', 'Kleine bus met aanhanger', 'kleine bus met aanhanger', 'synonym', 'local_seed'),

-- D (grote bus)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d', 'Rijbewijs D', 'Rijbewijs D', 'rijbewijs d', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d', 'Rijbewijs D', 'Busrijbewijs', 'busrijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d', 'Rijbewijs D', 'D rijbewijs', 'd rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d', 'Rijbewijs D', 'Groot busrijbewijs', 'groot busrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d', 'Rijbewijs D', 'Touringcarrijbewijs', 'touringcarrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d', 'Rijbewijs D', 'Bus rijbewijs', 'bus rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-d', 'Rijbewijs D', 'OV rijbewijs', 'ov rijbewijs', 'synonym', 'local_seed'),

-- DE (bus met aanhanger)
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-de', 'Rijbewijs DE', 'Rijbewijs DE', 'rijbewijs de', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-de', 'Rijbewijs DE', 'DE rijbewijs', 'de rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-de', 'Rijbewijs DE', 'Bus met aanhanger', 'bus met aanhanger', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- CATEGORIE T - TRACTOR / LANDBOUWVOERTUIGEN
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-t', 'Rijbewijs T', 'Rijbewijs T', 'rijbewijs t', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-t', 'Rijbewijs T', 'Tractorrijbewijs', 'tractorrijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-t', 'Rijbewijs T', 'T rijbewijs', 't rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-t', 'Rijbewijs T', 'Landbouwtrekkerrijbewijs', 'landbouwtrekkerrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-t', 'Rijbewijs T', 'Trekkerrijbewijs', 'trekkerrijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-t', 'Rijbewijs T', 'LZV rijbewijs', 'lzv rijbewijs', 'abbreviation', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/rijbewijs-t', 'Rijbewijs T', 'Landbouwvoertuig rijbewijs', 'landbouwvoertuig rijbewijs', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- CODE 95 - VAKBEKWAAMHEID CHAUFFEUR
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- Code 95 algemeen
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Code 95', 'code 95', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Chauffeursdiploma', 'chauffeursdiploma', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Vakbekwaamheid chauffeur', 'vakbekwaamheid chauffeur', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'CCV code 95', 'ccv code 95', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Nascholing chauffeur', 'nascholing chauffeur', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Beroepschauffeur certificaat', 'beroepschauffeur certificaat', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Chauffeursdiploma D', 'chauffeursdiploma d', 'specialization', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Chauffeursdiploma C', 'chauffeursdiploma c', 'specialization', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Basiskwalificatie chauffeur', 'basiskwalificatie chauffeur', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/code-95', 'Code 95 (Vakbekwaamheid chauffeur)', 'Beroepschauffeur diploma', 'beroepschauffeur diploma', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- ADR - GEVAARLIJKE STOFFEN
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- ADR Basis
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-basis', 'ADR Certificaat Basis', 'ADR certificaat', 'adr certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-basis', 'ADR Certificaat Basis', 'ADR basis', 'adr basis', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-basis', 'ADR Certificaat Basis', 'Gevaarlijke stoffen certificaat', 'gevaarlijke stoffen certificaat', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-basis', 'ADR Certificaat Basis', 'Transport gevaarlijke stoffen', 'transport gevaarlijke stoffen', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-basis', 'ADR Certificaat Basis', 'ADR rijbewijs', 'adr rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-basis', 'ADR Certificaat Basis', 'Gevaarlijke goederen certificaat', 'gevaarlijke goederen certificaat', 'synonym', 'local_seed'),

-- ADR Tank
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-tank', 'ADR Certificaat Tank', 'ADR tank', 'adr tank', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-tank', 'ADR Certificaat Tank', 'ADR tankcertificaat', 'adr tankcertificaat', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-tank', 'ADR Certificaat Tank', 'Tankvervoer gevaarlijke stoffen', 'tankvervoer gevaarlijke stoffen', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-tank', 'ADR Certificaat Tank', 'ADR tanktransport', 'adr tanktransport', 'synonym', 'local_seed'),

-- ADR Klasse 1 (explosieven)
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-klasse1', 'ADR Certificaat Klasse 1', 'ADR klasse 1', 'adr klasse 1', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-klasse1', 'ADR Certificaat Klasse 1', 'ADR explosieven', 'adr explosieven', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-klasse1', 'ADR Certificaat Klasse 1', 'Explosieven vervoer certificaat', 'explosieven vervoer certificaat', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-klasse1', 'ADR Certificaat Klasse 1', 'Transport explosieven', 'transport explosieven', 'synonym', 'local_seed'),

-- ADR Klasse 7 (radioactief)
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-klasse7', 'ADR Certificaat Klasse 7', 'ADR klasse 7', 'adr klasse 7', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-klasse7', 'ADR Certificaat Klasse 7', 'ADR radioactief', 'adr radioactief', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/adr-klasse7', 'ADR Certificaat Klasse 7', 'Radioactief vervoer certificaat', 'radioactief vervoer certificaat', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- VCA - VEILIGHEID
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
('https://linkeddata.competentnl.nl/local/id/knowledge/vca-basis', 'VCA Basis', 'VCA basis', 'vca basis', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/vca-basis', 'VCA Basis', 'VCA certificaat', 'vca certificaat', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/vca-basis', 'VCA Basis', 'Veiligheid Checklist Aannemers', 'veiligheid checklist aannemers', 'synonym', 'local_seed'),

('https://linkeddata.competentnl.nl/local/id/knowledge/vca-vol', 'VCA VOL', 'VCA VOL', 'vca vol', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/vca-vol', 'VCA VOL', 'VCA volledige opleiding', 'vca volledige opleiding', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/vca-vol', 'VCA VOL', 'VCA leidinggevende', 'vca leidinggevende', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- HEFTRUCK / REACHTRUCK
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
('https://linkeddata.competentnl.nl/local/id/knowledge/heftruckcertificaat', 'Heftruckcertificaat', 'Heftruckcertificaat', 'heftruckcertificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/heftruckcertificaat', 'Heftruckcertificaat', 'Heftruck rijbewijs', 'heftruck rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/heftruckcertificaat', 'Heftruckcertificaat', 'Vorkheftruck certificaat', 'vorkheftruck certificaat', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/heftruckcertificaat', 'Heftruckcertificaat', 'Heftruck diploma', 'heftruck diploma', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/heftruckcertificaat', 'Heftruckcertificaat', 'Stapelaar certificaat', 'stapelaar certificaat', 'synonym', 'local_seed'),

('https://linkeddata.competentnl.nl/local/id/knowledge/reachtruckcertificaat', 'Reachtruckcertificaat', 'Reachtruckcertificaat', 'reachtruckcertificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/reachtruckcertificaat', 'Reachtruckcertificaat', 'Reachtruck rijbewijs', 'reachtruck rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/reachtruckcertificaat', 'Reachtruckcertificaat', 'Reachtruck diploma', 'reachtruck diploma', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- OVERIGE CERTIFICATEN
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
-- BHV
('https://linkeddata.competentnl.nl/local/id/knowledge/bhv-certificaat', 'BHV Certificaat', 'BHV certificaat', 'bhv certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/bhv-certificaat', 'BHV Certificaat', 'Bedrijfshulpverlening', 'bedrijfshulpverlening', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/bhv-certificaat', 'BHV Certificaat', 'BHV diploma', 'bhv diploma', 'synonym', 'local_seed'),

-- EHBO
('https://linkeddata.competentnl.nl/local/id/knowledge/ehbo-certificaat', 'EHBO Certificaat', 'EHBO certificaat', 'ehbo certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/ehbo-certificaat', 'EHBO Certificaat', 'Eerste hulp diploma', 'eerste hulp diploma', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/ehbo-certificaat', 'EHBO Certificaat', 'EHBO diploma', 'ehbo diploma', 'synonym', 'local_seed'),

-- Taxichauffeur
('https://linkeddata.competentnl.nl/local/id/knowledge/taxichauffeur', 'Taxipas / Chauffeurskaart', 'Taxipas', 'taxipas', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/taxichauffeur', 'Taxipas / Chauffeurskaart', 'Chauffeurskaart taxi', 'chauffeurskaart taxi', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/taxichauffeur', 'Taxipas / Chauffeurskaart', 'Taxivergunning', 'taxivergunning', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/taxichauffeur', 'Taxipas / Chauffeurskaart', 'Taxichauffeur diploma', 'taxichauffeur diploma', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/taxichauffeur', 'Taxipas / Chauffeurskaart', 'Taxi rijbewijs', 'taxi rijbewijs', 'synonym', 'local_seed'),

-- Bestelbus / Koeriersdienst
('https://linkeddata.competentnl.nl/local/id/knowledge/koerierscertificaat', 'Koerier / Bestelbus certificaat', 'Koerierscertificaat', 'koerierscertificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/koerierscertificaat', 'Koerier / Bestelbus certificaat', 'Bestelbus certificaat', 'bestelbus certificaat', 'altLabel', 'local_seed'),

-- Kraanmachinist
('https://linkeddata.competentnl.nl/local/id/knowledge/kraanmachinist', 'Kraanmachinist certificaat', 'Kraanmachinist certificaat', 'kraanmachinist certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/kraanmachinist', 'Kraanmachinist certificaat', 'Hijskraan certificaat', 'hijskraan certificaat', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/kraanmachinist', 'Kraanmachinist certificaat', 'Kraan rijbewijs', 'kraan rijbewijs', 'synonym', 'local_seed'),

-- Hoogwerker
('https://linkeddata.competentnl.nl/local/id/knowledge/hoogwerker', 'Hoogwerker certificaat', 'Hoogwerker certificaat', 'hoogwerker certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/hoogwerker', 'Hoogwerker certificaat', 'Hoogwerker diploma', 'hoogwerker diploma', 'altLabel', 'local_seed'),

-- Shovel / wiellader
('https://linkeddata.competentnl.nl/local/id/knowledge/shovel', 'Shovel / Wiellader certificaat', 'Shovel certificaat', 'shovel certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/shovel', 'Shovel / Wiellader certificaat', 'Wiellader certificaat', 'wiellader certificaat', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/shovel', 'Shovel / Wiellader certificaat', 'Shovel rijbewijs', 'shovel rijbewijs', 'synonym', 'local_seed'),

-- Graafmachine
('https://linkeddata.competentnl.nl/local/id/knowledge/graafmachine', 'Graafmachine certificaat', 'Graafmachine certificaat', 'graafmachine certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/graafmachine', 'Graafmachine certificaat', 'Grondverzetmachine certificaat', 'grondverzetmachine certificaat', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/graafmachine', 'Graafmachine certificaat', 'Graafmachine rijbewijs', 'graafmachine rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/graafmachine', 'Graafmachine certificaat', 'Kraan rijbewijs grondverzet', 'kraan rijbewijs grondverzet', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- BINNENVAART
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
('https://linkeddata.competentnl.nl/local/id/knowledge/klein-vaarbewijs', 'Klein Vaarbewijs', 'Klein vaarbewijs', 'klein vaarbewijs', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/klein-vaarbewijs', 'Klein Vaarbewijs', 'KVB 1', 'kvb 1', 'abbreviation', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/klein-vaarbewijs', 'Klein Vaarbewijs', 'KVB 2', 'kvb 2', 'abbreviation', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/klein-vaarbewijs', 'Klein Vaarbewijs', 'Vaarbewijs', 'vaarbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/klein-vaarbewijs', 'Klein Vaarbewijs', 'Bootrijbewijs', 'bootrijbewijs', 'synonym', 'local_seed'),

('https://linkeddata.competentnl.nl/local/id/knowledge/groot-vaarbewijs', 'Groot Vaarbewijs', 'Groot vaarbewijs', 'groot vaarbewijs', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/groot-vaarbewijs', 'Groot Vaarbewijs', 'Binnenvaart rijbewijs', 'binnenvaart rijbewijs', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/groot-vaarbewijs', 'Groot Vaarbewijs', 'Rijnpatent', 'rijnpatent', 'specialization', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/groot-vaarbewijs', 'Groot Vaarbewijs', 'Schippersdiploma', 'schippersdiploma', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- LUCHTVAART
-- =====================================================
INSERT INTO knowledge_labels (knowledge_uri, pref_label, label, label_normalized, label_type, source) VALUES
('https://linkeddata.competentnl.nl/local/id/knowledge/ppl', 'PPL (Private Pilot License)', 'PPL', 'ppl', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/ppl', 'PPL (Private Pilot License)', 'Vliegbrevet', 'vliegbrevet', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/ppl', 'PPL (Private Pilot License)', 'Private pilot license', 'private pilot license', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/ppl', 'PPL (Private Pilot License)', 'Pilotenlicence', 'pilotenlicence', 'synonym', 'local_seed'),

('https://linkeddata.competentnl.nl/local/id/knowledge/drone-certificaat', 'Drone certificaat (A1/A2/A3)', 'Drone certificaat', 'drone certificaat', 'prefLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/drone-certificaat', 'Drone certificaat (A1/A2/A3)', 'UAS certificaat', 'uas certificaat', 'altLabel', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/drone-certificaat', 'Drone certificaat (A1/A2/A3)', 'Drone rijbewijs', 'drone rijbewijs', 'synonym', 'local_seed'),
('https://linkeddata.competentnl.nl/local/id/knowledge/drone-certificaat', 'Drone certificaat (A1/A2/A3)', 'RPAS certificaat', 'rpas certificaat', 'synonym', 'local_seed')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- STATISTIEKEN
-- =====================================================
SELECT
    'Rijbewijzen en certificaten geladen' as status,
    COUNT(*) as total_entries,
    COUNT(DISTINCT knowledge_uri) as unique_concepts
FROM knowledge_labels
WHERE source = 'local_seed';
