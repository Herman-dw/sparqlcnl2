/**
 * Test Script voor Multi-Prompt Orchestrator
 * ===========================================
 * 
 * Voer uit met: npx ts-node integration/scripts/test-orchestrator.ts
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Laad .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Types
interface DomainMatch {
  domainKey: string;
  domainName: string;
  confidence: number;
  matchedKeywords: string[];
}

async function main() {
  console.log('='.repeat(60));
  console.log('CompetentNL Multi-Prompt Orchestrator - Test');
  console.log('='.repeat(60));
  console.log('');

  // Database config
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'competentnl_prompts'
  };

  console.log('[Config] Database:', dbConfig.database);
  console.log('[Config] Host:', dbConfig.host);
  console.log('[Config] User:', dbConfig.user);
  console.log('[Config] Password:', dbConfig.password ? '***' : '(leeg!)');
  console.log('');

  if (!dbConfig.password) {
    console.error('⚠️  WAARSCHUWING: Geen DB_PASSWORD gevonden in .env.local!');
    console.error('   Voeg toe: DB_PASSWORD=jouw_wachtwoord');
    console.error('');
  }

  try {
    // Maak connectie
    console.log('[1] Database verbinding maken...');
    const pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 5
    });

    // Test connectie
    const [testRows] = await pool.execute('SELECT 1 as ok');
    console.log('    ✓ Verbonden met database\n');

    // Haal domeinen op
    console.log('[2] Domeinen ophalen...');
    const [domains] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT domain_key, domain_name, priority FROM prompt_domains ORDER BY priority DESC'
    );
    console.log(`    ✓ ${domains.length} domeinen gevonden:`);
    domains.forEach((d: any) => {
      console.log(`      - ${d.domain_key}: ${d.domain_name} (prio: ${d.priority})`);
    });
    console.log('');

    // Haal keywords op
    console.log('[3] Keywords ophalen...');
    const [keywords] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM classification_keywords'
    );
    console.log(`    ✓ ${(keywords[0] as any).count} keywords geladen\n`);

    // Haal voorbeelden op
    console.log('[4] Voorbeelden ophalen...');
    const [examples] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT pd.domain_name, COUNT(deq.id) as count 
      FROM prompt_domains pd 
      LEFT JOIN domain_example_queries deq ON pd.id = deq.domain_id 
      GROUP BY pd.id
      ORDER BY pd.priority DESC
    `);
    console.log('    ✓ Voorbeelden per domein:');
    examples.forEach((e: any) => {
      console.log(`      - ${e.domain_name}: ${e.count} voorbeelden`);
    });
    console.log('');

    // Test classificatie
    console.log('[5] Test classificatie...');
    const testQuestions = [
      "Welke vaardigheden heeft een software engineer nodig?",
      "Toon alle beroepen",
      "Hoeveel MBO kwalificaties zijn er?",
      "Vergelijk kapper en schoonheidsspecialist"
    ];

    for (const question of testQuestions) {
      const matches = await classifyQuestion(pool, question);
      const primary = matches[0];
      console.log(`    "${question.substring(0, 45)}..."`);
      console.log(`      → ${primary.domainKey} (${(primary.confidence * 100).toFixed(0)}%) [${primary.matchedKeywords.join(', ')}]`);
    }
    console.log('');

    // Sluit connectie
    await pool.end();
    
    console.log('='.repeat(60));
    console.log('✓ Alle tests geslaagd!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Volgende stap: Integreer de orchestrator in je app.');
    console.log('Zie integration/README.md voor instructies.');

  } catch (error: any) {
    console.error('\n✗ Fout:', error.message);
    console.error('');
    console.error('Controleer:');
    console.error('1. Is MariaDB actief? (Check Services)');
    console.error('2. Is DB_PASSWORD correct in .env.local?');
    console.error('3. Is de database aangemaakt? (setup-windows.bat)');
    console.error('');
    process.exit(1);
  }
}

/**
 * Simpele classificatie functie voor test
 */
async function classifyQuestion(pool: mysql.Pool, question: string): Promise<DomainMatch[]> {
  const normalizedQuestion = question.toLowerCase().trim();
  
  // Haal alle keywords op
  const [keywords] = await pool.execute<mysql.RowDataPacket[]>(`
    SELECT 
      ck.keyword_normalized,
      ck.weight,
      ck.is_exclusive,
      pd.domain_key,
      pd.domain_name,
      pd.priority
    FROM classification_keywords ck
    JOIN prompt_domains pd ON ck.domain_id = pd.id
    WHERE pd.is_active = TRUE
    ORDER BY pd.priority DESC, ck.weight DESC
  `);
  
  // Score per domein berekenen
  const domainScores = new Map<string, {
    score: number;
    name: string;
    priority: number;
    matchedKeywords: string[];
    hasExclusive: boolean;
  }>();
  
  for (const kw of keywords) {
    if (normalizedQuestion.includes(kw.keyword_normalized)) {
      const current = domainScores.get(kw.domain_key) || {
        score: 0,
        name: kw.domain_name,
        priority: kw.priority,
        matchedKeywords: [],
        hasExclusive: false
      };
      
      current.score += parseFloat(kw.weight);
      current.matchedKeywords.push(kw.keyword_normalized);
      if (kw.is_exclusive) {
        current.hasExclusive = true;
      }
      
      domainScores.set(kw.domain_key, current);
    }
  }
  
  // Als er een exclusieve match is, gebruik alleen dat domein
  for (const [key, data] of domainScores) {
    if (data.hasExclusive) {
      return [{
        domainKey: key,
        domainName: data.name,
        confidence: Math.min(data.score, 1.0),
        matchedKeywords: data.matchedKeywords
      }];
    }
  }
  
  // Sorteer op score en priority
  const sorted = Array.from(domainScores.entries())
    .map(([key, data]) => ({
      domainKey: key,
      domainName: data.name,
      confidence: Math.min(data.score / 2, 1.0),
      matchedKeywords: data.matchedKeywords,
      priority: data.priority
    }))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.priority - a.priority;
    });
  
  // Return top matches, of fallback naar 'occupation'
  if (sorted.length === 0) {
    return [{
      domainKey: 'occupation',
      domainName: 'Beroepen',
      confidence: 0.3,
      matchedKeywords: []
    }];
  }
  
  return sorted.slice(0, 2);
}

main();
