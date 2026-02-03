/**
 * Debug Script: Check altLabels in CNL SPARQL endpoint
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const SPARQL_ENDPOINT = process.env.SPARQL_ENDPOINT || process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
const SPARQL_API_KEY = process.env.COMPETENTNL_API_KEY || '';

async function runQuery(name: string, sparqlQuery: string): Promise<any[]> {
  console.log(`\n📡 ${name}...`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/sparql-results+json',
    'User-Agent': 'CompetentNL-Debug/1.0'
  };

  if (SPARQL_API_KEY) {
    headers['apikey'] = SPARQL_API_KEY;
  }

  const params = new URLSearchParams();
  params.append('query', sparqlQuery);
  params.append('format', 'application/sparql-results+json');

  const response = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers,
    body: params
  });

  if (!response.ok) {
    console.error(`  ❌ HTTP ${response.status}: ${response.statusText}`);
    const text = await response.text();
    console.error(`  Response: ${text.substring(0, 500)}`);
    return [];
  }

  const data = await response.json();
  return data.results?.bindings || [];
}

async function main() {
  console.log('🔍 CNL SPARQL AltLabels Debug\n');
  console.log(`Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`API Key: ${SPARQL_API_KEY ? SPARQL_API_KEY.substring(0, 8) + '...' : '(niet ingesteld)'}`);

  // Query 1: Count prefLabels and altLabels for occupations
  const countQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT
      (COUNT(DISTINCT ?prefLabel) AS ?prefCount)
      (COUNT(DISTINCT ?altLabel) AS ?altCount)
    WHERE {
      ?uri a cnlo:Occupation .
      OPTIONAL { ?uri skos:prefLabel ?prefLabel . FILTER(LANG(?prefLabel) = "nl") }
      OPTIONAL { ?uri skos:altLabel ?altLabel . FILTER(LANG(?altLabel) = "nl") }
    }
  `;

  const countResults = await runQuery('Telling prefLabels en altLabels voor Occupations', countQuery);
  if (countResults.length > 0) {
    console.log(`  prefLabels: ${countResults[0].prefCount?.value || 0}`);
    console.log(`  altLabels: ${countResults[0].altCount?.value || 0}`);
  }

  // Query 2: Check if altLabels exist without language filter
  const altLabelsNoLangQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT (COUNT(?altLabel) AS ?count) WHERE {
      ?uri a cnlo:Occupation .
      ?uri skos:altLabel ?altLabel .
    }
  `;

  const altNoLangResults = await runQuery('AltLabels zonder taalfilter', altLabelsNoLangQuery);
  if (altNoLangResults.length > 0) {
    console.log(`  Totaal altLabels (alle talen): ${altNoLangResults[0].count?.value || 0}`);
  }

  // Query 3: Check what language tags altLabels have
  const langTagsQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?lang (COUNT(?altLabel) AS ?count) WHERE {
      ?uri a cnlo:Occupation .
      ?uri skos:altLabel ?altLabel .
      BIND(LANG(?altLabel) AS ?lang)
    }
    GROUP BY ?lang
    ORDER BY DESC(?count)
    LIMIT 10
  `;

  const langResults = await runQuery('Talen van altLabels', langTagsQuery);
  console.log('  Verdeling:');
  for (const row of langResults) {
    const lang = row.lang?.value || '(geen)';
    const count = row.count?.value || 0;
    console.log(`    ${lang}: ${count}`);
  }

  // Query 4: Sample some altLabels to see what they look like
  const sampleAltQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?uri ?prefLabel ?altLabel (LANG(?altLabel) AS ?lang) WHERE {
      ?uri a cnlo:Occupation .
      ?uri skos:prefLabel ?prefLabel .
      ?uri skos:altLabel ?altLabel .
      FILTER(LANG(?prefLabel) = "nl")
    }
    LIMIT 10
  `;

  const sampleResults = await runQuery('Voorbeeld altLabels', sampleAltQuery);
  for (const row of sampleResults) {
    const prefLabel = row.prefLabel?.value || '?';
    const altLabel = row.altLabel?.value || '?';
    const lang = row.lang?.value || '(geen)';
    console.log(`  - ${prefLabel} → ${altLabel} [${lang}]`);
  }

  // Query 5: Check if maybe hiddenLabel or other properties are used
  const otherLabelsQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    SELECT ?predicate (COUNT(?label) AS ?count) WHERE {
      ?uri a cnlo:Occupation .
      ?uri ?predicate ?label .
      FILTER(
        ?predicate = skos:prefLabel ||
        ?predicate = skos:altLabel ||
        ?predicate = skos:hiddenLabel ||
        ?predicate = rdfs:label
      )
    }
    GROUP BY ?predicate
    ORDER BY DESC(?count)
  `;

  const otherLabelsResults = await runQuery('Alle label predicates', otherLabelsQuery);
  for (const row of otherLabelsResults) {
    const predicate = row.predicate?.value?.split('#').pop() || row.predicate?.value || '?';
    const count = row.count?.value || 0;
    console.log(`  - ${predicate}: ${count}`);
  }

  // Query 6: Test the UNION query directly
  const unionTestQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?labelType (COUNT(?label) AS ?count) WHERE {
      ?uri a cnlo:Occupation .
      {
        ?uri skos:prefLabel ?label .
        BIND("pref" AS ?labelType)
      } UNION {
        ?uri skos:altLabel ?label .
        BIND("alt" AS ?labelType)
      }
      FILTER(LANG(?label) = "nl")
    }
    GROUP BY ?labelType
  `;

  const unionResults = await runQuery('UNION query test (met nl filter)', unionTestQuery);
  for (const row of unionResults) {
    const labelType = row.labelType?.value || '?';
    const count = row.count?.value || 0;
    console.log(`  - ${labelType}: ${count}`);
  }

  // Query 7: Test UNION without language filter
  const unionNoLangQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?labelType (COUNT(?label) AS ?count) WHERE {
      ?uri a cnlo:Occupation .
      {
        ?uri skos:prefLabel ?label .
        BIND("pref" AS ?labelType)
      } UNION {
        ?uri skos:altLabel ?label .
        BIND("alt" AS ?labelType)
      }
    }
    GROUP BY ?labelType
  `;

  const unionNoLangResults = await runQuery('UNION query test (zonder taalfilter)', unionNoLangQuery);
  for (const row of unionNoLangResults) {
    const labelType = row.labelType?.value || '?';
    const count = row.count?.value || 0;
    console.log(`  - ${labelType}: ${count}`);
  }

  console.log('\n✅ Debug voltooid\n');
}

main().catch(console.error);
