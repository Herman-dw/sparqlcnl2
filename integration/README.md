# CompetentNL Multi-Prompt System - Integratie

## 🎯 Wat is dit?

Dit is een **intelligent multi-prompt systeem** dat:
1. Vragen classificeert naar het juiste domein (beroepen, vaardigheden, etc.)
2. Alleen relevante prompts en voorbeelden laadt
3. Betere SPARQL queries genereert door gefocuste context

## 📦 Inhoud

```
integration/
├── database/
│   ├── 001-complete-setup.sql    # Database + tabellen + seed data
│   └── 002-prompts-and-examples.sql  # Domein prompts + voorbeelden
├── services/
│   ├── promptOrchestrator.ts     # Hoofd orchestrator service
│   └── geminiService.ts          # Aangepaste Gemini service
├── scripts/
│   ├── setup-windows.bat         # Automatische setup
│   └── test-orchestrator.ts      # Test script
└── README.md                     # Dit bestand
```

## 🚀 Installatie (Windows)

### Stap 1: Kopieer bestanden

Kopieer de hele `integration` map naar je project:

```
applicatie sparql/
├── integration/          ← NIEUW
│   ├── database/
│   ├── services/
│   └── scripts/
├── services/
│   └── geminiService.ts  ← WORDT VERVANGEN
└── ...
```

### Stap 2: Run setup script

```powershell
cd "C:\Users\HermanMiedema\...\applicatie sparql\integration"
.\scripts\setup-windows.bat
```

Dit script:
- Maakt database `competentnl_prompts`
- Laadt alle tabellen en seed data
- Installeert `mysql2` npm package

### Stap 3: Update .env.local

Voeg toe aan je `.env.local`:

```env
# Multi-Prompt Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=jouw_wachtwoord
DB_NAME=competentnl_prompts
```

### Stap 4: Kopieer services

```powershell
# Backup oude service
copy services\geminiService.ts services\geminiService.backup.ts

# Kopieer nieuwe services
copy integration\services\promptOrchestrator.ts services\
copy integration\services\geminiService.ts services\
```

### Stap 5: Test

```powershell
npx ts-node integration/scripts/test-orchestrator.ts
```

Je zou dit moeten zien:

```
[1] Orchestrator initialiseren...
    ✓ Verbonden met database

[2] Test: "Welke vaardigheden heeft een software engineer nodig?"
    Domein: skill
    Confidence: 85%
    Keywords: vaardigheden, nodig voor
    Voorbeelden: 3
```

## 🔧 Hoe het werkt

```
Vraag: "Welke vaardigheden heeft een kapper nodig?"
           │
           ▼
┌──────────────────────┐
│  KEYWORD MATCHING    │
│  • "vaardigheden" → skill (1.0)
│  • "nodig voor" → skill (0.7)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  DOMEIN: skill       │
│  Confidence: 85%     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  LAAD PROMPTS        │
│  • System prompt (skill expert)
│  • Schema elementen (HumanCapability, etc.)
│  • 3 relevante voorbeelden
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  GEASSEMBLEERDE      │
│  PROMPT → Gemini     │
└──────────┬───────────┘
           │
           ▼
    SPARQL Query
```

## 📊 De 7 Domeinen

| Domein | Keywords | Wat het bevat |
|--------|----------|---------------|
| `occupation` | beroep, functie, job, werk | 3.263 beroepen |
| `skill` | vaardigheid, competentie, kunnen | 137 vaardigheden |
| `knowledge` | kennisgebied, vakgebied | 361 kennisgebieden |
| `education` | opleiding, mbo, diploma | 1.856 opleidingen |
| `task` | taak, werkzaamheid | 4.613 taken |
| `taxonomy` | isco, esco, classificatie | Externe mappings |
| `comparison` | vergelijk, verschil | Cross-domein |

## 🛠️ Handmatig SQL uitvoeren

Als het setup script niet werkt:

```powershell
# Open MySQL console
& "C:\Program Files\MariaDB 11.8\bin\mysql" -u root -p

# In MySQL:
source C:/pad/naar/integration/database/001-complete-setup.sql;
source C:/pad/naar/integration/database/002-prompts-and-examples.sql;
```

## 📝 Nieuwe voorbeelden toevoegen

```sql
USE competentnl_prompts;

INSERT INTO domain_example_queries 
(domain_id, question_nl, sparql_query, query_pattern, difficulty, is_verified) 
VALUES
((SELECT id FROM prompt_domains WHERE domain_key = 'skill'),
 'Toon vaardigheden met RIASEC code A',
 'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  SELECT ?skill ?label ?riasec
  WHERE {
    ?skill a cnlo:HumanCapability ;
           skos:prefLabel ?label ;
           cnlo:hasRIASEC ?riasec .
    FILTER(CONTAINS(?riasec, "A"))
  }
  LIMIT 50',
 'search', 'intermediate', TRUE);
```

## 🐛 Troubleshooting

### "Cannot find module 'mysql2'"

```powershell
npm install mysql2
```

### "Access denied for user 'root'"

Check je wachtwoord in `.env.local`

### "Unknown database 'competentnl_prompts'"

Run setup opnieuw:
```powershell
.\scripts\setup-windows.bat
```

### "FULLTEXT index not found"

De database is niet correct aangemaakt. Verwijder en maak opnieuw:

```sql
DROP DATABASE competentnl_prompts;
```

Dan run setup opnieuw.

## 📈 Statistieken bekijken

```sql
SELECT * FROM v_domain_stats;
```

Of in TypeScript:

```typescript
const stats = await orchestrator.getStats();
console.table(stats);
```
