#!/usr/bin/env node

/**
 * CompetentNL SPARQL Agent - Quick Start Script
 * Cross-platform starter die werkt op Windows, Mac en Linux
 */

import { spawn, exec } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { platform } from 'os';

// Kleuren (werkt op de meeste terminals)
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
║   CompetentNL SPARQL Agent - Opstarten     ║
╚════════════════════════════════════════════╝${colors.reset}
`);

// Check dependencies
console.log(`${colors.yellow}[1/3]${colors.reset} Controleren dependencies...`);
if (!existsSync('node_modules')) {
  log.warn('node_modules niet gevonden, installeren...');
  const install = spawn('npm', ['install'], { 
    stdio: 'inherit', 
    shell: true 
  });
  
  install.on('close', (code) => {
    if (code === 0) {
      log.success('Dependencies geïnstalleerd');
      checkEnvAndStart();
    } else {
      log.error('npm install mislukt');
      process.exit(1);
    }
  });
} else {
  log.success('Dependencies aanwezig');
  checkEnvAndStart();
}

function checkEnvAndStart() {
  // Check .env.local
  console.log(`${colors.yellow}[2/3]${colors.reset} Controleren configuratie...`);
  
  if (!existsSync('.env.local')) {
    log.warn('.env.local niet gevonden, aanmaken...');
    
    const envContent = `# CompetentNL API Configuratie
COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
COMPETENTNL_API_KEY=

# Gemini API Key (voor AI functionaliteit)
GEMINI_API_KEY=
`;
    
    writeFileSync('.env.local', envContent);
    log.warn('.env.local aangemaakt - vergeet niet je API keys in te vullen!');
    console.log(`
  ${colors.yellow}Open .env.local en voeg toe:${colors.reset}
    - COMPETENTNL_API_KEY (optioneel)
    - GEMINI_API_KEY (vereist voor AI)
`);
  } else {
    log.success('.env.local gevonden');
    
    // Check of GEMINI_API_KEY is ingevuld
    const envContent = readFileSync('.env.local', 'utf8');
    if (envContent.includes('GEMINI_API_KEY=\n') || envContent.includes('GEMINI_API_KEY=""')) {
      log.warn('GEMINI_API_KEY is leeg in .env.local');
    }
  }
  
  startServers();
}

function startServers() {
  console.log(`${colors.yellow}[3/3]${colors.reset} Servers starten...`);
  
  console.log(`
${colors.green}════════════════════════════════════════════${colors.reset}
  ${colors.blue}Frontend:${colors.reset} http://localhost:3000
  ${colors.blue}Backend:${colors.reset}  http://localhost:3001
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

  // Start npm start
  const npmStart = spawn('npm', ['start'], { 
    stdio: 'inherit', 
    shell: true 
  });

  npmStart.on('close', (code) => {
    process.exit(code);
  });
}
