/**
 * Calculate IDF weights for all HumanCapabilities in CompetentNL
 * 
 * IDF = log(N / df) where:
 * - N = total number of occupations
 * - df = document frequency (number of occupations that require this skill)
 * 
 * Usage: node calculate-idf-weights.js
 */

import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const SPARQL_ENDPOINT = process.env.COMPETENTNL_ENDPOINT || "https://sparql.competentnl.nl";
const API_KEY = process.env.COMPETENTNL_API_KEY;

if (!API_KEY) {
  console.error("Error: COMPETENTNL_API_KEY niet gevonden in .env.local!");
  process.exit(1);
}

// Simpele query: haal alle skill-occupation koppelingen op
const SKILL_LINKS_QUERY = `
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?skill ?skillLabel ?occ
WHERE {
  ?occ a cnlo:Occupation .
  ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?skill .
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = "nl")
}
`;

const TOTAL_OCCUPATIONS_QUERY = `
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT (COUNT(DISTINCT ?occ) AS ?totalCount)
WHERE {
  ?occ a cnlo:Occupation .
}
`;

async function executeSparqlQuery(query) {
  const params = new URLSearchParams();
  params.append("query", query);
  params.append("format", "application/sparql-results+json");

  const response = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Accept": "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "CompetentNL-IDF-Calculator/1.0",
      "apikey": API_KEY
    },
    body: params
  });
  
  if (!response.ok) {
    const body = await response.text();
    throw new Error("SPARQL query failed: " + response.status + " - " + body);
  }
  
  return response.json();
}

function calculateIDF(occupationCount, totalOccupations) {
  return Math.log(totalOccupations / Math.max(occupationCount, 1));
}

async function main() {
  console.log("Endpoint: " + SPARQL_ENDPOINT);
  console.log("API key geladen: " + API_KEY.substring(0, 8) + "...\n");
  
  // Stap 1: Totaal aantal beroepen
  console.log("Stap 1: Fetching total occupation count...");
  const totalResult = await executeSparqlQuery(TOTAL_OCCUPATIONS_QUERY);
  const totalOccupations = parseInt(totalResult.results.bindings[0].totalCount.value);
  console.log("   Total occupations: " + totalOccupations + "\n");
  
  // Stap 2: Haal alle skill-occupation koppelingen op
  console.log("Stap 2: Fetching skill-occupation links (dit kan even duren)...");
  const linksResult = await executeSparqlQuery(SKILL_LINKS_QUERY);
  const links = linksResult.results.bindings;
  console.log("   Found " + links.length + " skill-occupation links\n");
  
  // Stap 3: Bereken frequenties in JavaScript
  console.log("Stap 3: Calculating frequencies...");
  const skillMap = new Map();
  
  for (const link of links) {
    const skillUri = link.skill.value;
    const skillLabel = link.skillLabel.value;
    const occUri = link.occ.value;
    
    if (!skillMap.has(skillUri)) {
      skillMap.set(skillUri, {
        uri: skillUri,
        label: skillLabel,
        occupations: new Set()
      });
    }
    skillMap.get(skillUri).occupations.add(occUri);
  }
  
  console.log("   Found " + skillMap.size + " unique skills\n");
  
  // Stap 4: Bereken IDF
  console.log("Stap 4: Calculating IDF weights...\n");
  
  const idfData = [];
  for (const [uri, data] of skillMap) {
    const occCount = data.occupations.size;
    const idf = calculateIDF(occCount, totalOccupations);
    const coverage = (occCount / totalOccupations * 100);
    
    idfData.push({
      uri: uri,
      label: data.label,
      occupationCount: occCount,
      coverage: parseFloat(coverage.toFixed(1)),
      idf: idf
    });
  }
  
  // Sorteer op IDF (hoogste eerst)
  const sortedByIdf = idfData.slice().sort(function(a, b) {
    return b.idf - a.idf;
  });
  
  // Display results
  console.log("=".repeat(100));
  console.log("IDF WEIGHTS FOR HUMANCAPABILITIES");
  console.log("=".repeat(100));
  console.log("");
  
  console.log("TOP 20 MEEST UNIEKE SKILLS (hoogste IDF = meest onderscheidend):\n");
  console.log("| Rank | Skill                                    | Coverage | IDF   |");
  console.log("|------|------------------------------------------|----------|-------|");
  sortedByIdf.slice(0, 20).forEach(function(skill, i) {
    const label = skill.label.substring(0, 40).padEnd(40);
    const cov = (skill.coverage.toFixed(1) + "%").padStart(7);
    const idfStr = skill.idf.toFixed(3);
    console.log("| " + String(i+1).padStart(4) + " | " + label + " | " + cov + " | " + idfStr + " |");
  });
  
  console.log("\n");
  console.log("TOP 20 MEEST UNIVERSELE SKILLS (laagste IDF = minst onderscheidend):\n");
  console.log("| Rank | Skill                                    | Coverage | IDF   |");
  console.log("|------|------------------------------------------|----------|-------|");
  sortedByIdf.slice(-20).reverse().forEach(function(skill, i) {
    const label = skill.label.substring(0, 40).padEnd(40);
    const cov = (skill.coverage.toFixed(1) + "%").padStart(7);
    const idfStr = skill.idf.toFixed(3);
    console.log("| " + String(i+1).padStart(4) + " | " + label + " | " + cov + " | " + idfStr + " |");
  });
  
  // Summary statistics
  console.log("\n");
  console.log("=".repeat(100));
  console.log("SAMENVATTING");
  console.log("=".repeat(100));
  
  const sum = idfData.reduce(function(acc, s) { return acc + s.idf; }, 0);
  const avgIdf = sum / idfData.length;
  const maxIdf = Math.max.apply(null, idfData.map(function(s) { return s.idf; }));
  const minIdf = Math.min.apply(null, idfData.map(function(s) { return s.idf; }));
  const highCoverage = idfData.filter(function(s) { return s.coverage > 90; }).length;
  const lowCoverage = idfData.filter(function(s) { return s.coverage < 10; }).length;
  
  console.log("\nStatistieken:");
  console.log("   - Totaal skills: " + idfData.length);
  console.log("   - Gemiddelde IDF: " + avgIdf.toFixed(3));
  console.log("   - Max IDF: " + maxIdf.toFixed(3));
  console.log("   - Min IDF: " + minIdf.toFixed(3));
  console.log("   - Skills met >90% coverage (universeel): " + highCoverage);
  console.log("   - Skills met <10% coverage (specifiek): " + lowCoverage);
  
  // Save JSON to file
  const outputFile = "idf-weights.json";
  fs.writeFileSync(outputFile, JSON.stringify(sortedByIdf, null, 2));
  console.log("\n   JSON opgeslagen in: " + outputFile);
}

main().catch(function(err) {
  console.error("Error:", err.message);
});
