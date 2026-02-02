# CompetentNL Database - Complete Setup Guide

Deze guide helpt je om de volledige CompetentNL database op te zetten op een nieuwe omgeving, inclusief CV Processing functionaliteit.

## 📋 Overzicht

De applicatie gebruikt **twee databases**:
- **`competentnl_rag`** - Hoofddatabase voor SPARQL data, matching, en CV processing
- **`competentnl_prompts`** - Prompts, logging, en orchestrator configuratie

## 🚀 Snelle Start (Nieuwe Installatie)

### Optie A: Vanaf Backup (Aanbevolen)

Als je een bestaande backup hebt (snelst):

```powershell
# Restore volledige backup
Get-Content database\database-backup-latest.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

### Optie B: Vanaf Nul (Volledig Vers)

```powershell
# Stap 1: Maak databases en schema aan
& "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p < database\001-complete-setup.sql

# Stap 2: Voeg prompts en configuratie toe
& "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p < database\002-prompts-and-examples.sql

# Stap 3: (Optioneel) Voeg CV Processing tables toe
& "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p < database\003-cv-privacy-tables.sql

# Stap 4: Synchroniseer data van SPARQL endpoint
node database\sync-all-concepts.mjs
```

## 📦 Database Schema Files

| Bestand | Database | Beschrijving |
|---------|----------|--------------|
| `001-complete-setup.sql` | competentnl_rag | Database + alle tabellen voor SPARQL matching |
| `002-prompts-and-examples.sql` | competentnl_prompts | Prompts, domeinen, keywords, logging |
| `003-cv-privacy-tables.sql` | competentnl_rag | CV upload, PII detection, privacy logging |
| `003-conversation-logging.sql` | competentnl_rag | Conversatie logging (legacy) |

## 🗄️ Database Structuur

### competentnl_rag (~8 MiB met data)

**SPARQL Concept Labels** (gevuld door sync script):
- `occupation_labels` - ~3200 beroepen met synoniemen
- `education_labels` - ~1800 opleidingen
- `capability_labels` - ~140 vaardigheden
- `knowledge_labels` - ~367 kennisgebieden
- `task_labels` - ~4600 taken
- `workingcondition_labels` - Werkomstandigheden

**Matching Algoritme**:
- `skill_idf_weights` - IDF gewichten voor 112 skills
- `concept_synonyms` - Algemene synoniemen mapping
- `occupation_synonyms` - Beroep-specifieke synoniemen

**CV Processing (Privacy-First)** ⭐ NIEUW:
- `user_cvs` - CV uploads met encryptie & privacy metadata
- `cv_extractions` - Geëxtraheerde work experience, education, skills
- `privacy_consent_logs` - GDPR audit trail (PII detectie, consent, LLM calls)

**Logging & Analytics**:
- `concept_search_log` - Zoekacties
- `occupation_search_log` - Beroep searches
- `query_feedback` - User feedback (like/dislike)
- `question_embeddings` - RAG voorbeelden

**Views**:
- `v_concept_stats` - Statistieken per concept type
- `v_idf_stats` - IDF gewichten samenvatting
- `v_failed_queries` - Mislukte queries voor debugging

### competentnl_prompts (~400 KiB)

**Orchestrator**:
- `prompt_domains` - Domeinen (occupation, skill, education)
- `classification_keywords` - Keywords voor domein detectie
- `domain_example_queries` - Voorbeeldqueries per domein
- `domain_prompts` - Systeem prompts
- `domain_schema_elements` - SPARQL schema info
- `orchestrator_config` - Orchestrator configuratie
- `query_log` - Query logging

**Views**:
- `v_active_prompts` - Actieve prompts overzicht
- `v_domain_stats` - Domein statistieken

## 🔧 Stap-voor-Stap Setup

### 1. Vereisten

- ✅ MariaDB 11.x geïnstalleerd en draaiend
- ✅ Node.js 18+ geïnstalleerd
- ✅ `.env.local` bestand met:
  ```env
  # Database
  DB_HOST=localhost
  DB_USER=root
  DB_PASSWORD=jouw_wachtwoord

  # SPARQL API
  COMPETENTNL_API_KEY=jouw_api_key

  # CV Processing (optioneel)
  ENCRYPTION_KEY=32_character_random_string_here
  GLINER_SERVICE_URL=http://localhost:8001
  ```

### 2. Database Schema Aanmaken

#### Via MariaDB console:

```powershell
& "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

In MariaDB console:
```sql
source C:/Users/JouwNaam/Documents/Github_c/sparqlcnl2/database/001-complete-setup.sql;
source C:/Users/JouwNaam/Documents/Github_c/sparqlcnl2/database/002-prompts-and-examples.sql;
source C:/Users/JouwNaam/Documents/Github_c/sparqlcnl2/database/003-cv-privacy-tables.sql;
```

#### Via PowerShell (alternatief):

```powershell
Get-Content database\001-complete-setup.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
Get-Content database\002-prompts-and-examples.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
Get-Content database\003-cv-privacy-tables.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

### 3. Data Synchroniseren

Vul de tabellen met data van het CompetentNL SPARQL endpoint:

```powershell
node database\sync-all-concepts.mjs
```

Dit duurt 5-10 minuten en haalt op:
- ~3200 beroepen met synoniemen (~6 MiB)
- ~1800 opleidingen
- ~140 vaardigheden
- ~367 kennisgebieden
- ~4600 taken
- ~112 IDF gewichten voor matching algoritme

### 4. Verificatie

Check of alles correct is geïnstalleerd:

```sql
-- Check competentnl_rag
USE competentnl_rag;
SELECT COUNT(*) as beroepen FROM occupation_labels;
SELECT COUNT(*) as vaardigheden FROM capability_labels;
SELECT COUNT(*) as kennisgebieden FROM knowledge_labels;
SELECT COUNT(*) as cv_tables_exist FROM information_schema.tables
WHERE table_schema = 'competentnl_rag' AND table_name = 'user_cvs';

-- Check competentnl_prompts
USE competentnl_prompts;
SELECT COUNT(*) as domeinen FROM prompt_domains;
SELECT COUNT(*) as prompts FROM domain_prompts;
```

Verwachte output:
- beroepen: ~3200
- vaardigheden: ~140
- kennisgebieden: ~367
- cv_tables_exist: 1
- domeinen: ~8
- prompts: ~8

## 💾 Backup & Restore

### Backup Maken

Met het PowerShell script (aanbevolen):

```powershell
.\database\create-backup.ps1
```

Of handmatig:

```powershell
& "C:\Program Files\MariaDB 11.8\bin\mysqldump.exe" -u root -p --databases competentnl_rag competentnl_prompts --single-transaction > database\database-backup-latest.sql
```

### Backup Restoren

```powershell
Get-Content database\database-backup-latest.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

## 🔄 Data Updates

### Sync Opties

```powershell
# Alles opnieuw synchroniseren
node database\sync-all-concepts.mjs

# Alleen beroepen
node database\sync-all-concepts.mjs --type=occupation

# Alleen vaardigheden
node database\sync-all-concepts.mjs --type=capability

# Alleen IDF weights
node database\sync-all-concepts.mjs --type=idf

# Append mode (niet eerst legen)
node database\sync-all-concepts.mjs --skip-clear
```

### IDF Weights Opnieuw Berekenen

Als de CompetentNL data significant verandert:

```powershell
# Bereken nieuwe weights van SPARQL endpoint
node calculate-idf-weights.js

# Importeer naar database
node database\sync-all-concepts.mjs --type=idf
```

## 🔐 CV Processing Setup (Optioneel)

Voor CV upload functionaliteit:

### 1. Database Tables

Als je stap 2 hebt overgeslagen:

```powershell
Get-Content database\003-cv-privacy-tables.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

### 2. GLiNER Service (PII Detection)

Start de lokale PII detection service:

```powershell
cd gliner-fastapi
python app.py
```

Draait op: http://localhost:8001

### 3. Environment Variables

In `.env.local`:

```env
# Genereer een 32-character random string
ENCRYPTION_KEY=your_32_character_encryption_key

# GLiNER service URL
GLINER_SERVICE_URL=http://localhost:8001
```

Genereer encryption key:

```powershell
# PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### 4. Test CV Upload

Open `test-cv-upload.html` in een browser en test met een PDF of Word CV.

## 📊 Database Sizes

Na volledige setup:

| Database | Size | Records |
|----------|------|---------|
| competentnl_rag | ~8 MiB | ~9000+ labels |
| competentnl_prompts | ~400 KiB | ~50+ config records |
| **Totaal** | **~8.4 MiB** | |

## 🛠️ Troubleshooting

### "Table already exists" errors

Als je opnieuw wilt installeren:

```sql
DROP DATABASE IF EXISTS competentnl_rag;
DROP DATABASE IF EXISTS competentnl_prompts;
```

Dan opnieuw setup script draaien.

### Sync script hangt

Het SPARQL endpoint kan traag zijn. Wacht 5-10 minuten. Bij timeout:

```powershell
# Probeer per type
node database\sync-all-concepts.mjs --type=occupation
node database\sync-all-concepts.mjs --type=capability
node database\sync-all-concepts.mjs --type=knowledge
```

### CV tables niet gevonden

Check of 003-cv-privacy-tables.sql is uitgevoerd:

```sql
SHOW TABLES FROM competentnl_rag LIKE 'user_cvs';
```

Als leeg, voer uit:

```powershell
Get-Content database\003-cv-privacy-tables.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

## 📚 Meer Informatie

- **README.md** - Project overzicht en features
- **DEVELOPMENT.md** - Development workflow en best practices
- **SETUP_CV_PROCESSING.md** - Gedetailleerde CV processing setup
- **database/README.md** - Database technische details

## 🔖 Versiegeschiedenis

| Versie | Datum | Wijzigingen |
|--------|-------|-------------|
| v4.1.0 | Feb 2025 | CV Processing toegevoegd (user_cvs, cv_extractions, privacy_consent_logs) |
| v3.2.0 | Dec 2024 | UNION queries opgesplitst voor SPARQL endpoint compatibility |
| v3.1.0 | Dec 2024 | IDF weights tabel en sync toegevoegd |
| v3.0.0 | Dec 2024 | Twee databases: competentnl_rag en competentnl_prompts |
