
const express = require('express');
const cors = require('cors');

/**
 * CompetentNL Local Proxy Server
 * Draai dit bestand met: node server.js
 */

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// of iets netter als JSON:
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/proxy/sparql', async (req, res) => {
  const { endpoint, query, key } = req.body;

  if (!endpoint || !query) {
    return res.status(400).json({ error: 'Endpoint and query are required' });
  }

  console.log(`[Proxy] Bevraag ${endpoint}...`);

  try {
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('format', 'application/sparql-results+json');
    if (key) params.append('key', key);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': key ? `Bearer ${key}` : '',
        'X-API-Key': key || ''
      },
      body: params
    });

    const data = await response.json();
    
    // Stuur statuscode door van het endpoint
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy Error]', error.message);
    res.status(500).json({ 
      error: 'Proxy kon geen verbinding maken met het SPARQL endpoint.',
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`
  🚀 CompetentNL Local Backend Proxy draait op http://localhost:${PORT}
  -------------------------------------------------------------
  Selecteer 'Lokale Backend' in de webapp instellingen.
  `);
});
