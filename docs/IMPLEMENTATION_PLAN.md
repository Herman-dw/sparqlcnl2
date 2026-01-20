# CV Privacy Implementatie Plan

**Project:** CompetentNL CV-Analyse met Privacy-First Aanpak
**Datum:** 13 januari 2026

---

## OVERZICHT IMPLEMENTATIE

### Architectuur
```
┌─────────────────────────────────────────────────────────┐
│ FRONTEND (React + TypeScript)                           │
│ ├─ CVUploadModal.tsx                                    │
│ ├─ CVReviewScreen.tsx                                   │
│ └─ PrivacyConsentModal.tsx                              │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/JSON
┌─────────────────▼───────────────────────────────────────┐
│ BACKEND (Node.js/Express)                               │
│ ├─ /api/cv/upload                                       │
│ ├─ /api/cv/:id/extraction                               │
│ ├─ /api/cv/:id/privacy-consent                          │
│ └─ /api/cv/:id/classify                                 │
└─────────────────┬───────────────────────────────────────┘
                  │ Python subprocess
┌─────────────────▼───────────────────────────────────────┐
│ PYTHON SERVICE (GLiNER PII Detection)                   │
│ ├─ gliner_service.py                                    │
│ ├─ pii_detector.py                                      │
│ └─ requirements.txt                                     │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│ SERVICES (TypeScript)                                   │
│ ├─ cvProcessingService.ts                               │
│ ├─ employerGeneralizer.ts                               │
│ ├─ privacyLogger.ts                                     │
│ └─ cnlClassifier.ts                                     │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│ DATABASE (MariaDB)                                      │
│ ├─ user_cvs                                             │
│ ├─ cv_extractions                                       │
│ ├─ privacy_consent_logs                                 │
│ └─ employer_categories                                  │
└─────────────────────────────────────────────────────────┘
```

---

## FASE 1: PII DETECTIE & GENERALISATIE

### 1.1 GLiNER Python Service (CPU-optimized)

**Bestanden:**
- `services/python/gliner_service.py` - Main service
- `services/python/pii_detector.py` - PII detection logic
- `services/python/requirements.txt` - Dependencies
- `services/python/setup.sh` - Setup script

**Dependencies:**
- GLiNER (CPU-only)
- PyTorch CPU
- FastAPI (REST API)
- Uvicorn (ASGI server)

**Hardware vereisten:**
- CPU: 4+ cores
- RAM: 4 GB minimum
- Disk: 2 GB voor model

**Performance targets:**
- Inference tijd: <200ms per CV
- Batch size: 8
- Concurrent requests: 4

---

### 1.2 Employer Generalisatie Service

**Bestanden:**
- `services/employerGeneralizer.ts` - Generalisatie logic
- `services/employerCategories.ts` - Category mappings
- `services/riskAssessment.ts` - Re-identification risk

**Features:**
- Rule-based categorisatie
- Risk scoring
- Fallback naar sector inference

---

## FASE 2: USER INTERFACE & CLASSIFICATIE

### 2.1 Backend API Endpoints

**Bestanden:**
- `server.js` - Nieuwe routes (extend bestaande)
- `services/cvProcessingService.ts` - Orchestration

**Endpoints:**
- POST `/api/cv/upload` - Upload & start processing
- GET `/api/cv/:id/status` - Check processing status
- GET `/api/cv/:id/extraction` - Get results for review
- POST `/api/cv/:id/privacy-consent` - Save consent choice
- POST `/api/cv/:id/classify` - Trigger CNL classification

---

### 2.2 Frontend Components

**Bestanden:**
- `components/CVUploadModal.tsx` - Upload interface
- `components/CVReviewScreen.tsx` - Review extracted data
- `components/PrivacyConsentModal.tsx` - Consent dialog
- `components/PrivacyBadge.tsx` - Privacy status indicator

**Features:**
- Drag & drop upload
- Real-time processing status
- Privacy-first design
- Accessibility (WCAG 2.1 AA)

---

### 2.3 Privacy Logging

**Bestanden:**
- `services/privacyLogger.ts` - Logging service
- Database table: `privacy_consent_logs`

**Logged events:**
- PII detected
- Employer generalisations
- User consent choices
- Classification API calls

---

### 2.4 CNL Classificatie

**Bestanden:**
- `services/cnlClassifier.ts` - Classification logic
- Integration met bestaande `geminiService.ts`

**Flow:**
- Local matching first (rules)
- Gemini fallback (anonymized data only)
- Map to CNL occupations/education

---

## DATABASE SCHEMA

### Nieuwe tabellen:

```sql
-- 1. CV Documents
CREATE TABLE user_cvs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(500),
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    original_text_encrypted MEDIUMBLOB,
    anonymized_text MEDIUMTEXT,
    processing_status ENUM('pending', 'processing', 'completed', 'failed'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id)
);

-- 2. Extractions
CREATE TABLE cv_extractions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    section_type ENUM('experience', 'education', 'skill'),
    original_value TEXT,
    anonymized_value TEXT,
    generalized_employer VARCHAR(500),
    confidence_score FLOAT,
    needs_review BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE
);

-- 3. Privacy Logs
CREATE TABLE privacy_consent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cv_id INT NOT NULL,
    event_type ENUM('pii_detected', 'employer_generalized', 'user_consent', 'llm_call'),
    pii_types JSON,
    consent_given BOOLEAN,
    exact_data_shared BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cv_id) REFERENCES user_cvs(id) ON DELETE CASCADE
);

-- 4. Employer Categories (seed data)
CREATE TABLE employer_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employer_name VARCHAR(500),
    category VARCHAR(500),
    sector VARCHAR(200),
    is_identifying BOOLEAN DEFAULT FALSE,
    UNIQUE KEY unique_employer (employer_name)
);
```

---

## IMPLEMENTATIE VOLGORDE

### Week 1: Foundation
1. ✅ Database migratie uitvoeren
2. ✅ GLiNER Python service opzetten
3. ✅ Employer generalisatie implementeren
4. ✅ Backend API endpoints maken

### Week 2: Frontend
5. ✅ Upload modal component
6. ✅ Review scherm component
7. ✅ Consent modal component
8. ✅ Privacy logging

### Week 3: Integratie
9. ✅ CNL classificatie integreren
10. ✅ End-to-end testing
11. ✅ Performance optimalisatie
12. ✅ Documentatie

---

## DEVELOPMENT SETUP

### Prerequisites:
- Node.js 18+
- Python 3.9+
- MariaDB 10.5+
- 8 GB RAM minimum

### Environment variabelen:
```bash
# .env
GLINER_SERVICE_URL=http://localhost:8001
GEMINI_API_KEY=your_key_here
DATABASE_URL=mysql://user:pass@localhost:3306/competentnl_rag
ENCRYPTION_KEY=your_encryption_key_here
```

---

## TESTING STRATEGIE

### Unit Tests:
- GLiNER PII detection (95% accuracy target)
- Employer generalisatie (100% coverage)
- Privacy logging (audit trail completeness)

### Integration Tests:
- End-to-end CV processing
- Privacy consent flow
- CNL classification accuracy

### Performance Tests:
- GLiNER inference time (<200ms)
- Concurrent CV processing (4 simultaneous)
- Memory usage (<4 GB)

---

Nu ga ik elk onderdeel stap voor stap implementeren...
