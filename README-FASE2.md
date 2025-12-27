# CompetentNL SPARQL Agent v1.2.0 - Fase 2: RAG Integratie

## Nieuwe Features in Fase 2

### 🧠 RAG (Retrieval Augmented Generation)
- **Dynamische voorbeelden**: Voorbeeldqueries worden opgehaald op basis van similariteit met de gebruikersvraag
- **Vector search**: Embeddings worden opgeslagen in MariaDB voor snelle similarity search
- **Zelf-lerend systeem**: Succesvolle queries worden automatisch toegevoegd aan de database

### 📊 MariaDB Database
- Opslag van vraag-embeddings
- Query logging voor analyse
- Feedback tracking per voorbeeld
- Full-text search als fallback

### 📈 Verbeterde AI
- Context-aware query generatie
- Betere voorbeeldselectie op basis van relevantie
- Automatische categorisatie van vragen

## Installatie

### 1. Vereisten
- Node.js 18+
- MariaDB 10.5+ (of MySQL 8+)
- Gemini API key
- CompetentNL API key

### 2. Database Setup

```bash
# Start MariaDB (Windows met XAMPP/WAMP of Docker)
# Of installeer MariaDB: https://mariadb.org/download/

# Maak de database aan
mysql -u root -p < database/schema.sql
```

Of via phpMyAdmin/HeidiSQL: importeer `database/schema.sql`

### 3. Configuratie

```bash
# Kopieer environment template
cp .env.example .env.local

# Vul de waarden in:
# - COMPETENTNL_API_KEY
# - GEMINI_API_KEY
# - MARIADB_PASSWORD
```

### 4. Dependencies Installeren

```bash
npm install
```

### 5. Embeddings Genereren

```bash
# Genereer embeddings voor de voorbeeldvragen
npm run seed-db
```

Dit duurt ~1-2 minuten (model wordt gedownload).

### 6. Starten

```bash
npm run dev
```

## Projectstructuur

```
├── server.js                    # Backend met RAG endpoints
├── database/
│   ├── schema.sql              # Database schema
│   └── seed-embeddings.ts      # Embedding generator
├── services/
│   ├── geminiService.ts        # AI + RAG integratie
│   ├── ragService.ts           # RAG database service
│   └── embeddingService.ts     # Vector embeddings
├── App.tsx                      # Frontend
├── schema.ts                    # Schema documentatie
└── .env.local                   # Configuratie
```

## API Endpoints

### SPARQL Proxy
```
POST /proxy/sparql
Body: { query: string, endpoint?: string, key?: string }
```

### RAG Search
```
POST /rag/search
Body: { question: string, topK?: number }
Response: { embeddings: [...], method: 'vector' | 'fulltext' }
```

### RAG Add Example
```
POST /rag/add
Body: { question: string, sparql: string, category?: string }
```

### RAG Feedback
```
POST /rag/feedback
Body: { questionId: number, feedback: 'like' | 'dislike' }
```

### RAG Stats
```
GET /rag/stats
Response: { total_examples, total_queries, liked_queries, ... }
```

## Hoe RAG Werkt

1. **Gebruiker stelt vraag**: "Welke vaardigheden heeft een loodgieter?"

2. **Similarity Search**: 
   - Vraag wordt vergeleken met opgeslagen voorbeelden
   - Top 5 meest vergelijkbare worden geselecteerd

3. **Context Building**:
   - Geselecteerde voorbeelden worden toegevoegd aan AI prompt
   - Chat geschiedenis wordt meegenomen

4. **Query Generation**:
   - Gemini genereert SPARQL op basis van verrijkte context
   - Query wordt gevalideerd en uitgevoerd

5. **Feedback Loop**:
   - Gebruiker geeft 👍/👎
   - Feedback wordt opgeslagen bij gebruikte voorbeelden
   - Betere voorbeelden krijgen hogere score

## Database Schema

### question_embeddings
| Kolom | Type | Beschrijving |
|-------|------|--------------|
| id | INT | Primary key |
| question | TEXT | Natuurlijke taal vraag |
| sparql_query | TEXT | Bijbehorende SPARQL |
| embedding | JSON | Vector (384 dimensies) |
| category | ENUM | Vraag categorie |
| feedback_score | FLOAT | -1 tot 1 |
| usage_count | INT | Aantal keer gebruikt |

### query_logs
| Kolom | Type | Beschrijving |
|-------|------|--------------|
| id | INT | Primary key |
| session_id | VARCHAR | Sessie identifier |
| user_question | TEXT | Gestelde vraag |
| generated_sparql | TEXT | Gegenereerde query |
| similar_questions_used | JSON | IDs van gebruikte voorbeelden |
| user_feedback | ENUM | like/dislike/none |

## Troubleshooting

### Database connectie faalt
```bash
# Check of MariaDB draait
mysql -u root -p -e "SELECT 1"

# Check database bestaat
mysql -u root -p -e "SHOW DATABASES LIKE 'competentnl_rag'"
```

### Embeddings zijn leeg
```bash
# Herstart seed script
npm run seed-db

# Check in database
mysql -u root -p competentnl_rag -e "SELECT id, question, JSON_LENGTH(embedding) FROM question_embeddings"
```

### Server start niet
```bash
# Check poort 3001
netstat -ano | findstr :3001

# Kill bestaande processen
taskkill /F /IM node.exe
```

## Roadmap

- [ ] Browser-side embeddings (geen backend nodig)
- [ ] Automatisch nieuwe goede queries leren
- [ ] A/B testing van voorbeelden
- [ ] Export/import van RAG database
