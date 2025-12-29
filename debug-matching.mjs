/**
 * Debug script voor matching API
 * Run: node debug-matching.mjs
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'competentnl_rag',
  charset: 'utf8mb4'
};

const SPARQL_ENDPOINT = process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
const API_KEY = process.env.COMPETENTNL_API_KEY || '';

async function executeSparql(query) {
  const params = new URLSearchParams();
  params.append('query', query);
  params.append('format', 'application/sparql-results+json');

  const headers = {
    'Accept': 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (API_KEY) headers['apikey'] = API_KEY;

  const response = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers,
    body: params
  });

  if (!response.ok) {
    throw new Error(`SPARQL error ${response.status}`);
  }

  const data = await response.json();
  return data.results?.bindings || [];
}

async function debug() {
  console.log('\n🔍 MATCHING API DEBUG\n');
  console.log('='.repeat(70));
  
  const pool = await mysql.createPool(DB_CONFIG);
  
  // 1. Check capability_labels tabel
  console.log('\n1️⃣ CHECK: capability_labels tabel');
  try {
    const [capRows] = await pool.execute(`
      SELECT COUNT(*) as count FROM capability_labels
    `);
    console.log(`   ✅ capability_labels heeft ${capRows[0].count} rijen`);
    
    // Haal 3 voorbeelden
    const [samples] = await pool.execute(`
      SELECT DISTINCT capability_uri, pref_label 
      FROM capability_labels 
      LIMIT 3
    `);
    console.log('   📊 Voorbeelden uit lokale DB:');
    samples.forEach(r => {
      console.log(`      URI: ${r.capability_uri}`);
      console.log(`      Label: ${r.pref_label}\n`);
    });
  } catch (e) {
    console.log(`   ❌ capability_labels FOUT: ${e.message}`);
  }
  
  // 2. Haal skill URIs uit SPARQL
  console.log('\n2️⃣ CHECK: SPARQL skill URIs');
  try {
    const query = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT DISTINCT ?skill ?skillLabel
      WHERE {
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?skillLabel .
        FILTER(LANG(?skillLabel) = "nl")
      }
      LIMIT 3
    `;
    
    const bindings = await executeSparql(query);
    console.log('   📊 Voorbeelden uit SPARQL:');
    bindings.forEach(r => {
      console.log(`      URI: ${r.skill.value}`);
      console.log(`      Label: ${r.skillLabel.value}\n`);
    });
  } catch (e) {
    console.log(`   ❌ SPARQL FOUT: ${e.message}`);
  }
  
  // 3. VERGELIJK URI FORMATEN
  console.log('\n3️⃣ VERGELIJK: URI formaten');
  try {
    // Haal een specifiek skill op uit beide bronnen
    const [localRows] = await pool.execute(`
      SELECT capability_uri, pref_label 
      FROM capability_labels 
      WHERE pref_label = 'Programmeren'
      LIMIT 1
    `);
    
    const sparqlQuery = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT ?skill ?skillLabel
      WHERE {
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?skillLabel .
        FILTER(?skillLabel = "Programmeren"@nl)
      }
      LIMIT 1
    `;
    
    const sparqlRows = await executeSparql(sparqlQuery);
    
    console.log('   🔎 "Programmeren" vergelijking:');
    if (localRows.length > 0) {
      console.log(`      Lokale DB URI:  ${localRows[0].capability_uri}`);
    } else {
      console.log(`      Lokale DB URI:  ❌ NIET GEVONDEN`);
    }
    
    if (sparqlRows.length > 0) {
      console.log(`      SPARQL URI:     ${sparqlRows[0].skill.value}`);
    } else {
      console.log(`      SPARQL URI:     ❌ NIET GEVONDEN`);
    }
    
    // Check of ze matchen
    if (localRows.length > 0 && sparqlRows.length > 0) {
      const match = localRows[0].capability_uri === sparqlRows[0].skill.value;
      console.log(`      URIs matchen:   ${match ? '✅ JA' : '❌ NEE - DIT IS HET PROBLEEM!'}`);
    }
    
  } catch (e) {
    console.log(`   ❌ Vergelijking FOUT: ${e.message}`);
  }
  
  // 4. Check occupation-skill links in SPARQL
  console.log('\n4️⃣ CHECK: Occupation-skill links in SPARQL');
  try {
    const query = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      
      SELECT ?occ ?occLabel ?skill ?skillLabel
      WHERE {
        ?occ a cnlo:Occupation ;
             skos:prefLabel ?occLabel ;
             cnlo:requiresHATEssential ?skill .
        FILTER(LANG(?occLabel) = "nl")
        
        ?skill a cnlo:HumanCapability ;
               skos:prefLabel ?skillLabel .
        FILTER(LANG(?skillLabel) = "nl")
      }
      LIMIT 5
    `;
    
    const bindings = await executeSparql(query);
    console.log(`   ✅ ${bindings.length} occupation-skill links gevonden`);
    if (bindings.length > 0) {
      console.log('   📊 Voorbeeld:');
      const row = bindings[0];
      console.log(`      Beroep: ${row.occLabel.value}`);
      console.log(`      Skill: ${row.skillLabel.value}`);
      console.log(`      Skill URI: ${row.skill.value}`);
    }
  } catch (e) {
    console.log(`   ❌ SPARQL FOUT: ${e.message}`);
  }
  
  // 5. Test de volledige matching flow
  console.log('\n5️⃣ TEST: Volledige matching flow');
  try {
    const { matchProfile, preloadCache } = await import('./profile-matching-api.mjs');
    
    // Eerst cache laden
    console.log('   Loading cache...');
    await preloadCache();
    
    const testProfile = {
      skills: ['Programmeren'],
      knowledge: [],
      tasks: []
    };
    
    console.log(`   Profile: skills=['Programmeren']`);
    
    const result = await matchProfile(testProfile, { 
      limit: 5, 
      minScore: 0.001,  // Zeer lage drempel
      includeGaps: false,
      includeMatched: true 
    });
    
    console.log(`\n   📊 Resultaat:`);
    console.log(`      Success: ${result.success}`);
    console.log(`      Matches: ${result.matches?.length || 0}`);
    console.log(`      Candidates: ${result.meta?.totalCandidates}`);
    console.log(`      Matched candidates: ${result.meta?.matchedCandidates}`);
    
    if (result.meta?.resolvedProfile?.skills?.length > 0) {
      console.log('\n   🔗 Resolved skills:');
      result.meta.resolvedProfile.skills.forEach(s => {
        console.log(`      "${s.input}" → URI: ${s.uri}`);
      });
    } else {
      console.log('\n   ❌ Geen skills geresolveert!');
    }
    
    if (result.matches?.length > 0) {
      console.log('\n   🎯 Top 3 matches:');
      result.matches.slice(0, 3).forEach((m, i) => {
        console.log(`      ${i+1}. ${m.occupation.label}: ${(m.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('\n   ❌ GEEN MATCHES - Overlap check faalt');
      console.log('      Dit betekent dat de geresolveerte URI niet voorkomt');
      console.log('      in de occupation-skill links uit SPARQL.');
    }
    
  } catch (e) {
    console.log(`   ❌ Test FOUT: ${e.message}`);
    console.log(e.stack);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('Debug complete\n');
  
  await pool.end();
  process.exit(0);
}

debug().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
