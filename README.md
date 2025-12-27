# CompetentNL SPARQL AI Agent

Een intelligente NL-naar-SPARQL agent voor het bevragen van CompetentNL en ESCO data met AI-ondersteuning, SPARQL validatie en Excel export.

## Features

- 🗣️ **Natuurlijke taal naar SPARQL** - Stel vragen in het Nederlands
- 🧠 **Chatgeschiedenis** - Vervolgvragen stellen met context
- 📊 **Automatisch tellen** - Toont totaal aantal resultaten met optie om alles te laden
- ✅ **SPARQL Validatie** - Controleert queries voordat ze uitgevoerd worden
- 👍👎 **Feedback systeem** - Like/dislike voor verbetering
- 📥 **Excel export** - Download resultaten als .xlsx
- 🎨 **Moderne UI** - Clean, responsive interface

## Installatie

### Vereisten
- Node.js 18+
- npm of yarn
- Gemini API key (gratis via https://aistudio.google.com/apikey)
- CompetentNL API key

### Setup

1. Clone de repository:
```bash
git clone https://github.com/[username]/competentnl-sparql-agent.git
cd competentnl-sparql-agent
```

2. Installeer dependencies:
```bash
npm install
```

3. Maak een `.env.local` bestand:
```env
COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
COMPETENTNL_API_KEY=jouw_competentnl_api_key
GEMINI_API_KEY=jouw_gemini_api_key
```

4. Start de applicatie:
```bash
npm run dev
```

De app draait op:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Projectstructuur

```
├── App.tsx                     # Hoofd React component
├── index.tsx                   # React entry point
├── index.html                  # HTML template
├── types.ts                    # TypeScript types
├── constants.ts                # Configuratie constanten
├── schema.ts                   # CompetentNL schema documentatie
├── server.js                   # Express backend proxy
├── vite.config.ts              # Vite configuratie
├── package.json                # Dependencies
├── .env.local                  # API keys (niet committen!)
└── services/
    ├── geminiService.ts        # Gemini AI integratie
    ├── sparqlService.ts        # SPARQL query uitvoering
    ├── sparqlValidator.ts      # Query validatie
    ├── feedbackService.ts      # Feedback logging
    └── excelService.ts         # Excel export
```

## Gebruik

### Voorbeeldvragen

- "Welke vaardigheden heeft een kapper nodig?"
- "Toon alle kennisgebieden"
- "Welke beroepen vereisen leidinggeven?"
- "Wat zijn de taken van een verpleegkundige?"
- "Vergelijk kapper en schoonheidsspecialist"

### Vervolgvragen

De agent onthoudt de context, dus je kunt vervolgvragen stellen:
1. "Welke vaardigheden heeft een leraar nodig?"
2. "Welke daarvan zijn essentieel?"
3. "En welke beroepen hebben dezelfde vaardigheden?"

### Alle resultaten laden

Bij grote datasets toont de app eerst 50 resultaten met de vraag:
> "Er zijn 137 resultaten. Wil je ze allemaal zien?"

Klik op "Toon alle X resultaten" om alles te laden.

## API Keys

### CompetentNL API Key
Vraag aan via de CompetentNL website of contacteer het team.

### Gemini API Key
1. Ga naar https://aistudio.google.com/apikey
2. Log in met je Google account
3. Klik "Create API Key"
4. Kopieer de key naar `.env.local`

## Technische details

### CompetentNL Schema

De knowledge graph bevat:
- **Occupation** (3263) - Beroepen
- **HumanCapability** (137) - Vaardigheden
- **KnowledgeArea** (361) - Kennisgebieden
- **EducationalNorm** (1856) - Opleidingsnormen
- **OccupationTask** (4613) - Beroepstaken

### Belangrijke relaties
- `cnlo:requiresHATEssential` - Essentiële vaardigheden
- `cnlo:requiresHATImportant` - Belangrijke vaardigheden
- `cnluwv:isCharacterizedByOccupationTask_Essential` - Taken

### SPARQL beperkingen
- Geen `FROM <graph>` clauses (API ondersteunt dit niet)
- Altijd `LIMIT` gebruiken
- Alleen lees-queries (SELECT, ASK)

## Development

### Scripts

```bash
npm run dev          # Start frontend + backend
npm run start        # Alias voor dev
npm run start-frontend  # Alleen frontend
npm run start-backend   # Alleen backend
```

### Feedback analyseren

Feedback wordt opgeslagen in localStorage. Exporteer via:
- UI: Sidebar → Feedback → Exporteer CSV
- Console: `localStorage.getItem('competentnl_feedback')`

## Licentie

MIT

## Contact

Voor vragen over CompetentNL data: [CompetentNL website]
Voor vragen over deze agent: [GitHub Issues]
