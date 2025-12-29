# Voorstel: Profiel-naar-Beroep Matchingsalgoritme voor CompetentNL

## 1. Samenvatting

Dit document beschrijft een voorstel voor een intelligent matchingsalgoritme dat een **persoonlijk profiel** (vaardigheden, kennisgebieden, taken) matcht tegen beroepen in de CompetentNL knowledge graph. 

**Belangrijke ontwerpkeuzes:**
- **Input is een profiel**, niet een beroep - dit kan afkomstig zijn van een vorig beroep, vrijwilligerswerk, of andere ervaring
- **Asymmetrische matching** - de score van profiel→beroep A kan anders zijn dan profiel→beroep B
- **On-demand berekening** - geen pre-computed matrix
- **Gewichten**: Vaardigheden 50% | Kennisgebieden 30% | Taken 20%

Het algoritme houdt rekening met:
- **Gewogen vaardigheden** - unieke vaardigheden wegen zwaarder dan universele (IDF)
- **Kennisgebieden** - vakinhoudelijke overlap
- **Taken** - concrete werkzaamheden die overeenkomen
- **Relevantieniveaus** - Essential vs Important vs Somewhat

Het algoritme produceert een **matchingscore** en een **gedetailleerde analyse** van de fit en gaps tussen profiel en doelberoep.

---

## 2. Analyse van Beschikbare Data

### 2.1 Relevante Entiteiten in CompetentNL

| Entiteit | Aantal | Relatie met Beroep |
|----------|--------|-------------------|
| **Occupation** | 3.263 | Hoofdentiteit |
| **HumanCapability** | 137 | requiresHATEssential/Important/Somewhat |
| **KnowledgeArea** | 361 | requiresHATEssential/Important/Somewhat ✅ |
| **OccupationTask** | 4.613 | isCharacterizedByOccupationTask_Essential/Optional |

### 2.2 Belangrijke Relaties

```
Beroep → Vaardigheden:
- cnlo:requiresHATEssential    (80.237 koppelingen)
- cnlo:requiresHATImportant    (153.554 koppelingen)
- cnlo:requiresHATSomewhat     (82.518 koppelingen)

Beroep → Kennisgebieden:
- cnlo:requiresHATEssential    (zelfde predicaten als skills) ✅
- cnlo:requiresHATImportant    
- cnlo:requiresHATSomewhat     

Beroep → Taken:
- cnluwv:isCharacterizedByOccupationTask_Essential  (61.195)
- cnluwv:isCharacterizedByOccupationTask_Optional   (19.658)
```

**Bevinding**: Kennisgebieden gebruiken dezelfde `requiresHAT*` predicaten als vaardigheden. Dit vereenvoudigt de implementatie aanzienlijk!

### 2.3 Uitdagingen uit Feedback Taxonomie

De analyse van de vaardighedentaxonomie identificeert cruciale uitdagingen:

1. **Universaliteitsprobleem**: Veel vaardigheden (vooral DENKEN en ZIJN) komen bij >90% van alle beroepen voor en zijn niet onderscheidend
2. **Overlap**: Sterke correlaties (>0.85) tussen bepaalde vaardigheden
3. **Disbalans**: Cognitieve vaardigheden zijn oververtegenwoordigd

**Implicatie voor matching**: Vaardigheden die bij bijna alle beroepen voorkomen mogen niet zwaar meetellen!

---

## 3. Voorgesteld Matchingsmodel

### 3.1 Conceptueel Model

**Input**: Een profiel bestaande uit:
- Lijst van vaardigheden (met optioneel relevantie-niveau)
- Lijst van kennisgebieden
- Lijst van taken/werkzaamheden

**Output**: Ranking van beroepen met matchingscore en gap-analyse

De matchingscore wordt berekend als een gewogen combinatie van drie dimensies:

```
MATCH_SCORE = (α × SKILL_SCORE) + (β × KNOWLEDGE_SCORE) + (γ × TASK_SCORE)
```

Waarbij:
- α = 0.50 (vaardigheden - hoofdindicator)
- β = 0.30 (kennisgebieden - domeinspecifiek)
- γ = 0.20 (taken - concrete werkzaamheden)

### 3.2 Asymmetrische Matching

De matching is **asymmetrisch**: we berekenen hoeveel van wat het doelberoep vereist, het profiel afdekt. Dit betekent:

```
COVERAGE_SCORE = Wat het profiel biedt ∩ Wat het beroep vraagt
                 ─────────────────────────────────────────────
                 Wat het beroep vraagt (gewogen)
```

- Een profiel met 80% van de vereiste skills scoort 0.80
- Een profiel met extra skills die het beroep niet vraagt, verhoogt de score niet
- Maar die extra skills kunnen wel relevant zijn voor gap-analyse naar andere beroepen

### 3.2 Inverse Document Frequency (IDF) Weging voor Vaardigheden

**Kernprincipe**: Een vaardigheid die slechts bij weinig beroepen voorkomt is waardevoller voor matching dan een vaardigheid die overal voorkomt.

```
IDF(skill) = log(N / df(skill))

Waarbij:
- N = totaal aantal beroepen (3.263)
- df(skill) = aantal beroepen dat deze skill vereist
```

**Voorbeeld**:
- "Zorgvuldig werken" (komt voor bij 3.100 beroepen): IDF = log(3263/3100) ≈ 0.02 (laag gewicht)
- "Chirurgische technieken" (komt voor bij 15 beroepen): IDF = log(3263/15) ≈ 2.34 (hoog gewicht)

### 3.3 Relevantie-niveau Multiplicator

De relatie-sterkte (Essential/Important/Somewhat) krijgt een multiplicator:

| Niveau | Predicaat | Multiplicator |
|--------|-----------|---------------|
| Essential | requiresHATEssential | 1.0 |
| Important | requiresHATImportant | 0.6 |
| Somewhat | requiresHATSomewhat | 0.3 |

### 3.4 Vaardighedenscore Formule

Voor een profiel P dat gematcht wordt tegen beroep B:

```
SKILL_SCORE = Σ(skills in P ∩ B) [IDF(skill) × relevance_weight_B] 
              ÷ 
              Σ(skills required by B) [IDF(skill) × relevance_weight_B]
```

**Waarbij**:
- `P ∩ B` = vaardigheden die zowel in het profiel als in de beroepsvereisten zitten
- `relevance_weight_B` = gewicht op basis van Essential (1.0) / Important (0.6) / Somewhat (0.3)
- `IDF(skill)` = inverse document frequency van de vaardigheid

**Voorbeeld**:
- Beroep B vereist: Skill A (essential, IDF=2.0), Skill B (important, IDF=0.5), Skill C (essential, IDF=1.5)
- Profiel P heeft: Skill A, Skill C
- Score = (2.0×1.0 + 1.5×1.0) / (2.0×1.0 + 0.5×0.6 + 1.5×1.0) = 3.5 / 3.8 = 0.92

---

## 4. SPARQL Queries voor Implementatie

### Fase 1: Pre-compute IDF Gewichten (Eenmalig)

Deze query moet lokaal uitgevoerd worden tegen het CompetentNL endpoint om de IDF-gewichten te berekenen:

```sparql
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

# Bereken hoe vaak elke vaardigheid voorkomt bij beroepen
SELECT 
  ?skill 
  ?skillLabel 
  (COUNT(DISTINCT ?occ) AS ?occupationCount)
WHERE {
  ?occ a cnlo:Occupation .
  {
    ?occ cnlo:requiresHATEssential ?skill .
  } UNION {
    ?occ cnlo:requiresHATImportant ?skill .
  } UNION {
    ?occ cnlo:requiresHATSomewhat ?skill .
  }
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
GROUP BY ?skill ?skillLabel
ORDER BY DESC(?occupationCount)
```

**IDF berekening**: `IDF(skill) = log(3263 / occupationCount)`

### Fase 2: Haal Vereisten van Doelberoep Op

```sparql
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

# Haal alle vereisten van een doelberoep op
SELECT 
  ?type
  ?item
  ?itemLabel
  ?relevance
WHERE {
  # Zoek het beroep
  ?occ a cnlo:Occupation ;
       skos:prefLabel ?occLabel .
  FILTER(CONTAINS(LCASE(?occLabel), "fysiotherapeut"))
  
  # Vaardigheden
  {
    VALUES (?pred ?relevance) {
      (cnlo:requiresHATEssential "essential")
      (cnlo:requiresHATImportant "important")
      (cnlo:requiresHATSomewhat "somewhat")
    }
    ?occ ?pred ?item .
    ?item a cnlo:HumanCapability ;
          skos:prefLabel ?itemLabel .
    BIND("skill" AS ?type)
  }
  UNION
  # Kennisgebieden
  {
    VALUES (?pred ?relevance) {
      (cnlo:requiresHATEssential "essential")
      (cnlo:requiresHATImportant "important")
      (cnlo:requiresHATSomewhat "somewhat")
    }
    ?occ ?pred ?item .
    ?item a cnlo:KnowledgeArea ;
          skos:prefLabel ?itemLabel .
    BIND("knowledge" AS ?type)
  }
  UNION
  # Taken
  {
    VALUES (?pred ?relevance) {
      (cnluwv:isCharacterizedByOccupationTask_Essential "essential")
      (cnluwv:isCharacterizedByOccupationTask_Optional "optional")
    }
    ?occ ?pred ?item .
    ?item skos:prefLabel ?itemLabel .
    BIND("task" AS ?type)
  }
  
  FILTER(LANG(?itemLabel) = "nl" || LANG(?itemLabel) = "")
}
ORDER BY ?type ?relevance
```

### Fase 3: Match Profiel tegen Alle Beroepen (Ranking Query)

Deze query kan aangepast worden met de specifieke profile-items:

```sparql
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

# Vind beroepen die de gegeven skills vereisen
SELECT 
  ?occ 
  ?occLabel 
  (COUNT(DISTINCT ?matchedSkill) AS ?matchCount)
  (GROUP_CONCAT(DISTINCT ?matchedLabel; separator=", ") AS ?matchedSkills)
WHERE {
  ?occ a cnlo:Occupation ;
       skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = "nl")
  
  # Match tegen profiel-skills (vervang URIs met daadwerkelijke profiel)
  VALUES ?profileSkill {
    <https://linkeddata.competentnl.nl/id/humancapability/SKILL_URI_1>
    <https://linkeddata.competentnl.nl/id/humancapability/SKILL_URI_2>
    # ... meer skills uit profiel
  }
  
  ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant ?matchedSkill .
  FILTER(?matchedSkill = ?profileSkill)
  
  ?matchedSkill skos:prefLabel ?matchedLabel .
  FILTER(LANG(?matchedLabel) = "nl")
}
GROUP BY ?occ ?occLabel
ORDER BY DESC(?matchCount)
LIMIT 50
```

---

## 5. Implementatiestrategie

### 5.1 Architectuur Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  PROFIEL INPUT  │────▶│  MATCHING ENGINE │────▶│  RANKED RESULTS │
│  - Skills       │     │  - IDF lookup    │     │  - Scores       │
│  - Knowledge    │     │  - SPARQL query  │     │  - Gaps         │
│  - Tasks        │     │  - Score calc    │     │  - Matches      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  IDF CACHE   │
                        │  (database)  │
                        └──────────────┘
```

### 5.2 Tweestaps-aanpak

**Stap 1: Pre-computatie (Eenmalig/Periodiek)**
- Bereken IDF-gewichten voor alle 137 vaardigheden
- Sla op in `competentnl_rag` database
- Herbereken periodiek (bijv. maandelijks) wanneer beroepen-data wijzigt

**Stap 2: On-Demand Matching**
- Ontvang profiel (skills, knowledge, tasks)
- Voor elk doelberoep:
  - Haal vereisten op via SPARQL
  - Bereken gewogen coverage score
  - Identificeer gaps (wat mist het profiel?)
- Sorteer en retourneer top-N matches

### 5.2 Database Tabel voor IDF Gewichten

```sql
CREATE TABLE IF NOT EXISTS skill_idf_weights (
  skill_uri VARCHAR(500) PRIMARY KEY,
  skill_label VARCHAR(255),
  occupation_count INT,
  total_occupations INT DEFAULT 3263,
  idf_weight DECIMAL(8,4),
  skill_category VARCHAR(50), -- DENKEN, DOEN, VERBINDEN, etc.
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.3 Voorgestelde Skill Categorieën (uit Feedback)

| Categorie | Beschrijving | Typisch IDF |
|-----------|--------------|-------------|
| **DENKEN** | Informatieverwerking | LAAG (universeel) |
| **DOEN** | Fysiek handelen | GEMIDDELD-HOOG |
| **VERBINDEN** | Sociale interactie | GEMIDDELD |
| **STUREN** | Richting geven | GEMIDDELD |
| **CREËREN** | Nieuwe dingen bedenken | HOOG (specifiek) |
| **ZIJN** | Persoonlijke eigenschappen | ZEER LAAG (universeel) |

---

## 6. Algoritme Output Structuur

### 6.1 Matchingsresultaat JSON

```json
{
  "source_occupation": {
    "uri": "https://linkeddata.competentnl.nl/uwv/id/occupation/...",
    "label": "Verpleegkundige"
  },
  "target_occupation": {
    "uri": "https://linkeddata.competentnl.nl/uwv/id/occupation/...",
    "label": "Fysiotherapeut"
  },
  "overall_score": 0.72,
  "breakdown": {
    "skills": {
      "score": 0.68,
      "weight": 0.50,
      "shared_count": 45,
      "source_only": 12,
      "target_only": 8,
      "top_shared": [
        {"skill": "Verzorgen", "idf": 1.8, "relevance_match": "essential-essential"},
        {"skill": "Actief luisteren", "idf": 0.3, "relevance_match": "essential-important"}
      ],
      "gaps": [
        {"skill": "Revalidatietechnieken", "required_by": "target", "idf": 2.1}
      ]
    },
    "knowledge": {
      "score": 0.75,
      "weight": 0.30,
      "shared_areas": ["Gezondheidszorg", "Anatomie"],
      "gaps": ["Bewegingsleer"]
    },
    "tasks": {
      "score": 0.55,
      "weight": 0.20,
      "shared_count": 8,
      "different_count": 15
    }
  },
  "recommendations": {
    "skills_to_develop": ["Revalidatietechnieken", "Bewegingsanalyse"],
    "transferable_strengths": ["Patiëntzorg", "Medische kennis"]
  }
}
```

---

## 7. Vervolgstappen

### 7.1 Stap 1: IDF-gewichten Berekenen (Prioriteit)

Voer de IDF-query uit tegen het lokale CompetentNL endpoint:
1. Gebruik het meegeleverde script `calculate-idf-weights.js`
2. OF voer de SPARQL query handmatig uit
3. Sla de resultaten op in de `competentnl_rag` database

### 7.2 Stap 2: API Endpoint Bouwen

Bouw een endpoint dat:
1. Een profiel accepteert (lijst van skill/knowledge/task URIs of labels)
2. De IDF-gewichten ophaalt uit de database
3. Per doelberoep de coverage score berekent
4. Een gerankte lijst met gap-analyse retourneert

**Voorgestelde API structuur**:
```
POST /api/match-profile
Body: {
  "skills": ["Verzorgen", "Actief luisteren", ...],
  "knowledge": ["Gezondheidszorg", ...],
  "tasks": ["Patiënten begeleiden", ...]
}
Response: {
  "matches": [
    {"occupation": "Verpleegkundige", "score": 0.85, "gaps": [...]},
    ...
  ]
}
```

### 7.3 Stap 3: Concept Resolution Integreren

Gebruik de bestaande concept resolution om:
- Colloquiale termen ("verpleger") te matchen naar officiële labels
- Fuzzy matching toe te passen op profiel-input
- Disambiguatie te bieden bij meerdere matches

### 7.4 Stap 4: UI Integreren

Voeg een "Match mijn profiel" functie toe aan de frontend:
- Profiel samenstellen via selectie of vrije invoer
- Resultaten tonen met visuele score-indicatie
- Gap-analyse per match tonen

---

## 8. Beslissingen en Open Vragen

### 8.1 Genomen Beslissingen

| Vraag | Beslissing |
|-------|------------|
| Gewichten α/β/γ | 0.50/0.30/0.20 (later aanpasbaar) |
| Symmetrie | Asymmetrisch (profiel → beroep) |
| Werkomstandigheden | Niet in scope voor v1 |
| Berekening | On-demand, niet pre-computed |
| Input | Profiel (skills, knowledge, tasks) - bron-agnostisch |

### 8.2 Nog Te Beantwoorden

1. **Minimale matchingscore**: Vanaf welke score tonen we een match als "relevant"? (bijv. >0.50?)

2. **Aantal resultaten**: Top-10? Top-20? Alle boven threshold?

3. **Taken matching**: Exacte string match of fuzzy matching voor taken uit profiel?

4. **Profiel input formaat**: Hoe komt het profiel binnen? JSON? URIs? Labels met fuzzy matching?

---

## Bijlage A: Volledige IDF Berekening Query

```sparql
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT 
  ?skill 
  ?skillLabel 
  (COUNT(DISTINCT ?occ) AS ?occCount)
WHERE {
  ?occ a cnlo:Occupation .
  ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?skill .
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
GROUP BY ?skill ?skillLabel
ORDER BY DESC(?occCount)
```

**Instructie**: Voer deze query uit tegen `https://sparql.competentnl.nl` en sla het resultaat op. Bereken IDF = log(3263 / occCount) voor elke skill.

## Bijlage B: Kennisgebied IDF Berekening Query

```sparql
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT 
  ?area 
  ?areaLabel 
  (COUNT(DISTINCT ?occ) AS ?occCount)
WHERE {
  ?occ a cnlo:Occupation .
  ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?area .
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?areaLabel .
  FILTER(LANG(?areaLabel) = "nl")
}
GROUP BY ?area ?areaLabel
ORDER BY DESC(?occCount)
```

## Bijlage C: Verwante Documentatie

- `Feedback_taxonomie_v1.1_DEF.docx` - Analyse van vaardigheden-taxonomie
- `Documentatie_knowledge_graph_CompetentNL_versie_1__september_2025.pdf` - Officiële ontologie
- `Documentatie_vaardighedentaxonomie_in_CompetentNL_versie_1__september_2025.pdf` - Vaardighedenstructuur
- `Documentatie_kennisgebiedentaxonomie_CompetentNL_versie_1__september_2025.pdf` - Kennisgebieden

## Bijlage D: Proof-of-Concept Script

Zie `/home/claude/calculate-idf-weights.js` voor een Node.js script dat de IDF-gewichten berekent. Dit script moet lokaal worden uitgevoerd met toegang tot het CompetentNL SPARQL endpoint.
