/**
 * Test Script voor Multi-Prompt Orchestrator
 * ===========================================
 * 
 * Voer uit met: npx ts-node scripts/test-orchestrator.ts
 */

import { createPromptOrchestrator } from '../services/promptOrchestrator';

async function main() {
  console.log('='.repeat(60));
  console.log('CompetentNL Multi-Prompt Orchestrator - Test');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Maak orchestrator
    console.log('[1] Orchestrator initialiseren...');
    const orchestrator = await createPromptOrchestrator({
      host: 'localhost',
      user: 'root',
      password: process.env.DB_PASSWORD || '',
      database: 'competentnl_prompts'
    });
    console.log('    ✓ Verbonden met database\n');

    // Test vragen
    const testQuestions = [
      "Welke vaardigheden heeft een software engineer nodig?",
      "Toon alle beroepen",
      "Hoeveel MBO kwalificaties zijn er?",
      "Vergelijk kapper en schoonheidsspecialist",
      "Wat zijn de taken van een verpleegkundige?"
    ];

    for (let i = 0; i < testQuestions.length; i++) {
      const question = testQuestions[i];
      console.log(`[${i + 2}] Test: "${question}"`);
      
      const result = await orchestrator.orchestrate(question);
      
      console.log(`    Domein: ${result.metadata.primaryDomain}`);
      console.log(`    Confidence: ${(result.domains[0].confidence * 100).toFixed(0)}%`);
      console.log(`    Keywords: ${result.domains[0].matchedKeywords.join(', ') || 'geen'}`);
      console.log(`    Voorbeelden: ${result.metadata.exampleCount}`);
      console.log(`    Schema elementen: ${result.metadata.schemaElementCount}`);
      console.log(`    Prompt lengte: ${result.fullPrompt.length} chars`);
      console.log('');
    }

    // Toon statistieken
    console.log('[Stats] Domein statistieken:');
    const stats = await orchestrator.getStats();
    console.table(stats);

    // Sluit verbinding
    await orchestrator.close();
    console.log('\n✓ Test voltooid!\n');

  } catch (error: any) {
    console.error('\n✗ Fout:', error.message);
    console.error('\nControleer:');
    console.error('1. Is MariaDB actief?');
    console.error('2. Is het wachtwoord correct?');
    console.error('3. Is de database aangemaakt?');
    console.error('\nHerstart setup: scripts\\setup-windows.bat');
    process.exit(1);
  }
}

main();
