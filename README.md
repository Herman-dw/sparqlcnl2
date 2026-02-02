# CompetentNL SPARQL AI Agent

Een intelligente NL-naar-SPARQL agent voor het bevragen van CompetentNL en ESCO data met AI-ondersteuning, SPARQL validatie en Excel export.

> **Voor Developers:** Zie [DEVELOPMENT.md](./DEVELOPMENT.md) voor de development workflow, git merge script, en TypeScript import best practices.

## Features

### SPARQL AI Agent

- 🗣️ **Natuurlijke taal naar SPARQL** - Stel vragen in het Nederlands
- 🧠 **Chatgeschiedenis** - Vervolgvragen stellen met context
- 📊 **Automatisch tellen** - Toont totaal aantal resultaten met optie om alles te laden
- ✅ **SPARQL Validatie** - Controleert queries voordat ze uitgevoerd worden
- 👍👎 **Feedback systeem** - Like/dislike voor verbetering
- 📥 **Excel export** - Download resultaten als .xlsx
- 🎨 **Moderne UI** - Clean, responsive interface

### CV Upload & Analyse (Privacy-First)

- 📄 **CV Upload** - PDF & Word support (drag & drop)
- 🔒 **Lokale PII Detectie** - GLiNER model detecteert persoonsgegevens **VOOR** LLM analyse
- 🏢 **Werkgever Generalisatie** - Automatische privacy-bescherming tegen re-identificatie
- ⚠️ **Privacy Risk Assessment** - Intelligente analyse van identificatierisico's
- ✅ **User Review Screen** - Transparante weergave van gedetecteerde data en privacy-keuzes
- 🎯 **Informed Consent** - Gebruiker beslist bewust over data sharing met risk visualisatie
- 📋 **Audit Trail** - Volledige logging van privacy events (GDPR compliant)
- 🔐 **AES-256 Encryptie** - Originele CV tekst veilig opgeslagen
- 🗑️ **Auto-Delete** - 30-dagen retentie met automatische cleanup

## Design tokens

### Kleuren (hex)
- **Brand Navy**: `#0E2841`
- **Brand Blue**: `#156082`
- **Accent Orange**: `#E97132`
- **Accent Cyan**: `#0F9ED5`
- **Success Green**: `#196B24`
- **Magenta**: `#A02B93`
- **Surface**: `#F5F8FB`
- **Surface Alt / Kaarten**: `#FFFFFF`
- **Border**: `#D9E2EC`
- **Tekstkleur primair**: `#0E2841`
- **Tekstkleur secundair**: `#156082`
- **Tekst op donkere vlakken**: `#FFFFFF`
- **Tekst op accentvlakken**: `#0E2841`

### Typografieschaal
- **Fonts**: koppen `Space Grotesk`, body `Inter` (fallback system-ui).
- **H1**: 2.25rem / 2.75rem, weight 700  
- **H2**: 1.875rem / 2.375rem, weight 700  
- **H3**: 1.5rem / 2rem, weight 600  
- **H4**: 1.25rem / 1.75rem, weight 600  
- **Body**: 1rem / 1.625rem, weight 400  
- **Body strong**: 1rem / 1.625rem, weight 600  
- **Caption**: 0.8125rem / 1.25rem, weight 500  

### Contrast (WCAG)
Aanbevolen tekst/achtergrond combinaties met minimaal AA (4.5:1) en AAA (7:1) waar aangegeven:
- **AA**: Brand Blue op Surface (`#156082` op `#F5F8FB`, ~6.5:1)
- **AAA**: Brand Navy op Surface (`#0E2841` op `#F5F8FB`, ~14.1:1)
- **AAA**: Brand Navy op Surface Alt/White (`#0E2841` op `#FFFFFF`, ~15:1)
- **AA**: White op Brand Blue (`#FFFFFF` op `#156082`, ~6.9:1)
- **AA**: White op Success Green (`#FFFFFF` op `#196B24`, ~6.6:1)
- **AA**: Brand Navy op Border (`#0E2841` op `#D9E2EC`, ~13.6:1)

## Installatie

### Vereisten
- Node.js 18+
- Python 3.9+ (voor CV processing)
- MariaDB/MySQL met twee databases:
  - `competentnl_rag` - SPARQL caching & CV processing
  - `competentnl_prompts` - AI prompt templates & examples
- npm of yarn
- Gemini API key (gratis via https://aistudio.google.com/apikey)
- CompetentNL API key

### Quick Start (SPARQL Agent Only)

1. Clone de repository:
```bash
git clone https://github.com/[username]/competentnl-sparql-agent.git
cd competentnl-sparql-agent
```

2. Installeer dependencies:
```bash
npm install
```

3. Maak een `.env.local` bestand:
```env
COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
COMPETENTNL_API_KEY=jouw_competentnl_api_key
GEMINI_API_KEY=jouw_gemini_api_key
```

4. Start de applicatie:
```bash
npm run dev
```

De app draait op:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Full Setup (met CV Processing)

Voor CV upload en analyse functionaliteit, zie de uitgebreide [CV Upload & Analyse](#cv-upload--analyse---privacy-first-processing) sectie hieronder.

## Projectstructuur

```
├── App.tsx                          # Hoofd React component
├── index.tsx                        # React entry point
├── index.html                       # HTML template
├── server.js                        # Express backend
├── vite.config.ts                   # Vite configuratie
├── package.json                     # Dependencies
├── .env.local                       # API keys (niet committen!)
│
├── types/
│   ├── types.ts                     # Core types (SPARQL)
│   └── cv.ts                        # CV processing types (NEW)
│
├── services/
│   ├── geminiService.ts             # Gemini AI integratie
│   ├── sparqlService.ts             # SPARQL query uitvoering
│   ├── sparqlValidator.ts           # Query validatie
│   ├── feedbackService.ts           # Feedback logging
│   ├── excelService.ts              # Excel export
│   ├── cvProcessingService.ts       # CV orchestrator (NEW)
│   ├── privacyLogger.ts             # Privacy audit trail (NEW)
│   ├── employerCategories.ts        # Employer mappings (NEW)
│   ├── employerGeneralizer.ts       # Privacy generalization (NEW)
│   ├── riskAssessment.ts            # Privacy risk scoring (NEW)
│   └── python/                      # GLiNER PII Detection (NEW)
│       ├── gliner_service.py        # FastAPI REST service
│       ├── pii_detector.py          # GLiNER wrapper
│       ├── requirements.txt         # Python dependencies
│       └── setup.sh                 # Automated installation
│
├── routes/
│   └── cvRoutes.ts                  # CV API endpoints (NEW)
│
├── components/
│   ├── CVUploadModal.tsx            # Drag & drop upload (NEW)
│   ├── CVReviewScreen.tsx           # Privacy review UI (NEW)
│   └── PrivacyConsentModal.tsx      # Informed consent (NEW)
│
├── database/
│   └── 003-cv-privacy-tables.sql    # CV tables migration (NEW)
│
├── docs/
│   ├── CV_ANALYSIS_PLAN.md          # Complete functionele spec
│   ├── CV_PRIVACY_FLOW.md           # Privacy dataflow diagram
│   ├── LOCAL_LLM_ANALYSIS.md        # GLiNER analysis
│   ├── EMPLOYER_PRIVACY_ANALYSIS.md # Quasi-identifier analysis
│   └── IMPLEMENTATION_PLAN.md       # Implementation roadmap
│
├── constants.ts                     # Configuratie constanten
└── schema.ts                        # CompetentNL schema documentatie
```

---

## CV Upload & Analyse - Privacy-First Processing

### 🎯 Overzicht

Het CV Processing systeem analyseert uploaded CV's en matcht werkervaring en opleidingen met CompetentNL beroepen en opleidingsnormen. **Privacy staat voorop**: alle persoonsgegevens worden lokaal verwijderd VOOR ze naar externe AI services gaan.

### 🔒 Privacy Garanties

#### 1. Lokale PII Detectie
- **GLiNER model** (300M parameters, CPU-optimized) draait **lokaal** op de server
- Detecteert: namen, email, telefoon, adressen, BSN, geboortedatums
- **93% accuracy** zonder externe API calls
- PII wordt verwijderd VOOR classificatie met Gemini

#### 2. Werkgever Generalisatie
- Werkgever-sequenties kunnen identificerend zijn (bijv. "Google → OpenAI")
- Automatische generalisatie: "Google" → "Groot internationaal tech bedrijf"
- 50+ employer patterns met sector mapping
- Privacy risk scoring per CV

#### 3. User Control
- **Review screen** toont exact wat gedetecteerd is
- **Informed consent modal** bij hogere risico's
- Gebruiker kan kiezen tussen privacy (generalized) of kwaliteit (exact)
- Bij critical risk: alleen generalized mode beschikbaar

#### 4. GDPR Compliance
- AES-256 encryptie van originele CV tekst
- Complete audit trail van alle privacy events
- 30-dagen automatische verwijdering
- Right to erasure (DELETE endpoint)
- Consent logging met IP + User-Agent

### 📦 Installatie

#### Vereisten
- Node.js 18+
- Python 3.9+
- MariaDB/MySQL
- 4GB RAM minimum (voor GLiNER model)

#### Stap 1: Database Migratie

```bash
# Run database migration
mysql -u root -p competentnl_rag < database/003-cv-privacy-tables.sql
```

Dit creëert 6 nieuwe tabellen in de `competentnl_rag` database:
- `user_cvs` - CV storage met encryptie
- `cv_extractions` - Geëxtraheerde werkervaring/opleidingen
- `cv_pii_detections` - PII detectie resultaten
- `privacy_consent_logs` - Audit trail
- `cv_extraction_feedback` - User corrections
- `cnl_classification_cache` - Performance optimalisatie

#### Stap 2: GLiNER Service (Python)

```bash
cd services/python

# Automated setup (recommended)
./setup.sh

# Or manual setup:
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start GLiNER service
python gliner_service.py
```

**Service draait op**: `http://localhost:8001`

**Test de service**:
```bash
curl -X POST http://localhost:8001/anonymize \
  -H "Content-Type: application/json" \
  -d '{"text": "Mijn naam is Jan Jansen, email: jan@example.com"}'
```

#### Stap 3: Environment Variabelen

Voeg toe aan `.env.local`:
```env
# Existing
COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
COMPETENTNL_API_KEY=jouw_competentnl_api_key
GEMINI_API_KEY=jouw_gemini_api_key

# New: GLiNER Service
GLINER_SERVICE_URL=http://localhost:8001
GLINER_DETECTION_THRESHOLD=0.3
GLINER_MAX_CHUNK_LENGTH=512

# Encryption (generate met: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
CV_ENCRYPTION_KEY=your_32_byte_hex_key
CV_ENCRYPTION_IV=your_16_byte_hex_key
```

#### Stap 4: Restart Backend

```bash
npm run dev
```

### 🏗️ Architectuur

```
┌─────────────────────────────────────────────────────────────┐
│                     CV Upload Flow                          │
└─────────────────────────────────────────────────────────────┘

1. User uploads PDF/Word
   ↓
2. Extract text (pdf-parse / mammoth)
   ↓
3. GLiNER Service (LOKAAL)
   - Detect PII: naam, email, telefoon, adres, BSN
   - Replace with [REDACTED_NAME], [REDACTED_EMAIL], etc.
   ↓
4. Store in database:
   - Original text: AES-256 encrypted
   - Anonymized text: PII-removed, plain text
   ↓
5. Parse structure
   - Werkervaring (job title, employer, period, skills)
   - Opleidingen (degree, institution, year)
   ↓
6. Employer Generalization
   - "Google" → "Groot internationaal tech bedrijf"
   - "Lokale bakkerij De Korenschoof" → "Kleine lokale onderneming"
   ↓
7. Privacy Risk Assessment
   - PII count (high severity)
   - Employer sequence uniqueness
   - Total risk score: 0-100
   - Risk level: low/medium/high/critical
   ↓
8. User Review Screen
   - Shows: extracted data, privacy status, generalized vs. exact
   - User choice: keep privacy (default) OR opt-in for exact data
   ↓
9. Classify with Gemini (ONLINE)
   - Input: anonymized text + generalized employers
   - Match to CNL occupations/educations
   - NO PII in this step!
```

### 📡 API Endpoints

#### POST /api/cv/upload
Upload en verwerk een CV.

**Request**:
```typescript
FormData:
  cv: File (PDF/Word, max 10MB)
  sessionId: string
```

**Response**:
```typescript
{
  success: true,
  cvId: number,
  message: "CV uploaded and processing completed",
  processingStatus: "completed" | "processing" | "failed"
}
```

#### GET /api/cv/:cvId/status
Check CV processing status (voor polling).

**Response**:
```typescript
{
  cvId: number,
  status: "pending" | "processing" | "completed" | "failed",
  progress: number, // 0-100
  currentStep?: string,
  error?: string
}
```

#### GET /api/cv/:cvId/extraction
Haal extraction resultaten op voor review screen.

**Response**:
```typescript
{
  cvId: number,
  sections: {
    experience: Array<{
      id: number,
      content: {
        job_title: string,
        employer: string,
        duration_years: number,
        extracted_skills: string[]
      },
      displayEmployer: string, // Generalized
      privacyInfo: {
        wasGeneralized: boolean,
        originalEmployer?: string,
        generalizedEmployer?: string
      },
      matched_cnl_label?: string,
      confidence_score: number
    }>,
    education: [...],
    skills: [...]
  },
  privacyStatus: {
    riskLevel: "low" | "medium" | "high" | "critical",
    piiCount: number,
    piiDetected: string[], // ["name", "email", "phone"]
    allowExactData: boolean
  },
  overallConfidence: number
}
```

#### POST /api/cv/:cvId/privacy-consent
Sla gebruiker privacy consent op.

**Request**:
```typescript
{
  consentGiven: boolean,
  useExactEmployers: boolean,
  consentText: string
}
```

**Response**:
```typescript
{
  success: true,
  message: "Privacy consent saved",
  allowedActions: string[]
}
```

#### GET /api/cv/:cvId/privacy-audit
Haal volledig privacy audit trail op.

**Response**:
```typescript
{
  cvId: number,
  events: Array<{
    eventType: "pii_detected" | "employer_generalized" | "user_consent_given" | "llm_call_made" | "exact_data_shared",
    timestamp: string,
    details: object
  }>,
  eventCount: number
}
```

#### DELETE /api/cv/:cvId
Verwijder CV (GDPR Right to Erasure).

**Response**:
```typescript
{
  success: true,
  message: "CV successfully deleted"
}
```

### 💻 Gebruik

#### Frontend Integration

```tsx
import { CVUploadModal } from './components/CVUploadModal';
import { CVReviewScreen } from './components/CVReviewScreen';

function App() {
  const [cvId, setCvId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  return (
    <>
      <button onClick={() => setShowUpload(true)}>
        Upload CV
      </button>

      <CVUploadModal
        sessionId="user-session-123"
        isOpen={showUpload}
        onComplete={(id) => {
          setCvId(id);
          setShowUpload(false);
        }}
        onClose={() => setShowUpload(false)}
      />

      {cvId && (
        <CVReviewScreen
          cvId={cvId}
          onComplete={() => console.log('User approved')}
          onBack={() => setCvId(null)}
        />
      )}
    </>
  );
}
```

#### Backend Integration

```typescript
// server.js
import { createCVRoutes } from './routes/cvRoutes';

const db = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

app.use('/api/cv', createCVRoutes(db));
```

### 🛡️ Privacy Features In Detail

#### PII Detection Categories

| Category | Examples | GLiNER Label | Regex Fallback |
|----------|----------|--------------|----------------|
| Name | "Jan Jansen" | `person` | Dutch name patterns |
| Email | jan@example.com | `email` | RFC 5322 regex |
| Phone | +31612345678, 06-12345678 | `phone` | Dutch phone patterns |
| Address | Straatnaam 123, 1234AB | `address` | Postcode + street |
| BSN | 123456789 (with checksum) | - | 11-proof algorithm |
| Date of Birth | 01-01-1990 | `date` | Date patterns |

#### Employer Generalization Examples

| Original | Generalized (Medium) | Generalized (High) |
|----------|---------------------|-------------------|
| Google | Groot internationaal tech bedrijf | Tech bedrijf |
| OpenAI | AI/ML startup | Tech startup |
| Albert Heijn | Grote supermarktketen | Supermarkt |
| UvA | Grote Nederlandse universiteit | Universiteit |
| Lokale bakkerij De Korenschoof | Kleine lokale onderneming | Lokaal bedrijf |

#### Risk Assessment Logic

```typescript
Risk Score = (PII Risk × 0.6) + (Employer Risk × 0.4)

PII Risk:
- High severity (name, BSN, email): 30 points each
- Medium severity (phone, address): 15 points each
- Low severity (date): 5 points each

Employer Risk:
- Famous company sequence (2+): +30 points
- Unique combination: +20 points
- Chronological sequence revealing: +10 points

Total Risk Level:
- 0-25: LOW (exact data allowed with warning)
- 26-50: MEDIUM (consent required)
- 51-75: HIGH (strong warning, consent required)
- 76-100: CRITICAL (only generalized allowed)
```

### 🔍 Troubleshooting

#### GLiNER Service niet beschikbaar

**Symptoom**: `503 Service Unavailable` bij CV upload

**Oplossing**:
```bash
# Check of service draait
curl http://localhost:8001/health

# Herstart service
cd services/python
source venv/bin/activate
python gliner_service.py

# Check logs voor errors
tail -f gliner_service.log
```

#### Out of Memory errors

**Symptoom**: GLiNER service crasht of Python OOM killed

**Oplossing**:
```bash
# Verhoog chunk size limiet (kleiner = minder memory)
# In .env.local:
GLINER_MAX_CHUNK_LENGTH=384  # Default is 512

# Monitor memory usage
htop  # Watch Python process
```

#### Database connection errors

**Symptoom**: `ER_NO_SUCH_TABLE: Table 'user_cvs' doesn't exist`

**Oplossing**:
```bash
# Run migration opnieuw
mysql -u root -p competentnl_rag < database/003-cv-privacy-tables.sql

# Check of tabellen bestaan
mysql -u root -p competentnl_rag -e "SHOW TABLES LIKE '%cv%';"
```

#### Encryption errors

**Symptoom**: `Error: Invalid key length`

**Oplossing**:
```bash
# Generate nieuwe encryption keys (32 bytes = 64 hex chars)
node -e "console.log('CV_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CV_ENCRYPTION_IV=' + require('crypto').randomBytes(16).toString('hex'))"

# Voeg toe aan .env.local
```

### 📚 Documentatie

Voor meer details, zie:
- `docs/CV_ANALYSIS_PLAN.md` - Complete functionele en technische specificatie
- `docs/CV_PRIVACY_FLOW.md` - Gedetailleerd privacy dataflow diagram
- `docs/LOCAL_LLM_ANALYSIS.md` - GLiNER vs andere local LLM opties
- `docs/EMPLOYER_PRIVACY_ANALYSIS.md` - Werkgever sequences als quasi-identifiers
- `docs/IMPLEMENTATION_PLAN.md` - Stap-voor-stap implementatie roadmap

---

## Gebruik

### Voorbeeldvragen

- "Welke vaardigheden heeft een kapper nodig?"
- "Toon alle kennisgebieden"
- "Welke beroepen vereisen leidinggeven?"
- "Wat zijn de taken van een verpleegkundige?"
- "Vergelijk kapper en schoonheidsspecialist"

### Vervolgvragen

De agent onthoudt de context, dus je kunt vervolgvragen stellen:
1. "Welke vaardigheden heeft een leraar nodig?"
2. "Welke daarvan zijn essentieel?"
3. "En welke beroepen hebben dezelfde vaardigheden?"

### Alle resultaten laden

Bij grote datasets toont de app eerst 50 resultaten met de vraag:
> "Er zijn 137 resultaten. Wil je ze allemaal zien?"

Klik op "Toon alle X resultaten" om alles te laden.

## API Keys

### CompetentNL API Key
Vraag aan via de CompetentNL website of contacteer het team.

### Gemini API Key
1. Ga naar https://aistudio.google.com/apikey
2. Log in met je Google account
3. Klik "Create API Key"
4. Kopieer de key naar `.env.local`

## Technische details

### CompetentNL Schema

De knowledge graph bevat:
- **Occupation** (3263) - Beroepen
- **HumanCapability** (137) - Vaardigheden
- **KnowledgeArea** (361) - Kennisgebieden
- **EducationalNorm** (1856) - Opleidingsnormen
- **OccupationTask** (4613) - Beroepstaken

### Belangrijke relaties
- `cnlo:requiresHATEssential` - Essentiële vaardigheden
- `cnlo:requiresHATImportant` - Belangrijke vaardigheden
- `cnluwv:isCharacterizedByOccupationTask_Essential` - Taken

### SPARQL beperkingen
- Geen `FROM <graph>` clauses (API ondersteunt dit niet)
- Altijd `LIMIT` gebruiken
- Alleen lees-queries (SELECT, ASK)

## Development

### Scripts

```bash
npm run dev          # Start frontend + backend
npm run start        # Alias voor dev
npm run start-frontend  # Alleen frontend
npm run start-backend   # Alleen backend
```

### CV Processing Development

```bash
# Start alle services voor CV processing
cd services/python
source venv/bin/activate
python gliner_service.py &  # GLiNER op :8001

cd ../..
npm run dev  # Frontend (:3000) + Backend (:3001)
```

### Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| Frontend (Vite) | 3000 | React UI |
| Backend (Express) | 3001 | API + SPARQL proxy |
| GLiNER Service | 8001 | PII detection (Python/FastAPI) |

### Environment Variables Checklist

```env
# Required voor SPARQL
COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
COMPETENTNL_API_KEY=xxx
GEMINI_API_KEY=xxx

# Required voor CV Processing
GLINER_SERVICE_URL=http://localhost:8001
CV_ENCRYPTION_KEY=xxx (64 hex chars)
CV_ENCRYPTION_IV=xxx (32 hex chars)

# Database (CV processing)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=xxx
DB_NAME=competentnl_rag

# Optional tuning
GLINER_DETECTION_THRESHOLD=0.3
GLINER_MAX_CHUNK_LENGTH=512
```

### Testing CV Processing

```bash
# Test GLiNER service health
curl http://localhost:8001/health

# Test PII detection
curl -X POST http://localhost:8001/anonymize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Mijn naam is Jan Jansen, email: jan@example.com, tel: 06-12345678",
    "threshold": 0.3
  }'

# Expected output:
# {
#   "anonymized_text": "Mijn naam is [REDACTED_NAME], email: [REDACTED_EMAIL], tel: [REDACTED_PHONE]",
#   "pii_detected": {
#     "person": ["Jan Jansen"],
#     "email": ["jan@example.com"],
#     "phone": ["06-12345678"]
#   }
# }

# Test CV upload (via UI or curl)
curl -X POST http://localhost:3001/api/cv/upload \
  -F "cv=@test.pdf" \
  -F "sessionId=test-123"
```

### Privacy Audit (GDPR)

```bash
# Check voor PII leaks in LLM calls
node -e "
const { PrivacyLogger } = require('./services/privacyLogger');
const logger = new PrivacyLogger(db);
logger.checkPIILeakage().then(leaks => {
  if (leaks.length > 0) {
    console.error('⚠️ PII LEAK DETECTED:', leaks);
  } else {
    console.log('✅ No PII leaks detected');
  }
});
"

# Generate GDPR export voor gebruiker
curl http://localhost:3001/api/cv/123/privacy-audit
```

### Feedback analyseren

Feedback wordt opgeslagen in localStorage. Exporteer via:
- UI: Sidebar → Feedback → Exporteer CSV
- Console: `localStorage.getItem('competentnl_feedback')`

### Database Migrations

```bash
# Run migrations in order
mysql -u root -p competentnl_rag < database/001-complete-setup.sql
mysql -u root -p competentnl_prompts < database/002-prompts-and-examples.sql
mysql -u root -p competentnl_rag < database/003-cv-privacy-tables.sql

# Verify tables exist
mysql -u root -p competentnl_rag -e "
  SELECT TABLE_NAME, TABLE_ROWS
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = 'competentnl_rag' AND TABLE_NAME LIKE '%cv%';
"
```

## Security & Deployment

### Security Checklist

- [ ] **Encryption keys**: Generate nieuwe keys voor productie (niet dezelfde als dev)
- [ ] **Database access**: Restrictieve user permissions (geen root in prod)
- [ ] **GLiNER service**: Alleen toegankelijk via localhost (niet extern exposed)
- [ ] **File uploads**: Rate limiting + virus scanning (ClamAV)
- [ ] **API authentication**: Session/JWT tokens implementeren
- [ ] **HTTPS**: Verplicht in productie (Let's Encrypt)
- [ ] **Audit logs**: Regelmatig reviewen voor security incidents
- [ ] **Backup**: Dagelijkse encrypted backups van CV database
- [ ] **GDPR compliance**: Auto-delete na 30 dagen actief

### Production Deployment

```bash
# 1. Build frontend
npm run build

# 2. Setup Python service als systemd service
sudo tee /etc/systemd/system/gliner.service > /dev/null <<EOF
[Unit]
Description=GLiNER PII Detection Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/competentnl/services/python
ExecStart=/var/www/competentnl/services/python/venv/bin/python gliner_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable gliner
sudo systemctl start gliner

# 3. Setup Node.js backend (PM2)
npm install -g pm2
pm2 start server.js --name competentnl-backend
pm2 save
pm2 startup

# 4. Setup Nginx reverse proxy
sudo tee /etc/nginx/sites-available/competentnl > /dev/null <<EOF
server {
    listen 443 ssl http2;
    server_name competentnl.example.com;

    ssl_certificate /etc/letsencrypt/live/competentnl.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/competentnl.example.com/privkey.pem;

    # Frontend
    location / {
        root /var/www/competentnl/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # File upload limits
    client_max_body_size 10M;
}
EOF

sudo ln -s /etc/nginx/sites-available/competentnl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Performance Tuning

**GLiNER Service**:
```python
# In gliner_service.py
uvicorn.run(
    app,
    host="127.0.0.1",  # Localhost only
    port=8001,
    workers=2,  # Increase voor meer throughput (watch memory!)
    timeout_keep_alive=30
)
```

**Database Connection Pool**:
```typescript
// In server.js
const db = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,  // Tune based on load
  queueLimit: 0,
  waitForConnections: true
});
```

### Monitoring

```bash
# GLiNER service health
watch -n 5 'curl -s http://localhost:8001/health | jq'

# Backend health
watch -n 5 'curl -s http://localhost:3001/api/cv/health | jq'

# Database CV counts
watch -n 60 'mysql -u root -p competentnl_rag -e "
  SELECT
    COUNT(*) as total_cvs,
    COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active,
    COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted,
    AVG(privacy_risk_score) as avg_risk
  FROM user_cvs;
"'
```

## FAQ

### Waarom twee databases?

Het systeem gebruikt **twee gescheiden databases**:
- **`competentnl_rag`**: SPARQL query caching, embeddings, en CV processing data
- **`competentnl_prompts`**: AI prompt templates, examples, en conversation logging

Deze scheiding zorgt voor:
- Betere performance (kleinere indexes)
- Makkelijker backup strategieën (CV data vs prompts)
- Cleaner migrations (CV features zijn optioneel)

### Waarom lokaal PII detectie?

**Privacy-first**: Persoonsgegevens mogen NOOIT naar externe AI services (Gemini, ChatGPT, etc.) zonder expliciete consent. Door lokaal te detecteren en verwijderen VOOR classificatie, garanderen we dat PII niet gelekt wordt.

### Waarom niet 100% lokaal (alles local LLM)?

**Balans tussen privacy en kwaliteit**:
- PII detectie: 93% accuracy is goed genoeg, kan lokaal (GLiNER)
- CNL classificatie: Vereist domeinkennis van 3000+ beroepen, grote LLM nodig (Gemini)
- Oplossing: Hybrid approach - lokaal PII removal, online classificatie met anonieme data

### Hoe accuraat is GLiNER?

**93% accuracy** op Nederlandse PII detectie:
- Naam: ~95%
- Email: ~99% (regex fallback)
- Telefoon: ~98% (regex fallback)
- Adres: ~85%
- BSN: 100% (11-proof algorithm)

Hybrid approach (GLiNER + regex) geeft beste resultaten.

### Wat gebeurt er bij high risk CV's?

Bij **critical risk** (score 76-100):
- Gebruiker kan NIET opt-in voor exact data
- Alleen generalized mode beschikbaar
- Extra waarschuwing in UI
- Consent modal toont waarom het risico te hoog is

Bij **high risk** (score 51-75):
- Sterke waarschuwing maar opt-in is mogelijk
- Consent checkbox required
- Duidelijke uitleg van risico's

### GDPR: Hoe lang bewaren jullie CV's?

- **Origineel (encrypted)**: 30 dagen, daarna automatisch verwijderd
- **Extractions**: 90 dagen voor matching history
- **Audit trail**: 1 jaar voor GDPR compliance
- **User kan altijd eerder verwijderen**: DELETE endpoint (Right to Erasure)

### Kan ik de employer generalisatie aanpassen?

Ja! Zie `services/employerCategories.ts`:

```typescript
export const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  {
    pattern: /^(Jouw Bedrijf)$/i,
    category: 'Custom categorie',
    sector: 'Custom sector',
    isIdentifying: true,
    tier: 'exact'
  },
  // ... add more
];
```

### Performance: Hoeveel CV's per minuur?

**Bottleneck is GLiNER service**:
- 1 worker: ~3-5 CV's per minuut (afhankelijk van CV lengte)
- 2 workers: ~8-10 CV's per minuut
- 4 workers: ~15-20 CV's per minuut (let op memory usage!)

**Optimalisatie opties**:
1. Horizontal scaling: Meerdere GLiNER instances + load balancer
2. Queue systeem: Redis + Bull voor async processing
3. GPU acceleration: CUDA support voor 3-5x sneller (vereist GPU server)

## Licentie

MIT

## Contact

Voor vragen over CompetentNL data: [CompetentNL website]
Voor vragen over deze agent: [GitHub Issues]

## Credits

**CV Processing Pipeline ontwikkeld met**:
- [GLiNER](https://github.com/urchade/GLiNER) - Local NER model
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) - PDF text extraction
- [mammoth](https://www.npmjs.com/package/mammoth) - Word document parsing
- [FastAPI](https://fastapi.tiangolo.com/) - Python REST framework
