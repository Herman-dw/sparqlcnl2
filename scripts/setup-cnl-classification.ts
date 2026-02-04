/**
 * Setup Script: CNL Classification Feature
 * =========================================
 *
 * Dit script voert de volgende stappen uit:
 * 1. Database migratie voor Step 6 (classificatie)
 * 2. Genereren van CNL concept embeddings (optioneel, voor semantic matching)
 * 3. Test classificatie met voorbeelddata
 *
 * Gebruik:
 *   npx ts-node --esm scripts/setup-cnl-classification.ts [--migrate] [--embeddings] [--test]
 *
 * Opties:
 *   --migrate     Voer database migratie uit
 *   --embeddings  Genereer CNL concept embeddings (kan lang duren)
 *   --test        Test classificatie met voorbeelddata
 *   --all         Voer alle stappen uit
 *   --reset       Leeg embeddings tabel voor regeneratie (gebruik met --embeddings)
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local (takes precedence) and .env
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

// Database configuratie (ondersteunt zowel MARIADB_* als DB_* variabelen, zoals server.js)
const DB_CONFIG = {
  host: process.env.MARIADB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MARIADB_PORT || process.env.DB_PORT || '3306'),
  user: process.env.MARIADB_USER || process.env.DB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || process.env.DB_NAME || 'competentnl_rag',
  multipleStatements: true
};

// SPARQL endpoint voor CNL concepten
const SPARQL_ENDPOINT = process.env.SPARQL_ENDPOINT || process.env.COMPETENTNL_ENDPOINT || 'https://sparql.competentnl.nl';
const SPARQL_API_KEY = process.env.COMPETENTNL_API_KEY || '';

// ============================================================================
// STAP 1: DATABASE MIGRATIE
// ============================================================================

/**
 * Fallback: Create tables manually if batch migration fails
 */
async function createTablesManually(connection: mysql.Connection): Promise<void> {
  // Create cnl_concept_embeddings table
  // Note: unique key is on (concept_uri, pref_label) to allow multiple labels per concept (prefLabel + altLabels)
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cnl_concept_embeddings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        concept_uri VARCHAR(500) NOT NULL,
        concept_type ENUM('occupation', 'education', 'capability', 'knowledge', 'task', 'workingCondition') NOT NULL,
        pref_label VARCHAR(255) NOT NULL COMMENT 'Label tekst (kan prefLabel of altLabel zijn)',
        label_type ENUM('pref', 'alt') DEFAULT 'pref' COMMENT 'Type label: pref=officieel, alt=synoniem',
        embedding BLOB NOT NULL,
        embedding_model VARCHAR(100) DEFAULT 'all-MiniLM-L6-v2',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_concept_label (concept_uri, pref_label),
        INDEX idx_concept_type (concept_type),
        INDEX idx_pref_label (pref_label),
        INDEX idx_label_type (label_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Tabel cnl_concept_embeddings aangemaakt');
  } catch (error: any) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('  ⚠ Tabel cnl_concept_embeddings bestaat al');
      // Try to add label_type column if it doesn't exist
      try {
        await connection.execute(`ALTER TABLE cnl_concept_embeddings ADD COLUMN label_type ENUM('pref', 'alt') DEFAULT 'pref' AFTER pref_label`);
        console.log('  ✓ Kolom label_type toegevoegd');
      } catch (e: any) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          // Ignore if column already exists
        }
      }
    } else {
      console.error('  ❌ Kon cnl_concept_embeddings niet aanmaken:', error.message);
    }
  }

  // Create cv_classification_feedback table
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cv_classification_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        extraction_id INT NOT NULL,
        cv_id INT NOT NULL,
        original_uri VARCHAR(500) NULL,
        original_label VARCHAR(255) NULL,
        original_method ENUM('exact', 'fuzzy', 'semantic', 'llm', 'manual') NULL,
        original_confidence DECIMAL(3,2) NULL,
        corrected_uri VARCHAR(500) NOT NULL,
        corrected_label VARCHAR(255) NOT NULL,
        feedback_type ENUM('confirmed', 'corrected', 'rejected', 'added') NOT NULL,
        user_notes TEXT NULL,
        session_id VARCHAR(255) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_extraction_id (extraction_id),
        INDEX idx_cv_id (cv_id),
        INDEX idx_feedback_type (feedback_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Tabel cv_classification_feedback aangemaakt');
  } catch (error: any) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('  ⚠ Tabel cv_classification_feedback bestaat al');
    } else {
      console.error('  ❌ Kon cv_classification_feedback niet aanmaken:', error.message);
    }
  }

  // Add columns to cv_extractions if they don't exist
  const columnsToAdd = [
    { name: 'matched_cnl_uri', definition: 'VARCHAR(500) NULL' },
    { name: 'matched_cnl_label', definition: 'VARCHAR(255) NULL' },
    { name: 'classification_method', definition: "ENUM('exact', 'fuzzy', 'semantic', 'llm', 'manual') NULL" },
    { name: 'alternative_matches', definition: 'JSON NULL' },
    { name: 'classification_confirmed', definition: 'BOOLEAN DEFAULT FALSE' },
    { name: 'classified_at', definition: 'DATETIME NULL' }
  ];

  for (const col of columnsToAdd) {
    try {
      await connection.execute(`ALTER TABLE cv_extractions ADD COLUMN ${col.name} ${col.definition}`);
      console.log(`  ✓ Kolom ${col.name} toegevoegd aan cv_extractions`);
    } catch (error: any) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, this is OK
      } else {
        console.error(`  ❌ Kon kolom ${col.name} niet toevoegen:`, error.message);
      }
    }
  }
}

async function runMigration(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('STAP 1: Database Migratie');
  console.log('='.repeat(60) + '\n');

  console.log(`📌 Database configuratie:`);
  console.log(`   Host: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`   User: ${DB_CONFIG.user}`);
  console.log(`   Database: ${DB_CONFIG.database}`);
  console.log(`   Password: ${DB_CONFIG.password ? '********' : '(leeg)'}\n`);

  const connection = await mysql.createConnection({
    ...DB_CONFIG,
    multipleStatements: true
  });

  try {
    const migrationPath = path.join(__dirname, '../database/005-cv-classification-step.sql');

    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migratie bestand niet gevonden: ${migrationPath}`);
      return;
    }

    console.log(`📄 Lezen migratie: ${migrationPath}`);
    let migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Remove USE statement since we're already connected to the correct database
    migrationSQL = migrationSQL.replace(/USE\s+\w+;/gi, '');

    console.log('🔄 Uitvoeren migratie...\n');

    // Execute the entire migration as one batch (multipleStatements is enabled)
    try {
      const results = await connection.query(migrationSQL);
      console.log('  ✓ Migratie SQL uitgevoerd');

      // Count successful statements (results is an array for multiple statements)
      const resultArray = Array.isArray(results[0]) ? results[0] : [results[0]];
      console.log(`  📊 ${resultArray.length} resultaten ontvangen`);

    } catch (error: any) {
      // Handle specific errors that are OK
      if (error.code === 'ER_DUP_FIELDNAME' ||
          error.code === 'ER_TABLE_EXISTS_ERROR' ||
          error.message.includes('Duplicate column') ||
          error.message.includes('already exists')) {
        console.log(`  ⚠ Sommige objecten bestaan al (dit is OK)`);
      } else {
        console.error(`  ❌ Migratie error: ${error.message}`);
        console.error(`     Code: ${error.code}`);

        // Try to continue with individual table creation
        console.log('\n🔄 Proberen individuele tabellen aan te maken...\n');
        await createTablesManually(connection);
      }
    }

    // Always ensure tables exist (fallback for MariaDB compatibility issues)
    console.log('\n🔄 Controleren/aanmaken tabellen...\n');
    await createTablesManually(connection);

    console.log(`\n📊 Migratie voltooid`);

    // Verificatie
    console.log('\n🔍 Verificatie...');

    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = '${DB_CONFIG.database}'
        AND TABLE_NAME = 'cv_extractions'
        AND COLUMN_NAME IN ('matched_cnl_uri', 'matched_cnl_label', 'classification_method')
    `);

    console.log(`  ✓ cv_extractions classificatie kolommen: ${(columns as any[]).length}/3`);

    const [tables] = await connection.execute(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = '${DB_CONFIG.database}'
        AND TABLE_NAME IN ('cnl_concept_embeddings', 'cv_classification_feedback')
    `);

    console.log(`  ✓ Nieuwe tabellen aangemaakt: ${(tables as any[]).length}/2`);

  } finally {
    await connection.end();
  }
}

// ============================================================================
// STAP 2: CNL CONCEPT EMBEDDINGS GENEREREN
// ============================================================================

async function generateCNLEmbeddings(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('STAP 2: CNL Concept Embeddings Genereren');
  console.log('='.repeat(60) + '\n');

  // Dynamisch importeren van embedding service
  let generateEmbedding: (text: string) => Promise<number[]>;

  try {
    const embeddingService = await import('../services/embeddingService.ts');
    generateEmbedding = embeddingService.generateEmbedding;
    console.log('✅ Embedding service geladen\n');
  } catch (error) {
    console.error('❌ Kon embedding service niet laden:', error);
    console.log('   Zorg dat @xenova/transformers is geïnstalleerd\n');
    return;
  }

  // Check for API key
  console.log(`📌 SPARQL configuratie:`);
  console.log(`   Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`   API Key: ${SPARQL_API_KEY ? SPARQL_API_KEY.substring(0, 8) + '...' : '(niet ingesteld)'}\n`);

  if (!SPARQL_API_KEY) {
    console.log('⚠️  Geen COMPETENTNL_API_KEY gevonden in environment.');
    console.log('   Embeddings genereren wordt overgeslagen.');
    console.log('   Stel COMPETENTNL_API_KEY in .env.local in om embeddings te genereren.\n');
    return;
  }

  const connection = await mysql.createConnection(DB_CONFIG);

  // Check for --reset flag to truncate embeddings table
  if (process.argv.includes('--reset')) {
    console.log('🗑️  Reset flag gedetecteerd - tabel wordt geleegd...');
    try {
      await connection.execute('TRUNCATE TABLE cnl_concept_embeddings');
      console.log('  ✓ Tabel cnl_concept_embeddings geleegd\n');
    } catch (error: any) {
      console.error('  ❌ Kon tabel niet legen:', error.message);
    }
  }

  try {
    // Eerst controleren of de embeddings tabel bestaat
    try {
      await connection.execute('SELECT 1 FROM cnl_concept_embeddings LIMIT 1');
    } catch (tableError: any) {
      if (tableError.code === 'ER_NO_SUCH_TABLE') {
        console.log('⚠️  Tabel cnl_concept_embeddings bestaat niet.');
        console.log('   Voer eerst de database migratie uit met: npm run cnl:migrate');
        console.log('   Of run het SQL bestand direct: mysql -u root -p competentnl_rag < database/005-cv-classification-step.sql\n');
        return;
      }
      throw tableError;
    }

    // Ensure label_type column exists (added for altLabels support)
    try {
      await connection.execute(`
        ALTER TABLE cnl_concept_embeddings
        ADD COLUMN label_type ENUM('pref', 'alt') DEFAULT 'pref'
        COMMENT 'Type label: pref=officieel, alt=synoniem'
        AFTER pref_label
      `);
      console.log('  ✓ Kolom label_type toegevoegd aan cnl_concept_embeddings\n');
    } catch (alterError: any) {
      if (alterError.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, this is OK
      } else {
        console.log(`  ⚠ Kon label_type kolom niet toevoegen: ${alterError.message}`);
      }
    }

    // Extend pref_label column to VARCHAR(500) to prevent truncation of long labels
    try {
      await connection.execute(`
        ALTER TABLE cnl_concept_embeddings
        MODIFY COLUMN pref_label VARCHAR(500) NOT NULL
        COMMENT 'Label tekst (kan prefLabel of altLabel zijn)'
      `);
      console.log('  ✓ Kolom pref_label vergroot naar VARCHAR(500)\n');
    } catch (alterError: any) {
      // Ignore if column is already the right size or other non-critical errors
      if (!alterError.message.includes('already')) {
        console.log(`  ⚠ Kon pref_label kolom niet vergroten: ${alterError.message}`);
      }
    }

    // Haal CNL concepten op via SPARQL
    console.log('📡 Ophalen CNL concepten via SPARQL...\n');

    // Occupation gebruikt SKOS-XL, Education/Capability/Knowledge gebruiken standaard SKOS
    const conceptTypes = [
      { type: 'occupation', query: 'cnlo:Occupation', limit: 35000, useSkosXL: true },  // ~3500 pref + ~25000 alt/spec
      { type: 'education', query: 'cnlo:EducationalNorm', limit: 10000, useSkosXL: false },
      { type: 'capability', query: 'cnlo:HumanCapability', limit: 5000, useSkosXL: false },
      { type: 'knowledge', query: 'cnlo:KnowledgeArea', limit: 2000, useSkosXL: false }  // ~361 kennisgebieden
    ];

    let totalProcessed = 0;

    for (const { type, query, limit, useSkosXL } of conceptTypes) {
      console.log(`\n🔍 Verwerken ${type} (prefLabels + altLabels)...`);

      // Bouw query afhankelijk van of het type SKOS-XL of standaard SKOS gebruikt
      let sparqlQuery: string;

      if (useSkosXL) {
        // SKOS-XL query voor Occupation - labels zijn DetailedLabel objecten
        sparqlQuery = `
          PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
          PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
          PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
          PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>

          SELECT DISTINCT ?uri ?label ?labelType ?description WHERE {
            ?uri a ${query} .
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
              BIND("alt" AS ?labelType)
            }
            OPTIONAL { ?uri skos:definition ?description . FILTER(LANG(?description) = "nl") }
            FILTER(LANG(?label) = "nl")
          }
          ORDER BY ?uri ?labelType
          LIMIT ${limit}
        `;
      } else {
        // Standaard SKOS query voor Education en Capability
        sparqlQuery = `
          PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
          PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

          SELECT DISTINCT ?uri ?label ?labelType ?description WHERE {
            ?uri a ${query} .
            {
              ?uri skos:prefLabel ?label .
              BIND("pref" AS ?labelType)
            } UNION {
              ?uri skos:altLabel ?label .
              BIND("alt" AS ?labelType)
            }
            OPTIONAL { ?uri skos:definition ?description . FILTER(LANG(?description) = "nl") }
            FILTER(LANG(?label) = "nl")
          }
          ORDER BY ?uri ?labelType
          LIMIT ${limit}
        `;
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'CompetentNL-CNL-Setup/1.0'
        };

        // Add API key with correct header name (lowercase 'apikey')
        if (SPARQL_API_KEY) {
          headers['apikey'] = SPARQL_API_KEY;
        }

        // Build request body with URLSearchParams
        const params = new URLSearchParams();
        params.append('query', sparqlQuery);
        params.append('format', 'application/sparql-results+json');

        const response = await fetch(SPARQL_ENDPOINT, {
          method: 'POST',
          headers,
          body: params
        });

        if (!response.ok) {
          console.error(`  ❌ SPARQL query mislukt: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const concepts = data.results?.bindings || [];

        // Tel unieke labels (niet unieke URIs)
        const uniqueLabels = new Set(concepts.map((c: any) => `${c.uri?.value}|${c.label?.value}`));
        console.log(`  📝 ${concepts.length} labels gevonden (${uniqueLabels.size} unieke combinaties)`);

        let processed = 0;
        let prefCount = 0;
        let altCount = 0;

        for (const concept of concepts) {
          const uri = concept.uri?.value;
          const label = concept.label?.value;
          const labelType = concept.labelType?.value || 'pref';
          const description = concept.description?.value || '';

          if (!uri || !label) continue;

          // Check of embedding al bestaat voor deze URI+label combinatie
          const [existing] = await connection.execute(
            'SELECT id FROM cnl_concept_embeddings WHERE concept_uri = ? AND pref_label = ?',
            [uri, label]
          );

          if ((existing as any[]).length > 0) {
            continue; // Skip existing
          }

          // Genereer embedding - combineer label met beschrijving voor betere matching
          const embeddingText = description
            ? `${label} - ${description.substring(0, 200)}`
            : label;
          const embedding = await generateEmbedding(embeddingText);

          // Sla op als binary blob
          const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

          // Insert met ON DUPLICATE KEY UPDATE voor robuustheid
          await connection.execute(
            `INSERT INTO cnl_concept_embeddings
             (concept_uri, concept_type, pref_label, embedding, label_type)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE embedding = VALUES(embedding)`,
            [uri, type, label, embeddingBuffer, labelType]
          );

          processed++;
          totalProcessed++;
          if (labelType === 'pref') prefCount++;
          else altCount++;

          if (processed % 50 === 0) {
            console.log(`  📊 ${processed}/${concepts.length} verwerkt...`);
          }
        }

        console.log(`  ✓ ${processed} nieuwe embeddings gegenereerd (${prefCount} prefLabels, ${altCount} altLabels)`);

      } catch (error) {
        console.error(`  ❌ Error bij ${type}:`, error);
      }
    }

    console.log(`\n📊 Totaal: ${totalProcessed} embeddings gegenereerd`);

    // Statistieken per type en label type
    const [stats] = await connection.execute(`
      SELECT concept_type, label_type, COUNT(*) as count
      FROM cnl_concept_embeddings
      GROUP BY concept_type, label_type
      ORDER BY concept_type, label_type
    `);

    console.log('\n📈 Embeddings per type:');
    let currentType = '';
    for (const row of stats as any[]) {
      if (row.concept_type !== currentType) {
        currentType = row.concept_type;
        console.log(`  ${row.concept_type}:`);
      }
      const labelTypeLabel = row.label_type === 'pref' ? 'prefLabels' : 'altLabels (synoniemen)';
      console.log(`    - ${labelTypeLabel}: ${row.count}`);
    }

    // Totalen
    const [totals] = await connection.execute(`
      SELECT
        COUNT(DISTINCT concept_uri) as unique_concepts,
        COUNT(*) as total_labels,
        SUM(CASE WHEN label_type = 'pref' THEN 1 ELSE 0 END) as pref_count,
        SUM(CASE WHEN label_type = 'alt' THEN 1 ELSE 0 END) as alt_count
      FROM cnl_concept_embeddings
    `);
    const t = (totals as any[])[0];
    console.log(`\n📊 Totalen:`);
    console.log(`  - Unieke concepten: ${t.unique_concepts}`);
    console.log(`  - Totaal labels: ${t.total_labels} (${t.pref_count} pref + ${t.alt_count} alt)`);

  } finally {
    await connection.end();
  }
}

// ============================================================================
// STAP 3: TEST CLASSIFICATIE
// ============================================================================

async function testClassification(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('STAP 3: Test Classificatie');
  console.log('='.repeat(60) + '\n');

  // Dynamisch importeren van classification service
  let CNLClassificationService: any;

  try {
    const classificationModule = await import('../services/cnlClassificationService.ts');
    CNLClassificationService = classificationModule.CNLClassificationService;
    console.log('✅ Classification service geladen\n');
  } catch (error) {
    console.error('❌ Kon classification service niet laden:', error);
    return;
  }

  const pool = mysql.createPool(DB_CONFIG);

  try {
    const service = new CNLClassificationService(pool);

    // Test data - aangepast voor CNL taxonomie
    // Note: CNL education bevat alleen MBO opleidingen, geen HBO
    const testCases = [
      { type: 'occupation', value: 'Software Developer', context: 'Ontwikkelen van web applicaties' },
      { type: 'occupation', value: 'ICT Architect', context: 'Ontwerpen van IT systemen en infrastructuur' },
      { type: 'occupation', value: 'Verpleegkundige', context: 'Zorg voor patiënten in ziekenhuis' },
      { type: 'occupation', value: 'Systeembeheerder', context: 'Beheer van servers en netwerken' },
      { type: 'education', value: 'MBO Applicatieontwikkelaar', context: 'Niveau 4 opleiding' },
      { type: 'education', value: 'MBO Verzorgende IG', context: 'Niveau 3 opleiding' },
      { type: 'capability', value: 'Programmeren', context: 'Python, JavaScript' },
      { type: 'capability', value: 'Analyseren', context: 'Data analyse en probleemoplossing' },
    ];

    console.log('🧪 Uitvoeren test classificaties...\n');
    console.log('-'.repeat(80));

    for (const testCase of testCases) {
      console.log(`\n📌 Test: "${testCase.value}" (${testCase.type})`);
      console.log(`   Context: "${testCase.context}"`);

      try {
        const result = await service.classifyItem(
          {
            section_type: testCase.type === 'occupation' ? 'experience' :
                         testCase.type === 'education' ? 'education' : 'skill',
            content: testCase.type === 'occupation' ? { job_title: testCase.value, description: testCase.context } :
                    testCase.type === 'education' ? { degree: testCase.value, field_of_study: testCase.context } :
                    { skill_name: testCase.value }
          },
          {
            useSemanticMatching: true,
            useLLMFallback: true
          }
        );

        if (result.found && result.match) {
          console.log(`   ✓ Match: "${result.match.prefLabel}"`);
          console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
          console.log(`   🔧 Method: ${result.method}`);
          console.log(`   🔗 URI: ${result.match.uri}`);
        } else {
          console.log(`   ⚠ Geen match gevonden`);
          if (result.alternatives && result.alternatives.length > 0) {
            console.log(`   📝 Alternatieven:`);
            for (const alt of result.alternatives.slice(0, 3)) {
              console.log(`      - ${alt.prefLabel} (${(alt.confidence * 100).toFixed(0)}%)`);
            }
          }
        }

        if (result.needsReview) {
          console.log(`   ⚡ Needs review: true`);
        }

      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n' + '-'.repeat(80));
    console.log('\n✅ Test classificatie voltooid\n');

  } finally {
    await pool.end();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const runAll = args.includes('--all');
  const runMigrate = args.includes('--migrate') || runAll;
  const runEmbeddings = args.includes('--embeddings') || runAll;
  const runTest = args.includes('--test') || runAll;

  if (!runMigrate && !runEmbeddings && !runTest) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║          CNL Classification Setup Script                       ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Gebruik:                                                      ║
║    npm run cnl:setup        (alle stappen)                     ║
║    npm run cnl:migrate      (alleen migratie)                  ║
║    npm run cnl:embeddings   (alleen embeddings)                ║
║    npm run cnl:test         (alleen test)                      ║
║                                                                ║
║  Opties:                                                       ║
║    --migrate     Database migratie uitvoeren                   ║
║    --embeddings  CNL concept embeddings genereren              ║
║    --test        Test classificatie met voorbeelddata          ║
║    --all         Alle stappen uitvoeren                        ║
║    --reset       Leeg embeddings tabel (met --embeddings)      ║
║                                                                ║
║  Voorbeelden:                                                  ║
║    npm run cnl:embeddings -- --reset   (herlaad alle embed.)   ║
║    npm run cnl:setup                   (alle stappen)          ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);
    return;
  }

  console.log('\n🚀 CNL Classification Setup\n');
  console.log('Geselecteerde stappen:');
  if (runMigrate) console.log('  ✓ Database migratie');
  if (runEmbeddings) console.log('  ✓ Embeddings genereren');
  if (runTest) console.log('  ✓ Test classificatie');

  try {
    if (runMigrate) {
      await runMigration();
    }

    if (runEmbeddings) {
      await generateCNLEmbeddings();
    }

    if (runTest) {
      await testClassification();
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Setup voltooid!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Setup gefaald:', error);
    process.exit(1);
  }
}

main();
