# CV Processing Setup Guide

## Status

✅ **Klaar:**
- Alle code is geschreven en aanwezig in de codebase
- Database migratie uitgevoerd (003-cv-privacy-tables.sql)
- GLiNER model geïnstalleerd
- Dependencies toegevoegd aan package.json

## Wat je nu moet doen:

### Stap 1: Installeer NPM Dependencies

```bash
npm install
```

**Let op**: Als je errors ziet over `sharp`, negeer deze. De CV processing dependencies (pdf-parse, mammoth, multer) worden wel geïnstalleerd.

### Stap 2: Configureer Environment Variabelen

Maak een `.env.local` bestand (als die nog niet bestaat):

```bash
cp .env.example .env.local
```

Voeg de volgende regels toe aan `.env.local`:

```env
# === CV Processing ===
GLINER_SERVICE_URL=http://localhost:8001
GLINER_DETECTION_THRESHOLD=0.3
GLINER_MAX_CHUNK_LENGTH=512

# Encryption keys (GEGENEREERD):
CV_ENCRYPTION_KEY=0395842eba5c93df42192ad339ad8a39a8d647df69124331ba1b4d383f9c0cfb
CV_ENCRYPTION_IV=2187969ac02cb363ca6de39813e71d43

# Database (voor CV processing)
DB_NAME=competentnl_rag
DB_PROMPTS_NAME=competentnl_prompts
```

**BELANGRIJK**: Zorg dat je ook de bestaande variabelen invult:
- `GEMINI_API_KEY` - Je Google Gemini API key
- `COMPETENTNL_API_KEY` - Je CompetentNL API key
- `MARIADB_PASSWORD` - Je database wachtwoord

### Stap 3: Start GLiNER Service

In een **nieuwe terminal**:

```bash
cd services/python
source venv/bin/activate
python gliner_service.py
```

Je zou moeten zien:
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8001
```

**Test de service**:
```bash
curl http://localhost:8001/health
# Expected: {"status":"healthy","model_loaded":true}
```

### Stap 4: Start de Backend (met CV routes)

In je **main terminal**:

```bash
npm run dev
```

Je zou moeten zien:
```
[Backend] .env.local geladen
✓ RAG Database: competentnl_rag
✓ Prompts Database: competentnl_prompts
📄 CV Processing routes mounted at /api/cv
CompetentNL Server v4.1.0 - All Scenarios + Matching
```

### Stap 5: Test de CV Upload API

```bash
# Test of de API endpoints beschikbaar zijn
curl http://localhost:3001/api/cv/health

# Upload een test CV (vervang met je eigen PDF)
curl -X POST http://localhost:3001/api/cv/upload \
  -F "cv=@test.pdf" \
  -F "sessionId=test-123"
```

Expected response:
```json
{
  "success": true,
  "cvId": 1,
  "message": "CV uploaded and processing completed",
  "processingStatus": "completed"
}
```

## Frontend Integratie

De frontend components zijn al gemaakt, maar nog niet geïntegreerd in de UI. Hier is hoe je een CV upload knop kunt toevoegen:

### Optie A: Voeg toe aan je bestaande UI

In `App.tsx` (of waar je wilt dat de CV upload beschikbaar is):

```tsx
import { useState } from 'react';
import { CVUploadModal } from './components/CVUploadModal';
import { CVReviewScreen } from './components/CVReviewScreen';

function YourComponent() {
  const [showCVUpload, setShowCVUpload] = useState(false);
  const [cvId, setCvId] = useState<number | null>(null);

  return (
    <>
      {/* Upload knop */}
      <button
        onClick={() => setShowCVUpload(true)}
        className="your-button-style"
      >
        📄 Upload CV voor Analyse
      </button>

      {/* Upload modal */}
      <CVUploadModal
        sessionId="user-session-123" // Of gebruik je echte session ID
        isOpen={showCVUpload}
        onComplete={(id) => {
          setCvId(id);
          setShowCVUpload(false);
        }}
        onClose={() => setShowCVUpload(false)}
      />

      {/* Review screen */}
      {cvId && (
        <CVReviewScreen
          cvId={cvId}
          onComplete={() => {
            console.log('CV approved by user');
            setCvId(null);
          }}
          onBack={() => setCvId(null)}
        />
      )}
    </>
  );
}
```

## Troubleshooting

### GLiNER service start niet

```bash
cd services/python

# Check Python versie (moet 3.9+)
python3 --version

# Herinstalleer venv
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start opnieuw
python gliner_service.py
```

### Database errors

```bash
# Check of tabellen bestaan
mysql -u root -p competentnl_rag -e "SHOW TABLES LIKE '%cv%';"

# Als tabellen niet bestaan, run migration opnieuw
mysql -u root -p competentnl_rag < database/003-cv-privacy-tables.sql
```

### NPM install errors

Als je problemen hebt met `sharp`, voeg dit toe aan `.npmrc`:
```
sharp_binary_host=https://github.com/lovell/sharp-libvips/releases/download
sharp_libvips_binary_host=https://github.com/lovell/sharp-libvips/releases/download
```

Of installeer zonder optionals:
```bash
npm install --omit=optional
```

## Wat gebeurt er nu?

Als alles werkt heb je:

1. **Backend API** op `http://localhost:3001` met CV processing endpoints
2. **GLiNER service** op `http://localhost:8001` voor lokale PII detectie
3. **Frontend components** die je kunt integreren in je UI
4. **Database** met 6 nieuwe tabellen voor CV storage en privacy logging

**Privacy Flow:**
1. User upload CV (PDF/Word)
2. GLiNER detecteert PII **lokaal** (geen API call!)
3. Werkgevers worden gegeneraliseerd
4. Privacy risk assessment
5. User review screen met transparency
6. Informed consent bij hogere risico's
7. Classificatie met Gemini (alleen anonieme data!)

## Volgende Stappen

- [ ] Test met een echte CV
- [ ] Bekijk de privacy review screen
- [ ] Check de audit trail: `GET /api/cv/:cvId/privacy-audit`
- [ ] Integreer in je main UI
- [ ] Optioneel: Connect met je bestaande CompetentNL classificatie

## Vragen?

Zie de complete documentatie in:
- `README.md` - Complete setup en API docs
- `docs/CV_ANALYSIS_PLAN.md` - Functionele specificatie
- `docs/CV_PRIVACY_FLOW.md` - Privacy dataflow
