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
const SPARQL_ENDPOINT = process.env.SPARQL_ENDPOINT || 'https://linkeddata.competentnl.nl/sparql';

// ============================================================================
// STAP 1: DATABASE MIGRATIE
// ============================================================================

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
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔄 Uitvoeren migratie...\n');

    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      if (statement.toLowerCase().startsWith('use ')) {
        // Skip USE statements, we're already connected to the database
        continue;
      }

      try {
        await connection.execute(statement);
        successCount++;

        // Log wat we doen
        const firstLine = statement.split('\n')[0].substring(0, 60);
        console.log(`  ✓ ${firstLine}...`);
      } catch (error: any) {
        // Sommige errors zijn OK (bijv. column already exists)
        if (error.code === 'ER_DUP_FIELDNAME' ||
            error.code === 'ER_TABLE_EXISTS_ERROR' ||
            error.message.includes('Duplicate column')) {
          console.log(`  ⚠ Overgeslagen (bestaat al): ${statement.substring(0, 50)}...`);
        } else {
          console.error(`  ❌ Error: ${error.message}`);
          errorCount++;
        }
      }
    }

    console.log(`\n📊 Migratie voltooid: ${successCount} statements, ${errorCount} errors`);

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

  const connection = await mysql.createConnection(DB_CONFIG);

  try {
    // Haal CNL concepten op via SPARQL
    console.log('📡 Ophalen CNL concepten via SPARQL...\n');

    const conceptTypes = [
      { type: 'occupation', query: 'cnlo:Occupation' },
      { type: 'education', query: 'cnlo:EducationalNorm' },
      { type: 'capability', query: 'cnlo:HumanCapability' }
    ];

    let totalProcessed = 0;

    for (const { type, query } of conceptTypes) {
      console.log(`\n🔍 Verwerken ${type}...`);

      const sparqlQuery = `
        PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

        SELECT DISTINCT ?uri ?label WHERE {
          ?uri a ${query} .
          ?uri skos:prefLabel ?label .
          FILTER(LANG(?label) = "nl")
        }
        LIMIT 500
      `;

      try {
        const response = await fetch(SPARQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/sparql-results+json'
          },
          body: `query=${encodeURIComponent(sparqlQuery)}`
        });

        if (!response.ok) {
          console.error(`  ❌ SPARQL query mislukt: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const concepts = data.results?.bindings || [];

        console.log(`  📝 ${concepts.length} concepten gevonden`);

        let processed = 0;
        for (const concept of concepts) {
          const uri = concept.uri?.value;
          const label = concept.label?.value;

          if (!uri || !label) continue;

          // Check of embedding al bestaat
          const [existing] = await connection.execute(
            'SELECT id FROM cnl_concept_embeddings WHERE concept_uri = ?',
            [uri]
          );

          if ((existing as any[]).length > 0) {
            continue; // Skip existing
          }

          // Genereer embedding
          const embedding = await generateEmbedding(label);

          // Sla op als binary blob
          const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

          await connection.execute(
            `INSERT INTO cnl_concept_embeddings
             (concept_uri, concept_type, pref_label, embedding)
             VALUES (?, ?, ?, ?)`,
            [uri, type, label, embeddingBuffer]
          );

          processed++;
          totalProcessed++;

          if (processed % 50 === 0) {
            console.log(`  📊 ${processed}/${concepts.length} verwerkt...`);
          }
        }

        console.log(`  ✓ ${processed} nieuwe embeddings gegenereerd`);

      } catch (error) {
        console.error(`  ❌ Error bij ${type}:`, error);
      }
    }

    console.log(`\n📊 Totaal: ${totalProcessed} embeddings gegenereerd`);

    // Statistieken
    const [stats] = await connection.execute(`
      SELECT concept_type, COUNT(*) as count
      FROM cnl_concept_embeddings
      GROUP BY concept_type
    `);

    console.log('\n📈 Embeddings per type:');
    for (const row of stats as any[]) {
      console.log(`  - ${row.concept_type}: ${row.count}`);
    }

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

    // Test data
    const testCases = [
      { type: 'occupation', value: 'Software Developer', context: 'Ontwikkelen van web applicaties' },
      { type: 'occupation', value: 'Kapper', context: 'Haarverzorging en styling' },
      { type: 'occupation', value: 'Verpleegkundige', context: 'Zorg voor patiënten in ziekenhuis' },
      { type: 'education', value: 'HBO Informatica', context: 'Bachelor programma' },
      { type: 'education', value: 'MBO Verzorging', context: 'Niveau 3 opleiding' },
      { type: 'capability', value: 'Programmeren', context: 'Python, JavaScript' },
      { type: 'capability', value: 'Communicatieve vaardigheden', context: 'Klantcontact' },
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
║    npx ts-node --esm scripts/setup-cnl-classification.ts       ║
║                                                                ║
║  Opties:                                                       ║
║    --migrate     Database migratie uitvoeren                   ║
║    --embeddings  CNL concept embeddings genereren              ║
║    --test        Test classificatie met voorbeelddata          ║
║    --all         Alle stappen uitvoeren                        ║
║                                                                ║
║  Voorbeelden:                                                  ║
║    npx ts-node --esm scripts/setup-cnl-classification.ts --all ║
║    npx ts-node --esm scripts/setup-cnl-classification.ts       ║
║        --migrate --test                                        ║
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
