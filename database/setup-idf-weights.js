/**
 * Setup IDF Weights Database Table
 * 
 * Dit script voert stap 5.2 uit het matching algoritme voorstel uit:
 * 1. Maakt de skill_idf_weights tabel aan in competentnl_rag database
 * 2. Leest de bestaande idf-weights.json in
 * 3. Slaat de resultaten op in de database
 * 
 * Usage: node setup-idf-weights.js
 * 
 * Vereist:
 *   - idf-weights.json in dezelfde map
 *   - Database configuratie in .env.local (DB_HOST, DB_USER, DB_PASSWORD)
 */

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: ".env.local" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CONFIGURATIE
// ============================================

// Database configuratie
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: "competentnl_rag",
  charset: "utf8mb4"
};

// Totaal aantal beroepen (uit voorstel-matching-algoritme.md)
const TOTAL_OCCUPATIONS = 3263;

// Input bestand - zoek in huidige map of parent directory
const IDF_LOCATIONS = [
  path.join(__dirname, 'idf-weights.json'),           // zelfde map als script
  path.join(__dirname, '..', 'idf-weights.json'),     // parent directory
  path.join(process.cwd(), 'idf-weights.json')        // working directory
];
const IDF_JSON_FILE = IDF_LOCATIONS.find(f => fs.existsSync(f)) || IDF_LOCATIONS[0];

// Skill categorieën mapping op basis van keywords
const CATEGORY_KEYWORDS = {
  DENKEN: [
    "analyseren", "evalueren", "onderzoeken", "leren", "plannen",
    "informatie", "begrijpen", "interpreteren", "reflecteren",
    "kritisch", "logisch", "abstract", "conceptueel"
  ],
  DOEN: [
    "bedienen", "hanteren", "verzorgen", "vervaardigen", "bewerken",
    "repareren", "monteren", "installeren", "rijden", "besturen",
    "verplegen", "fysiek", "motorisch", "handmatig"
  ],
  VERBINDEN: [
    "communiceren", "samenwerken", "overleggen", "adviseren",
    "onderhandelen", "presenteren", "netwerken", "bemiddelen",
    "luisteren", "aandacht", "begrip", "empathie", "begeleiden"
  ],
  STUREN: [
    "coördineren", "leiding", "organiseren", "delegeren",
    "managen", "aansturen", "beslissen", "richting"
  ],
  CREËREN: [
    "ontwerpen", "creëren", "innoveren", "ontwikkelen",
    "bedenken", "vormgeven", "creatief", "artistiek", "uitdrukken"
  ],
  ZIJN: [
    "zorgvuldig", "flexibel", "integer", "stressbestendig",
    "nauwkeurig", "betrouwbaar", "verantwoordelijk", "aanpassings"
  ]
};

// ============================================
// SQL STATEMENTS
// ============================================

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS skill_idf_weights (
  skill_uri VARCHAR(500) PRIMARY KEY,
  skill_label VARCHAR(255),
  occupation_count INT,
  total_occupations INT DEFAULT 3263,
  idf_weight DECIMAL(8,4),
  skill_category VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_skill_label (skill_label),
  INDEX idx_idf_weight (idf_weight),
  INDEX idx_skill_category (skill_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const UPSERT_SKILL_SQL = `
INSERT INTO skill_idf_weights 
  (skill_uri, skill_label, occupation_count, total_occupations, idf_weight, skill_category)
VALUES 
  (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  skill_label = VALUES(skill_label),
  occupation_count = VALUES(occupation_count),
  total_occupations = VALUES(total_occupations),
  idf_weight = VALUES(idf_weight),
  skill_category = VALUES(skill_category),
  updated_at = CURRENT_TIMESTAMP
`;

// ============================================
// HELPER FUNCTIES
// ============================================

function determineCategory(skillLabel) {
  const lowerLabel = skillLabel.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerLabel.includes(keyword)) {
        return category;
      }
    }
  }
  
  return "OVERIG";
}

function printProgress(current, total, prefix = "") {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round(percentage / 5);
  const empty = 20 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  process.stdout.write(`\r   ${prefix}[${bar}] ${percentage}% (${current}/${total})`);
}

// ============================================
// MAIN FUNCTIE
// ============================================

async function main() {
  console.log("═".repeat(70));
  console.log("  SETUP IDF WEIGHTS - Stap 5.2 Matching Algoritme");
  console.log("═".repeat(70));
  console.log("");
  
  // Stap 1: Lees JSON bestand
  console.log("📄 Stap 1: Inlezen idf-weights.json...");
  console.log(`   Bestand: ${IDF_JSON_FILE}`);
  
  if (!fs.existsSync(IDF_JSON_FILE)) {
    console.error(`   ❌ idf-weights.json niet gevonden`);
    console.error("   Gezocht in:");
    IDF_LOCATIONS.forEach(loc => console.error(`      - ${loc}`));
    console.error("\n   Genereer eerst met: node calculate-idf-weights.js");
    process.exit(1);
  }
  
  const jsonContent = fs.readFileSync(IDF_JSON_FILE, "utf-8");
  const skills = JSON.parse(jsonContent);
  console.log(`   ✓ ${skills.length} skills ingelezen\n`);
  
  // Stap 2: Verbind met database
  console.log("🔌 Stap 2: Verbinden met database...");
  console.log(`   Host: ${DB_CONFIG.host}`);
  console.log(`   Database: ${DB_CONFIG.database}`);
  
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log("   ✓ Verbonden met database\n");
  } catch (err) {
    console.error(`   ❌ Database verbinding mislukt: ${err.message}`);
    console.error("\n   Controleer je database configuratie in .env.local:");
    console.error("   - DB_HOST (standaard: localhost)");
    console.error("   - DB_USER (standaard: root)");
    console.error("   - DB_PASSWORD");
    console.error("\n   En zorg dat de database 'competentnl_rag' bestaat.");
    process.exit(1);
  }
  
  // Stap 3: Maak tabel aan
  console.log("📦 Stap 3: Aanmaken database tabel...");
  try {
    await connection.execute(CREATE_TABLE_SQL);
    console.log("   ✓ Tabel skill_idf_weights aangemaakt (of bestaat al)\n");
  } catch (err) {
    console.error(`   ❌ Tabel aanmaken mislukt: ${err.message}`);
    await connection.end();
    process.exit(1);
  }
  
  // Stap 4: Importeer data
  console.log("💾 Stap 4: Importeren naar database...\n");
  
  let saved = 0;
  let errors = 0;
  
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const category = determineCategory(skill.label);
    
    try {
      await connection.execute(UPSERT_SKILL_SQL, [
        skill.uri,
        skill.label,
        skill.occupationCount,
        TOTAL_OCCUPATIONS,
        parseFloat(skill.idf.toFixed(4)),
        category
      ]);
      saved++;
    } catch (err) {
      errors++;
      if (errors <= 3) {
        console.error(`\n   ⚠ Fout bij opslaan "${skill.label}": ${err.message}`);
      }
    }
    
    printProgress(i + 1, skills.length, "Importeren: ");
  }
  
  console.log("\n");
  console.log(`   ✓ ${saved} skills opgeslagen`);
  if (errors > 0) {
    console.log(`   ⚠ ${errors} fouten bij opslaan`);
  }
  console.log("");
  
  // Stap 5: Toon statistieken
  console.log("📈 Stap 5: Statistieken ophalen...\n");
  
  const [statsRows] = await connection.execute(`
    SELECT 
      COUNT(*) as total_skills,
      ROUND(AVG(idf_weight), 3) as avg_idf,
      ROUND(MAX(idf_weight), 3) as max_idf,
      ROUND(MIN(idf_weight), 3) as min_idf,
      SUM(CASE WHEN (occupation_count * 100.0 / total_occupations) > 90 THEN 1 ELSE 0 END) as universal_skills,
      SUM(CASE WHEN (occupation_count * 100.0 / total_occupations) < 10 THEN 1 ELSE 0 END) as specific_skills
    FROM skill_idf_weights
  `);
  
  const stats = statsRows[0];
  
  console.log("   ┌──────────────────────────────────────────┐");
  console.log("   │           SAMENVATTING                   │");
  console.log("   ├──────────────────────────────────────────┤");
  console.log(`   │ Totaal skills:        ${String(stats.total_skills).padStart(6)}           │`);
  console.log(`   │ Gemiddelde IDF:       ${String(stats.avg_idf).padStart(6)}           │`);
  console.log(`   │ Hoogste IDF:          ${String(stats.max_idf).padStart(6)}           │`);
  console.log(`   │ Laagste IDF:          ${String(stats.min_idf).padStart(6)}           │`);
  console.log(`   │ Universele skills:    ${String(stats.universal_skills || 0).padStart(6)} (>90% cov) │`);
  console.log(`   │ Specifieke skills:    ${String(stats.specific_skills || 0).padStart(6)} (<10% cov) │`);
  console.log("   └──────────────────────────────────────────┘");
  console.log("");
  
  // Top 10 meest unieke skills
  const [topUnique] = await connection.execute(`
    SELECT skill_label, occupation_count, idf_weight, skill_category
    FROM skill_idf_weights
    ORDER BY idf_weight DESC
    LIMIT 10
  `);
  
  console.log("   🎯 TOP 10 MEEST UNIEKE SKILLS (hoogste IDF):");
  console.log("   ┌────┬──────────────────────────────┬────────┬────────┬───────────┐");
  console.log("   │ #  │ Skill                        │ Count  │ IDF    │ Categorie │");
  console.log("   ├────┼──────────────────────────────┼────────┼────────┼───────────┤");
  topUnique.forEach((skill, i) => {
    const label = skill.skill_label.substring(0, 28).padEnd(28);
    const count = String(skill.occupation_count).padStart(6);
    const idf = parseFloat(skill.idf_weight).toFixed(3).padStart(6);
    const cat = (skill.skill_category || "").substring(0, 9).padEnd(9);
    console.log(`   │ ${String(i + 1).padStart(2)} │ ${label} │ ${count} │ ${idf} │ ${cat} │`);
  });
  console.log("   └────┴──────────────────────────────┴────────┴────────┴───────────┘");
  console.log("");
  
  // Top 10 meest universele skills
  const [topUniversal] = await connection.execute(`
    SELECT skill_label, occupation_count, idf_weight, skill_category
    FROM skill_idf_weights
    ORDER BY idf_weight ASC
    LIMIT 10
  `);
  
  console.log("   🌐 TOP 10 MEEST UNIVERSELE SKILLS (laagste IDF):");
  console.log("   ┌────┬──────────────────────────────┬────────┬────────┬───────────┐");
  console.log("   │ #  │ Skill                        │ Count  │ IDF    │ Categorie │");
  console.log("   ├────┼──────────────────────────────┼────────┼────────┼───────────┤");
  topUniversal.forEach((skill, i) => {
    const label = skill.skill_label.substring(0, 28).padEnd(28);
    const count = String(skill.occupation_count).padStart(6);
    const idf = parseFloat(skill.idf_weight).toFixed(3).padStart(6);
    const cat = (skill.skill_category || "").substring(0, 9).padEnd(9);
    console.log(`   │ ${String(i + 1).padStart(2)} │ ${label} │ ${count} │ ${idf} │ ${cat} │`);
  });
  console.log("   └────┴──────────────────────────────┴────────┴────────┴───────────┘");
  console.log("");
  
  // Categorieën verdeling
  const [categoryStats] = await connection.execute(`
    SELECT 
      skill_category,
      COUNT(*) as count,
      ROUND(AVG(idf_weight), 3) as avg_idf
    FROM skill_idf_weights
    GROUP BY skill_category
    ORDER BY avg_idf ASC
  `);
  
  console.log("   📊 VERDELING PER CATEGORIE:");
  console.log("   ┌────────────┬───────┬───────────┐");
  console.log("   │ Categorie  │ Aantal│ Gem. IDF  │");
  console.log("   ├────────────┼───────┼───────────┤");
  categoryStats.forEach((cat) => {
    const name = (cat.skill_category || "OVERIG").padEnd(10);
    const count = String(cat.count).padStart(5);
    const avgIdf = String(cat.avg_idf).padStart(9);
    console.log(`   │ ${name} │ ${count} │ ${avgIdf} │`);
  });
  console.log("   └────────────┴───────┴───────────┘");
  console.log("");
  
  // Sluit database verbinding
  await connection.end();
  
  console.log("═".repeat(70));
  console.log("  ✅ SETUP VOLTOOID!");
  console.log("═".repeat(70));
  console.log("");
  console.log("   De skill_idf_weights tabel is gevuld en klaar voor gebruik.");
  console.log("");
  console.log("   Voorbeeld queries:");
  console.log("   ─────────────────────────────────────────────────────────────");
  console.log("   -- Haal IDF op voor een specifieke skill:");
  console.log("   SELECT skill_label, idf_weight FROM skill_idf_weights");
  console.log("   WHERE skill_label LIKE '%verzorgen%';");
  console.log("");
  console.log("   -- Bekijk alle unieke (specifieke) skills:");
  console.log("   SELECT * FROM skill_idf_weights");
  console.log("   WHERE idf_weight > 1.5 ORDER BY idf_weight DESC;");
  console.log("");
}

// ============================================
// RUN
// ============================================

main().catch((err) => {
  console.error("\n❌ ONVERWACHTE FOUT:", err.message);
  console.error(err.stack);
  process.exit(1);
});
