/**
 * Calculate IDF weights for all HumanCapabilities in CompetentNL
 * 
 * IDF = log(N / df) where:
 * - N = total number of occupations
 * - df = document frequency (number of occupations that require this skill)
 * 
 * Usage: node calculate-idf-weights.js
 */

const SPARQL_ENDPOINT = "https://sparql.competentnl.nl";

const SKILL_FREQUENCY_QUERY = `
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT 
  ?skill 
  ?skillLabel 
  ?notation
  (COUNT(DISTINCT ?occ) AS ?occupationCount)
WHERE {
  ?occ a cnlo:Occupation .
  {
    ?occ cnlo:requiresHATEssential ?skill .
  } UNION {
    ?occ cnlo:requiresHATImportant ?skill .
  } UNION {
    ?occ cnlo:requiresHATSomewhat ?skill .
  }
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?skillLabel .
  OPTIONAL { ?skill skos:notation ?notation }
  FILTER(LANG(?skillLabel) = "nl")
}
GROUP BY ?skill ?skillLabel ?notation
ORDER BY DESC(?occupationCount)
`;

const TOTAL_OCCUPATIONS_QUERY = `
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT (COUNT(DISTINCT ?occ) AS ?totalCount)
WHERE {
  ?occ a cnlo:Occupation .
}
`;

async function executeSparqlQuery(query) {
  const url = SPARQL_ENDPOINT + "?query=" + encodeURIComponent(query);
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/sparql-results+json"
    }
  });
  
  if (!response.ok) {
    throw new Error("SPARQL query failed: " + response.status + " " + response.statusText);
  }
  
  return response.json();
}

function calculateIDF(occupationCount, totalOccupations) {
  return Math.log(totalOccupations / Math.max(occupationCount, 1));
}

async function main() {
  console.log("Fetching total occupation count...\n");
  
  const totalResult = await executeSparqlQuery(TOTAL_OCCUPATIONS_QUERY);
  const totalOccupations = parseInt(totalResult.results.bindings[0].totalCount.value);
  console.log("Total occupations: " + totalOccupations + "\n");
  
  console.log("Fetching skill frequencies...\n");
  
  const skillResult = await executeSparqlQuery(SKILL_FREQUENCY_QUERY);
  const skills = skillResult.results.bindings;
  
  console.log("Found " + skills.length + " unique skills\n");
  console.log("=".repeat(100));
  console.log("IDF WEIGHTS FOR HUMANCAPABILITIES");
  console.log("=".repeat(100));
  console.log("");
  
  const idfData = skills.map(function(skill) {
    const occCount = parseInt(skill.occupationCount.value);
    const idf = calculateIDF(occCount, totalOccupations);
    const coverage = (occCount / totalOccupations * 100).toFixed(1);
    
    return {
      uri: skill.skill.value,
      label: skill.skillLabel.value,
      notation: skill.notation ? skill.notation.value : "-",
      occupationCount: occCount,
      coverage: parseFloat(coverage),
      idf: idf
    };
  });
  
  const sortedByIdf = idfData.slice().sort(function(a, b) {
    return b.idf - a.idf;
  });
  
  console.log("TOP 20 MOST UNIQUE SKILLS (highest IDF = most discriminating):\n");
  console.log("| Rank | Skill                                    | Coverage | IDF   |");
  console.log("|------|------------------------------------------|----------|-------|");
  sortedByIdf.slice(0, 20).forEach(function(skill, i) {
    const label = skill.label.substring(0, 40).padEnd(40);
    const cov = (skill.coverage.toFixed(1) + "%").padStart(7);
    const idfStr = skill.idf.toFixed(3);
    console.log("| " + String(i+1).padStart(4) + " | " + label + " | " + cov + " | " + idfStr + " |");
  });
  
  console.log("\n");
  console.log("TOP 20 MOST UNIVERSAL SKILLS (lowest IDF = least discriminating):\n");
  console.log("| Rank | Skill                                    | Coverage | IDF   |");
  console.log("|------|------------------------------------------|----------|-------|");
  sortedByIdf.slice(-20).reverse().forEach(function(skill, i) {
    const label = skill.label.substring(0, 40).padEnd(40);
    const cov = (skill.coverage.toFixed(1) + "%").padStart(7);
    const idfStr = skill.idf.toFixed(3);
    console.log("| " + String(i+1).padStart(4) + " | " + label + " | " + cov + " | " + idfStr + " |");
  });
  
  console.log("\n");
  console.log("=".repeat(100));
  console.log("JSON OUTPUT FOR DATABASE IMPORT");
  console.log("=".repeat(100));
  console.log(JSON.stringify(idfData, null, 2));
  
  console.log("\n");
  console.log("=".repeat(100));
  console.log("SUMMARY STATISTICS");
  console.log("=".repeat(100));
  
  const sum = idfData.reduce(function(acc, s) { return acc + s.idf; }, 0);
  const avgIdf = sum / idfData.length;
  const maxIdf = Math.max.apply(null, idfData.map(function(s) { return s.idf; }));
  const minIdf = Math.min.apply(null, idfData.map(function(s) { return s.idf; }));
  const highCoverage = idfData.filter(function(s) { return s.coverage > 90; }).length;
  const lowCoverage = idfData.filter(function(s) { return s.coverage < 10; }).length;
  
  console.log("\nStatistics:");
  console.log("   - Total skills: " + idfData.length);
  console.log("   - Average IDF: " + avgIdf.toFixed(3));
  console.log("   - Max IDF: " + maxIdf.toFixed(3));
  console.log("   - Min IDF: " + minIdf.toFixed(3));
  console.log("   - Skills with >90% coverage (universeel): " + highCoverage);
  console.log("   - Skills with <10% coverage (specifiek): " + lowCoverage);
}

main().catch(function(err) {
  console.error("Error:", err.message);
});
