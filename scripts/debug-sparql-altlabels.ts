/**
 * Debug Script: Check SKOS-XL labels in CNL SPARQL endpoint
 *
 * CNL gebruikt SKOS-XL (extended labels) in plaats van standaard SKOS.
 * Labels zijn DetailedLabel objecten met de tekst in skosxl:literalForm.
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
  console.log('🔍 CNL SPARQL SKOS-XL Labels Debug\n');
  console.log(`Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`API Key: ${SPARQL_API_KEY ? SPARQL_API_KEY.substring(0, 8) + '...' : '(niet ingesteld)'}`);

  // Query 1: Count SKOS-XL labels per type
  const skosxlCountQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
    PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>

    SELECT ?labelType (COUNT(?label) AS ?count) WHERE {
      ?uri a cnlo:Occupation .
      {
        ?uri skosxl:prefLabel ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("pref" AS ?labelType)
      } UNION {
        ?uri skosxl:altLabel ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("alt" AS ?labelType)
      } UNION {
        ?uri cnluwvo:specialization ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("spec" AS ?labelType)
      }
      FILTER(LANG(?label) = "nl")
    }
    GROUP BY ?labelType
  `;

  const skosxlResults = await runQuery('SKOS-XL labels telling (pref/alt/spec) voor Occupations', skosxlCountQuery);
  let totalLabels = 0;
  for (const row of skosxlResults) {
    const labelType = row.labelType?.value || '?';
    const count = parseInt(row.count?.value || '0');
    totalLabels += count;
    const labelName = labelType === 'pref' ? 'prefLabels (officiële naam)' :
                     labelType === 'alt' ? 'altLabels (synoniemen)' :
                     'specializations (verbijzonderingen)';
    console.log(`  - ${labelName}: ${count}`);
  }
  console.log(`  ─────────────────────────────`);
  console.log(`  Totaal: ${totalLabels} labels`);

  // Query 2: Sample SKOS-XL altLabels and specializations
  const skosxlSampleQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
    PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>

    SELECT ?uri ?prefLabel ?altLabel ?type WHERE {
      ?uri a cnlo:Occupation .
      ?uri skosxl:prefLabel ?prefNode .
      ?prefNode skosxl:literalForm ?prefLabel .
      {
        ?uri skosxl:altLabel ?altNode .
        ?altNode skosxl:literalForm ?altLabel .
        BIND("synoniem" AS ?type)
      } UNION {
        ?uri cnluwvo:specialization ?altNode .
        ?altNode skosxl:literalForm ?altLabel .
        BIND("verbijzondering" AS ?type)
      }
      FILTER(LANG(?prefLabel) = "nl" && LANG(?altLabel) = "nl")
    }
    LIMIT 15
  `;

  const skosxlSampleResults = await runQuery('Voorbeeld SKOS-XL altLabels en specializations', skosxlSampleQuery);
  for (const row of skosxlSampleResults) {
    const prefLabel = row.prefLabel?.value || '?';
    const altLabel = row.altLabel?.value || '?';
    const type = row.type?.value || '?';
    console.log(`  - ${prefLabel} → ${altLabel} [${type}]`);
  }

  // Query 3: Count labels for Education
  const educationCountQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
    PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>

    SELECT ?labelType (COUNT(?label) AS ?count) WHERE {
      ?uri a cnlo:EducationalNorm .
      {
        ?uri skosxl:prefLabel ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("pref" AS ?labelType)
      } UNION {
        ?uri skosxl:altLabel ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("alt" AS ?labelType)
      } UNION {
        ?uri cnluwvo:specialization ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("spec" AS ?labelType)
      }
      FILTER(LANG(?label) = "nl")
    }
    GROUP BY ?labelType
  `;

  const educationResults = await runQuery('SKOS-XL labels telling voor Education', educationCountQuery);
  totalLabels = 0;
  for (const row of educationResults) {
    const labelType = row.labelType?.value || '?';
    const count = parseInt(row.count?.value || '0');
    totalLabels += count;
    const labelName = labelType === 'pref' ? 'prefLabels' :
                     labelType === 'alt' ? 'altLabels' :
                     'specializations';
    console.log(`  - ${labelName}: ${count}`);
  }
  console.log(`  ─────────────────────────────`);
  console.log(`  Totaal: ${totalLabels} labels`);

  // Query 4: Count labels for Capability
  const capabilityCountQuery = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
    PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>

    SELECT ?labelType (COUNT(?label) AS ?count) WHERE {
      ?uri a cnlo:HumanCapability .
      {
        ?uri skosxl:prefLabel ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("pref" AS ?labelType)
      } UNION {
        ?uri skosxl:altLabel ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("alt" AS ?labelType)
      } UNION {
        ?uri cnluwvo:specialization ?labelNode .
        ?labelNode skosxl:literalForm ?label .
        BIND("spec" AS ?labelType)
      }
      FILTER(LANG(?label) = "nl")
    }
    GROUP BY ?labelType
  `;

  const capabilityResults = await runQuery('SKOS-XL labels telling voor Capability', capabilityCountQuery);
  totalLabels = 0;
  for (const row of capabilityResults) {
    const labelType = row.labelType?.value || '?';
    const count = parseInt(row.count?.value || '0');
    totalLabels += count;
    const labelName = labelType === 'pref' ? 'prefLabels' :
                     labelType === 'alt' ? 'altLabels' :
                     'specializations';
    console.log(`  - ${labelName}: ${count}`);
  }
  console.log(`  ─────────────────────────────`);
  console.log(`  Totaal: ${totalLabels} labels`);

  console.log('\n✅ Debug voltooid\n');
}

main().catch(console.error);
