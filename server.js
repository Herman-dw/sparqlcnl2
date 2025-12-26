
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Laad .env.local indien aanwezig
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
  console.log('[Backend] .env.local geladen');
} else {
  dotenv.config();
  console.log('[Backend] Standaard .env geladen');
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/proxy/sparql', async (req, res) => {
  const endpoint = process.env.COMPETENTNL_ENDPOINT || req.body.endpoint;
  const query = req.body.query;
  const key = process.env.COMPETENTNL_API_KEY || req.body.key;

  if (!endpoint || !query) {
    return res.status(400).json({ error: 'Endpoint en query zijn verplicht.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('format', 'application/sparql-results+json');

    const headers = {
      'Accept': 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CompetentNL-AI-Agent/1.0'
    };

    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
      headers['X-API-Key'] = key;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: params,
      timeout: 30000
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `CompetentNL server fout (${response.status})`,
        details: errorText 
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ 
      error: 'Proxy kon geen verbinding maken met het SPARQL endpoint.',
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`
  🚀 CompetentNL Proxy Server actief!
  -------------------------------------------------------------
  Poort:         ${PORT}
  Endpoint:      ${process.env.COMPETENTNL_ENDPOINT || 'Laden uit UI/Request...'}
  API-Key Status: ${process.env.COMPETENTNL_API_KEY ? '✅ Actief' : '❌ Niet gevonden in .env.local'}
  -------------------------------------------------------------
  `);
});
