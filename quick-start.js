#!/usr/bin/env node

/**
 * CompetentNL SPARQL Agent - Quick Start Script v1.3
 * Cross-platform starter die eerst oude processen stopt
 */

import { spawn, exec, execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { platform } from 'os';

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`)
};

console.log(`
${colors.blue}╔════════════════════════════════════════════╗
║   CompetentNL SPARQL Agent v1.3 - Start    ║
╚════════════════════════════════════════════╝${colors.reset}
`);

// Stap 1: Kill oude processen
console.log(`${colors.yellow}[1/4]${colors.reset} Stoppen oude processen...`);

function killOldProcesses() {
  return new Promise((resolve) => {
    if (platform() === 'win32') {
      // Windows: kill node processen op poort 3000 en 3001
      try {
        // Kill alle node processen (kan falen als er geen zijn)
        execSync('taskkill /F /IM node.exe 2>nul', { stdio: 'ignore' });
        log.success('Oude Node processen gestopt');
      } catch (e) {
        log.info('Geen oude Node processen gevonden');
      }
    } else {
      // Mac/Linux: kill processen op specifieke poorten
      try {
        execSync('lsof -ti:3000,3001 | xargs kill -9 2>/dev/null', { stdio: 'ignore' });
        log.success('Oude processen gestopt');
      } catch (e) {
        log.info('Geen oude processen gevonden');
      }
    }
    
    // Wacht even tot poorten vrijkomen
    setTimeout(resolve, 1000);
  });
}

async function main() {
  await killOldProcesses();
  
  // Stap 2: Check dependencies
  console.log(`${colors.yellow}[2/4]${colors.reset} Controleren dependencies...`);
  
  if (!existsSync('node_modules')) {
    log.warn('node_modules niet gevonden, installeren...');
    try {
      execSync('npm install', { stdio: 'inherit' });
      log.success('Dependencies geïnstalleerd');
    } catch (e) {
      log.error('npm install mislukt');
      process.exit(1);
    }
  } else {
    log.success('Dependencies aanwezig');
  }
  
  // Stap 3: Check .env.local
  console.log(`${colors.yellow}[3/4]${colors.reset} Controleren configuratie...`);
  
  if (!existsSync('.env.local')) {
    log.warn('.env.local niet gevonden, aanmaken...');
    
    const envContent = `# CompetentNL API Configuratie
COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
COMPETENTNL_API_KEY=

# Gemini API Key (voor AI functionaliteit)
GEMINI_API_KEY=

# MariaDB RAG Database
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=root
MARIADB_PASSWORD=
MARIADB_DATABASE=competentnl_rag
`;
    
    writeFileSync('.env.local', envContent);
    log.warn('.env.local aangemaakt - vergeet niet je API keys in te vullen!');
  } else {
    log.success('.env.local gevonden');
    
    const envContent = readFileSync('.env.local', 'utf8');
    if (!envContent.includes('GEMINI_API_KEY=') || envContent.match(/GEMINI_API_KEY=\s*$/m)) {
      log.warn('GEMINI_API_KEY lijkt leeg - AI functionaliteit werkt mogelijk niet');
    }
  }
  
  // Stap 4: Start servers
  console.log(`${colors.yellow}[4/4]${colors.reset} Servers starten...`);
  
  console.log(`
${colors.green}════════════════════════════════════════════${colors.reset}
  ${colors.blue}Frontend:${colors.reset} http://localhost:3000
  ${colors.blue}Backend:${colors.reset}  http://localhost:3001
  ${colors.blue}Health:${colors.reset}   http://localhost:3001/health
${colors.green}════════════════════════════════════════════${colors.reset}

  ${colors.yellow}Tip: Ctrl+C om te stoppen${colors.reset}
`);

  // Open browser na 3 seconden
  setTimeout(() => {
    const url = 'http://localhost:3000';
    const cmd = platform() === 'win32' ? 'start' : 
                platform() === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }, 3000);

  // Start npm start (concurrently)
  const npmStart = spawn('npm', ['start'], { 
    stdio: 'inherit', 
    shell: true 
  });

  npmStart.on('close', (code) => {
    process.exit(code);
  });
}

main();
