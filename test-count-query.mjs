/**
 * test-count-query.mjs
 * ====================
 * Test de COUNT query direct tegen de CompetentNL API
 * 
 * Gebruik: node test-count-query.mjs
 */

import dotenv from 'dotenv';
import fs from 'fs';

// Load environment
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const endpoint = process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
const apiKey = process.env.COMPETENTNL_API_KEY || '';

const query = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT (COUNT(DISTINCT ?occupation) AS ?aantalBeroepen) WHERE {
  ?occupation a cnlo:Occupation .
}`;

console.log('');
console.log('============================================');
console.log('  CompetentNL: Test COUNT Query');
console.log('============================================');
console.log('');
console.log('[Config]');
console.log('  Endpoint:', endpoint);
console.log('  API Key:', apiKey ? apiKey.substring(0, 8) + '...' : '(geen)');
console.log('');
console.log('[Query]');
console.log(query);
console.log('');

async function testQuery() {
  console.log('[Request] Versturen...');
  
  const params = new URLSearchParams();
  params.append('query', query);
  params.append('format', 'application/sparql-results+json');

  const headers = {
    'Accept': 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'CompetentNL-Test/1.0'
  };

  if (apiKey) {
    headers['apikey'] = apiKey;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: params
    });

    console.log('[Response]');
    console.log('  Status:', response.status, response.statusText);
    console.log('  Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('');
    console.log('[Body]');
    
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
      
      if (json.results?.bindings?.[0]) {
        console.log('');
        console.log('============================================');
        console.log('  ✓ SUCCES! Aantal beroepen:', json.results.bindings[0].aantalBeroepen?.value);
        console.log('============================================');
      }
    } catch (e) {
      console.log(text);
    }
    
  } catch (error) {
    console.error('');
    console.error('✗ FOUT:', error.message);
  }
}

testQuery();
