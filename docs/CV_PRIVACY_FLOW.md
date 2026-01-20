# CV Verwerking - Privacy-First Informatieflow

## KRITIEK PRINCIPE: PII wordt EERST verwijderd, VOORDAT er iets naar de LLM gaat!

---

## VOLLEDIGE INFORMATIEFLOW

```
┌─────────────────────────────────────────────────────────────────┐
│ STAP 1: GEBRUIKER UPLOAD                                        │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Gebruiker uploadt: "cv_jan_jansen.pdf"                         │
│                                                                 │
│ Inhoud van CV:                                                  │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Jan Jansen                                                 │ │
│ │ Hoofdstraat 123, 1234 AB Amsterdam                        │ │
│ │ jan.jansen@example.nl                                     │ │
│ │ 06-12345678                                               │ │
│ │                                                            │ │
│ │ WERKERVARING                                              │ │
│ │ Software Engineer bij TechCorp B.V. (2020-2024)          │ │
│ │ - Ontwikkeling van webapplicaties met Python en React    │ │
│ │ - Database optimalisatie met PostgreSQL                  │ │
│ │                                                            │ │
│ │ OPLEIDING                                                  │ │
│ │ HBO Informatica, Hogeschool Utrecht (2016-2020)           │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ Upload naar server
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAP 2: SERVER - TEXT EXTRACTIE                                │
│ ─────────────────────────────────────────────────────────────── │
│ 🖥️  Backend Server (Node.js)                                    │
│                                                                 │
│ Tool: pdf-parse                                                 │
│ Input: cv_jan_jansen.pdf (binary)                              │
│ Output: Raw text (string)                                       │
│                                                                 │
│ const rawText = await extractPDFText(file);                     │
│                                                                 │
│ rawText = "Jan Jansen\nHoofdstraat 123, 1234 AB Amsterdam\n..." │
│                                                                 │
│ ⚠️  PII ZIT NOG IN DE DATA!                                     │
│ ⚠️  DEZE DATA GAAT NIET NAAR EXTERNE SERVICES!                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ In-memory processing
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAP 3: SERVER - PII DETECTIE                                  │
│ ─────────────────────────────────────────────────────────────── │
│ 🔍 PII Detector (Lokaal op server, geen externe API!)          │
│                                                                 │
│ const piiDetected = detectPII(rawText);                         │
│                                                                 │
│ Gevonden PII:                                                   │
│ ✅ Email:    jan.jansen@example.nl                              │
│ ✅ Telefoon: 06-12345678                                        │
│ ✅ Adres:    Hoofdstraat 123, 1234 AB Amsterdam                │
│ ✅ Naam:     Jan Jansen                                         │
│                                                                 │
│ piiDetected = ['email', 'phone', 'address', 'name']             │
│                                                                 │
│ ⚠️  PII ZIT NOG STEEDS IN rawText!                              │
│ ⚠️  MAAR WORDT NU WEL HERKEND!                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ In-memory processing
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAP 4: SERVER - PII VERWIJDERING ⭐ KRITIEKE STAP!             │
│ ─────────────────────────────────────────────────────────────── │
│ 🧹 Anonymizer (Lokaal op server)                                │
│                                                                 │
│ const anonymized = anonymizeCV(rawText, piiDetected);           │
│                                                                 │
│ VOOR anonimisering:                                             │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Jan Jansen                                                 │ │
│ │ Hoofdstraat 123, 1234 AB Amsterdam                        │ │
│ │ jan.jansen@example.nl                                     │ │
│ │ 06-12345678                                               │ │
│ │                                                            │ │
│ │ WERKERVARING                                              │ │
│ │ Software Engineer bij TechCorp B.V. (2020-2024)          │ │
│ │ - Ontwikkeling met Python en React                        │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ NA anonimisering:                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ [NAAM_VERWIJDERD]                                          │ │
│ │ [ADRES_VERWIJDERD]                                        │ │
│ │ [EMAIL_VERWIJDERD]                                        │ │
│ │ [TELEFOON_VERWIJDERD]                                     │ │
│ │                                                            │ │
│ │ WERKERVARING                                              │ │
│ │ Software Engineer bij [BEDRIJF] (2020-2024)              │ │
│ │ - Ontwikkeling met Python en React                        │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ✅ ALLE PII IS NU VERWIJDERD!                                   │
│ ✅ Functietitels, vaardigheden blijven intact                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ Twee verschillende opslag locaties:
                            ↓
           ┌────────────────┴────────────────┐
           ↓                                  ↓
┌─────────────────────────┐    ┌─────────────────────────────────┐
│ OPSLAG 1: DATABASE      │    │ OPSLAG 2: GEHEUGEN              │
│ (voor later ophalen)    │    │ (voor verdere processing)       │
├─────────────────────────┤    ├─────────────────────────────────┤
│                         │    │                                 │
│ user_cvs tabel:         │    │ In-memory variabelen:           │
│ ├─ original_text        │    │ ├─ anonymizedText               │
│ │  (ENCRYPTED!)         │    │ └─ piiDetected[]                │
│ ├─ anonymized_text      │    │                                 │
│ └─ pii_detected (JSON)  │    │ Deze data wordt gebruikt        │
│                         │    │ voor volgende stappen           │
│ ❌ PII in original      │    │                                 │
│ ✅ Geen PII in anon     │    │ ✅ Geen PII in deze data!       │
└─────────────────────────┘    └─────────────────────────────────┘
                                              ↓
                                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAP 5: SERVER - STRUCTURELE PARSING                           │
│ ─────────────────────────────────────────────────────────────── │
│ 📋 CV Parser (Lokaal op server, rules-based)                    │
│                                                                 │
│ const parsed = parseCVStructure(anonymizedText);                │
│                                                                 │
│ Extracted data:                                                 │
│ {                                                               │
│   experience: [                                                 │
│     {                                                           │
│       jobTitle: "Software Engineer",                            │
│       organization: "[BEDRIJF]",  // Anoniem!                  │
│       years: "2020-2024",                                       │
│       skills: ["Python", "React", "PostgreSQL"]                │
│     }                                                           │
│   ],                                                            │
│   education: [                                                  │
│     {                                                           │
│       degree: "HBO Informatica",                                │
│       institution: "Hogeschool Utrecht",                        │
│       year: "2020"                                              │
│     }                                                           │
│   ]                                                             │
│ }                                                               │
│                                                                 │
│ ✅ Alleen functietitels, vaardigheden, opleidingen              │
│ ✅ GEEN NAW-gegevens!                                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAP 6: SERVER - LOKALE MATCHING (80% van gevallen)            │
│ ─────────────────────────────────────────────────────────────── │
│ 🔍 CNL Matcher (Lokaal op server, GEEN externe API)             │
│                                                                 │
│ const matches = await matchLocalCNL(parsed);                    │
│                                                                 │
│ Database query:                                                 │
│ SELECT occupation_uri, occupation_label                         │
│ FROM cnl_occupation_keywords                                    │
│ WHERE keyword LIKE 'Software Engineer'                          │
│                                                                 │
│ Result:                                                         │
│ {                                                               │
│   uri: "cnlo:SoftwareOntwikkelaar",                            │
│   label: "Softwareontwikkelaar",                                │
│   confidence: 0.95  // Hoge zekerheid!                         │
│ }                                                               │
│                                                                 │
│ ✅ 95% zekerheid → GEEN LLM NODIG!                              │
│ ✅ Gratis, snel, privacy-vriendelijk                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ Confidence check
                            ↓
                    Confidence > 70%?
                            │
              ┌─────────────┴─────────────┐
              │ JA (80% van gevallen)     │ NEE (20% van gevallen)
              ↓                           ↓
    ┌─────────────────────┐    ┌─────────────────────────────────┐
    │ KLAAR!              │    │ STAP 7: LLM ENHANCEMENT         │
    │ Ga naar STAP 8      │    │ (ALLEEN VOOR LAGE CONFIDENCE)   │
    └─────────────────────┘    ├─────────────────────────────────┤
                               │ 🤖 Gemini API Call               │
                               │                                 │
                               │ ⚠️  LET OP: ALLEEN ANONIEME DATA!│
                               │                                 │
                               │ Input naar Gemini:              │
                               │ ┌─────────────────────────────┐ │
                               │ │ Functietitel:                │ │
                               │ │ "Team Lead IT"               │ │
                               │ │                              │ │
                               │ │ Vaardigheden:                │ │
                               │ │ "Projectmanagement,          │ │
                               │ │  Agile, Scrum"               │ │
                               │ │                              │ │
                               │ │ Classificeer naar            │ │
                               │ │ CompetentNL beroep           │ │
                               │ └─────────────────────────────┘ │
                               │                                 │
                               │ ❌ GEEN naam                     │
                               │ ❌ GEEN email                    │
                               │ ❌ GEEN telefoon                 │
                               │ ❌ GEEN adres                    │
                               │ ❌ GEEN BSN                      │
                               │                                 │
                               │ ✅ Alleen functietitel          │
                               │ ✅ Alleen vaardigheden          │
                               │                                 │
                               │ Gemini Response:                │
                               │ {                               │
                               │   occupation: "ICTProjectleider"│
                               │   confidence: 0.82              │
                               │ }                               │
                               └─────────────────────────────────┘
                                              ↓
                                              ↓
                    ┌─────────────────────────┴─────────────┐
                    │                                       │
                    ↓                                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAP 8: FRONTEND - REVIEW SCHERM                               │
│ ─────────────────────────────────────────────────────────────── │
│ 👤 Gebruiker Interface                                          │
│                                                                 │
│ Gebruiker ziet:                                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ✅ Privacy Status: Geen persoonsgegevens gedeeld          │ │
│ │    Gedetecteerd en verwijderd:                            │ │
│ │    • 1 email                                              │ │
│ │    • 1 telefoonnummer                                     │ │
│ │    • 1 adres                                              │ │
│ │    • 1 naam                                               │ │
│ │                                                            │ │
│ │ 🔍 Werkervaring:                                           │ │
│ │ 1. Software Engineer (2020-2024)                          │ │
│ │    Gematcht: Softwareontwikkelaar ✅ 95%                  │ │
│ │    [✅ Akkoord] [✏️ Bewerken]                              │ │
│ │                                                            │ │
│ │ 2. Team Lead IT (2015-2018)                               │ │
│ │    Gematcht: ICT-projectleider ⚠️ 82%                     │ │
│ │    [🎯 Kies suggestie] [✏️ Bewerken]                      │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ✅ Gebruiker ziet dat PII is verwijderd                         │
│ ✅ Gebruiker kan extracties valideren                           │
│ ✅ Transparantie en controle                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ Gebruiker klikt "Ga naar matching"
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAP 9: MATCHING                                                │
│ ─────────────────────────────────────────────────────────────── │
│ 🎯 Bestaande Matching API                                       │
│                                                                 │
│ Input:                                                          │
│ {                                                               │
│   capabilities: [                                               │
│     { uri: "cnlo:Python", label: "Python" },                   │
│     { uri: "cnlo:React", label: "React" }                      │
│   ],                                                            │
│   occupationHistory: [                                          │
│     { uri: "cnlo:SoftwareOntwikkelaar", years: 4 }             │
│   ]                                                             │
│ }                                                               │
│                                                                 │
│ Output:                                                         │
│ - Top 10 passende beroepen                                     │
│ - Skills gaps                                                   │
│ - Training aanbevelingen                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## SAMENVATTING: WAT GEBEURT ER MET PII?

### Tijdlijn van PII in het systeem:

| Stap | Locatie | PII Status | Data naar Extern? |
|------|---------|------------|-------------------|
| **1. Upload** | Browser → Server | ✅ Zit in data | ❌ Nee |
| **2. Extractie** | Server (in-memory) | ✅ Zit in rawText | ❌ Nee |
| **3. Detectie** | Server (in-memory) | ✅ Wordt herkend | ❌ Nee |
| **4. Anonimisering** | Server (in-memory) | ❌ **VERWIJDERD** | ❌ Nee |
| **5. Parsing** | Server (in-memory) | ❌ Niet meer aanwezig | ❌ Nee |
| **6. Lokale Match** | Server (database query) | ❌ Niet meer aanwezig | ❌ Nee |
| **7. LLM Call** | Server → **Gemini API** | ❌ **NOOIT VERSTUURD** | ✅ **JA, MAAR ZONDER PII!** |
| **8. Review** | Server → Browser | ❌ Niet meer aanwezig | ❌ Nee (alleen results) |
| **9. Matching** | Server (bestaande API) | ❌ Niet meer aanwezig | ❌ Nee |

### Kritieke Garanties:

1. ✅ **PII wordt verwijderd in STAP 4** (op de server)
2. ✅ **LLM call gebeurt in STAP 7** (NA anonimisering)
3. ✅ **Gemini API ziet NOOIT**: naam, email, telefoon, adres, BSN
4. ✅ **Gemini API ziet ALLEEN**: functietitel, vaardigheden (niet-persoonlijk)
5. ✅ **Originele CV** (met PII) wordt ENCRYPTED opgeslagen in database
6. ✅ **Auto-delete** na 30 dagen

---

## CODE VOORBEELD: HOW IT WORKS

```typescript
// services/cvProcessingService.ts

export async function processCVFile(file: File, sessionId: string) {

  // STAP 2: Extractie (PII zit nog in data)
  const rawText = await extractPDFText(file);
  // rawText = "Jan Jansen\njan@example.nl\n06-12345678\n..."

  // STAP 3 & 4: Detectie + Anonimisering (PII wordt verwijderd)
  const { anonymizedText, piiDetected } = anonymizeCV(rawText);
  // anonymizedText = "[NAAM]\n[EMAIL]\n[TELEFOON]\n..."
  // piiDetected = ['name', 'email', 'phone']

  // Opslag: origineel encrypted, anoniem plain
  const cvId = await storeCVDocument({
    originalText: encrypt(rawText),      // ✅ Encrypted!
    anonymizedText: anonymizedText,      // ✅ Geen PII!
    piiDetected: piiDetected
  });

  // STAP 5: Parsing (gebruikt ANONIEME tekst)
  const parsed = parseCVStructure(anonymizedText);
  // parsed = { experience: [{ jobTitle: "Software Engineer", ... }] }

  // STAP 6: Lokale matching (geen externe API)
  const localMatches = await matchLocalCNL(parsed);

  // STAP 7: LLM alleen voor lage confidence
  const lowConfidence = localMatches.filter(m => m.confidence < 0.7);

  if (lowConfidence.length > 0) {
    // ⚠️  KRITIEK: Alleen anonieme data naar LLM!
    const llmInput = {
      jobTitle: lowConfidence[0].jobTitle,  // ✅ "Team Lead IT"
      skills: lowConfidence[0].skills        // ✅ ["Agile", "Scrum"]
      // ❌ GEEN naam, email, telefoon, etc.
    };

    const llmResult = await callGeminiAPI(llmInput);
  }

  return {
    cvId,
    extraction: { ...parsed, ...localMatches },
    piiWasRemoved: piiDetected.length > 0
  };
}
```

---

## VERIFICATIE: HOE WEET JE DAT HET WERKT?

### 1. Logging van LLM Calls

Alle Gemini API calls worden gelogd:

```typescript
async function callGeminiAPI(input: any) {
  // Log wat we ECHT naar Gemini sturen
  console.log('[LLM CALL] Input data:', JSON.stringify(input));

  // Check of er geen PII in zit
  const containsPII = checkForPII(JSON.stringify(input));
  if (containsPII) {
    throw new Error('⛔ PII DETECTED IN LLM INPUT! Blocked.');
  }

  const response = await gemini.generateContent(input);
  return response;
}
```

### 2. Audit Log

Database tabel `cv_processing_logs` bevat:
- Welke data naar LLM ging
- Timestamp
- PII detection results

### 3. Review Scherm

Gebruiker ziet expliciet:
> "✅ Privacy Status: Geen persoonsgegevens gedeeld
>  Gedetecteerd en verwijderd: 1 email, 1 telefoon, 1 adres"

---

## CONCLUSIE

### Volgorde is CRUCIAAL:

```
❌ FOUT:  CV → LLM → PII verwijderen
✅ GOED:  CV → PII verwijderen → LLM
```

### Privacy Garanties:

1. ✅ PII wordt **EERST** verwijderd (STAP 4)
2. ✅ LLM wordt **DAARNA** aangeroepen (STAP 7)
3. ✅ LLM ziet **ALLEEN** functietitels en vaardigheden
4. ✅ Gebruiker heeft **CONTROLE** via review scherm
5. ✅ Alles is **TRANSPARANT** en **VERIFIEERBAAR**

Is dit nu duidelijk? De data gaat NOOIT naar de LLM voordat PII is verwijderd! 🔒
