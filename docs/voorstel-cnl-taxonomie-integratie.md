# Voorstel: CNL Taxonomie Integratie voor CV Wizard

**Versie**: 1.0
**Datum**: 2026-02-03
**Status**: Ontwerp

---

## Samenvatting

Dit document beschrijft het technische en functionele ontwerp voor het automatisch classificeren van functies, opleidingen en skills uit CV's naar de CompetentNL (CNL) taxonomie. De classificatie wordt geïntegreerd als **Stap 6** in de bestaande CV Wizard pipeline.

---

## 1. Huidige Situatie

### 1.1 CV Wizard Pipeline (Stappen 1-5)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Stap 1: Tekst Extractie     → PDF/Word naar raw text                │
│ Stap 2: PII Detectie        → GLiNER identificeert persoonlijke data│
│ Stap 3: Anonimisering       → Vervang PII met placeholders          │
│ Stap 4: Structuur Parsing   → LLM parseert experience/education/skills│
│ Stap 5: Privacy & Werkgevers → Generaliseer werkgevers              │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Geparseerde CV Data (uit Stap 4)

Na stap 4 hebben we gestructureerde data:

```typescript
// Experience items
{
  jobTitle: "Senior Software Developer",
  organization: "Bedrijf in IT-sector",
  startDate: "2019",
  endDate: "2023",
  description: "...",
  skills: ["Python", "React", "PostgreSQL"]
}

// Education items
{
  degree: "Bachelor Informatica",
  institution: "Hogeschool",
  year: "2018",
  fieldOfStudy: "Computer Science"
}

// Skills (los genoemde vaardigheden)
{
  skillName: "Projectmanagement",
  skillLevel: "Senior"
}
```

### 1.3 Beschikbare CNL Taxonomie Concepten

| Concept Type | Aantal Items | Omschrijving |
|-------------|-------------|--------------|
| **Occupations** | 3.263 | Beroepen/functies |
| **HumanCapabilities** | 137 | Vaardigheden/competenties |
| **KnowledgeAreas** | 361 | Kennisgebieden |
| **EducationalNorms** | 1.856 | Opleidingen/kwalificaties |
| **OccupationTasks** | 4.613 | Beroepstaken |
| **WorkingConditions** | ~200 | Werkomstandigheden |

---

## 2. Voorgestelde Oplossing: Stap 6 - CNL Classificatie

### 2.1 Overzicht

```
┌─────────────────────────────────────────────────────────────────────┐
│ STAP 6: CNL TAXONOMIE CLASSIFICATIE                                 │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │  Functies   │    │ Opleidingen │    │   Skills    │             │
│  │ (job_title) │    │  (degree)   │    │(skill_name) │             │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘             │
│         │                   │                   │                    │
│         ▼                   ▼                   ▼                    │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │           MULTI-STRATEGY CLASSIFICATION ENGINE           │        │
│  │  1. Exact Match (lokale DB)                              │        │
│  │  2. Fuzzy Match (Levenshtein + n-grams)                  │        │
│  │  3. Semantic Match (embeddings)                          │        │
│  │  4. LLM Fallback (voor ambigue gevallen)                 │        │
│  └─────────────────────────────────────────────────────────┘        │
│         │                   │                   │                    │
│         ▼                   ▼                   ▼                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │    CNL      │    │    CNL      │    │    CNL      │             │
│  │ Occupation  │    │Educational  │    │HumanCapab.  │             │
│  │    URI      │    │  Norm URI   │    │    URI      │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Classificatie Mapping

| CV Item | CNL Concept Type | Database Tabel | Voorbeeld |
|---------|-----------------|----------------|-----------|
| `jobTitle` | `cnlo:Occupation` | `occupation_labels` | "Loodgieter" → `cnl:occupation/123` |
| `degree` | `cnlo:EducationalNorm` | `education_labels` | "MBO Installatietechniek" → `cnl:education/456` |
| `skillName` | `cnlo:HumanCapability` | `capability_labels` | "Samenwerken" → `cnl:capability/789` |

---

## 3. Technisch Ontwerp

### 3.1 Database Schema Uitbreiding

De bestaande `cv_extractions` tabel heeft al velden voor classificatie:

```sql
-- Bestaande velden in cv_extractions
matched_cnl_uri VARCHAR(500),           -- CNL URI van de match
matched_cnl_label VARCHAR(255),         -- Label van de gematchte CNL concept
confidence_score DECIMAL(3,2),          -- 0.00-1.00
classification_method ENUM('rules','local_db','llm','manual','semantic'),
alternative_matches JSON,               -- Alternatieve matches voor disambiguatie
```

### 3.2 Nieuwe Classification Service

**Bestand**: `services/cnlClassificationService.ts`

```typescript
/**
 * CNL Classification Service
 * Classificeert CV items naar CompetentNL taxonomie
 */

import { ConceptType, ConceptMatch, CONCEPT_CONFIGS } from './conceptResolver';
import { normalizeText } from './conceptResolver';

export interface ClassificationResult {
  found: boolean;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'semantic' | 'llm' | 'manual';
  match?: {
    uri: string;
    prefLabel: string;
    matchedLabel: string;
    conceptType: ConceptType;
  };
  alternatives?: ConceptMatch[];
  needsReview: boolean;
}

export interface CVClassificationRequest {
  cvId: number;
  items: {
    extractionId: number;
    sectionType: 'experience' | 'education' | 'skill';
    value: string;              // jobTitle, degree, of skillName
    context?: string;           // Extra context (description, organization)
  }[];
}

export interface CVClassificationResponse {
  cvId: number;
  classifications: {
    extractionId: number;
    result: ClassificationResult;
  }[];
  summary: {
    total: number;
    classified: number;
    needsReview: number;
    byMethod: Record<string, number>;
  };
  processingTimeMs: number;
}

export class CNLClassificationService {
  private db: Pool;

  constructor(database: Pool) {
    this.db = database;
  }

  /**
   * Classificeer alle items van een CV
   */
  async classifyCV(cvId: number): Promise<CVClassificationResponse> {
    const startTime = Date.now();

    // 1. Haal alle extracties op
    const extractions = await this.getUnclassifiedExtractions(cvId);

    // 2. Classificeer elk item
    const classifications = [];
    for (const extraction of extractions) {
      const result = await this.classifyItem(extraction);
      classifications.push({
        extractionId: extraction.id,
        result
      });

      // 3. Update database
      await this.storeClassification(extraction.id, result);
    }

    // 4. Bereken summary
    const summary = this.calculateSummary(classifications);

    return {
      cvId,
      classifications,
      summary,
      processingTimeMs: Date.now() - startTime
    };
  }

  /**
   * Classificeer een enkel item met multi-strategy approach
   */
  async classifyItem(item: {
    sectionType: 'experience' | 'education' | 'skill';
    value: string;
    context?: string;
  }): Promise<ClassificationResult> {

    const conceptType = this.mapSectionToConceptType(item.sectionType);
    const normalizedValue = normalizeText(item.value);

    // Strategy 1: Exact match in lokale database
    const exactMatch = await this.tryExactMatch(normalizedValue, conceptType);
    if (exactMatch.found && exactMatch.confidence >= 0.95) {
      return exactMatch;
    }

    // Strategy 2: Fuzzy match
    const fuzzyMatch = await this.tryFuzzyMatch(normalizedValue, conceptType);
    if (fuzzyMatch.found && fuzzyMatch.confidence >= 0.85) {
      return fuzzyMatch;
    }

    // Strategy 3: Semantic match (embeddings)
    const semanticMatch = await this.trySemanticMatch(
      item.value,
      item.context,
      conceptType
    );
    if (semanticMatch.found && semanticMatch.confidence >= 0.75) {
      return semanticMatch;
    }

    // Strategy 4: LLM fallback voor moeilijke gevallen
    const llmMatch = await this.tryLLMMatch(item.value, item.context, conceptType);
    if (llmMatch.found) {
      return llmMatch;
    }

    // Geen match gevonden - markeer voor handmatige review
    return {
      found: false,
      confidence: 0,
      method: 'manual',
      needsReview: true,
      alternatives: [
        ...(exactMatch.alternatives || []),
        ...(fuzzyMatch.alternatives || [])
      ].slice(0, 5)
    };
  }

  /**
   * Map CV section type naar CNL concept type
   */
  private mapSectionToConceptType(sectionType: string): ConceptType {
    switch (sectionType) {
      case 'experience': return 'occupation';
      case 'education': return 'education';
      case 'skill': return 'capability';
      default: return 'occupation';
    }
  }

  /**
   * Strategy 1: Exact match in lokale database
   */
  private async tryExactMatch(
    normalizedValue: string,
    conceptType: ConceptType
  ): Promise<ClassificationResult> {
    const config = CONCEPT_CONFIGS[conceptType];

    const [rows] = await this.db.execute(`
      SELECT ${config.uriColumn} as uri, pref_label, label, label_type
      FROM ${config.table}
      WHERE label_normalized = ?
      ORDER BY
        CASE label_type
          WHEN 'prefLabel' THEN 1
          WHEN 'altLabel' THEN 2
          ELSE 3
        END
      LIMIT 1
    `, [normalizedValue]);

    if (rows.length > 0) {
      return {
        found: true,
        confidence: rows[0].label_type === 'prefLabel' ? 1.0 : 0.95,
        method: 'exact',
        match: {
          uri: rows[0].uri,
          prefLabel: rows[0].pref_label,
          matchedLabel: rows[0].label,
          conceptType
        },
        needsReview: false
      };
    }

    return { found: false, confidence: 0, method: 'exact', needsReview: true };
  }

  /**
   * Strategy 2: Fuzzy match met Levenshtein distance
   */
  private async tryFuzzyMatch(
    normalizedValue: string,
    conceptType: ConceptType
  ): Promise<ClassificationResult> {
    const config = CONCEPT_CONFIGS[conceptType];

    // Gebruik database fuzzy matching (LIKE + Levenshtein waar beschikbaar)
    const [rows] = await this.db.execute(`
      SELECT ${config.uriColumn} as uri, pref_label, label, label_normalized,
             (1.0 - (
               LENGTH(label_normalized) - LENGTH(REPLACE(LOWER(label_normalized), ?, ''))
             ) / LENGTH(label_normalized)) as similarity
      FROM ${config.table}
      WHERE label_normalized LIKE ?
         OR label_normalized LIKE ?
         OR label_normalized LIKE ?
      ORDER BY similarity DESC
      LIMIT 5
    `, [
      normalizedValue,
      `${normalizedValue}%`,
      `%${normalizedValue}%`,
      `%${normalizedValue}`
    ]);

    if (rows.length > 0) {
      // Bereken Levenshtein similarity client-side voor accuratere score
      const bestMatch = rows[0];
      const similarity = this.calculateSimilarity(normalizedValue, bestMatch.label_normalized);

      return {
        found: similarity >= 0.70,
        confidence: similarity,
        method: 'fuzzy',
        match: similarity >= 0.70 ? {
          uri: bestMatch.uri,
          prefLabel: bestMatch.pref_label,
          matchedLabel: bestMatch.label,
          conceptType
        } : undefined,
        alternatives: rows.slice(1).map(r => ({
          uri: r.uri,
          prefLabel: r.pref_label,
          matchedLabel: r.label,
          matchType: 'fuzzy' as const,
          confidence: this.calculateSimilarity(normalizedValue, r.label_normalized),
          conceptType
        })),
        needsReview: similarity < 0.85
      };
    }

    return { found: false, confidence: 0, method: 'fuzzy', needsReview: true };
  }

  /**
   * Strategy 3: Semantic match met embeddings
   */
  private async trySemanticMatch(
    value: string,
    context: string | undefined,
    conceptType: ConceptType
  ): Promise<ClassificationResult> {
    // Combineer value met context voor betere embedding
    const searchText = context ? `${value} - ${context}` : value;

    try {
      // Gebruik bestaande embeddingService
      const { embeddingService } = await import('./embeddingService');
      const embedding = await embeddingService.getEmbedding(searchText);

      // Zoek meest vergelijkbare concepten
      const matches = await embeddingService.findSimilar(
        embedding,
        conceptType,
        5
      );

      if (matches.length > 0 && matches[0].similarity >= 0.75) {
        return {
          found: true,
          confidence: matches[0].similarity,
          method: 'semantic',
          match: {
            uri: matches[0].uri,
            prefLabel: matches[0].prefLabel,
            matchedLabel: matches[0].prefLabel,
            conceptType
          },
          alternatives: matches.slice(1).map(m => ({
            uri: m.uri,
            prefLabel: m.prefLabel,
            matchedLabel: m.prefLabel,
            matchType: 'fuzzy' as const,
            confidence: m.similarity,
            conceptType
          })),
          needsReview: matches[0].similarity < 0.85
        };
      }
    } catch (error) {
      console.warn('Semantic match failed:', error);
    }

    return { found: false, confidence: 0, method: 'semantic', needsReview: true };
  }

  /**
   * Strategy 4: LLM-assisted classification
   */
  private async tryLLMMatch(
    value: string,
    context: string | undefined,
    conceptType: ConceptType
  ): Promise<ClassificationResult> {
    const config = CONCEPT_CONFIGS[conceptType];

    // Haal top kandidaten op voor LLM selectie
    const [candidates] = await this.db.execute(`
      SELECT ${config.uriColumn} as uri, pref_label
      FROM ${config.table}
      WHERE label_type = 'prefLabel'
      ORDER BY RAND()
      LIMIT 20
    `);

    // TODO: Implementeer LLM call met Gemini/lokaal model
    // Dit is een placeholder - in productie zou dit een echte LLM call zijn

    const prompt = `
Gegeven de volgende ${config.dutchName} uit een CV: "${value}"
${context ? `Context: ${context}` : ''}

Kies de beste match uit deze CompetentNL ${config.dutchNamePlural}:
${candidates.map((c, i) => `${i + 1}. ${c.pref_label}`).join('\n')}

Antwoord met alleen het nummer van de beste match, of "0" als geen passende match.
`;

    // Placeholder response - vervang met echte LLM call
    return { found: false, confidence: 0, method: 'llm', needsReview: true };
  }

  /**
   * Bereken string similarity (Levenshtein-based)
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLen;
  }

  /**
   * Sla classificatie op in database
   */
  private async storeClassification(
    extractionId: number,
    result: ClassificationResult
  ): Promise<void> {
    await this.db.execute(`
      UPDATE cv_extractions SET
        matched_cnl_uri = ?,
        matched_cnl_label = ?,
        confidence_score = ?,
        classification_method = ?,
        alternative_matches = ?,
        needs_review = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      result.match?.uri || null,
      result.match?.prefLabel || null,
      result.confidence,
      result.method,
      JSON.stringify(result.alternatives || []),
      result.needsReview,
      extractionId
    ]);
  }

  /**
   * Bereken summary statistieken
   */
  private calculateSummary(classifications: any[]) {
    const byMethod: Record<string, number> = {};
    let classified = 0;
    let needsReview = 0;

    for (const c of classifications) {
      byMethod[c.result.method] = (byMethod[c.result.method] || 0) + 1;
      if (c.result.found) classified++;
      if (c.result.needsReview) needsReview++;
    }

    return {
      total: classifications.length,
      classified,
      needsReview,
      byMethod
    };
  }
}
```

### 3.3 API Routes

**Bestand**: `routes/cv-classification.ts`

```typescript
import { Router } from 'express';
import { CNLClassificationService } from '../services/cnlClassificationService';

const router = Router();

/**
 * POST /api/cv/:cvId/classify
 * Start automatische classificatie voor een CV
 */
router.post('/:cvId/classify', async (req, res) => {
  const cvId = parseInt(req.params.cvId);
  const service = new CNLClassificationService(req.db);

  try {
    const result = await service.classifyCV(cvId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cv/:cvId/classifications
 * Haal classificaties op voor review
 */
router.get('/:cvId/classifications', async (req, res) => {
  // Return classificaties met alternatieven voor review UI
});

/**
 * PUT /api/cv/extraction/:extractionId/classification
 * Update classificatie (handmatige correctie)
 */
router.put('/extraction/:extractionId/classification', async (req, res) => {
  const { uri, label, method } = req.body;
  // Update met method = 'manual'
});

/**
 * POST /api/cv/extraction/:extractionId/resolve
 * Resolve disambiguatie door gebruiker
 */
router.post('/extraction/:extractionId/resolve', async (req, res) => {
  const { selectedUri } = req.body;
  // Update met gekozen alternatief
});

export default router;
```

### 3.4 Wizard Step 6 Component

**Bestand**: `components/cv-wizard/Step6Classification.tsx`

```typescript
interface Step6ClassificationProps {
  cvId: number;
  onComplete: (classifications: Classification[]) => void;
  onBack: () => void;
}

export function Step6Classification({ cvId, onComplete, onBack }: Step6ClassificationProps) {
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  useEffect(() => {
    // Auto-classify bij mount
    classifyCV(cvId).then(result => {
      setClassifications(result.classifications);
      setLoading(false);
    });
  }, [cvId]);

  const handleSelectAlternative = async (extractionId: number, uri: string) => {
    // Update classificatie met geselecteerd alternatief
  };

  const handleManualSearch = async (extractionId: number, searchTerm: string) => {
    // Zoek in CNL database en toon resultaten
  };

  return (
    <div className="step-6-classification">
      <h2>Stap 6: CNL Taxonomie Classificatie</h2>
      <p>
        We hebben je CV geanalyseerd en koppelen nu functies, opleidingen
        en vaardigheden aan de CompetentNL standaard.
      </p>

      {loading ? (
        <ClassificationProgress />
      ) : (
        <>
          {/* Functies/Beroepen */}
          <ClassificationSection
            title="Functies → Beroepen"
            items={classifications.filter(c => c.sectionType === 'experience')}
            onSelectAlternative={handleSelectAlternative}
            onManualSearch={handleManualSearch}
          />

          {/* Opleidingen */}
          <ClassificationSection
            title="Opleidingen → Kwalificaties"
            items={classifications.filter(c => c.sectionType === 'education')}
            onSelectAlternative={handleSelectAlternative}
            onManualSearch={handleManualSearch}
          />

          {/* Skills */}
          <ClassificationSection
            title="Vaardigheden → Competenties"
            items={classifications.filter(c => c.sectionType === 'skill')}
            onSelectAlternative={handleSelectAlternative}
            onManualSearch={handleManualSearch}
          />

          {/* Summary */}
          <ClassificationSummary classifications={classifications} />

          <div className="step-actions">
            <button onClick={onBack}>Terug</button>
            <button
              onClick={() => onComplete(classifications)}
              disabled={classifications.some(c => c.needsReview && !c.userConfirmed)}
            >
              Bevestigen & Doorgaan
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

---

## 4. Functioneel Ontwerp

### 4.1 Gebruikerservaring

#### Stap 6 Interface Mockup

```
┌──────────────────────────────────────────────────────────────────────┐
│  STAP 6 VAN 6: CNL TAXONOMIE CLASSIFICATIE                          │
│  ════════════════════════════════════════════════════════════════   │
│                                                                      │
│  We koppelen je CV aan de CompetentNL standaard voor betere         │
│  matching met vacatures en opleidingen.                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ FUNCTIES → BEROEPEN                                    3 items │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  ✅ Senior Software Developer                                   │ │
│  │     → Softwareontwikkelaar (98% match)                         │ │
│  │     [bekijk alternatieven ▼]                                    │ │
│  │                                                                 │ │
│  │  ⚠️ Technical Lead                                              │ │
│  │     → Geen exacte match gevonden                                │ │
│  │     Suggesties:                                                 │ │
│  │     ○ ICT-projectleider (72%)                                   │ │
│  │     ○ Teamleider ICT (68%)                                      │ │
│  │     ○ Softwarearchitect (65%)                                   │ │
│  │     [🔍 handmatig zoeken]                                       │ │
│  │                                                                 │ │
│  │  ✅ Junior Developer                                            │ │
│  │     → Junior softwareontwikkelaar (95% match)                  │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ OPLEIDINGEN → KWALIFICATIES                            2 items │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  ✅ Bachelor Informatica                                        │ │
│  │     → HBO Informatica (92% match)                               │ │
│  │                                                                 │ │
│  │  ✅ VWO                                                          │ │
│  │     → VWO diploma (100% match)                                  │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ VAARDIGHEDEN → COMPETENTIES                           12 items │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  ✅ Python        → Programmeren (90%)                          │ │
│  │  ✅ Scrum         → Samenwerken (85%)                           │ │
│  │  ✅ SQL           → Gegevens beheren (88%)                      │ │
│  │  ⚠️ React         → [geen match - kies handmatig]              │ │
│  │  ... en 8 meer                                                  │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ SAMENVATTING                                                   │ │
│  │  ✅ 14 van 17 items automatisch geclassificeerd                │ │
│  │  ⚠️ 3 items vereisen je keuze                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [← Terug]                                    [Bevestigen & Afronden]│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Classificatie Feedback Indicators

| Icon | Status | Betekenis | Actie Vereist |
|------|--------|-----------|---------------|
| ✅ | Hoge match | Confidence ≥ 85% | Geen |
| ⚠️ | Lage match | Confidence 50-85% | Review aanbevolen |
| ❓ | Geen match | Confidence < 50% | Keuze vereist |
| 🔧 | Handmatig | Door gebruiker gekozen | Geen |

### 4.3 Alternatieve Selectie Flow

```
Gebruiker klikt "bekijk alternatieven" bij een classificatie:

┌─────────────────────────────────────────────────────────┐
│  "Senior Software Developer" classificeren als:         │
│                                                         │
│  ○ Softwareontwikkelaar (98%) ← huidig                 │
│  ○ Applicatieontwikkelaar (89%)                        │
│  ○ Software engineer (85%)                              │
│  ○ Programmeur (78%)                                    │
│  ○ ICT-er (65%)                                         │
│                                                         │
│  [🔍 Zoek anders...]  [Annuleren]  [Bevestig keuze]    │
└─────────────────────────────────────────────────────────┘
```

### 4.4 Handmatige Zoek Flow

```
Gebruiker klikt "handmatig zoeken":

┌─────────────────────────────────────────────────────────┐
│  Zoek een beroep in CompetentNL                        │
│                                                         │
│  [🔍 tech lead________________] [Zoeken]               │
│                                                         │
│  Resultaten:                                            │
│  ○ Teamleider ICT (68%)                                │
│  ○ ICT-projectleider (65%)                             │
│  ○ Technisch manager (60%)                             │
│  ○ IT-manager (58%)                                     │
│                                                         │
│  [Annuleren]                        [Selecteer]        │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        COMPLETE DATA FLOW                            │
└──────────────────────────────────────────────────────────────────────┘

          CV Upload
              │
              ▼
    ┌─────────────────┐
    │   PDF/Word      │
    │   Document      │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │  Stap 1-5       │
    │  Processing     │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────────────────────────────────────────┐
    │                cv_extractions                        │
    │  ┌───────────────────────────────────────────────┐  │
    │  │ id: 1                                         │  │
    │  │ section_type: 'experience'                    │  │
    │  │ content: {jobTitle: "Senior Dev", ...}        │  │
    │  │ matched_cnl_uri: NULL    ← nog leeg           │  │
    │  │ classification_method: NULL                    │  │
    │  └───────────────────────────────────────────────┘  │
    └────────────────────────┬────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │    STAP 6: CLASSIFICATIE    │
              │                             │
              │  CNLClassificationService   │
              │                             │
              └──────────────┬──────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌─────────┐        ┌─────────┐        ┌─────────┐
    │ Exact   │        │ Fuzzy   │        │Semantic │
    │ Match   │        │ Match   │        │ Match   │
    └────┬────┘        └────┬────┘        └────┬────┘
         │                  │                   │
         └────────────┬─────┴──────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   occupation_labels    │
         │   education_labels     │
         │   capability_labels    │
         └───────────┬────────────┘
                     │
                     ▼
    ┌─────────────────────────────────────────────────────┐
    │                cv_extractions (UPDATED)              │
    │  ┌───────────────────────────────────────────────┐  │
    │  │ id: 1                                         │  │
    │  │ section_type: 'experience'                    │  │
    │  │ content: {jobTitle: "Senior Dev", ...}        │  │
    │  │ matched_cnl_uri: "cnl:occupation/1234"        │  │
    │  │ matched_cnl_label: "Softwareontwikkelaar"     │  │
    │  │ confidence_score: 0.98                        │  │
    │  │ classification_method: 'exact'                │  │
    │  │ alternative_matches: [...]                    │  │
    │  └───────────────────────────────────────────────┘  │
    └────────────────────────┬────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │   Profile Matching API   │
              │   (matchProfile)          │
              │                          │
              │   Input:                 │
              │   - skills: [URIs]       │
              │   - knowledge: [URIs]    │
              │   - tasks: [URIs]        │
              └──────────────┬───────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │   Matching Results       │
              │   - Passende beroepen    │
              │   - Gap analyse          │
              │   - Opleidingsadvies     │
              └──────────────────────────┘
```

---

## 6. Integratie met Profile Matching

### 6.1 Van CV naar Match Profile

Na classificatie kan het CV worden omgezet naar een `MatchProfile`:

```typescript
async function convertCVToMatchProfile(cvId: number): Promise<MatchProfile> {
  const extractions = await getCVExtractions(cvId);

  const profile: MatchProfile = {
    capabilities: [],
    knowledge: [],
    tasks: [],
    occupationHistory: [],
    education: []
  };

  for (const extraction of extractions) {
    if (!extraction.matched_cnl_uri) continue;

    switch (extraction.section_type) {
      case 'experience':
        // Voeg beroep toe aan history
        profile.occupationHistory.push({
          occupationUri: extraction.matched_cnl_uri,
          occupationLabel: extraction.matched_cnl_label,
          years: calculateYears(extraction.content)
        });

        // Haal bijbehorende skills op via SPARQL
        const occSkills = await fetchOccupationProfile(extraction.matched_cnl_uri);
        profile.capabilities.push(...occSkills.capabilities);
        profile.knowledge.push(...occSkills.knowledge);
        profile.tasks.push(...occSkills.tasks);
        break;

      case 'education':
        profile.education.push({
          educationUri: extraction.matched_cnl_uri,
          educationLabel: extraction.matched_cnl_label,
          level: inferLevel(extraction.content),
          yearCompleted: extraction.content.year
        });

        // Haal bijbehorende competenties op
        const eduProfile = await fetchEducationProfile(extraction.matched_cnl_uri);
        profile.capabilities.push(...eduProfile.capabilities);
        profile.knowledge.push(...eduProfile.knowledge);
        break;

      case 'skill':
        profile.capabilities.push({
          uri: extraction.matched_cnl_uri,
          label: extraction.matched_cnl_label,
          source: 'cv'
        });
        break;
    }
  }

  // Deduplicate
  profile.capabilities = deduplicateByUri(profile.capabilities);
  profile.knowledge = deduplicateByUri(profile.knowledge);
  profile.tasks = deduplicateByUri(profile.tasks);

  return profile;
}
```

### 6.2 Enrichment via Beroep/Opleiding URIs

Wanneer een functie of opleiding is geclassificeerd, kunnen we het profiel verrijken:

```
CV item: "Senior Software Developer"
    ↓ classificatie
CNL Occupation: "Softwareontwikkelaar" (cnl:occupation/1234)
    ↓ SPARQL query
Gerelateerde competenties:
  - Analyseren (essential)
  - Programmeren (essential)
  - Problemen oplossen (important)
  - Samenwerken (important)
  - Communiceren (somewhat)
```

---

## 7. Implementatie Roadmap

### Fase 1: Core Classificatie (Week 1-2)

- [ ] `CNLClassificationService` implementeren
- [ ] Exact match strategy
- [ ] Fuzzy match strategy
- [ ] Database updates voor cv_extractions
- [ ] API routes voor classificatie

### Fase 2: UI Componenten (Week 2-3)

- [ ] Step6Classification component
- [ ] ClassificationSection component
- [ ] AlternativeSelector modal
- [ ] ManualSearch dialog
- [ ] Progress indicators

### Fase 3: Semantic Matching (Week 3-4)

- [ ] Embeddings genereren voor CNL labels
- [ ] Vector search implementeren
- [ ] Confidence calibratie

### Fase 4: LLM Integration (Week 4-5)

- [ ] Gemini/lokaal model integratie
- [ ] Prompt engineering voor classificatie
- [ ] Fallback logica

### Fase 5: Testing & Optimalisatie (Week 5-6)

- [ ] Unit tests voor classification service
- [ ] Integration tests voor complete flow
- [ ] Performance optimalisatie
- [ ] User testing en feedback verwerking

---

## 8. Technische Overwegingen

### 8.1 Performance

- **Caching**: CNL labels in-memory cachen (reeds aanwezig in matching API)
- **Batch processing**: Meerdere items tegelijk classificeren
- **Background processing**: Classificatie starten zodra stap 5 klaar is

### 8.2 Nauwkeurigheid

- **Confidence thresholds**: Configureerbaar per concept type
- **Feedback loop**: Handmatige correcties gebruiken voor verbetering
- **A/B testing**: Verschillende strategies vergelijken

### 8.3 Privacy

- **Geen PII naar externe services**: Alle matching lokaal of via geanonimiseerde data
- **Logging**: Geen persoonlijke informatie loggen
- **GDPR compliant**: Classificatie data verwijderen bij CV verwijdering

---

## 9. Success Metrics

| Metric | Target | Meting |
|--------|--------|--------|
| Auto-classification rate | ≥ 80% | % items met confidence ≥ 0.75 |
| Accuracy | ≥ 90% | % correcte classificaties na user review |
| Processing time | < 5 sec | Tijd voor complete CV classificatie |
| User corrections | < 15% | % items handmatig aangepast |

---

## 10. Appendix: Bestaande Code Referenties

| Component | Bestand | Relevante Functies |
|-----------|---------|-------------------|
| Concept Resolver | `services/conceptResolver.ts` | `normalizeText`, `CONCEPT_CONFIGS` |
| Occupation Resolver | `services/occupationResolver.ts` | `resolveOccupation` |
| Profile Builder | `services/profileBuilderService.ts` | `fetchOccupationProfile`, `fetchEducationProfile` |
| CV Processing | `services/cvProcessingService.ts` | `parseStructure`, `storeExtractions` |
| Matching API | `profile-matching-api.mjs` | `resolveLabelsToUris`, `matchProfile` |
| Database Schema | `types/cv.ts` | `CVExtraction`, `ClassificationResult` |
