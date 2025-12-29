# CompetentNL Database Setup

Deze map bevat alles wat nodig is om de database vanaf nul op te zetten of te herstellen.

## Bestanden

| Bestand | Beschrijving |
|---------|--------------|
| `database-schema-complete.sql` | Database structuur (tabellen, views, indexes) |
| `sync-all-concepts.mjs` | Script dat data ophaalt van SPARQL endpoint |
| `database-backup-full.sql` | Volledige backup van je huidige database (plaats hier je backup) |

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
- ~360 kennisgebieden
- ~4600 taken
- Werkomstandigheden

## Herstellen van backup

Als je een bestaande backup hebt:

```powershell
Get-Content database/database-backup-full.sql | & "C:\Program Files\MariaDB 11.8\bin\mysql.exe" -u root -p
```

## Backup maken

Maak regelmatig een backup:

```powershell
& "C:\Program Files\MariaDB 11.8\bin\mysqldump.exe" -u root -p --databases competentnl_rag competentnl_prompts > database/database-backup-full.sql
```

## Sync opties

```powershell
# Alle concept types synchroniseren
node database/sync-all-concepts.mjs

# Alleen beroepen synchroniseren
node database/sync-all-concepts.mjs --type=occupation

# Alleen vaardigheden synchroniseren  
node database/sync-all-concepts.mjs --type=capability

# Toevoegen zonder te wissen (append mode)
node database/sync-all-concepts.mjs --skip-clear
```

## Vereisten

- MariaDB 11.x geïnstalleerd
- Node.js 18+
- `.env.local` met `COMPETENTNL_API_KEY`

## Database structuur

### competentnl_rag (7+ MiB)
- `occupation_labels` - Beroepen met synoniemen (~6 MiB)
- `education_labels` - Opleidingen
- `capability_labels` - Vaardigheden
- `knowledge_labels` - Kennisgebieden
- `task_labels` - Taken
- `workingcondition_labels` - Werkomstandigheden
- `user_feedback` - Gebruikersfeedback
- `query_logs` - Query logging
- `concept_selections` - Disambiguatie keuzes
- Views voor analytics

### competentnl_prompts (352 KiB)
- `prompt_domains` - Domeinen (occupation, skill, education, etc.)
- `classification_keywords` - Keywords per domein
- `domain_example_queries` - Voorbeeldqueries
- `domain_prompts` - Systeem prompts
- `orchestrator_config` - Configuratie
