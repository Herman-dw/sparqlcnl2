# CompetentNL Database Setup

Deze map bevat alles wat nodig is om de database vanaf nul op te zetten of te herstellen.

> **🚀 Voor complete setup instructies, zie [SETUP-COMPLETE.md](./SETUP-COMPLETE.md)**

## Quick Links

- **[SETUP-COMPLETE.md](./SETUP-COMPLETE.md)** - Volledige setup guide voor nieuwe installaties
- **[create-backup.ps1](./create-backup.ps1)** - PowerShell script voor backup maken

## Bestanden

| Bestand | Beschrijving |
|---------|--------------|
| **Setup Scripts** | |
| `001-complete-setup.sql` | Database structuur competentnl_rag (v4.1.0) |
| `002-prompts-and-examples.sql` | Database structuur competentnl_prompts |
| `003-cv-privacy-tables.sql` | CV Processing tables (user_cvs, privacy logs) ⭐ NIEUW |
| `003-conversation-logging.sql` | Conversatie logging (legacy) |
| **Data Sync** | |
| `sync-all-concepts.mjs` | Script dat data ophaalt van SPARQL endpoint + IDF weights |
| `idf-weights.json` | Pre-berekende IDF gewichten voor vaardigheden |
| `calculate-idf-weights.js` | Script om IDF gewichten opnieuw te berekenen |
| `setup-idf-weights.js` | Standalone script om alleen IDF weights te importeren |
| **Backup** | |
| `create-backup.ps1` | PowerShell script voor backup maken ⭐ NIEUW |
| `database-backup-latest.sql` | Laatste backup (maak met create-backup.ps1) |
| **Legacy** | |
| `database-schema-complete.sql` | Oude schema (gebruik 001-complete-setup.sql) |
| `concept_resolver_schema.sql` | Legacy concept resolver |
| `occupation_resolver_schema.sql` | Legacy occupation resolver |
| `schema.sql` | Legacy schema |

## Installatie vanaf nul

### Stap 1: Schema aanmaken
```powershell
& "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

In MariaDB:
```sql
source C:/Users/HermanMiedema/Documents/Github_c/sparqlcnl2/database/database-schema-complete.sql
```

### Stap 2: Data synchroniseren van SPARQL endpoint
```powershell
cd C:\Users\HermanMiedema\Documents\Github_c\sparqlcnl2
node database/sync-all-concepts.mjs
```

Dit duurt 5-10 minuten en haalt op:
- ~3200 beroepen met synoniemen
- ~1800 opleidingen
- ~140 vaardigheden
- **~367 kennisgebieden** (361 prefLabels + 6 altLabels)
- ~4600 taken
- Werkomstandigheden
- **~112 IDF gewichten** (uit `idf-weights.json`)

## Herstellen van backup

Als je een bestaande backup hebt:

```powershell
Get-Content database/database-backup-full.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

## Backup maken

**Met PowerShell script (aanbevolen):**

```powershell
.\database\create-backup.ps1
```

Dit maakt automatisch:
- Timestamped backup: `database-backup-2025-02-02_143000.sql`
- Latest backup: `database-backup-latest.sql`

**Handmatig:**

```powershell
& "C:\Program Files\MariaDB 11.8\bin\mysqldump.exe" -u root -p --databases competentnl_rag competentnl_prompts --single-transaction > database\database-backup-latest.sql
```

## Sync opties

```powershell
# Alle concept types + IDF weights synchroniseren
node database/sync-all-concepts.mjs

# Alleen beroepen synchroniseren
node database/sync-all-concepts.mjs --type=occupation

# Alleen vaardigheden synchroniseren  
node database/sync-all-concepts.mjs --type=capability

# Alleen kennisgebieden synchroniseren
node database/sync-all-concepts.mjs --type=knowledge

# Alleen IDF weights synchroniseren
node database/sync-all-concepts.mjs --type=idf

# Alles behalve IDF weights
node database/sync-all-concepts.mjs --skip-idf

# Toevoegen zonder te wissen (append mode)
node database/sync-all-concepts.mjs --skip-clear
```

## IDF Weights (Matching Algoritme)

De `skill_idf_weights` tabel bevat gewichten voor het profiel-naar-beroep matching algoritme (zie `voorstel-matching-algoritme.md`).

### Wat zijn IDF weights?
- **IDF** = Inverse Document Frequency
- Skills die bij weinig beroepen voorkomen krijgen een **hoog gewicht** (meer onderscheidend)
- Skills die bij bijna alle beroepen voorkomen krijgen een **laag gewicht** (minder onderscheidend)

### Voorbeelden
| Skill | Coverage | IDF | Betekenis |
|-------|----------|-----|-----------|
| Verplegen | 9.3% | 2.37 | Zeer specifiek, hoog onderscheidend |
| Programmeren | 10.9% | 2.22 | Specifiek voor IT beroepen |
| Toewijding tonen | 99.97% | 0.00 | Universeel, niet onderscheidend |

### IDF weights opnieuw berekenen
Als de CompetentNL data verandert, kun je de IDF weights opnieuw berekenen:

```powershell
# Stap 1: Bereken nieuwe weights van SPARQL endpoint
node calculate-idf-weights.js

# Stap 2: Importeer naar database
node database/sync-all-concepts.mjs --type=idf
```

Of gebruik het standalone script:
```powershell
node setup-idf-weights.js
```

## Vereisten

- MariaDB 11.x geïnstalleerd
- Node.js 18+
- `.env.local` met:
  - `COMPETENTNL_API_KEY`
  - `DB_HOST` (standaard: localhost)
  - `DB_USER` (standaard: root)
  - `DB_PASSWORD`

## Database structuur

### competentnl_rag (~8 MiB)

**Concept labels (gevuld door sync script):**
- `occupation_labels` - Beroepen met synoniemen (~6 MiB, ~3200 records)
- `education_labels` - Opleidingen (~1800 records)
- `capability_labels` - Vaardigheden (~140 records)
- `knowledge_labels` - Kennisgebieden (~367 records)
- `task_labels` - Taken (~4600 records)
- `workingcondition_labels` - Werkomstandigheden

**Matching algoritme:**
- `skill_idf_weights` - IDF gewichten per vaardigheid (112 skills)

**CV Processing (Privacy-First)** ⭐ NIEUW v4.1.0:
- `user_cvs` - CV uploads met AES-256 encryptie, PII tracking, privacy scores
- `cv_extractions` - Werk ervaring, opleidingen, vaardigheden met CNL mapping
- `privacy_consent_logs` - GDPR audit trail (PII detectie, consent, LLM calls)

**Synoniemen & mapping:**
- `concept_synonyms` - Algemene synoniemen
- `occupation_synonyms` - Beroep-specifieke synoniemen

**Logging & analytics:**
- `concept_search_log` - Zoekacties logging
- `occupation_search_log` - Beroep zoekacties
- `query_feedback` - Gebruikersfeedback
- `question_embeddings` - RAG voorbeelden

**Views:**
- `v_concept_stats` - Statistieken per concept type
- `v_idf_stats` - IDF gewichten samenvatting
- `v_idf_by_category` - IDF per skill categorie
- `v_failed_queries` - Mislukte queries
- `v_top_examples` - Meest gebruikte voorbeelden

### competentnl_prompts (352 KiB)

**Orchestrator tabellen:**
- `prompt_domains` - Domeinen (occupation, skill, education, etc.)
- `classification_keywords` - Keywords per domein
- `domain_example_queries` - Voorbeeldqueries
- `domain_prompts` - Systeem prompts
- `domain_schema_elements` - Schema elementen per domein
- `orchestrator_config` - Configuratie
- `query_log` - Query logging

**Views:**
- `v_active_prompts` - Actieve prompts per domein
- `v_domain_stats` - Statistieken per domein

## Versiegeschiedenis

| Versie | Datum | Wijzigingen |
|--------|-------|-------------|
| v4.1.0 | Feb 2025 | **CV Processing** - user_cvs, cv_extractions, privacy_consent_logs tables; create-backup.ps1 script; SETUP-COMPLETE.md guide |
| v3.2.0 | Dec 2024 | UNION queries opgesplitst (fix SPARQL endpoint), clear logica verbeterd |
| v3.1.0 | Dec 2024 | IDF weights tabel en sync toegevoegd |
| v3.0.0 | Dec 2024 | Twee databases: competentnl_rag en competentnl_prompts |

## Bekende issues & oplossingen

### SPARQL endpoint limitaties
Het CompetentNL SPARQL endpoint (`sparql.competentnl.nl`) ondersteunt geen complexe queries met meerdere UNION statements. Daarom zijn alle queries in v3.2.0 opgesplitst in eenvoudige queries per label type (prefLabel, altLabel).

### Kennisgebieden synoniemen
Er zijn slechts 6 altLabels voor kennisgebieden. Dit is correct - de meeste kennisgebieden hebben alleen een prefLabel.
