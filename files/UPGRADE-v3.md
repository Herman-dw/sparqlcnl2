# CompetentNL v3.0.0 - Upgrade Instructies

## 🎯 Wat is nieuw?

Deze versie combineert:
1. **Multi-Prompt Orchestrator** - Dynamische domein-detectie en prompts
2. **Concept Resolver** - Disambiguatie van beroepen/synoniemen (bestaand)
3. **Chat History** - Vervolgvragen context (bestaand)
4. **RAG Examples** - Voorbeeldqueries uit beide databases

## 📦 Bestanden

```
integration/
├── server.combined.js              ← NIEUWE server (vervangt server.js)
├── services/
│   ├── geminiService.combined.ts   ← NIEUWE service (vervangt geminiService.ts)
│   ├── promptOrchestrator.ts       ← Orchestrator (nieuw)
│   └── geminiService.ts            ← Oude versie (backup)
├── database/
│   ├── 001-complete-setup.sql      ← Orchestrator database
│   └── 002-prompts-and-examples.sql
└── scripts/
    └── setup-windows.bat
```

## 🚀 Upgrade Stappen

### Stap 1: Backup maken

```powershell
cd C:\Users\HermanMiedema\Documents\Github_c\sparqlcnl2

# Backup huidige bestanden
Copy-Item server.js server.backup.js
Copy-Item services/geminiService.ts services/geminiService.backup.ts
```

### Stap 2: Orchestrator database opzetten (als nog niet gedaan)

```powershell
cd integration
.\scripts\setup-windows.bat
```

### Stap 3: .env.local aanpassen

Voeg toe aan `.env.local`:

```env
# Bestaande RAG database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=jouw_wachtwoord
DB_NAME=competentnl_rag

# Nieuwe Orchestrator database
DB_PROMPTS_NAME=competentnl_prompts
```

### Stap 4: Nieuwe bestanden installeren

```powershell
cd C:\Users\HermanMiedema\Documents\Github_c\sparqlcnl2

# Kopieer nieuwe server
Copy-Item integration/server.combined.js server.js -Force

# Kopieer nieuwe services
Copy-Item integration/services/geminiService.combined.ts services/geminiService.ts -Force
Copy-Item integration/services/promptOrchestrator.ts services/promptOrchestrator.ts
```

### Stap 5: Dependencies installeren

```powershell
npm install mysql2 dotenv
```

### Stap 6: Testen

```powershell
# Start backend
node server.js

# In andere terminal: start frontend
npm run dev
```

## 🔄 Hoe het nu werkt

```
Gebruikersvraag: "Welke vaardigheden heeft een kapper nodig?"
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  1. CONCEPT EXTRACTOR                                        │
│     Detecteert "kapper" als mogelijke beroepsnaam            │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  2. CONCEPT RESOLVER (backend)                               │
│     Zoekt in competentnl_rag.occupation_labels               │
│     → Vindt: "Kapper", "Dameskapper", "Herenkapper", etc.    │
│     → Meerdere matches? → DISAMBIGUATIE vraag                │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  3. ORCHESTRATOR (als geen disambiguatie nodig)              │
│     Classificeert vraag → Domein: "skill"                    │
│     Laadt: skill prompts + schema + voorbeelden              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  4. PROMPT ASSEMBLY                                          │
│     Combineert:                                              │
│     - Orchestrator prompt (domein-specifiek)                 │
│     - Opgeloste concepten ("kapper" → officiële naam)        │
│     - RAG voorbeelden (uit beide databases)                  │
│     - Chat history                                           │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  5. GEMINI AI                                                │
│     Genereert SPARQL met alle context                        │
└──────────────────────────────────────────────────────────────┘
```

## 📊 Databases

| Database | Inhoud | Gebruikt door |
|----------|--------|---------------|
| `competentnl_rag` | Beroepslabels, synoniemen, RAG voorbeelden, zoeklog | Concept Resolver |
| `competentnl_prompts` | Domeinen, keywords, prompts, domein-voorbeelden | Orchestrator |

## 🐛 Troubleshooting

### "Orchestrator not available"
- Check of `competentnl_prompts` database bestaat
- Check DB_PROMPTS_NAME in .env.local
- De app werkt nog steeds, maar zonder domein-detectie

### "Concept resolve failed"
- Check of `competentnl_rag` database bestaat
- Check of occupation_labels tabel gevuld is

### Beide databases werken niet
- Check of MariaDB draait
- Check DB_PASSWORD in .env.local

## ✅ Testen

Open http://localhost:5173 en test:

1. **Disambiguatie**: "Welke vaardigheden heeft een architect?" 
   → Moet vragen: "Welke architect bedoel je?"

2. **Domein-detectie**: "Toon alle MBO kwalificaties"
   → Console moet tonen: `[Orchestrator] Domein: education`

3. **Vervolgvraag**: Na vorige vraag: "Hoeveel zijn er?"
   → Moet context gebruiken

4. **Concept resolver**: "Vaardigheden van loodgieter"
   → Moet "loodgieter" resolven naar officiële naam
