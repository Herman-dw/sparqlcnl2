# Query Flow: Van Natuurlijke Taal naar SPARQL

Dit document beschrijft het volledige proces van hoe een gebruikersvraag in het Nederlands wordt omgezet naar een SPARQL query en hoe de resultaten worden teruggegeven.

## Inhoudsopgave

1. [Overzicht](#overzicht)
2. [Complete Flow Diagram](#complete-flow-diagram)
3. [Gedetailleerde Stappen](#gedetailleerde-stappen)
4. [Key Components](#key-components)
5. [Database Rollen](#database-rollen)
6. [Caching Mechanismen](#caching-mechanismen)

---

## Overzicht

De applicatie maakt gebruik van een multi-layer architectuur om natuurlijke taal vragen om te zetten naar SPARQL queries:

```
Frontend (React) → Backend (Express) → Gemini AI → SPARQL Validatie → Database Executie
                      ↓
                 Concept Resolver
                 RAG Database
                 Caching Layer
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────┐
│ 1. FRONTEND - ChatInterface.tsx          │
│    Gebruiker voert vraag in              │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. QUESTION PROCESSING - App.tsx (handleSend)              │
│    • Detecteer RIASEC context                              │
│    • Bouw chat history (laatste 6 berichten)               │
│    • Creëer user message                                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. SPARQL GENERATION - geminiService.ts                      │
│    generateSparqlWithDisambiguation()                        │
│                                                               │
│    a) RIASEC Detection                                       │
│    b) Question Classification → /orchestrator/classify       │
│    c) Extract occupation term                                │
│    d) Resolve concept → /concept/resolve                     │
│       ├─ Cache check (1 uur TTL)                            │
│       ├─ Database lookup (occupation_labels)                │
│       └─ Disambiguatie indien nodig                         │
│    e) Genereer SPARQL via Gemini API                        │
│       └─ System instruction met 900+ regels                 │
│    f) Fix SPARQL query (fix prefixes, URIs)                │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─ DISAMBIGUATION? ──→ Vraag gebruiker om te kiezen
             │                       ↓
             │                   Gebruiker selecteert optie
             │                       ↓
             │                   Ga verder bij stap (e)
             │
             ├─ GEEN SPARQL? ───────→ Probeer /generate endpoint
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. SPARQL VALIDATION - sparqlValidator.ts                   │
│    validateSparqlQuery()                                     │
│                                                               │
│    • Check voor INSERT/UPDATE/DELETE (verboden)             │
│    • Check LIMIT aanwezig                                    │
│    • Verifieer prefixes gedefinieerd                        │
│    • Auto-fix: Voeg ontbrekende prefixes, LIMIT toe        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. EXECUTE QUERY - sparqlService.ts                         │
│    executeSparql()                                           │
│                                                               │
│    Via local backend proxy:                                  │
│    POST /proxy/sparql {endpoint, query, key}                │
│       ↓                                                       │
│    server.js /proxy/sparql handler:                          │
│    • Fix ontbrekende prefixes                               │
│    • Fix incorrecte occupation URIs (vanuit DB)            │
│    • POST naar SPARQL endpoint                              │
│    • Return results                                          │
│       ↓                                                       │
│    Process bindings (converteer naar objecten)               │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. SUMMARIZE RESULTS - geminiService.ts                     │
│    summarizeResults()                                        │
│                                                               │
│    • Neem eerste 15 resultaten                              │
│    • Roep Gemini API aan voor Nederlandse samenvatting     │
│    • Return menselijk-vriendelijke tekst                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. DISPLAY RESULTS - App.tsx (UI Update)                    │
│                                                               │
│    • Voeg assistant message toe met samenvatting            │
│    • Toon resultaten tabel/lijst                            │
│    • Toon SPARQL query in uitklapbare sectie                │
│    • Bied feedback knoppen aan (👍 👎 ⚠️)                   │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. PERSIST & FEEDBACK                                        │
│                                                               │
│    • Sla message op in database (persistMessage)            │
│    • Track feedback (like/dislike)                           │
│    • Update RAG feedback scores (ragService)                │
│    • Log query voor analytics                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Gedetailleerde Stappen

### Stap 1: Frontend - Gebruiker Voert Vraag In

**Component:** `components/ChatInterface.tsx:1-350`

```typescript
// Input element
<input
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
/>

// Event handler
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!input.trim()) return;

  // Verstuur naar parent component
  onSend(input);
  setInput('');
};
```

**Ook in:** `App.tsx:422-600`
- `handleSend()` - hoofdmechanisme voor het verwerken van vragen
- Maakt chat history aan voor context
- Detecteert RIASEC-gerelateerde vragen via `detectRiasecContext()`

---

### Stap 2: Vraag Versturen naar Backend

Er zijn twee hoofdroutes voor het versturen van vragen:

#### Route 1: Directe Generatie
```typescript
// App.tsx:347-355
const generateRes = await fetch(`${localBackendUrl}/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question,
    chatHistory: getChatHistory(),
    domain: 'taxonomy'
  })
});
```

#### Route 2: Gemini Service (frontend-side)
```typescript
// App.tsx:450-456
const result = await generateSparqlWithDisambiguation(
  text,
  {
    graphs: selectedGraphs,
    type: resourceType,
    status: 'Current'
  },
  chatHistory,
  pendingDisambiguation || undefined,
  sessionId
);
```

---

### Stap 3: Services & Mechanismen voor NL → SPARQL

#### A. Concept Resolver

**Bestand:** `server.js:500-750`

**Endpoint:** `POST /concept/resolve`

**Parameters:**
- `searchTerm`: De zoekterm (bijv. "kapper", "verpleegkundige")
- `conceptType`: Type concept (`occupation`, `education`, `capability`, `knowledge`)

**Proces:**

1. **Cache Check** (server.js:56-110)
   - In-memory cache met TTL van 1 uur
   - Cache key: `{searchTerm}:{conceptType}`
   - Auto-cleanup elke 10 minuten

2. **Database Query** - MariaDB RAG database
   ```sql
   SELECT occupation_uri, pref_label, label, match_type, confidence
   FROM occupation_labels
   WHERE LOWER(label) LIKE ? OR LOWER(pref_label) LIKE ?
   ORDER BY match_confidence DESC, LENGTH(label)
   LIMIT 10
   ```

3. **Output:**
   - **Exacte Match (1 resultaat):** Direct geresolved → `found: true`
   - **Meerdere Matches:** Disambiguatie nodig → `needsDisambiguation: true`
   - **Geen Match:** Fallback naar synthesische matches

**Specifiek Bestand:** `services/conceptResolver.ts:1-250`

Ondersteunt deze concept types:
- `occupation` (beroepen)
- `education` (opleidingen)
- `capability` (vaardigheden)
- `knowledge` (kennisgebieden)
- `task` (taken)
- `workingCondition` (arbeidsomstandigheden)

---

#### B. Gemini Service

**Bestand:** `services/geminiService.ts`

**Hoofdfunctie:** `generateSparqlWithDisambiguation():299-454`

**Stappen:**

1. **RIASEC Detectie** (line 309)
   ```typescript
   const riasecDetected = isRiasecQuestionText(userQuery);
   ```
   - Gebruikt centrale RIASEC detector uit `utils/riasec-detector.ts`

2. **Vraag Classificatie** (line 379)
   ```typescript
   const classification = await classifyQuestion(userQuery);
   const domain = classification?.primary?.domainKey || 'occupation';
   ```
   - Roept `POST /orchestrator/classify` aan

3. **Beroepterm Extractie** (line 388)
   ```typescript
   const occupationTerm = extractOccupationTerm(userQuery);
   ```
   - Gebruikt regex patterns (lines 203-214)

4. **Concept Resolutie** (line 391)
   ```typescript
   const conceptResult = await resolveConcept(occupationTerm, 'occupation');
   ```

5. **Disambiguatie Check** (lines 416-434)
   ```typescript
   if (conceptResult?.needsDisambiguation && conceptResult.matches?.length > 1) {
     return {
       sparql: null,
       response: disambiguationQuestion,
       needsDisambiguation: true,
       disambiguationData: {
         originalQuestion: userQuery,
         matches: conceptResult.matches,
         searchTerm: occupationTerm,
         conceptType: 'occupation'
       }
     };
   }
   ```

6. **SPARQL Generatie** (lines 475-984)
   ```typescript
   async function generateSparqlInternal(...)
   ```

   **Substappen:**
   - Controleer resolved concepts → bouw URI mapping
   - Roep Gemini API aan met system instruction + user query
   - Fix gegenereerde query: `fixSparqlQuery()`
   - Fix occupation URIs: `fixOccupationUri()`

**Gemini API Call:**
```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: chatContext + queryWithUri,
  config: {
    systemInstruction,  // 900+ regels met instructies en voorbeelden
    temperature: 0.1,   // Deterministisch
  }
});
```

**System Instruction** (lines 820-933):
- 900+ regels met gedetailleerde instructies
- CompetentNL schema definitie
- SPARQL voorbeelden
- Best practices
- Common pitfalls en hoe ze te vermijden

---

#### C. Backend Generate Endpoint

**Bestand:** `server.js:1361-1700`

**Endpoint:** `POST /generate`

Dit endpoint bevat ingebouwde scenario handlers voor veelvoorkomende vragen:

**Scenario 2: MBO Kwalificaties** (lines 1406-1445)
- Detectie: `q.includes('mbo') && q.includes('kwalificatie')`
- Query: COUNT-based + List variant

**Scenario 3: Context-Aware Follow-up** (lines 1391-1404)
- Detectie: `hasPriorMessages && q.includes('hoeveel')`
- Gebruikt chat history voor context

**Scenario 5: Opleidingsvragen** (lines 1447-1478)
- Detectie: `q.includes('leer') && (q.includes('kennisgebied') || q.includes('vaardigheid'))`

**Scenario 6: RIASEC/Holland-code** (lines 1480-1540)
- Detectie: `q.includes('riasec') || q.includes('hollandcode')`
- Extraheert RIASEC letter (R/I/A/S/E/C)

---

### Stap 4: SPARQL Validatie

**Bestand:** `services/sparqlValidator.ts:1-220`

**Functie:** `validateSparqlQuery():56-130`

**Validatie Checks:**

1. Check voor INSERT/UPDATE/DELETE (alleen lees-queries toegestaan)
2. Check voor LIMIT bij SELECT queries
3. Check voor WHERE clause bij SELECT
4. Check gebruikte vs gedefinieerde prefixes
5. Check gebalanceerde haakjes en quotes

**Auto-Fix Functie:** `fixSparqlQuery():135-177`

```typescript
// Verwijder markdown code blocks
query = query.replace(/```sparql\n?/g, '').replace(/```\n?/g, '');

// Verwijder FROM clauses (niet ondersteund door API)
query = query.replace(/FROM\s+<[^>]+>/gi, '');

// Voeg ontbrekende prefixes toe
if (!query.includes('PREFIX cnlo:')) {
  query = 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>\n' + query;
}

// Voeg LIMIT toe indien nodig
if (query.includes('SELECT') && !query.includes('LIMIT')) {
  query += '\nLIMIT 100';
}
```

**Bekende Prefixes** (server.js:325-335):
```sparql
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX esco: <http://data.europa.eu/esco/model#>
```

---

### Stap 5: Query Uitvoering tegen Database

**Bestand:** `services/sparqlService.ts:1-114`

**Functie:** `executeSparql():6-85`

**Flow:**

1. **Via Lokale Backend Proxy** (prioriteit)
   ```typescript
   // Line 16-40
   const response = await fetch('http://localhost:3001/proxy/sparql', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ endpoint, query, key })
   });
   ```

2. **Backend Proxy Handler** (server.js:442-497)
   ```javascript
   app.post('/proxy/sparql', async (req, res) => {
     let { endpoint, query, key } = req.body;

     // Fix ontbrekende prefixes
     query = fixMissingPrefixes(query);

     // Fix verkeerde occupation URIs
     query = await fixIncorrectOccupationUri(query);

     // Verstuur naar SPARQL endpoint
     const response = await fetch(endpoint, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/sparql-query',
         'Accept': 'application/sparql-results+json',
         'X-API-Key': key
       },
       body: query
     });

     // Return resultaten
     const data = await response.json();
     res.json(data);
   });
   ```

3. **Response Verwerking** (sparqlService.ts:87-97)
   ```typescript
   const processBindings = (data: any) => {
     // ASK queries
     if (data.boolean !== undefined) {
       return [{ result: data.boolean }];
     }

     // SELECT queries
     if (!data.results || !data.results.bindings) {
       return [];
     }

     // Converteer SPARQL JSON format naar objecten
     return data.results.bindings.map(binding => {
       const row: any = {};
       for (const key in binding) {
         row[key] = binding[key].value;
       }
       return row;
     });
   };
   ```

**Mogelijke Proxy Modes:**
- `'local'`: Via localhost:3001 (meest betrouwbaar)
- `'none'`: Direct (CORS problemen)
- `'codetabs'`, `'allorigins'`, `'corsproxy'`: Publieke proxies

---

### Stap 6: Resultaten Samenvatten

**Bestand:** `services/geminiService.ts:990-1032`

**Functie:** `summarizeResults()`

```typescript
const summarizeResults = async (
  question: string,
  results: any[]
): Promise<string> => {
  // Neem sample van max 15 items
  const sample = results.slice(0, 15);

  // Roep Gemini API aan
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      `Vraag: ${question}`,
      `Resultaten: ${JSON.stringify(sample, null, 2)}`,
      `Geef een korte Nederlandse samenvatting van deze resultaten.`
    ],
    config: {
      temperature: 0.3
    }
  });

  return response.text();
};
```

---

### Stap 7: Resultaten Weergeven in Frontend

**Bestand:** `App.tsx:498-630`

```typescript
// 1. Voer SPARQL uit
const results = await executeSparql(result.sparql, ...);

// 2. Vat resultaten samen
const summary = await summarizeResults(question, results);

// 3. Maak assistant bericht
const assistantMsg: Message = {
  id: (Date.now() + 1).toString(),
  role: 'assistant',
  text: `${baseResponse}\n\n${summary}`,
  sparql: result.sparql,
  results,
  timestamp: new Date(),
  status: 'success',
  metadata: {
    domain: result.domain,
    resultCount: results.length
  }
};

// 4. Update UI
setMessages(prev => [...prev, assistantMsg]);

// 5. Opslag in database
await persistMessage(assistantMsg);
```

**UI Componenten:**
- Resultaten tabel/lijst (ChatInterface.tsx)
- SPARQL query in uitklapbare sectie
- Feedback knoppen (👍 👎 ⚠️)
- Excel export optie

---

### Stap 8: Persistentie & Feedback

**Feedback Service:** `services/feedbackService.ts`

```typescript
const saveFeedback = async (
  messageId: string,
  feedback: 'like' | 'dislike' | 'flag',
  comment?: string
) => {
  // Opslaan in localStorage
  const feedbacks = JSON.parse(
    localStorage.getItem('competentnl_feedback') || '[]'
  );

  feedbacks.push({
    messageId,
    feedback,
    comment,
    timestamp: new Date().toISOString()
  });

  localStorage.setItem('competentnl_feedback', JSON.stringify(feedbacks));

  // Verstuur naar backend
  await sendFeedbackToBackend({
    messageId,
    feedback,
    comment
  });

  // Update RAG scores
  await updateRAGFeedbackScore(messageId, feedback);
};
```

---

## Key Components

| Bestand | Rol | Belangrijkste Functies |
|---------|-----|------------------------|
| `services/geminiService.ts` | NL→SPARQL generatie | `generateSparqlWithDisambiguation()`, `generateSparqlInternal()`, `summarizeResults()` |
| `services/sparqlService.ts` | Query executie | `executeSparql()`, response processing |
| `services/sparqlValidator.ts` | Query validatie | `validateSparqlQuery()`, `fixSparqlQuery()` |
| `services/conceptResolver.ts` | Concept matching | `resolveConcept()`, `generateDisambiguationQuestion()` |
| `services/ragService.ts` | Vector search | `findSimilarQuestions()`, `buildRAGContext()` |
| `services/feedbackService.ts` | Feedback logging | `saveFeedback()`, `sendFeedbackToBackend()` |
| `components/ChatInterface.tsx` | Chat UI | `handleSubmit()`, resultaten weergave |
| `App.tsx` | Hoofdapplicatie | `handleSend()`, query execution flow |
| `server.js` | Backend server | `/concept/resolve`, `/generate`, `/proxy/sparql` |
| `schema.ts` | Schema documentatie | Ontologie definitie + prefixes |

---

## Database Rollen

### MariaDB Database Pools

De applicatie maakt gebruik van meerdere database pools voor verschillende doeleinden:

#### 1. competentnl_rag (RAG Pool)

**Tabellen:**

**`occupation_labels`**
```sql
CREATE TABLE occupation_labels (
  id INT PRIMARY KEY AUTO_INCREMENT,
  occupation_uri VARCHAR(500),
  pref_label VARCHAR(255),
  label VARCHAR(255),
  match_type ENUM('exact', 'alt', 'hidden', 'synthetic'),
  match_confidence DECIMAL(3,2),
  INDEX idx_label (label),
  INDEX idx_pref_label (pref_label)
);
```

**`education_labels`**, **`capability_labels`**, **`knowledge_labels`**
- Vergelijkbare structuur voor andere concept types

**`question_embeddings`**
```sql
CREATE TABLE question_embeddings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  question TEXT,
  sparql_query TEXT,
  embedding JSON,  -- Vector representatie van de vraag
  category VARCHAR(100),
  feedback_score DECIMAL(3,2),
  usage_count INT,
  success_rate DECIMAL(3,2),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**`query_logs`**
```sql
CREATE TABLE query_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(100),
  question TEXT,
  sparql_query TEXT,
  result_count INT,
  execution_time_ms INT,
  success BOOLEAN,
  error_message TEXT,
  timestamp TIMESTAMP
);
```

---

#### 2. competentnl_prompts (Prompts Pool)

**Tabellen:**

**`orchestrator_config`**
- Bevat configuratie voor vraag classificatie
- Domein detectie rules

**`domain_prompts`**
- Domein-specifieke prompts voor AI
- Templates voor verschillende query types

**`example_queries`**
- Voorbeeldvragen met correcte SPARQL queries
- Gebruikt voor few-shot learning

**`schema_elements`**
- CompetentNL schema documentatie
- Predicaten, classes, properties

---

### Database Queries in de Flow

**Concept Resolution Query:**
```sql
SELECT occupation_uri, pref_label, label, match_type, confidence
FROM occupation_labels
WHERE LOWER(label) LIKE ? OR LOWER(pref_label) LIKE ?
ORDER BY match_confidence DESC, LENGTH(label)
LIMIT 10
```

**RAG Similarity Search:**
```sql
SELECT id, question, sparql_query, embedding, feedback_score
FROM question_embeddings
WHERE category = ?
ORDER BY (feedback_score * 0.3 + usage_count * 0.2 + success_rate * 0.5) DESC
LIMIT 5
```

**Occupation URI Correction:**
```sql
SELECT occupation_uri, pref_label
FROM occupation_labels
WHERE label = ?
  AND match_type = 'exact'
LIMIT 1
```

---

## Caching Mechanismen

### 1. In-Memory Concept Cache

**Locatie:** `server.js:54-129`

```javascript
const conceptCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 uur

// Cache entry structuur
{
  key: "{searchTerm}:{conceptType}",
  value: {
    data: {...},
    timestamp: Date.now()
  }
}

// Auto-cleanup elke 10 minuten
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of conceptCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      conceptCache.delete(key);
    }
  }
}, 10 * 60 * 1000);
```

**Cache strategie:**
- Max 1000 entries
- TTL: 60 minuten
- LRU eviction bij limiet

---

### 2. RAG Vector Database Cache

**Locatie:** `services/ragService.ts:79-137`

```typescript
// Laadt alle question embeddings in geheugen
const embeddings = await loadQuestionEmbeddings();

// Berekent cosine similarity
const similarities = embeddings.map(emb => ({
  ...emb,
  similarity: cosineSimilarity(queryVector, emb.embedding)
}));

// Retourneert top-K vergelijkbare vragen
const topK = similarities
  .sort((a, b) => {
    // Combineer similarity met feedback score
    const scoreA = a.similarity * 0.7 + a.feedback_score * 0.3;
    const scoreB = b.similarity * 0.7 + b.feedback_score * 0.3;
    return scoreB - scoreA;
  })
  .slice(0, 5);
```

---

### 3. Conversation History Cache

**Locatie:** `App.tsx:277-293`

```typescript
// Opgeslagen in lokale backend database
const persistMessage = async (message: Message) => {
  await fetch('http://localhost:3001/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      role: message.role,
      text: message.text,
      sparql: message.sparql,
      results: message.results,
      timestamp: message.timestamp
    })
  });
};

// Ophalen voor context
const getChatHistory = () => {
  return messages.slice(-6); // Laatste 6 berichten
};
```

---

## Gemini AI Rol

**Model:** `gemini-2.0-flash`

### Taak 1: SPARQL Generatie

**Input:**
- Natuurlijke taal vraag
- Chat history (laatste 6 berichten)
- System instruction (900+ regels)
- Resolved concepts met URIs

**Output:**
- SPARQL query

**Configuratie:**
```typescript
{
  model: 'gemini-2.0-flash',
  temperature: 0.1,  // Zeer deterministisch
  systemInstruction: `
    Je bent een SPARQL query generator voor CompetentNL.

    SCHEMA:
    - cnlo:Occupation (3263 beroepen)
    - cnlo:HumanCapability (137 vaardigheden)
    - cnlo:KnowledgeArea (361 kennisgebieden)
    ...

    EXAMPLES:
    Q: Welke vaardigheden heeft een kapper?
    A: SELECT ?capability ?label WHERE {
         <https://data.esco.eu.../kapper> cnlo:requiresHATEssential ?capability .
         ?capability skos:prefLabel ?label .
       }

    RULES:
    - Gebruik altijd LIMIT
    - Geen FROM clauses
    - Alleen SELECT en ASK queries
    ...
  `
}
```

---

### Taak 2: Resultaten Samenvatting

**Input:**
- Oorspronkelijke vraag
- Data sample (max 15 items)

**Output:**
- Nederlandse samenvatting

**Configuratie:**
```typescript
{
  model: 'gemini-2.0-flash',
  temperature: 0.3,  // Iets meer creativiteit
  prompt: `
    Vraag: ${question}
    Resultaten: ${JSON.stringify(sample)}

    Geef een korte, informatieve Nederlandse samenvatting
    van deze resultaten. Wees specifiek en concreet.
  `
}
```

---

## CompetentNL Schema Overzicht

### Hoofdconcepten

**cnlo:Occupation** (3263 items)
```sparql
?occupation a cnlo:Occupation ;
  skos:prefLabel ?label ;
  skos:definition ?description ;
  cnlo:requiresHATEssential ?capability ;
  cnlo:requiresHATImportant ?capability ;
  cnluwv:isCharacterizedByOccupationTask_Essential ?task .
```

**cnlo:HumanCapability** (137 items)
```sparql
?capability a cnlo:HumanCapability ;
  skos:prefLabel ?label ;
  skos:notation ?code ;
  cnlo:hasRIASEC ?riasecLetter ;
  skos:broader ?parent ;
  skos:narrower ?child .
```

**cnlo:KnowledgeArea** (361 items)
```sparql
?knowledge a cnlo:KnowledgeArea ;
  skos:prefLabel ?label ;
  skos:definition ?description .
```

**cnlo:EducationalNorm** (1856 items)
```sparql
?education a cnlo:EducationalNorm ;
  skos:prefLabel ?label ;
  cnlo:prescribesHATEssential ?capability ;
  cnlo:prescribesKnowledge ?knowledge .
```

**cnluwv:OccupationTask** (4613 items)
```sparql
?task a cnluwv:OccupationTask ;
  skos:prefLabel ?label ;
  skos:definition ?description .
```

### Belangrijke Predicaten

**Vaardigheden relaties:**
- `cnlo:requiresHATEssential` - Essentiële vaardigheden
- `cnlo:requiresHATImportant` - Belangrijke vaardigheden
- `cnlo:requiresHATSomewhat` - Enigszins vereiste vaardigheden

**Taken relaties:**
- `cnluwv:isCharacterizedByOccupationTask_Essential`
- `cnluwv:isCharacterizedByOccupationTask_Important`
- `cnluwv:isCharacterizedByOccupationTask_Somewhat`

**RIASEC classificatie:**
- `cnlo:hasRIASEC` - RIASEC letter (R/I/A/S/E/C)

**Kennisgebieden:**
- `cnlo:requiresKnowledge` - Vereiste kennisgebieden

---

## Foutafhandeling & Fallbacks

### 1. Concept Niet Gevonden

```typescript
if (!conceptResult.found && !conceptResult.needsDisambiguation) {
  // Fallback: gebruik originele term in query
  const syntheticUri = `https://data.esco.eu/concept/${occupationTerm}`;

  // Of: vraag gebruiker om herformulering
  return {
    sparql: null,
    response: `Ik kon geen exacte match vinden voor "${occupationTerm}".
               Kunt u de vraag anders formuleren?`
  };
}
```

---

### 2. SPARQL Generatie Mislukt

```typescript
try {
  const result = await generateSparqlWithDisambiguation(...);
  if (!result.sparql) {
    // Fallback naar /generate endpoint
    const backupResult = await fetch('/generate', {...});
  }
} catch (error) {
  // Toon vriendelijke foutmelding
  return {
    error: true,
    message: "Sorry, er ging iets mis bij het genereren van de query."
  };
}
```

---

### 3. Query Validatie Fouten

```typescript
const validation = validateSparqlQuery(query);

if (!validation.isValid) {
  // Probeer auto-fix
  const fixed = fixSparqlQuery(query);
  const revalidation = validateSparqlQuery(fixed);

  if (revalidation.isValid) {
    // Gebruik gefixte query
    return fixed;
  } else {
    // Toon specifieke foutmelding
    throw new Error(validation.errors.join('; '));
  }
}
```

---

### 4. SPARQL Endpoint Fouten

```typescript
try {
  const results = await executeSparql(query);
} catch (error) {
  if (error.message.includes('timeout')) {
    // Timeout: probeer met kleinere LIMIT
    const simplifiedQuery = query.replace(/LIMIT \d+/, 'LIMIT 10');
    return await executeSparql(simplifiedQuery);
  }

  if (error.message.includes('syntax')) {
    // Syntax error: log en vraag herformulering
    logError(error, query);
    return {
      error: true,
      message: "De query bevat een syntaxfout. Probeer de vraag anders te formuleren."
    };
  }
}
```

---

## Performance Optimalisaties

### 1. Batch Concept Resolution

Voor vragen met meerdere concepten:

```typescript
// In plaats van individuele calls
const concept1 = await resolveConcept('kapper', 'occupation');
const concept2 = await resolveConcept('verpleegkundige', 'occupation');

// Gebruik batch endpoint
const concepts = await resolveConceptsBatch([
  { term: 'kapper', type: 'occupation' },
  { term: 'verpleegkundige', type: 'occupation' }
]);
```

---

### 2. Lazy Loading van Resultaten

Voor grote result sets:

```typescript
// Toon eerst 50 resultaten
const initialResults = results.slice(0, 50);

// Bied optie om alles te laden
if (results.length > 50) {
  showLoadMoreButton(results.length);
}
```

---

### 3. Debounced Search

Voor autocomplete:

```typescript
const debouncedSearch = debounce(async (term: string) => {
  const suggestions = await resolveConcept(term, 'occupation');
  showSuggestions(suggestions);
}, 300); // 300ms delay
```

---

## Testing & Debugging

### Query Testing

```typescript
// Test query tegen endpoint
const testQuery = async (sparql: string) => {
  console.log('Testing query:', sparql);

  const validation = validateSparqlQuery(sparql);
  console.log('Validation:', validation);

  if (validation.isValid) {
    const results = await executeSparql(sparql);
    console.log('Results:', results.length, 'items');
    console.log('Sample:', results.slice(0, 3));
  }
};
```

---

### Concept Resolution Testing

```typescript
// Test concept resolver
const testConceptResolver = async (term: string, type: string) => {
  console.log(`Resolving: "${term}" as ${type}`);

  const result = await resolveConcept(term, type);
  console.log('Result:', result);

  if (result.needsDisambiguation) {
    console.log('Disambiguation options:', result.matches);
  }
};
```

---

## Conclusie

Dit complete systeem combineert:

1. **AI-powered NL processing** (Gemini)
2. **Concept disambiguation** (RAG database)
3. **SPARQL validatie en optimalisatie**
4. **Efficiënte caching** (multi-layer)
5. **Robuuste foutafhandeling**
6. **Context-aware vervolgvragen** (chat history)

De architectuur is modulair en schaalbaar, met duidelijke scheiding tussen:
- Frontend (React UI)
- Backend (Express API)
- AI Services (Gemini)
- Database (MariaDB + SPARQL endpoint)

Dit maakt het systeem gemakkelijk te onderhouden en uit te breiden met nieuwe functionaliteit.
