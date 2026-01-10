/**
 * End-to-End Test: Beroep → SPARQL Query met URI
 * =================================================
 *
 * Test dat vaardigheden-vragen voor willekeurige beroepen:
 * 1. Een URI gebruiken in de query (VALUES statement)
 * 2. GEEN FILTER(CONTAINS(...)) gebruiken
 * 3. Daadwerkelijk vaardigheden retourneren (niet leeg)
 *
 * Bij disambiguatie: kies random één optie
 *
 * Moet 3x achter elkaar slagen met verschillende beroepen.
 */

import fetch from 'node-fetch';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environment
dotenv.config({ path: '.env.local' });

const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:3001';
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const SPARQL_ENDPOINT = 'https://api.sandbox.triply.cc/datasets/CompetentNL/CompetentNL-UWV/services/CompetentNL-UWV/sparql';

// Kleuren voor console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

/**
 * Genereer een random beroep uit een pre-defined lijst
 * (sneller en betrouwbaarder dan LLM calls)
 */
async function generateRandomOccupation() {
  const occupations = [
    'kapper',
    'loodgieter',
    'verpleger',
    'architect',
    'kok',
    'docent',
    'monteur',
    'bakker',
    'electriciën',
    'timmerman',
    'schoonmaker',
    'tuinman',
    'kassamedewerker',
    'buschauffeur',
    'secretaresse'
  ];

  const randomIndex = Math.floor(Math.random() * occupations.length);
  return occupations[randomIndex];
}

/**
 * Stel vraag aan backend via /generate endpoint
 */
async function askQuestion(question) {
  log(colors.cyan, `\n📤 Vraag: "${question}"`);

  const response = await fetch(`${BACKEND_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      chatHistory: []
    })
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Handle disambiguatie: kies random één optie
 */
async function handleDisambiguation(data, occupation) {
  if (!data.needsDisambiguation || !data.disambiguationData) {
    return null;
  }

  const options = data.disambiguationData.options || [];
  if (options.length === 0) {
    throw new Error('Disambiguatie nodig maar geen opties beschikbaar');
  }

  // Kies random optie
  const randomIndex = Math.floor(Math.random() * options.length);
  const selected = options[randomIndex];

  log(colors.yellow, `⚠️  Disambiguatie: ${options.length} opties gevonden`);
  log(colors.yellow, `   → Random gekozen: ${randomIndex + 1}. ${selected.prefLabel}`);

  // Stuur selectie terug
  const response = await fetch(`${BACKEND_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: `${randomIndex + 1}`,
      chatHistory: [
        { role: 'user', content: `wat zijn de vaardigheden van een ${occupation}` },
        { role: 'assistant', content: data.response }
      ],
      pendingDisambiguation: data.disambiguationData
    })
  });

  if (!response.ok) {
    throw new Error(`Disambiguatie response error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Valideer SPARQL query
 */
function validateQuery(sparql, occupation) {
  const checks = {
    hasSparql: false,
    hasValues: false,
    noFilterContains: true,
    hasRequiresHAT: false
  };

  if (!sparql || typeof sparql !== 'string') {
    return { valid: false, checks, reason: 'Geen SPARQL query gegenereerd' };
  }

  checks.hasSparql = true;

  // Check 1: Moet VALUES statement hebben
  if (/VALUES\s+\?occupation\s*\{\s*<[^>]+>\s*\}/i.test(sparql)) {
    checks.hasValues = true;
  }

  // Check 2: Mag GEEN FILTER(CONTAINS(...)) hebben voor occupation
  const filterContainsPattern = /FILTER\s*\(\s*CONTAINS\s*\(\s*LCASE\s*\(\s*\?occLabel/i;
  if (filterContainsPattern.test(sparql)) {
    checks.noFilterContains = false;
  }

  // Check 3: Moet requiresHAT predicate hebben
  if (/requiresHAT(Essential|Important)/i.test(sparql)) {
    checks.hasRequiresHAT = true;
  }

  const valid = checks.hasValues && checks.noFilterContains && checks.hasRequiresHAT;

  let reason = '';
  if (!checks.hasValues) {
    reason = '❌ Query gebruikt GEEN VALUES statement met URI';
  } else if (!checks.noFilterContains) {
    reason = '❌ Query gebruikt FILTER(CONTAINS(...)) in plaats van URI';
  } else if (!checks.hasRequiresHAT) {
    reason = '❌ Query mist requiresHAT predicate';
  }

  return { valid, checks, reason };
}

/**
 * Voer SPARQL query uit en check resultaten
 */
async function executeSparql(sparql) {
  const response = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-query',
      'Accept': 'application/sparql-results+json'
    },
    body: sparql
  });

  if (!response.ok) {
    throw new Error(`SPARQL endpoint error: ${response.status}`);
  }

  const data = await response.json();
  return data.results?.bindings || [];
}

/**
 * Run één test iteratie
 */
async function runTest(iteration) {
  log(colors.blue, `\n${'='.repeat(60)}`);
  log(colors.blue, `TEST ${iteration}/3`);
  log(colors.blue, '='.repeat(60));

  try {
    // Stap 1: Genereer random beroep
    log(colors.cyan, '\n🎲 Genereer random beroep...');
    const occupation = await generateRandomOccupation();
    log(colors.green, `   ✓ Beroep: "${occupation}"`);

    // Stap 2: Stel vraag
    const question = `wat zijn de vaardigheden van een ${occupation}`;
    let data = await askQuestion(question);

    // Stap 3: Handle disambiguatie indien nodig
    if (data.needsDisambiguation) {
      data = await handleDisambiguation(data, occupation);
      if (!data) {
        throw new Error('Disambiguatie afgebroken');
      }
    }

    // Stap 4: Valideer SPARQL query
    const sparql = data.sparql;

    log(colors.cyan, '\n📝 SPARQL Query:');
    log(colors.gray, sparql.split('\n').map(line => '   ' + line).join('\n'));

    log(colors.cyan, '\n🔍 Validatie:');
    const validation = validateQuery(sparql, occupation);

    log(colors.cyan, `   - Heeft VALUES statement: ${validation.checks.hasValues ? '✓' : '✗'}`);
    log(colors.cyan, `   - Geen FILTER(CONTAINS): ${validation.checks.noFilterContains ? '✓' : '✗'}`);
    log(colors.cyan, `   - Heeft requiresHAT: ${validation.checks.hasRequiresHAT ? '✓' : '✗'}`);

    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    log(colors.green, '   ✓ Query validatie geslaagd');

    // Stap 5: Voer query uit en check resultaten
    log(colors.cyan, '\n🚀 Voer SPARQL query uit...');
    const results = await executeSparql(sparql);

    if (results.length === 0) {
      throw new Error('❌ Query retourneert GEEN vaardigheden - beroep niet correct omgezet');
    }

    log(colors.green, `   ✓ ${results.length} vaardigheden gevonden`);
    log(colors.gray, `   Eerste 3: ${results.slice(0, 3).map(r => r.skillLabel?.value).join(', ')}`);

    // Stap 6: Success!
    log(colors.green, `\n✅ TEST ${iteration} GESLAAGD`);
    return { success: true, occupation, resultCount: results.length };

  } catch (error) {
    log(colors.red, `\n❌ TEST ${iteration} GEFAALD`);
    log(colors.red, `   Reden: ${error.message}`);
    return { success: false, occupation: 'unknown', error: error.message };
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n');
  log(colors.blue, '╔════════════════════════════════════════════════════════════╗');
  log(colors.blue, '║  End-to-End Test: URI Generation voor Beroepen            ║');
  log(colors.blue, '╚════════════════════════════════════════════════════════════╝');

  const results = [];

  // Run 3 tests
  for (let i = 1; i <= 3; i++) {
    const result = await runTest(i);
    results.push(result);

    if (!result.success) {
      break; // Stop bij eerste failure
    }

    // Wacht kort tussen tests
    if (i < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Finale rapport
  log(colors.blue, `\n${'='.repeat(60)}`);
  log(colors.blue, 'FINALE RAPPORT');
  log(colors.blue, '='.repeat(60));

  const successes = results.filter(r => r.success).length;

  results.forEach((result, i) => {
    const status = result.success ? '✅' : '❌';
    const occupation = result.occupation || 'unknown';
    const info = result.success
      ? `${result.resultCount} vaardigheden`
      : result.error;

    log(result.success ? colors.green : colors.red,
      `${status} Test ${i + 1}: ${occupation} - ${info}`);
  });

  console.log('');

  if (successes === 3) {
    log(colors.green, '🎉 ALLE TESTS GESLAAGD! Het systeem werkt correct.');
    process.exit(0);
  } else {
    log(colors.red, `💔 ${successes}/3 tests geslaagd. Fix het probleem!`);
    process.exit(1);
  }
}

// Check environment
if (!GEMINI_API_KEY) {
  log(colors.red, '❌ VITE_GEMINI_API_KEY niet gevonden in .env.local');
  process.exit(1);
}

// Run tests
main().catch(error => {
  log(colors.red, '❌ Fatal error:', error);
  process.exit(1);
});
