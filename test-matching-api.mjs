/**
 * Test script voor Profile Matching API v1.1.0
 * =============================================
 * 
 * Gebruik:
 *   node test-matching-api.mjs
 *   node test-matching-api.mjs --profile="Verzorgen,Verplegen"
 * 
 * LET OP: Eerste run duurt langer omdat de cache wordt opgebouwd (~30-60 sec)
 *         Daarna zijn requests veel sneller.
 */

import { matchProfile, preloadCache } from './profile-matching-api.mjs';

// ============================================================
// TEST PROFIELEN
// ============================================================

const TEST_PROFILES = [
  {
    name: 'Zorgprofiel (Verpleegkundige)',
    profile: {
      skills: ['Verzorgen', 'Verplegen', 'Aandacht en begrip tonen', 'Communiceren'],
      knowledge: ['Gezondheidszorg'],
      tasks: []
    }
  },
  {
    name: 'IT Profiel (Developer)',
    profile: {
      skills: ['Programmeren', 'Analyseren', 'Problemen oplossen'],
      knowledge: ['Informatica', 'Softwareontwikkeling'],
      tasks: []
    }
  },
  {
    name: 'Creatief Profiel (Ontwerper)',
    profile: {
      skills: ['Non-verbaal creatief uitdrukken', 'Ontwerpen van systemen en producten'],
      knowledge: [],
      tasks: []
    }
  },
  {
    name: 'Leidinggevend Profiel',
    profile: {
      skills: ['Leiding geven', 'Coördineren', 'Organiseren', 'Communiceren'],
      knowledge: [],
      tasks: []
    }
  }
];

// ============================================================
// DISPLAY HELPERS
// ============================================================

function printScore(score) {
  const percentage = (score * 100).toFixed(1);
  const filled = Math.round(score * 20);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return `[${bar}] ${percentage}%`;
}

function printMatch(match, index) {
  console.log(`\n   ${index}. ${match.occupation.label}`);
  console.log(`      Score: ${printScore(match.score)}`);
  
  const { skills, knowledge, tasks } = match.breakdown;
  console.log(`      Skills:    ${(skills.score * 100).toFixed(0).padStart(3)}% (${skills.matchedCount}/${skills.totalCount} matched) × ${skills.weight} weight`);
  console.log(`      Knowledge: ${(knowledge.score * 100).toFixed(0).padStart(3)}% (${knowledge.matchedCount}/${knowledge.totalCount} matched) × ${knowledge.weight} weight`);
  console.log(`      Tasks:     ${(tasks.score * 100).toFixed(0).padStart(3)}% (${tasks.matchedCount}/${tasks.totalCount} matched) × ${tasks.weight} weight`);
  
  if (match.gaps?.skills?.length > 0) {
    const topGaps = match.gaps.skills.slice(0, 3).map(g => {
      const idfStr = g.idf ? ` (IDF: ${g.idf.toFixed(2)})` : '';
      return `${g.label}${idfStr}`;
    }).join(', ');
    console.log(`      Gaps: ${topGaps}`);
  }
  
  if (match.matched?.skills?.length > 0) {
    const matchedSkills = match.matched.skills.slice(0, 5).map(m => m.label).join(', ');
    console.log(`      Matched: ${matchedSkills}`);
  }
}

// ============================================================
// MAIN TEST
// ============================================================

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('   Profile Matching API v1.1.0 - Test Suite');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  console.log('ℹ️  Eerste run bouwt cache op (~30-60 sec), daarna veel sneller.\n');
  
  // Check voor custom profiel via command line
  const customArg = process.argv.find(a => a.startsWith('--profile='));
  if (customArg) {
    const skillsStr = customArg.split('=')[1];
    const skills = skillsStr.split(',').map(s => s.trim());
    TEST_PROFILES.unshift({
      name: 'Custom Profiel',
      profile: { skills, knowledge: [], tasks: [] }
    });
  }
  
  for (const test of TEST_PROFILES) {
    console.log('─'.repeat(70));
    console.log(`\n📋 ${test.name}`);
    console.log('─'.repeat(70));
    
    console.log('\n   Input:');
    if (test.profile.skills.length > 0) {
      console.log(`   • Skills: ${test.profile.skills.join(', ')}`);
    }
    if (test.profile.knowledge.length > 0) {
      console.log(`   • Knowledge: ${test.profile.knowledge.join(', ')}`);
    }
    if (test.profile.tasks.length > 0) {
      console.log(`   • Tasks: ${test.profile.tasks.join(', ')}`);
    }
    
    const startTime = Date.now();
    
    try {
      const result = await matchProfile(test.profile, {
        limit: 5,
        minScore: 0.05,
        includeGaps: true,
        includeMatched: true
      });
      
      const duration = Date.now() - startTime;
      
      if (!result.success) {
        console.log(`\n   ❌ Error: ${result.error}`);
        continue;
      }
      
      console.log(`\n   ✅ ${result.matches.length} matches gevonden (${duration}ms)`);
      
      // Toon resolved profiel
      if (result.meta?.resolvedProfile) {
        const resolved = result.meta.resolvedProfile;
        const unresolvedSkills = resolved.skills.filter(s => !s.uri);
        if (unresolvedSkills.length > 0) {
          console.log(`   ⚠️  Niet gevonden: ${unresolvedSkills.map(s => s.input).join(', ')}`);
        }
      }
      
      console.log('\n   Top 5 matches:');
      
      result.matches.forEach((match, i) => {
        printMatch(match, i + 1);
      });
      
    } catch (error) {
      console.log(`\n   ❌ Exception: ${error.message}`);
    }
    
    console.log('\n');
  }
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('   Tests voltooid');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  process.exit(0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
