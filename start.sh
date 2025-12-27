#!/bin/bash

# CompetentNL SPARQL Agent - Start Script
# ========================================

set -e

# Kleuren voor output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════╗"
echo "║   CompetentNL SPARQL Agent - Opstarten     ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Node.js
echo -e "${YELLOW}[1/4]${NC} Controleren Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js niet gevonden. Installeer Node.js via https://nodejs.org${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js gevonden: ${NODE_VERSION}${NC}"

# Check npm
echo -e "${YELLOW}[2/4]${NC} Controleren npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm niet gevonden.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm gevonden: $(npm -v)${NC}"

# Check/install dependencies
echo -e "${YELLOW}[3/4]${NC} Controleren dependencies..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}  → node_modules niet gevonden, installeren...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies geïnstalleerd${NC}"
else
    echo -e "${GREEN}✓ Dependencies aanwezig${NC}"
fi

# Check .env.local
echo -e "${YELLOW}[4/4]${NC} Controleren configuratie..."
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}  → .env.local niet gevonden, aanmaken...${NC}"
    cat > .env.local << 'EOF'
# CompetentNL API Configuratie
COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
COMPETENTNL_API_KEY=

# Gemini API Key (voor AI functionaliteit)
GEMINI_API_KEY=
EOF
    echo -e "${YELLOW}  ⚠ .env.local aangemaakt - vul je API keys in!${NC}"
    echo ""
    echo -e "${YELLOW}  Open .env.local en voeg toe:${NC}"
    echo -e "${YELLOW}    - COMPETENTNL_API_KEY (optioneel)${NC}"
    echo -e "${YELLOW}    - GEMINI_API_KEY (vereist voor AI)${NC}"
    echo ""
    read -p "  Druk Enter om door te gaan, of Ctrl+C om te stoppen..."
else
    echo -e "${GREEN}✓ .env.local gevonden${NC}"
    
    # Check of GEMINI_API_KEY is ingevuld
    if grep -q "GEMINI_API_KEY=$" .env.local || grep -q "GEMINI_API_KEY=\"\"" .env.local; then
        echo -e "${YELLOW}  ⚠ Let op: GEMINI_API_KEY is leeg in .env.local${NC}"
    fi
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Alles klaar! Servers starten...${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}Frontend:${NC} http://localhost:3000"
echo -e "  ${BLUE}Backend:${NC}  http://localhost:3001"
echo ""
echo -e "  ${YELLOW}Tip: Ctrl+C om te stoppen${NC}"
echo ""

# Open browser na 3 seconden (achtergrond)
(sleep 3 && open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null || start http://localhost:3000 2>/dev/null) &

# Start de applicatie
npm start
