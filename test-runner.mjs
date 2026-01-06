/**
 * CompetentNL Test Runner v4.1.0
 * ================================
 * Met gedetailleerde logging voor debugging
 * 
 * Gebruik:
 *   node test-runner.mjs
 *   node test-runner.mjs --scenario=1
 *   node test-runner.mjs --verbose
 * 
 * Output:
 *   - Console: samenvatting
 *   - test-results.log: gedetailleerde log voor debugging
 *   - test-results.json: machine-readable resultaten
 */

import fs from 'fs';

// ============================================================
// CONFIGURATIE
// ============================================================

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const LOG_FILE = 'test-results.log';
const JSON_FILE = 'test-results.json';

// Parse command line args
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const SPECIFIC_SCENARIO = args.find(a => a.startsWith('--scenario='))?.split('=')[1];

// ============================================================
// LOGGING
// ============================================================

let logBuffer = [];

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  logBuffer.push(line);
  if (VERBOSE || level === 'ERROR') {
    console.log(line);
  }
}

function logSection(title) {
  const separator = '='.repeat(70);
  log(separator);
  log(title);
  log(separator);
}

function logJson(label, obj) {
  log(`${label}:`);
  const jsonStr = JSON.stringify(obj, null, 2);
  jsonStr.split('\n').forEach(line => log(`  ${line}`));
}

function saveLog() {
  fs.writeFileSync(LOG_FILE, logBuffer.join('\n'), 'utf-8');
  console.log(`\n📄 Gedetailleerde log opgeslagen: ${LOG_FILE}`);
}

// ============================================================
// TEST SCENARIOS
// ============================================================

const TEST_SCENARIOS = [
  {
    id: '1',
    name: 'Disambiguatie: Architect',
    description: 'Bij "architect" moet het systeem vragen welke architect bedoeld wordt',
    endpoint: '/concept/resolve',
    method: 'POST',
    payload: { searchTerm: 'architect', conceptType: 'occupation' },
    validations: [
      { 
        field: 'needsDisambiguation', 
        expected: true, 
        description: 'Moet disambiguatie triggeren'
      },
      { 
        field: 'matches', 
        check: 'isArray',
        minLength: 2,
        description: 'Moet meerdere matches retourneren'
      },
      {
        field: 'disambiguationQuestion',
        check: 'contains',
        value: 'welke',
        caseInsensitive: true,
        description: 'Vraag moet "welke" bevatten'
      }
    ]
  },
  {
    id: '1a',
    name: 'Feedback endpoint',
    description: 'Feedback moet opgeslagen kunnen worden',
    endpoint: '/feedback',
    method: 'POST',
    payload: { 
      rating: 5, 
      feedbackType: 'helpful', 
      comment: 'Test feedback',
      sessionId: 'test-session',
      context: { question: 'test vraag' }
    },
    validations: [
      { 
        field: 'success', 
        expected: true, 
        description: 'Feedback moet succesvol opgeslagen worden'
      }
    ]
  },
  {
    id: '2',
    name: 'Domein-detectie: MBO Kwalificaties',
    description: 'Vraag over MBO moet domein "education" detecteren',
    endpoint: '/orchestrator/classify',
    method: 'POST',
    payload: { question: 'Toon alle MBO kwalificaties' },
    validations: [
      { 
        field: 'primary.domainKey', 
        expected: 'education', 
        description: 'Domein moet "education" zijn'
      },
      {
        field: 'primary.confidence',
        check: 'greaterThan',
        value: 0.5,
        description: 'Confidence moet > 0.5 zijn'
      }
    ]
  },
  {
    id: '2a',
    name: 'SPARQL generatie: MBO query',
    description: 'MBO vraag moet SPARQL met MboKwalificatie genereren',
    endpoint: '/generate',
    method: 'POST',
    payload: { 
      question: 'Toon alle MBO kwalificaties',
      filters: { graphs: [], type: 'All', status: 'Current' }
    },
    validations: [
      { 
        field: 'sparql', 
        check: 'contains',
        value: 'MboKwalificatie',
        description: 'SPARQL moet MboKwalificatie bevatten'
      },
      {
        field: 'sparql',
        check: 'contains',
        value: 'SELECT',
        description: 'SPARQL moet SELECT bevatten'
      }
    ]
  },
  {
    id: '3',
    name: 'Vervolgvraag met context',
    description: '"Hoeveel zijn er?" moet context van vorige vraag gebruiken',
    endpoint: '/generate',
    method: 'POST',
    payload: { 
      question: 'Hoeveel zijn er?',
      filters: { graphs: [], type: 'All', status: 'Current' },
      chatHistory: [
        { role: 'user', content: 'Toon alle MBO kwalificaties' },
        { role: 'assistant', content: 'Hier zijn de MBO kwalificaties', sparql: 'SELECT ?k WHERE { ?k a ksmo:MboKwalificatie }' }
      ]
    },
    validations: [
      { 
        field: 'sparql', 
        check: 'contains',
        value: 'COUNT',
        description: 'SPARQL moet COUNT bevatten voor "hoeveel"'
      },
      {
        field: 'contextUsed',
        expected: true,
        description: 'Context moet gebruikt zijn'
      }
    ]
  },
  {
    id: '4',
    name: 'Concept resolver: Loodgieter',
    description: '"Loodgieter" moet resolved worden naar officiële naam',
    endpoint: '/concept/resolve',
    method: 'POST',
    payload: { searchTerm: 'loodgieter', conceptType: 'occupation' },
    validations: [
      { 
        field: 'found', 
        expected: true, 
        description: 'Moet gevonden worden'
      },
      {
        field: 'needsDisambiguation',
        expected: false,
        description: 'Geen disambiguatie nodig (unieke match)'
      },
      {
        field: 'resolvedLabel',
        check: 'exists',
        description: 'Moet een resolvedLabel hebben'
      }
    ]
  },
  {
    id: '5',
    name: 'Opleiding: Vaardigheden + Kennisgebieden',
    description: 'Vraag over opleiding moet zowel skills als knowledge retourneren',
    endpoint: '/generate',
    method: 'POST',
    payload: { 
      question: 'Wat leer je bij de opleiding werkvoorbereider installaties?',
      filters: { graphs: [], type: 'All', status: 'Current' }
    },
    validations: [
      { 
        field: 'sparql', 
        check: 'contains',
        value: 'prescribesHATEssential',
        description: 'SPARQL moet prescribesHATEssential bevatten (vaardigheden)'
      },
      {
        field: 'sparql',
        check: 'contains',
        value: 'prescribesKnowledge',
        description: 'SPARQL moet prescribesKnowledge bevatten (kennisgebieden)'
      },
      {
        field: 'sparql',
        check: 'contains',
        value: 'LIMIT',
        description: 'SPARQL moet LIMIT bevatten (zelfde validatie als UI)'
      }
    ]
  },
  {
    id: '6',
    name: 'RIASEC Hollandcode',
    description: 'Vraag over RIASEC R moet hasRIASEC predikaat gebruiken',
    endpoint: '/generate',
    method: 'POST',
    payload: { 
      question: 'Geef alle vaardigheden die een relatie hebben met R (RIASEC)',
      filters: { graphs: [], type: 'All', status: 'Current' }
    },
    validations: [
      { 
        field: 'sparql', 
        check: 'contains',
        value: 'hasRIASEC',
        description: 'SPARQL moet hasRIASEC bevatten'
      },
      {
        field: 'sparql',
        check: 'contains',
        value: 'LIMIT',
        description: 'SPARQL moet LIMIT bevatten (zelfde validatie als UI)'
      },
      {
        field: 'sparql',
        check: 'regex',
        pattern: '["\']R["\']',
        description: 'SPARQL moet "R" als waarde hebben'
      }
    ]
  }
];

// ============================================================
// API HELPERS
// ============================================================

async function callAPI(endpoint, method, payload) {
  const url = `${BACKEND_URL}${endpoint}`;
  log(`API Call: ${method} ${url}`);
  logJson('Request payload', payload);
  
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    log(`Response status: ${response.status}`);
    logJson('Response data', data);
    
    return { success: true, status: response.status, data };
  } catch (error) {
    log(`API Error: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
}

async function checkHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function validateField(data, validation) {
  const value = getNestedValue(data, validation.field);
  
  const result = {
    validation: validation.description,
    field: validation.field,
    actualValue: value,
    passed: false,
    reason: ''
  };
  
  // Check type of validation
  if (validation.expected !== undefined) {
    // Exact match
    result.expectedValue = validation.expected;
    result.passed = value === validation.expected;
    result.reason = result.passed 
      ? 'Exact match' 
      : `Verwacht: ${JSON.stringify(validation.expected)}, Kreeg: ${JSON.stringify(value)}`;
  }
  else if (validation.check === 'isArray') {
    result.passed = Array.isArray(value);
    if (result.passed && validation.minLength) {
      result.passed = value.length >= validation.minLength;
      result.reason = result.passed
        ? `Array met ${value.length} items (min: ${validation.minLength})`
        : `Array te kort: ${value.length} items (min: ${validation.minLength})`;
    } else {
      result.reason = result.passed ? 'Is een array' : 'Is geen array';
    }
  }
  else if (validation.check === 'contains') {
    const searchValue = validation.caseInsensitive 
      ? validation.value.toLowerCase() 
      : validation.value;
    const actualValue = validation.caseInsensitive 
      ? String(value || '').toLowerCase() 
      : String(value || '');
    
    result.passed = actualValue.includes(searchValue);
    result.reason = result.passed
      ? `Bevat "${validation.value}"`
      : `Bevat NIET "${validation.value}"`;
    result.searchedFor = validation.value;
  }
  else if (validation.check === 'regex') {
    const regex = new RegExp(validation.pattern);
    result.passed = regex.test(String(value || ''));
    result.reason = result.passed
      ? `Matcht regex: ${validation.pattern}`
      : `Matcht NIET regex: ${validation.pattern}`;
  }
  else if (validation.check === 'exists') {
    result.passed = value !== undefined && value !== null;
    result.reason = result.passed ? 'Waarde bestaat' : 'Waarde is undefined/null';
  }
  else if (validation.check === 'greaterThan') {
    result.passed = typeof value === 'number' && value > validation.value;
    result.reason = result.passed
      ? `${value} > ${validation.value}`
      : `${value} is NIET > ${validation.value}`;
  }
  
  return result;
}

// ============================================================
// TEST RUNNER
// ============================================================

async function runScenario(scenario) {
  logSection(`TEST ${scenario.id}: ${scenario.name}`);
  log(`Beschrijving: ${scenario.description}`);
  
  const startTime = Date.now();
  
  // Call API
  const apiResult = await callAPI(scenario.endpoint, scenario.method, scenario.payload);
  
  const duration = Date.now() - startTime;
  log(`Duur: ${duration}ms`);
  
  if (!apiResult.success) {
    return {
      id: scenario.id,
      name: scenario.name,
      passed: false,
      duration,
      error: apiResult.error,
      validationResults: [],
      apiResponse: null,
      suggestion: `Backend endpoint ${scenario.endpoint} is niet bereikbaar. Check of de server draait.`
    };
  }
  
  // Run validations
  const validationResults = scenario.validations.map(v => validateField(apiResult.data, v));
  const allPassed = validationResults.every(v => v.passed);
  
  // Log validation results
  log('');
  log('Validatie resultaten:');
  validationResults.forEach((v, i) => {
    const icon = v.passed ? '✅' : '❌';
    log(`  ${icon} ${v.validation}`);
    log(`     Field: ${v.field}`);
    log(`     ${v.reason}`);
    if (!v.passed && v.actualValue !== undefined) {
      log(`     Actual value: ${JSON.stringify(v.actualValue).substring(0, 200)}`);
    }
  });
  
  // Generate fix suggestion if failed
  let suggestion = '';
  if (!allPassed) {
    suggestion = generateFixSuggestion(scenario, validationResults, apiResult.data);
    log('');
    log(`💡 Suggestie: ${suggestion}`, 'WARN');
  }
  
  return {
    id: scenario.id,
    name: scenario.name,
    passed: allPassed,
    duration,
    validationResults,
    apiResponse: apiResult.data,
    suggestion
  };
}

function generateFixSuggestion(scenario, validationResults, apiResponse) {
  const failedValidations = validationResults.filter(v => !v.passed);
  
  // Scenario-specific suggestions
  if (scenario.id === '1') {
    if (failedValidations.some(v => v.field === 'needsDisambiguation')) {
      return `De occupation_labels tabel bevat mogelijk maar één "architect" entry. ` +
             `Voeg meer architecten toe aan de database: INSERT INTO occupation_labels (occupation_uri, pref_label, label, label_type) VALUES ` +
             `('uri/architect-2', 'Software architect', 'Architect', 'altLabel');`;
    }
  }
  
  if (scenario.id === '2') {
    if (failedValidations.some(v => v.field.includes('domainKey'))) {
      const actualDomain = apiResponse?.primary?.domainKey;
      return `Domein detectie retourneert "${actualDomain}" ipv "education". ` +
             `Check de classification_keywords tabel voor "mbo" en "kwalificatie" met domain_id voor education. ` +
             `Of update server.js classifyQuestion() functie.`;
    }
  }
  
  if (scenario.id === '3') {
    if (failedValidations.some(v => v.field === 'contextUsed')) {
      return `chatHistory wordt niet doorgegeven of niet verwerkt. ` +
             `Check of generateSparqlInternal() de chatHistory parameter gebruikt en contextUsed retourneert.`;
    }
    if (failedValidations.some(v => v.searchedFor === 'COUNT')) {
      return `Follow-up detectie werkt niet. Check isFollowUpQuestion() logica in server.js of geminiService.ts. ` +
             `De vraag "Hoeveel zijn er?" moet een COUNT query genereren.`;
    }
  }
  
  if (scenario.id === '4') {
    if (failedValidations.some(v => v.field === 'found')) {
      return `"Loodgieter" niet gevonden in occupation_labels. ` +
             `INSERT INTO occupation_labels (occupation_uri, pref_label, label, label_type) VALUES ` +
             `('uri/installateur', 'Installatiemonteur sanitair', 'Loodgieter', 'altLabel');`;
    }
  }
  
  if (scenario.id === '5') {
    const missing = [];
    if (failedValidations.some(v => v.searchedFor === 'prescribesHATEssential')) missing.push('vaardigheden');
    if (failedValidations.some(v => v.searchedFor === 'prescribesKnowledge')) missing.push('kennisgebieden');
    if (missing.length > 0) {
      return `SPARQL query mist ${missing.join(' en ')}. ` +
             `Update de opleiding-detectie in server.js /generate endpoint om UNION te gebruiken voor beide predicaten.`;
    }
  }
  
  if (scenario.id === '6') {
    if (failedValidations.some(v => v.searchedFor === 'hasRIASEC')) {
      return `RIASEC detectie werkt niet. Check of "riasec" of "hollandcode" pattern matching werkt in server.js. ` +
             `De SPARQL moet "cnlo:hasRIASEC" bevatten.`;
    }
  }
  
  // Generic suggestion
  return `Check de ${scenario.endpoint} endpoint in server.js. ` +
         `Verwachte velden: ${failedValidations.map(v => v.field).join(', ')}`;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     CompetentNL Test Runner v4.1.0                        ║');
  console.log('║     Met gedetailleerde logging voor debugging             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  log('Test run gestart');
  log(`Backend URL: ${BACKEND_URL}`);
  
  // Health check
  console.log('🔍 Backend health check...');
  const healthy = await checkHealth();
  if (!healthy) {
    console.log('❌ Backend niet bereikbaar op ' + BACKEND_URL);
    console.log('   Start eerst de backend met: node server.js');
    process.exit(1);
  }
  console.log('✅ Backend is online\n');
  log('Backend health check: OK');
  
  // Filter scenarios if specific one requested
  let scenarios = TEST_SCENARIOS;
  if (SPECIFIC_SCENARIO) {
    scenarios = TEST_SCENARIOS.filter(s => s.id === SPECIFIC_SCENARIO);
    if (scenarios.length === 0) {
      console.log(`❌ Scenario ${SPECIFIC_SCENARIO} niet gevonden`);
      console.log(`   Beschikbare scenarios: ${TEST_SCENARIOS.map(s => s.id).join(', ')}`);
      process.exit(1);
    }
  }
  
  // Run tests
  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    results.push(result);
    
    // Console output
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} Test ${result.id}: ${result.name} (${result.duration}ms)`);
    if (!result.passed && result.suggestion) {
      console.log(`   💡 ${result.suggestion.substring(0, 100)}...`);
    }
  }
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 RESULTAAT: ${passed}/${results.length} tests geslaagd`);
  if (failed > 0) {
    console.log(`\n❌ Gefaalde tests:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   • ${r.id}: ${r.name}`);
    });
  }
  console.log('═'.repeat(60));
  
  // Save logs
  logSection('SAMENVATTING');
  log(`Totaal: ${results.length} tests`);
  log(`Geslaagd: ${passed}`);
  log(`Gefaald: ${failed}`);
  
  saveLog();
  
  // Save JSON results
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    backendUrl: BACKEND_URL,
    summary: { total: results.length, passed, failed },
    results: results.map(r => ({
      id: r.id,
      name: r.name,
      passed: r.passed,
      duration: r.duration,
      validationResults: r.validationResults,
      suggestion: r.suggestion,
      // Include truncated API response for debugging
      apiResponsePreview: JSON.stringify(r.apiResponse).substring(0, 500)
    }))
  };
  
  fs.writeFileSync(JSON_FILE, JSON.stringify(jsonOutput, null, 2), 'utf-8');
  console.log(`📄 JSON resultaten opgeslagen: ${JSON_FILE}`);
  
  // Exit with error code if tests failed
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
