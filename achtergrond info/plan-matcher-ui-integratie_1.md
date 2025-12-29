# Implementatieplan: Matcher UI Integratie

## Overzicht

Dit plan beschrijft de stapsgewijze integratie van de Profile Matcher API in de CompetentNL SPARQL Agent UI. Het eindresultaat is een conversatie-gedreven matching ervaring, maar we beginnen met eenvoudige bouwstenen.

---

## Huidige Situatie

### ✅ Al Gebouwd (Backend)
- `profile-matching-api.mjs` - Core matching logica met IDF-weging
- `matching-router.mjs` - Express router met endpoints:
  - `POST /api/match-profile` - Match een profiel
  - `GET /api/match-profile/health` - Health check
  - `POST /api/match-profile/preload` - Cache preloaden
- IDF gewichten in `skill_idf_weights` tabel
- Caching van beroepsvereisten (~30-60 sec eerste load)

### 🔨 Nog Te Bouwen (Frontend)
- Match-knop in UI
- Profiel-builder component
- Resultaten weergave
- Gap-analyse visualisatie
- Conversatie-integratie

---

## Fasering

```
┌─────────────────────────────────────────────────────────────────────┐
│  FASE 1: Match Knop + Handmatig Profiel     (1-2 dagen)            │
│  ─────────────────────────────────────────                          │
│  • Match knop in sidebar/toolbar                                    │
│  • Simpele modal voor skill selectie                                │
│  • Resultaten in chat of modal tonen                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FASE 2: Profiel via Werkverleden/Opleiding  (2-3 dagen)           │
│  ─────────────────────────────────────────                          │
│  • "Bouw profiel" wizard                                            │
│  • Beroep/opleiding zoeken → skills extraheren                      │
│  • Profiel opslaan in sessie                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FASE 3: Conversatie-Integratie             (3-5 dagen)            │
│  ─────────────────────────────────────────                          │
│  • Chat-detectie: "welke banen passen bij mij?"                     │
│  • AI vraagt door naar achtergrond                                  │
│  • Automatische profielopbouw                                       │
│  • Resultaten in chat-flow                                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FASE 4: Uitbreidingen                      (toekomst)             │
│  ─────────────────────────────────────────                          │
│  • Holland Code (RIASEC) integratie                                 │
│  • Competentie-test module                                          │
│  • Interview-extractie met AI                                       │
│  • Profiel persistentie (account)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Fase 1: Match Knop + Handmatig Profiel

### 1.1 UI Componenten

```
┌──────────────────────────────────────────────────────────────┐
│  CompetentNL SPARQL Agent                    [⚙️] [🎯 Match]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Chat interface...]                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼ click
┌──────────────────────────────────────────────────────────────┐
│  🎯 Match Profiel                                       [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Selecteer je vaardigheden:                                  │
│  ┌────────────────────────────────────────────┐              │
│  │ 🔍 Zoek vaardigheid...                     │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  Geselecteerd: (3)                                           │
│  ┌────────────────────────────────────────────┐              │
│  │ [x] Programmeren    [x] Analyseren         │              │
│  │ [x] Samenwerken                            │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  [Uitgebreid ▼]  ← Toont kennisgebieden/taken               │
│                                                              │
│                                     [Annuleren] [🔍 Matchen] │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Resultaten Weergave

```
┌──────────────────────────────────────────────────────────────┐
│  🎯 Match Resultaten                                    [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Op basis van: Programmeren, Analyseren, Samenwerken         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. Software Developer                          85% ████ │  │
│  │    Skills: 82% | Kennis: 90% | Taken: 80%               │  │
│  │    ▸ Te ontwikkelen: CI/CD, Cloud architectuur          │  │
│  │                                          [📋 Details]    │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 2. Data Analist                                78% ███  │  │
│  │    Skills: 75% | Kennis: 85% | Taken: 70%               │  │
│  │    ▸ Te ontwikkelen: Statistiek, Machine Learning       │  │
│  │                                          [📋 Details]    │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 3. IT Consultant                               72% ███  │  │
│  │    ...                                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [← Terug]                              [📊 Exporteer PDF]   │
└──────────────────────────────────────────────────────────────┘
```

### 1.3 Technische Implementatie

**Nieuwe bestanden:**

```
src/
├── components/
│   ├── MatchButton.tsx           # De knop in de toolbar
│   ├── MatchModal.tsx            # Modal container
│   ├── ProfileBuilder.tsx        # Skill selectie component
│   ├── MatchResults.tsx          # Resultaten weergave
│   └── SkillSearchInput.tsx      # Autocomplete voor skills
├── hooks/
│   └── useProfileMatch.ts        # API hook voor matching
├── types/
│   └── matching.ts               # TypeScript types
└── services/
    └── matchingService.ts        # API calls
```

**API Service:**

```typescript
// src/services/matchingService.ts

export interface MatchProfile {
  skills: string[];
  knowledge?: string[];
  tasks?: string[];
}

export interface MatchResult {
  occupation: { uri: string; label: string };
  score: number;
  breakdown: {
    skills: { score: number; matchedCount: number; totalCount: number };
    knowledge: { score: number; matchedCount: number; totalCount: number };
    tasks: { score: number; matchedCount: number; totalCount: number };
  };
  gaps: {
    skills: Array<{ label: string; relevance: string; idf?: number }>;
    knowledge: Array<{ label: string; relevance: string }>;
    tasks: Array<{ label: string; relevance: string }>;
  };
}

export async function matchProfile(
  profile: MatchProfile,
  options?: { limit?: number; minScore?: number }
): Promise<{ success: boolean; matches: MatchResult[]; meta: any }> {
  const response = await fetch('/api/match-profile?' + new URLSearchParams({
    limit: String(options?.limit || 20),
    minScore: String(options?.minScore || 0.3),
  }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  return response.json();
}
```

### 1.4 Integratie met bestaande code

De matching router moet geïntegreerd worden in `server.js`:

```javascript
// In server.js toevoegen:
import matchingRouter from './routes/matching-router.mjs';

// Na andere routes:
app.use('/api', matchingRouter);

// Bij server start:
import { preloadCache } from './routes/profile-matching-api.mjs';
preloadCache().catch(err => console.warn('Cache preload failed:', err));
```

---

## Fase 2: Profiel via Werkverleden/Opleiding

### 2.1 Concept

In plaats van handmatig vaardigheden te selecteren, kan de gebruiker:
1. Een vorig beroep opgeven → systeem haalt bijbehorende skills op
2. Een opleiding opgeven → systeem haalt bijbehorende skills op
3. Meerdere bronnen combineren

### 2.2 User Flow

```
┌──────────────────────────────────────────────────────────────┐
│  🎯 Bouw je Profiel                                     [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Hoe wil je je profiel opbouwen?                            │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ 💼 Werkervaring │  │ 🎓 Opleiding    │  │ ✏️ Handmatig │ │
│  │                 │  │                 │  │              │ │
│  │ Selecteer een   │  │ Selecteer een   │  │ Kies zelf je │ │
│  │ vorig beroep    │  │ opleiding       │  │ vaardigheden │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ "Werkervaring" geselecteerd
┌──────────────────────────────────────────────────────────────┐
│  💼 Voeg Werkervaring Toe                               [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Welk beroep heb je uitgeoefend?                            │
│  ┌────────────────────────────────────────────┐              │
│  │ 🔍 verpleegkundige                         │              │
│  └────────────────────────────────────────────┘              │
│  ▸ Verpleegkundige (algemeen)                                │
│  ▸ Verpleegkundige (GGZ)                                     │
│  ▸ Verpleegkundige (IC)                                      │
│                                                              │
│  [← Terug]                                         [Verder →]│
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ Beroep geselecteerd
┌──────────────────────────────────────────────────────────────┐
│  💼 Bevestig Vaardigheden                               [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Als Verpleegkundige (algemeen) heb je waarschijnlijk       │
│  de volgende vaardigheden ontwikkeld:                        │
│                                                              │
│  Essentieel: (automatisch geselecteerd)                      │
│  ✓ Verzorgen                   ✓ Verplegen                   │
│  ✓ Aandacht en begrip tonen    ✓ Communiceren                │
│                                                              │
│  Belangrijk: (optioneel)                                     │
│  ☐ Documenteren                ✓ Observeren                  │
│  ✓ Samenwerken                 ☐ Plannen                     │
│                                                              │
│  [+ Nog een beroep toevoegen]                                │
│                                                              │
│  [← Terug]                              [🔍 Matchen met dit] │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Backend: Skills ophalen per beroep

We moeten een endpoint toevoegen om skills van een beroep op te halen:

```javascript
// GET /api/occupation/:uri/requirements
router.get('/occupation/:uri/requirements', async (req, res) => {
  const uri = decodeURIComponent(req.params.uri);
  // ... SPARQL query om skills/knowledge/tasks op te halen
});
```

Of we kunnen de bestaande data in de cache gebruiken die al bij matching wordt opgehaald.

### 2.4 Profiel State Management

```typescript
interface UserProfile {
  id: string;
  sources: ProfileSource[];
  skills: ProfileSkill[];
  knowledge: ProfileKnowledge[];
  tasks: ProfileTask[];
  createdAt: Date;
  updatedAt: Date;
}

interface ProfileSource {
  type: 'occupation' | 'education' | 'manual' | 'hollandcode' | 'test';
  uri?: string;
  label: string;
  addedAt: Date;
}

interface ProfileSkill {
  uri: string;
  label: string;
  source: string;  // Verwijzing naar ProfileSource
  relevance: 'essential' | 'important' | 'somewhat';
  confirmed: boolean;  // Door gebruiker bevestigd
}
```

---

## Fase 3: Conversatie-Integratie

### 3.1 Concept

De matcher wordt aangeroepen vanuit de chat wanneer de gebruiker vragen stelt als:
- "Welke banen passen bij mij?"
- "Ik wil van baan wisselen, wat kan ik worden?"
- "Ik ben verpleegkundige, welke andere beroepen kan ik doen?"

### 3.2 Trigger Detectie

De orchestrator krijgt een nieuw domein: `matching`

```sql
-- In competentnl_prompts database
INSERT INTO prompt_domains (domain_key, domain_name, description) 
VALUES ('matching', 'Profiel Matching', 'Vragen over baan matches en carrière mogelijkheden');

INSERT INTO classification_keywords (domain_id, keyword, weight) VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'matching'), 'passen bij mij', 0.95),
((SELECT id FROM prompt_domains WHERE domain_key = 'matching'), 'welke baan', 0.9),
((SELECT id FROM prompt_domains WHERE domain_key = 'matching'), 'carrière', 0.8),
((SELECT id FROM prompt_domains WHERE domain_key = 'matching'), 'overstappen', 0.85),
((SELECT id FROM prompt_domains WHERE domain_key = 'matching'), 'ander beroep', 0.9),
((SELECT id FROM prompt_domains WHERE domain_key = 'matching'), 'wat kan ik worden', 0.95);
```

### 3.3 Chat Flow

```
┌────────────────────────────────────────────────────────────────────┐
│ Gebruiker: Ik ben verpleegkundige en wil iets anders gaan doen.   │
│           Welke beroepen passen bij mij?                           │
├────────────────────────────────────────────────────────────────────┤
│ Assistant: Ik help je graag met het vinden van passende beroepen! │
│                                                                    │
│ Om een goede match te maken, bouw ik eerst een profiel op basis   │
│ van je ervaring als verpleegkundige.                               │
│                                                                    │
│ [Profielbouwer wordt getoond als embedded component]              │
│ ┌────────────────────────────────────────────────────────────┐    │
│ │ 💼 Je profiel (op basis van Verpleegkundige)              │    │
│ │                                                            │    │
│ │ Vaardigheden: Verzorgen, Verplegen, Communiceren, ...     │    │
│ │                                                            │    │
│ │ [✏️ Aanpassen]              [✅ Klopt, ga door met match] │    │
│ └────────────────────────────────────────────────────────────┘    │
├────────────────────────────────────────────────────────────────────┤
│ [Gebruiker klikt "Ga door met match"]                             │
├────────────────────────────────────────────────────────────────────┤
│ Assistant: Op basis van je vaardigheden als verpleegkundige,      │
│ zijn dit de best passende beroepen:                                │
│                                                                    │
│ 1. **Verzorgende** (85% match)                                    │
│    Je hebt al de meeste vaardigheden! Te ontwikkelen: -           │
│                                                                    │
│ 2. **Praktijkondersteuner** (78% match)                           │
│    Te ontwikkelen: Medisch administratie, Triage                  │
│                                                                    │
│ 3. **Fysiotherapeut** (65% match)                                 │
│    Te ontwikkelen: Bewegingsleer, Revalidatietechnieken           │
│                                                                    │
│ Wil je meer weten over een van deze beroepen?                     │
└────────────────────────────────────────────────────────────────────┘
```

### 3.4 Technische Aanpak

```typescript
// In geminiService.ts of generateSparql functie

// Detecteer matching intent
if (classification?.primary?.domainKey === 'matching') {
  // Check of we al een profiel hebben
  const existingProfile = chatHistory.getProfile();
  
  if (!existingProfile) {
    // Probeer beroep/opleiding uit de vraag te halen
    const extractedOccupation = extractOccupationFromQuestion(question);
    
    if (extractedOccupation) {
      // Haal skills op en vraag bevestiging
      return {
        type: 'profile_builder',
        sourceOccupation: extractedOccupation,
        needsConfirmation: true
      };
    } else {
      // Vraag naar achtergrond
      return {
        type: 'clarification',
        response: 'Om goede matches te vinden, moet ik eerst weten wat je achtergrond is. Wat is je huidige of laatste beroep?'
      };
    }
  }
  
  // We hebben een profiel, doe de match
  const results = await matchProfile(existingProfile);
  return formatMatchResults(results);
}
```

---

## Fase 4: Uitbreidingen (Toekomst)

### 4.1 Holland Code (RIASEC) Integratie

De gebruiker kan zijn Holland Code opgeven of een korte test doen. De vaardigheden worden dan gefilterd op basis van de RIASEC letters.

```
Holland Code: R A S
↓
Filter vaardigheden waar hasRIASEC = 'R' OR 'A' OR 'S'
↓  
Bouw profiel met deze vaardigheden
↓
Match tegen beroepen
```

**Benodigde data (al aanwezig in CompetentNL):**
- `cnlo:hasRIASEC` relatie op HumanCapability

### 4.2 Competentie-Test Module

Een interactieve test waarbij de gebruiker vragen beantwoordt over wat hij/zij leuk vindt om te doen. Resultaten worden vertaald naar vaardigheden.

### 4.3 Interview-Extractie

AI-gedreven gesprek dat open vragen stelt:
- "Vertel eens over een project waar je trots op bent"
- "Wat vind je het leukst aan je werk?"

De antwoorden worden geanalyseerd om vaardigheden te identificeren.

### 4.4 Profiel Persistentie

Opslaan van profielen zodat gebruikers later kunnen terugkomen:
- Lokaal in browser (localStorage)
- Of met account in database

---

## Implementatie Prioriteiten

| Prioriteit | Item | Geschatte Tijd |
|------------|------|----------------|
| 🔴 Hoog | Fase 1: Match knop + handmatig profiel | 1-2 dagen |
| 🔴 Hoog | Integratie matching-router in server.js | 30 min |
| 🟡 Middel | Fase 2: Profiel via werkverleden | 2-3 dagen |
| 🟡 Middel | Skills ophalen endpoint | 1 dag |
| 🟢 Later | Fase 3: Conversatie-integratie | 3-5 dagen |
| 🟢 Later | Fase 4: Uitbreidingen | Ongoing |

---

## Volgende Stappen

1. **Nu**: Review dit plan, pas aan waar nodig
2. **Start Fase 1**:
   - Integreer matching-router in server.js
   - Bouw MatchButton component
   - Bouw MatchModal met skill selectie
   - Bouw MatchResults component
3. **Test**: Handmatige matching flow volledig testen
4. **Fase 2**: Profielbouwer met werkverleden/opleiding

---

## Technische Notities

### Cache Warming
De eerste match request duurt ~30-60 seconden (cache opbouwen). Oplossingen:
- `preloadCache()` bij server start (al geïmplementeerd)
- Loading indicator in UI
- Background preload bij app start

### Skill Autocomplete
Voor de skill selectie input hebben we een endpoint nodig dat skills zoekt:
```
GET /api/skills/search?q=program&limit=10
```
Dit kan de bestaande `concept_synonyms` tabel gebruiken.

### State Management
Overweeg React Context of Zustand voor profiel state management, zodat het profiel persistent is tijdens de sessie.
