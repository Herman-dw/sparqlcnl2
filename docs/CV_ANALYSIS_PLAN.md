# Technisch en Functioneel Plan: CV-Analyse met Privacy-Bescherming

**Versie:** 1.0
**Datum:** 13 januari 2026
**Doel:** CV-upload en -analyse met classificatie naar CompetentNL occupations en Opleidingsnormen, met strikte privacy-waarborgen

---

## 1. EXECUTIVE SUMMARY

### Hoofdfunctionaliteit
- **CV Upload**: Gebruikers kunnen PDF of Word documenten uploaden
- **Automatische Extractie**: Herkenning van werkervaring, opleidingen en vaardigheden
- **Classificatie**: Mapping naar CompetentNL occupations en Opleidingsnormen
- **Privacy-First**: Persoonsgegevens worden NIET naar externe LLM gestuurd
- **Matching**: Automatische koppeling aan vacatures/profielen met gebruikersvalidatie

### Kritieke Succesfactoren
- ✅ Privacy compliance: PII blijft lokaal
- ✅ Accurate classificatie: 85%+ match met CNL taxonomie
- ✅ Gebruiksvriendelijk: Max. 3 klikken van upload naar resultaat
- ✅ Transparantie: Gebruiker kan extracties reviewen en corrigeren

---

## 2. PRIVACY-OPLOSSINGEN: 4 ARCHITECTUREN

### Oplossing 1: **Lokale Extractie + Anonimisering** ⭐ **AANBEVOLEN**

**Architectuur:**
```
CV Upload (PDF/Word)
    ↓
[Server] PDF Parser (pdf-parse) → Raw text extractie
    ↓
[Server] PII Detector (regex + NER)
    ↓ Detecteert: NAW, BSN, telefoonnummer, email, geboortedatum
[Server] Anonimisering
    ↓ Replace met placeholders: [NAAM], [ADRES], [EMAIL], etc.
[Server] Structurele Parser (Rules-based)
    ↓ Herkent secties: Experience, Education, Skills
    ↓ Extracteert: functietitels, bedrijfsnamen, data, vaardigheden
[Database] Opslag van geanonimiseerde data
    ↓
[Server] LLM Call met ALLEEN geanonimiseerde functietitels/vaardigheden
    ↓ Input: "Software Engineer, Python, React, 5 jaar ervaring"
    ↓ Geen NAW-gegevens!
[Gemini API] Classificatie naar CNL Occupations
    ↓
[Server] Mapping naar Opleidingsnormen
    ↓
[Frontend] Review-scherm voor gebruiker
```

**Privacy-Waarborgen:**
- ❌ **Geen** namen, adressen, contactgegevens naar LLM
- ❌ **Geen** geboortedatums of BSN
- ✅ **Wel** functietitels, vaardigheden, opleidingsnamen (niet persoonsgebonden)
- ✅ **Wel** jaren ervaring (relatief, zonder exacte data)
- ✅ Gebruiker kan altijd originele CV downloaden (lokaal opgeslagen)

**Voor:**
- ✅ Minimale aanpassing bestaande LLM-pipeline
- ✅ Relatief eenvoudige implementatie
- ✅ Privacy-compliant zonder externe dependencies
- ✅ Gebruiker ziet wat naar LLM gaat

**Tegen:**
- ⚠️ Regex-based PII detectie is niet 100% nauwkeurig
- ⚠️ Namen in functietitels kunnen worden gemist
- ⚠️ Vereist goede testing met diverse CV-formaten

---

### Oplossing 2: **Volledig Lokale LLM (On-Premise)**

**Architectuur:**
```
CV Upload → Server → Lokale LLM (LLaMA 3, Mistral 7B) → CNL Matching
```

**Technische Stack:**
- **Model**: Mistral 7B Instruct (open source)
- **Runtime**: Ollama of vLLM
- **Hardware**: GPU server (NVIDIA T4 minimum)
- **Fine-tuning**: Op CompetentNL dataset

**Voor:**
- ✅ 100% privacy: data verlaat infrastructuur nooit
- ✅ Geen API-kosten
- ✅ Volledige controle over model

**Tegen:**
- ❌ Hoge infrastructuur-kosten (GPU server)
- ❌ Onderhoudskosten (model updates, monitoring)
- ❌ Lagere kwaliteit dan Gemini 2.0 Flash
- ❌ Langere processing tijd (30-60 sec vs 2-5 sec)

**Kostenschatting:**
- €500-1000/maand server hosting
- 40-80 uur ontwikkeltijd voor fine-tuning
- 20 uur/maand onderhoud

---

### Oplossing 3: **Hybride: Rules + LLM voor Classificatie** ⭐ **BESTE BALANS**

**Architectuur:**
```
CV Upload
    ↓
[Rules Engine] Heuristische extractie
    ↓ Template matching voor secties
    ↓ Regex voor data, functietitels
    ↓ Keyword matching voor vaardigheden
[Database] Lokale mapping tables
    ↓ Match functietitels tegen CNL occupations database
    ↓ "Software Engineer" → cnlo:SoftwareOntwikkelaar
[LLM] Alleen voor AMBIGUÏTEIT
    ↓ Als confidence < 70%: vraag LLM classificatie
    ↓ Input: ALLEEN functietitel + vaardigheden (geen PII)
[Frontend] Review-scherm
```

**Voor:**
- ✅ 80% gevallen zonder LLM (snel + gratis)
- ✅ Privacy: alleen edge cases naar LLM
- ✅ Lage API-kosten
- ✅ Hoge controle en transparantie

**Tegen:**
- ⚠️ Complexe rules engine onderhouden
- ⚠️ Vereist uitgebreide CNL mapping database
- ⚠️ Lagere kwaliteit voor edge cases

---

### Oplossing 4: **Client-Side Processing (Browser)**

**Architectuur:**
```
CV Upload
    ↓
[Browser] PDF.js → Text extractie IN BROWSER
    ↓
[Browser] TensorFlow.js NER model → Structurering
    ↓
[Browser] Lokale fuzzy matching → CNL database (cached)
    ↓
[Server] Alleen matches voor validatie (geen CV-inhoud)
```

**Voor:**
- ✅ Zero data naar server (ultieme privacy)
- ✅ Instant feedback (geen network latency)
- ✅ Geen server resources

**Tegen:**
- ❌ Performance issues bij grote CVs
- ❌ Browser compatibility challenges
- ❌ Complexe frontend codebase
- ❌ Moeilijk te onderhouden ML models

---

## 3. AANBEVOLEN OPLOSSING: **Hybride Anonimisering**

**Keuze:** Combinatie van Oplossing 1 + Oplossing 3

**Waarom:**
1. **Privacy-first**: PII wordt altijd verwijderd voor LLM-calls
2. **Performance**: 70-80% gevallen via rules, 20-30% via LLM
3. **Kosten**: Minimale API-usage door rules-based filtering
4. **Kwaliteit**: Gemini voor complexe gevallen
5. **Onderhoud**: Geen zware infrastructure, wel uitbreidbaar

---

## 4. FUNCTIONELE USER FLOW

### Hoofdflow: CV Upload → Review → Matching

#### Stap 1: Upload Scherm

```
╔═══════════════════════════════════════════════════════════╗
║  📄 Upload je CV                                          ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │                                                     │  ║
║  │         🖱️  Drag & drop je CV hier                 │  ║
║  │                                                     │  ║
║  │            of klik om te selecteren                │  ║
║  │                                                     │  ║
║  │     Ondersteunde formaten: PDF, Word (.docx)       │  ║
║  │              Max. bestandsgrootte: 10MB            │  ║
║  │                                                     │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                            ║
║  ℹ️  Privacy garantie:                                     ║
║     • Je CV wordt alleen gebruikt voor matching            ║
║     • Persoonsgegevens worden NIET gedeeld met AI         ║
║     • Automatisch verwijderd na 30 dagen                  ║
║                                                            ║
║  ☑️ Sla review over bij >85% zekerheid (optioneel)        ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
```

#### Stap 2: Processing

```
╔═══════════════════════════════════════════════════════════╗
║  ⏳ Analyseren van je CV...                               ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  ████████████░░░░░░░░░░░░  60%                           ║
║                                                            ║
║  ✅ Tekst geëxtraheerd                                     ║
║  ✅ Persoonsgegevens verwijderd                            ║
║  🔄 Werkervaring analyseren...                             ║
║  ⏸️  Opleidingen classificeren                             ║
║  ⏸️  Vaardigheden herkennen                                ║
║                                                            ║
║  Dit kan 10-30 seconden duren                             ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
```

#### Stap 3: Review Scherm ⭐ **KERN VAN DE GEBRUIKERSERVARING**

```
╔═══════════════════════════════════════════════════════════╗
║  ✅ CV Analyse Compleet - Controleer de Resultaten        ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  📋 Privacy Status: ✅ Geen persoonsgegevens gedeeld      ║
║     Gedetecteerd en verwijderd: 1 email, 1 telefoon       ║
║                                                            ║
║  [🔍 Werkervaring] [🎓 Opleidingen] [💪 Vaardigheden]     ║
║   ────────────────                                         ║
║                                                            ║
║  🔍 WERKERVARING (3 items gevonden)                       ║
║                                                            ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ 1. Software Engineer                               │  ║
║  │    Periode: 2020-2024 (4 jaar)                     │  ║
║  │    ─────────────────────────────────────────────   │  ║
║  │    📍 Gematcht: Softwareontwikkelaar               │  ║
║  │    🎯 Zekerheid: 95% ✅                             │  ║
║  │    🔧 Vaardigheden: Python, React, SQL             │  ║
║  │                                                     │  ║
║  │    [✏️ Bewerken] [✅ Akkoord] [❌ Verwijderen]      │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                            ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ 2. Junior Developer                                │  ║
║  │    Periode: 2018-2020 (2 jaar)                     │  ║
║  │    ─────────────────────────────────────────────   │  ║
║  │    📍 Gematcht: Softwareontwikkelaar               │  ║
║  │    🎯 Zekerheid: 88% ✅                             │  ║
║  │    ⚠️  Mogelijk duplicate van item 1?              │  ║
║  │                                                     │  ║
║  │    [🔀 Samenvoegen] [✏️ Bewerken] [✅ Akkoord]     │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                            ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ 3. Team Lead IT                                    │  ║
║  │    Periode: 2015-2018 (3 jaar)                     │  ║
║  │    ─────────────────────────────────────────────   │  ║
║  │    📍 Gematcht: ??? (Niet gevonden)                │  ║
║  │    🎯 Zekerheid: 45% ⚠️ REVIEW NODIG               │  ║
║  │                                                     │  ║
║  │    💡 Suggesties:                                  │  ║
║  │       • ICT-projectleider                          │  ║
║  │       • Teammanager ICT                            │  ║
║  │       • Informatieanalist                          │  ║
║  │                                                     │  ║
║  │    [🎯 Kies suggestie ▼] [🔍 Zoek zelf]           │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                            ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ 📊 KWALITEITSSCORE                                 │  ║
║  │ ────────────────────────────────────────────────   │  ║
║  │ Totaal: 76% ⚠️  (1 item heeft review nodig)       │  ║
║  │ • Werkervaring: 76% (1 van 3 onzeker)             │  ║
║  │ • Opleidingen: 95% ✅                              │  ║
║  │ • Vaardigheden: 90% ✅                             │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                            ║
║  💡 Tip: Controleer vooral items met oranje waarschuwing   ║
║                                                            ║
║  [⬅️ Terug] [💾 Opslaan] [➡️ Ga naar matching (1 onzeker)]║
╚═══════════════════════════════════════════════════════════╝
```

**Interactieve Elementen:**

1. **Per Item Acties:**
   - ✏️ **Bewerken**: Open modal om classificatie aan te passen
   - ✅ **Akkoord**: Markeer als correct, ga verder
   - ❌ **Verwijderen**: Item is niet relevant voor matching
   - 🔀 **Samenvoegen**: Combineer duplicate entries

2. **Low-Confidence Interactie:**
   - 🎯 **Kies suggestie**: Dropdown met top 3 CNL matches
   - 🔍 **Zoek zelf**: Open autocomplete search (hergebruik bestaande functie)
   - ⏭️ **Overslaan**: Laat item leeg, gebruik niet voor matching

3. **Bulk Acties:**
   - "✅ Alle groene items goedkeuren" (items met >85% zekerheid)
   - "🔍 Toon alleen items die review nodig hebben"
   - "📊 Exporteer naar Excel/JSON"

#### Stap 4: Matching Resultaten

Na validatie wordt gebruiker doorgestuurd naar bestaande matching interface met:
- Top 10 passende beroepen
- Skills gaps analyse
- Training aanbevelingen

---

## 5. TECHNISCHE ARCHITECTUUR

### 5.1 Database Schema

```sql
-- Database: competentnl_rag (bestaande database uitbreiden)

-- CV Document Management
CREATE TABLE user_cvs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NULL,
    file_name VARCHAR(500) NOT NULL,
    file_size_kb INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Text content (encrypted at rest)
    original_text MEDIUMTEXT,      -- Encrypted
    anonymized_text MEDIUMTEXT,    -- PII removed
    pii_detected JSON,              -- ['email', 'phone', 'address', 'name']

    -- Processing status
    extraction_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    processing_duration_ms INT NULL,
    error_message TEXT NULL,

    -- Relations
    created_profile_id INT NULL,

    -- Soft delete (GDPR compliance)
    deleted_at DATETIME NULL,

    INDEX idx_session (session_id),
    INDEX idx_status (extraction_status),
    INDEX idx_upload_date (upload_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CV Extraction Results
CREATE TABLE cv_extractions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    section_type ENUM('experience', 'education', 'skill', 'summary') NOT NULL,

    -- Extracted content
    content JSON NOT NULL,
    /* Example structure for 'experience':
    {
      "job_title": "Software Engineer",
      "organization": "Tech Company",
      "start_date": "2020",
      "end_date": "2024",
      "description": "Developed web applications...",
      "extracted_skills": ["Python", "React"]
    }
    */

    -- Classification results
    extracted_concepts JSON,
    /* Example:
    {
      "matched_occupation_uri": "http://data.europa.eu/esco/occupation/...",
      "matched_occupation_label": "Softwareontwikkelaar",
      "match_method": "rules|llm",
      "alternative_matches": [
        {"uri": "...", "label": "Web Developer", "score": 0.78}
      ]
    }
    */

    -- Confidence & validation
    confidence_score FLOAT NOT NULL,
    classification_method ENUM('rules', 'llm', 'manual') NOT NULL,
    needs_review BOOLEAN DEFAULT FALSE,
    user_validated BOOLEAN DEFAULT FALSE,
    user_correction JSON NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,
    INDEX idx_cv_id (cv_id),
    INDEX idx_needs_review (needs_review),
    INDEX idx_section (section_type),
    INDEX idx_confidence (confidence_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Occupation Matching Cache
CREATE TABLE cv_occupation_matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    extraction_id INT NULL,

    -- Input
    extracted_job_title VARCHAR(500) NOT NULL,

    -- Output
    matched_occupation_uri VARCHAR(500) NOT NULL,
    matched_occupation_label VARCHAR(500) NOT NULL,
    match_score FLOAT NOT NULL,
    match_method ENUM('exact', 'fuzzy', 'llm', 'manual') NOT NULL,

    -- Skills mapping
    extracted_skills JSON,        -- Skills from CV
    mapped_cnl_skills JSON,       -- Mapped to CNL HumanCapability URIs

    -- Metadata
    is_primary BOOLEAN DEFAULT FALSE,
    user_confirmed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,
    FOREIGN KEY (extraction_id) REFERENCES cv_extractions(id) ON DELETE SET NULL,
    INDEX idx_cv_id (cv_id),
    INDEX idx_occupation (matched_occupation_uri),
    INDEX idx_job_title (extracted_job_title(100)),
    INDEX idx_confirmed (user_confirmed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Processing Logs (for debugging & analytics)
CREATE TABLE cv_processing_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    step ENUM('upload', 'extract', 'anonymize', 'parse', 'classify', 'review', 'match') NOT NULL,
    status ENUM('started', 'completed', 'failed') NOT NULL,
    duration_ms INT NULL,
    error_message TEXT NULL,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,
    INDEX idx_cv_id (cv_id),
    INDEX idx_step_status (step, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User Feedback (learning loop)
CREATE TABLE cv_extraction_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    extraction_id INT NOT NULL,
    feedback_type ENUM('correct', 'incorrect', 'missing', 'duplicate') NOT NULL,
    original_value TEXT,
    corrected_value TEXT,
    user_comment TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE,
    FOREIGN KEY (extraction_id) REFERENCES cv_extractions(id) ON DELETE CASCADE,
    INDEX idx_feedback_type (feedback_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Local Occupation Mapping (for rules-based matching)
CREATE TABLE cnl_occupation_keywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    occupation_uri VARCHAR(500) NOT NULL,
    occupation_label VARCHAR(500) NOT NULL,
    keyword VARCHAR(200) NOT NULL,
    keyword_type ENUM('exact', 'synonym', 'related') NOT NULL,
    weight FLOAT DEFAULT 1.0,

    UNIQUE KEY unique_keyword_occupation (occupation_uri, keyword),
    INDEX idx_keyword (keyword),
    INDEX idx_occupation (occupation_uri)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5.2 Backend API Endpoints

```javascript
// server.js - nieuwe endpoints toevoegen

import multer from 'multer';
import {
  processCVFile,
  getCVExtraction,
  updateExtraction,
  convertToMatchProfile
} from './services/cvProcessingService.js';

// Multer configuratie voor file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Alleen PDF en Word documenten zijn toegestaan'));
    }
  }
});

// ===== CV UPLOAD & PROCESSING =====

/**
 * Upload CV en start processing
 * POST /api/cv/upload
 */
app.post('/api/cv/upload', upload.single('cv'), async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Geen bestand geüpload' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is verplicht' });
    }

    // Start async processing
    const result = await processCVFile(req.file, sessionId);

    res.json({
      success: true,
      cvId: result.cvId,
      message: 'CV succesvol geüpload en processing gestart',
      extractionStatus: 'processing',
      estimatedDuration: '10-30 seconden'
    });

  } catch (error) {
    console.error('CV upload error:', error);
    res.status(500).json({
      error: 'Fout bij uploaden CV',
      details: error.message
    });
  }
});

/**
 * Get extraction results (for review screen)
 * GET /api/cv/:cvId/extraction
 */
app.get('/api/cv/:cvId/extraction', async (req, res) => {
  try {
    const { cvId } = req.params;

    const extraction = await getCVExtraction(parseInt(cvId));

    if (!extraction) {
      return res.status(404).json({ error: 'CV niet gevonden' });
    }

    res.json(extraction);

  } catch (error) {
    console.error('Get extraction error:', error);
    res.status(500).json({
      error: 'Fout bij ophalen extractie',
      details: error.message
    });
  }
});

/**
 * Get CV processing status (polling)
 * GET /api/cv/:cvId/status
 */
app.get('/api/cv/:cvId/status', async (req, res) => {
  try {
    const { cvId } = req.params;

    const status = await getCVProcessingStatus(parseInt(cvId));

    res.json(status);

  } catch (error) {
    res.status(500).json({ error: 'Fout bij ophalen status' });
  }
});

/**
 * Update extraction (user corrections)
 * PATCH /api/cv/:cvId/extraction/:itemId
 */
app.patch('/api/cv/:cvId/extraction/:itemId', async (req, res) => {
  try {
    const { cvId, itemId } = req.params;
    const { correctedValue, feedbackType, comment } = req.body;

    await updateExtraction(
      parseInt(cvId),
      parseInt(itemId),
      correctedValue,
      feedbackType,
      comment
    );

    res.json({
      success: true,
      message: 'Extractie bijgewerkt'
    });

  } catch (error) {
    console.error('Update extraction error:', error);
    res.status(500).json({ error: 'Fout bij bijwerken extractie' });
  }
});

/**
 * Validate all extractions (after review)
 * POST /api/cv/:cvId/validate
 */
app.post('/api/cv/:cvId/validate', async (req, res) => {
  try {
    const { cvId } = req.params;
    const { validatedItems } = req.body;

    await markExtractionsValidated(parseInt(cvId), validatedItems);

    res.json({
      success: true,
      message: 'Extracties gevalideerd'
    });

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Fout bij valideren' });
  }
});

/**
 * Convert CV to MatchProfile (for matching API)
 * POST /api/cv/:cvId/to-profile
 */
app.post('/api/cv/:cvId/to-profile', async (req, res) => {
  try {
    const { cvId } = req.params;
    const { includeUnconfirmed } = req.body;

    const matchProfile = await convertToMatchProfile(
      parseInt(cvId),
      includeUnconfirmed || false
    );

    res.json({
      success: true,
      matchProfile
    });

  } catch (error) {
    console.error('Profile conversion error:', error);
    res.status(500).json({ error: 'Fout bij conversie naar profiel' });
  }
});

/**
 * Delete CV (GDPR compliance)
 * DELETE /api/cv/:cvId
 */
app.delete('/api/cv/:cvId', async (req, res) => {
  try {
    const { cvId } = req.params;

    await deleteCVDocument(parseInt(cvId));

    res.json({
      success: true,
      message: 'CV succesvol verwijderd'
    });

  } catch (error) {
    console.error('Delete CV error:', error);
    res.status(500).json({ error: 'Fout bij verwijderen CV' });
  }
});
```

### 5.3 Backend Services

**Bestandsstructuur:**
```
services/
├── cvProcessingService.ts     # Main orchestrator
├── cvAnonymizer.ts             # PII detection & removal
├── cvParser.ts                 # Structure extraction
├── cnlMatcher.ts               # Local CNL matching
└── cvStorageService.ts         # Database operations
```

---

## 6. IMPLEMENTATIE ROADMAP

### Fase 1: Foundation (Week 1-2)
**Doel:** Basis CV upload en extractie

**Taken:**
- ✅ Database schema implementeren
- ✅ Multer file upload configureren
- ✅ PDF/Word text extractie (pdf-parse, mammoth)
- ✅ PII detector bouwen (regex patterns)
- ✅ Basis API endpoints (upload, status)

**Deliverables:**
- Upload endpoint werkt
- Text wordt geëxtraheerd
- PII wordt gedetecteerd
- Unit tests (85% coverage)

**Story Points:** 13

---

### Fase 2: Rules-Based Matching (Week 3)
**Doel:** Lokale matching zonder LLM

**Taken:**
- ✅ CNL occupation keywords tabel vullen
- ✅ Fuzzy string matching implementeren
- ✅ CV parser (secties herkennen)
- ✅ Skill extraction logic
- ✅ Confidence scoring

**Deliverables:**
- 70%+ CVs worden gematcht
- Lokale database queries < 500ms
- Integration tests met 20 sample CVs

**Story Points:** 8

---

### Fase 3: LLM Enhancement (Week 4)
**Doel:** Gemini voor complexe cases

**Taken:**
- ✅ Gemini API integration
- ✅ Hybrid matching (rules → LLM fallback)
- ✅ Prompt engineering voor classificatie
- ✅ Caching & performance

**Deliverables:**
- >85% classificatie accuraatheid
- API calls alleen bij confidence < 70%
- Processing tijd < 15s gemiddeld

**Story Points:** 5

---

### Fase 4: Review UI (Week 5-6)
**Doel:** Gebruiker kan extracties valideren

**Taken:**
- ✅ CV Upload modal component
- ✅ Review screen met tabs
- ✅ Edit/approve/reject functies
- ✅ Suggesti dropdown
- ✅ Integration met bestaande matching

**Deliverables:**
- Werkende review interface
- User flow compleet
- Responsive design
- UAT met 5 test users

**Story Points:** 13

---

### Fase 5: Privacy & Security (Week 7)
**Doel:** GDPR compliance

**Taken:**
- ✅ Encryption at rest
- ✅ Auto-delete cron job (30 dagen)
- ✅ Audit logging
- ✅ Privacy documentation
- ✅ Security testing

**Deliverables:**
- PII audit: 100% detection
- GDPR compliance checklist ✅
- Penetration testing report

**Story Points:** 8

---

### Fase 6: Polish (Week 8)
**Doel:** Production ready

**Taken:**
- ✅ Performance tuning
- ✅ Error handling
- ✅ Analytics & monitoring
- ✅ User documentation
- ✅ API documentation

**Deliverables:**
- Load testing passed (50 concurrent)
- User manual
- API docs
- Deployment guide

**Story Points:** 5

---

**TOTAAL: 8 weken, 52 story points**

---

## 7. PRIVACY & COMPLIANCE

### PII Detection Patterns

```typescript
// services/cvAnonymizer.ts

export const PII_PATTERNS = {
  // Email
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Nederlandse telefoonnummers
  phone: /(\+31|0031|0)[1-9][0-9]{8}/g,
  mobilePhone: /06[\s-]?\d{8}/g,

  // BSN (met Elfproef validatie)
  bsn: /\b\d{9}\b/g,

  // Postcode
  postalCode: /\b[1-9][0-9]{3}\s?[A-Z]{2}\b/g,

  // Adressen
  address: /(straat|laan|weg|plein|singel|gracht|kade|boulevard)\s*\d+/gi,

  // Geboortedatum
  birthdate: /\b(0?[1-9]|[12][0-9]|3[01])[-/.](0?[1-9]|1[0-2])[-/.](19|20)\d{2}\b/g,

  // IBAN
  iban: /\bNL\d{2}[A-Z]{4}\d{10}\b/g,

  // Namen (heuristisch - eerste 500 chars van CV)
  name: /\b[A-Z][a-z]{2,}\s+(?:van\s+|de\s+|der\s+|den\s+|te\s+)?[A-Z][a-z]{2,}\b/g
};

export function anonymizeCV(rawText: string): AnonymizedResult {
  const piiDetected: string[] = [];
  let anonymized = rawText;

  // Email
  const emails = rawText.match(PII_PATTERNS.email);
  if (emails && emails.length > 0) {
    piiDetected.push('email');
    emails.forEach(email => {
      anonymized = anonymized.replace(email, '[EMAIL_VERWIJDERD]');
    });
  }

  // Telefoon
  const phones = rawText.match(PII_PATTERNS.phone);
  if (phones && phones.length > 0) {
    piiDetected.push('phone');
    phones.forEach(phone => {
      anonymized = anonymized.replace(phone, '[TELEFOON_VERWIJDERD]');
    });
  }

  // BSN (met validatie)
  const bsns = rawText.match(PII_PATTERNS.bsn);
  if (bsns && bsns.length > 0) {
    bsns.forEach(bsn => {
      if (isValidBSN(bsn)) {
        piiDetected.push('bsn');
        anonymized = anonymized.replace(bsn, '[BSN_VERWIJDERD]');
      }
    });
  }

  // Namen (alleen in eerste 500 chars = header)
  const headerText = rawText.substring(0, 500);
  const names = headerText.match(PII_PATTERNS.name);
  if (names && names.length > 0) {
    piiDetected.push('name');
    const primaryName = names[0]; // Eerste naam is meestal de persoon zelf
    anonymized = anonymized.replace(new RegExp(primaryName, 'g'), '[NAAM]');
  }

  return {
    anonymizedText: anonymized,
    piiDetected: [...new Set(piiDetected)],
    originalLength: rawText.length,
    anonymizedLength: anonymized.length
  };
}

function isValidBSN(bsn: string): boolean {
  // Elfproef validatie voor BSN
  const digits = bsn.split('').map(Number);
  const check = digits[0] * 9 + digits[1] * 8 + digits[2] * 7 +
                digits[3] * 6 + digits[4] * 5 + digits[5] * 4 +
                digits[6] * 3 + digits[7] * 2 - digits[8];
  return check % 11 === 0;
}
```

### GDPR Compliance

**Rechtsgronden (Art. 6 AVG):**
- ✅ Toestemming gebruiker (checkbox bij upload)
- ✅ Gerechtvaardigd belang (matching voor arbeidsbemiddeling)

**Data Minimalisatie (Art. 5 AVG):**
- ❌ Geen NAW-gegevens naar LLM
- ✅ Alleen functietitels en vaardigheden worden verwerkt
- ✅ Auto-delete na 30 dagen

**Rechten Betrokkene:**
- ✅ Recht op inzage: GET /api/cv/:cvId
- ✅ Recht op verwijdering: DELETE /api/cv/:cvId
- ✅ Recht op dataportabiliteit: Export naar JSON

---

## 8. TESTING STRATEGIE

### Unit Tests (Target: 85% coverage)

```typescript
// tests/cvAnonymizer.test.ts

describe('PII Anonymization', () => {
  test('removes email addresses', () => {
    const input = 'Contact: jan.jansen@example.nl';
    const result = anonymizeCV(input);
    expect(result.anonymizedText).not.toContain('jan.jansen@example.nl');
    expect(result.piiDetected).toContain('email');
  });

  test('removes Dutch phone numbers', () => {
    const input = 'Tel: 0612345678 of +31612345678';
    const result = anonymizeCV(input);
    expect(result.anonymizedText).toContain('[TELEFOON_VERWIJDERD]');
  });

  test('keeps job titles intact', () => {
    const input = 'Werkzaam als Software Engineer';
    const result = anonymizeCV(input);
    expect(result.anonymizedText).toContain('Software Engineer');
  });
});
```

### Integration Tests

```typescript
// tests/cvProcessing.integration.test.ts

describe('CV Processing Pipeline', () => {
  test('processes complete CV end-to-end', async () => {
    const cvBuffer = fs.readFileSync('./fixtures/sample_cv.pdf');
    const file = { buffer: cvBuffer, mimetype: 'application/pdf' };

    const result = await processCVFile(file, 'test-session');

    expect(result.cvId).toBeDefined();
    expect(result.sections.experience.length).toBeGreaterThan(0);
    expect(result.overallConfidence).toBeGreaterThan(0.7);
  });
});
```

### User Acceptance Testing Scenarios

1. **Happy Path**: Goed CV → Alles high confidence → Skip review → Matching
2. **Low Confidence**: Rare functietitels → Review screen → Correcties → Matching
3. **PII Detection**: Email/telefoon in CV → Detectie werkt → Niet in LLM logs
4. **Error Handling**: Corrupt PDF → Duidelijke foutmelding

---

## 9. KOSTEN & RESOURCES

### Development Effort

| Fase | Uren | FTE Weeks |
|------|------|-----------|
| Backend | 80h | 2.0 |
| Frontend | 60h | 1.5 |
| Testing | 40h | 1.0 |
| Security | 20h | 0.5 |
| Docs | 20h | 0.5 |
| **Totaal** | **220h** | **5.5 weken** |

### Operational Costs (per maand)

- Gemini API (1000 CVs): €15-30
- Database storage: €5
- **Totaal: €20-35/maand**

**Cost per CV:** ~€0.005-0.01

---

## 10. SUCCESS METRICS

### Technical KPIs
- ✅ Extractie accuraatheid: >85%
- ✅ PII detectie: 100% test coverage
- ✅ Processing time: <15s gemiddeld
- ✅ Uptime: 99.9%

### Business KPIs
- ✅ Adoption rate: 30% gebruikt CV upload
- ✅ User satisfaction: >4.0/5.0
- ✅ Time saved: 5 min per user

### Privacy KPIs
- ✅ Zero PII leaks naar LLM
- ✅ 100% CVs auto-deleted na 30 dagen
- ✅ User trust: >80% comfortable met privacy

---

## 11. RISICO'S & MITIGATIE

| Risico | Impact | Kans | Mitigatie |
|--------|--------|------|-----------|
| PII leak naar LLM | HOOG | LAAG | Uitgebreide testing, audit logging |
| Lage accuraatheid | MED | MED | User review, feedback loop |
| Performance issues | MED | LAAG | Async processing, caching |
| User adoption | MED | MED | Onboarding, privacy messaging |

---

## CONCLUSIE

Dit plan biedt een **privacy-first** oplossing voor CV-analyse met:
- ✅ Geen persoonsgegevens naar externe LLM
- ✅ Gebruiker behoudt controle via review-scherm
- ✅ 85%+ classificatie accuraatheid
- ✅ 8 weken implementatie
- ✅ Lage kosten (€20-35/maand)

**Aanbeveling:** Start met Fase 1-2 (4 weken) voor MVP, evalueer resultaten, dan Fase 3-6.

---

**Document Eigenaar:** Development Team
**Stakeholders:** Product Owner, Security Officer, Legal
**Volgende Review:** Na Fase 3 (Week 4)
