# RIASEC naar Vaardigheden naar Matching - Implementatie

## Overzicht

Deze implementatie voegt een nieuwe flow toe waarbij gebruikers na de RIASEC test vaardigheden kunnen selecteren op basis van hun Holland-code resultaten, en deze vervolgens kunnen gebruiken voor beroepen matching.

## Nieuwe Flow

1. **RIASEC Test** → Gebruiker voltooit de 24 stellingen
2. **Resultaten** → Gebruiker ziet Holland-code (bijv. "SIA")
3. **"Selecteer vaardigheden"** → Knop verschijnt om door te gaan
4. **RiasecSkillSelector** → Gebruiker selecteert relevante vaardigheden per RIASEC letter
5. **MatchModal** → Pre-gevuld met geselecteerde vaardigheden, klaar voor matching

## Bestanden

### Nieuwe bestanden (kopieer naar je project):

```
services/riasecService.ts      # API service voor RIASEC capabilities
components/RiasecSkillSelector.tsx  # Component voor vaardighedenselectie
```

### Aangepaste bestanden:

```
server.js          # Nieuwe endpoints: /api/riasec/capabilities/:letter etc.
App.tsx            # Flow integratie + state management
RiasecTest.tsx     # Nieuwe onResultComplete callback + doorgaan knop
MatchModal.tsx     # Nieuwe initialSkills prop
```

## Backend API Endpoints

### GET /api/riasec/capabilities/:letter
Haal vaardigheden op voor een RIASEC letter (R, I, A, S, E, of C).

**Response:**
```json
{
  "success": true,
  "letter": "S",
  "name": "Social",
  "dutch": "Sociaal",
  "description": "Sociale vaardigheden voor samenwerken en helpen",
  "capabilities": [
    { "uri": "https://...", "label": "Coachen" },
    { "uri": "https://...", "label": "Samenwerken" }
  ],
  "totalCount": 45
}
```

### POST /api/riasec/capabilities/batch
Haal vaardigheden op voor meerdere letters tegelijk.

**Request:**
```json
{ "letters": ["S", "I", "A"] }
```

### GET /api/riasec/info
Haal informatie op over alle RIASEC letters.

## Installatie

1. **Backend:**
   - Vervang `server.js` met de nieuwe versie
   - Herstart de server

2. **Frontend:**
   - Kopieer `riasecService.ts` naar `src/services/`
   - Kopieer `RiasecSkillSelector.tsx` naar `src/components/`
   - Vervang `App.tsx`, `RiasecTest.tsx`, en `MatchModal.tsx`
   - Herbouw de frontend

## Test de flow

1. Ga naar de RIASEC-zelftest
2. Vul alle 24 stellingen in
3. Klik op "Bereken mijn RIASEC-code"
4. Klik op "Selecteer vaardigheden op basis van je profiel"
5. Selecteer vaardigheden in de tabs (S, I, A voor bijv. code "SIA")
6. Klik op "Match met beroepen"
7. De MatchModal opent met je geselecteerde vaardigheden pre-gevuld

## Technische details

- De vaardigheden worden opgehaald via SPARQL met `cnlo:hasRIASEC` predicaat
- Caching is ingebouwd in de backend voor snelle responses
- De flow state wordt beheerd in App.tsx met `riasecResult` en `riasecSelectedCapabilities`
