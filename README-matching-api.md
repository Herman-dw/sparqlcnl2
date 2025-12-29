# Profile Matching API v1.1.0

API voor het matchen van een persoonlijk profiel (vaardigheden, kennisgebieden, taken) tegen beroepen in de CompetentNL knowledge graph.

## Overzicht

Deze API implementeert het matching algoritme uit `voorstel-matching-algoritme.md`:

- **Gewogen scoring** met IDF (Inverse Document Frequency) voor vaardigheden
- **Asymmetrische matching** - berekent hoeveel van wat het beroep vraagt, het profiel afdekt
- **Gap-analyse** - identificeert welke vaardigheden/kennis nog ontbreken
- **Caching** - beroepsvereisten worden gecached voor snelle matching (v1.1.0)

### Belangrijke wijziging v1.1.0

De SPARQL endpoint (`sparql.competentnl.nl`) ondersteunt geen complexe queries met meerdere UNIONs. Daarom:
- Queries zijn opgesplitst in simpele queries per relevantie niveau
- Resultaten worden lokaal gecached (1 uur TTL)
- **Eerste request duurt ~30-60 seconden** (cache opbouwen)
- Daarna zijn requests zeer snel (<100ms)

### Score Formule

```
MATCH_SCORE = (α × SKILL_SCORE) + (β × KNOWLEDGE_SCORE) + (γ × TASK_SCORE)

Waarbij:
- α = 0.50 (vaardigheden - hoofdindicator)
- β = 0.30 (kennisgebieden - domeinspecifiek)
- γ = 0.20 (taken - concrete werkzaamheden)
```

### Relevantie Gewichten

| Niveau | Multiplicator |
|--------|---------------|
| Essential | 1.0 |
| Important | 0.4 |
| Somewhat | 0.2 |

## Bestanden

| Bestand | Beschrijving |
|---------|--------------|
| `profile-matching-api.mjs` | Core matching logica (standalone module) |
| `matching-router.mjs` | Express router voor API endpoints |
| `test-matching-api.mjs` | Test script met voorbeeldprofielen |

## Installatie

1. **Zorg dat de database is opgezet:**
   ```powershell
   node database/sync-all-concepts.mjs
   ```
   Dit vult ook de `skill_idf_weights` tabel.

2. **Installeer dependencies:**
   ```powershell
   npm install mysql2 express dotenv
   ```

## Gebruik als Standalone Module

```javascript
import { matchProfile } from './profile-matching-api.mjs';

const profile = {
  skills: ['Verzorgen', 'Verplegen', 'Communiceren'],
  knowledge: ['Gezondheidszorg'],
  tasks: []
};

const result = await matchProfile(profile, {
  limit: 10,
  minScore: 0.1,
  includeGaps: true
});

console.log(result.matches);
```

## Gebruik als Express Route

```javascript
import express from 'express';
import matchingRouter from './matching-router.mjs';
import { preloadCache } from './profile-matching-api.mjs';

const app = express();
app.use(express.json());
app.use('/api', matchingRouter);

// Preload cache bij server start (aanbevolen!)
preloadCache().then(() => {
  app.listen(3001, () => {
    console.log('Server running on port 3001');
  });
});
```

## API Endpoints

### POST /api/match-profile

Match een profiel tegen beroepen.

**Request:**
```json
{
  "skills": ["Verzorgen", "Verplegen", "Communiceren"],
  "knowledge": ["Gezondheidszorg"],
  "tasks": []
}
```

**Query Parameters:**
| Parameter | Default | Beschrijving |
|-----------|---------|--------------|
| `limit` | 50 | Maximum aantal resultaten (max: 100) |
| `minScore` | 0.1 | Minimum score (0-1) |
| `includeGaps` | true | Inclusief gap-analyse |
| `includeMatched` | true | Inclusief gematchte items |

**Response:**
```json
{
  "success": true,
  "matches": [
    {
      "occupation": {
        "uri": "https://linkeddata.competentnl.nl/uwv/id/occupation/...",
        "label": "Verpleegkundige"
      },
      "score": 0.85,
      "breakdown": {
        "skills": {
          "score": 0.82,
          "weight": 0.5,
          "matchedCount": 3,
          "totalCount": 5
        },
        "knowledge": {
          "score": 1.0,
          "weight": 0.3,
          "matchedCount": 1,
          "totalCount": 1
        },
        "tasks": {
          "score": 0.6,
          "weight": 0.2,
          "matchedCount": 2,
          "totalCount": 4
        }
      },
      "gaps": {
        "skills": [
          { "label": "Revalidatietechnieken", "relevance": "essential", "idf": 1.8 }
        ],
        "knowledge": [],
        "tasks": []
      },
      "matched": {
        "skills": [
          { "label": "Verzorgen", "relevance": "essential" },
          { "label": "Communiceren", "relevance": "important" }
        ],
        "knowledge": [...],
        "tasks": [...]
      }
    }
  ],
  "meta": {
    "executionTime": 234,
    "totalCandidates": 150,
    "returnedMatches": 50,
    "resolvedProfile": {
      "skills": [
        { "input": "Verzorgen", "resolved": "Verzorgen", "uri": "https://..." }
      ]
    },
    "weights": {
      "skills": 0.5,
      "knowledge": 0.3,
      "tasks": 0.2
    }
  }
}
```

### GET /api/match-profile/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-29T10:30:00.000Z",
  "checks": {
    "database": { "status": "ok", "idfWeightsCount": 112 },
    "sparql": { "status": "ok", "statusCode": 200 }
  }
}
```

### GET /api/idf-weights

Bekijk IDF gewichten (voor debugging).

**Query Parameters:**
| Parameter | Beschrijving |
|-----------|--------------|
| `category` | Filter op categorie (DENKEN, DOEN, etc.) |
| `minIdf` | Minimum IDF waarde |
| `limit` | Aantal resultaten (max: 200) |
| `sortBy` | `asc` of `desc` |

### GET /api/idf-weights/categories

Bekijk statistieken per skill categorie.

### POST /api/match-profile/preload

Preload de cache (voor server warming).

**Response:**
```json
{
  "success": true,
  "message": "Cache preloaded successfully",
  "duration": 45000
}
```

### DELETE /api/match-profile/cache

Wis de cache (forceer refresh bij volgende request).

## Testen

```powershell
# Run alle test profielen
# LET OP: Eerste run duurt ~30-60 sec (cache opbouwen)
node test-matching-api.mjs

# Test met custom profiel
node test-matching-api.mjs --profile="Programmeren,Analyseren,Samenwerken"
```

## Voorbeeld Output

```
📋 Zorgprofiel (Verpleegkundige)
─────────────────────────────────────────────────────────────────────

   Input:
   • Skills: Verzorgen, Verplegen, Aandacht en begrip tonen, Communiceren
   • Knowledge: Gezondheidszorg

   ✅ 5 matches gevonden (234ms)

   Top 5 matches:

   1. Verpleegkundige
      Score: [████████████████░░░░] 82.5%
      Skills:    85% (4/5 matched) × 0.5 weight
      Knowledge: 100% (1/1 matched) × 0.3 weight
      Tasks:     50% (2/4 matched) × 0.2 weight
      Gaps: Revalidatietechnieken (IDF: 1.82)
      Matched: Verzorgen, Verplegen, Aandacht en begrip tonen

   2. Verzorgende
      Score: [███████████████░░░░░] 75.0%
      ...
```

## Integratie met Frontend

De API retourneert genoeg informatie voor een rijke UI:

1. **Match cards** met score visualisatie
2. **Breakdown charts** per dimensie (skills/knowledge/tasks)
3. **Gap analysis** voor ontwikkeladvies
4. **Matched items** voor bevestiging

### Voorbeeld React Component

```jsx
function MatchCard({ match }) {
  return (
    <div className="match-card">
      <h3>{match.occupation.label}</h3>
      <ScoreBar score={match.score} />
      
      <div className="breakdown">
        <DimensionBar 
          label="Skills" 
          score={match.breakdown.skills.score}
          matched={match.breakdown.skills.matchedCount}
          total={match.breakdown.skills.totalCount}
        />
        {/* ... knowledge, tasks */}
      </div>
      
      {match.gaps?.skills?.length > 0 && (
        <div className="gaps">
          <h4>Te ontwikkelen:</h4>
          <ul>
            {match.gaps.skills.map(gap => (
              <li key={gap.label}>{gap.label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Volgende Stappen

- [ ] Frontend integratie met profiel-builder UI
- [ ] Caching van veelgevraagde beroepsvereisten
- [ ] Knowledge IDF gewichten toevoegen
- [ ] Task matching verbeteren met fuzzy matching
- [ ] Feedback loop voor score calibratie
