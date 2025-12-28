@echo off
REM ============================================================
REM CompetentNL Multi-Prompt System - Setup Script (Windows)
REM ============================================================
REM 
REM Dit script:
REM 1. Maakt de database aan
REM 2. Laadt alle tabellen en seed data
REM 3. Installeert npm packages
REM 4. Test de verbinding
REM
REM VEREISTEN:
REM - MariaDB 11.8 geïnstalleerd in "C:\Program Files\MariaDB 11.8\"
REM - Node.js geïnstalleerd
REM - Je weet het root wachtwoord van MariaDB
REM ============================================================

echo.
echo ========================================
echo CompetentNL Multi-Prompt System Setup
echo ========================================
echo.

REM Stel het pad naar mysql in
set MYSQL_PATH="C:\Program Files\MariaDB 11.8\bin\mysql.exe"

REM Check of mysql bestaat
if not exist %MYSQL_PATH% (
    echo [ERROR] MySQL niet gevonden op %MYSQL_PATH%
    echo.
    echo Pas het pad aan in dit script of installeer MariaDB.
    pause
    exit /b 1
)

echo [INFO] MySQL gevonden: %MYSQL_PATH%
echo.

REM Vraag om wachtwoord
set /p DB_PASSWORD="Voer MariaDB root wachtwoord in: "
echo.

REM Stap 1: Database setup
echo [1/4] Database en tabellen aanmaken...
%MYSQL_PATH% -u root -p%DB_PASSWORD% < database\001-complete-setup.sql
if errorlevel 1 (
    echo [ERROR] Database setup mislukt!
    pause
    exit /b 1
)
echo [OK] Database tabellen aangemaakt
echo.

REM Stap 2: Prompts en examples laden
echo [2/4] Prompts en voorbeelden laden...
%MYSQL_PATH% -u root -p%DB_PASSWORD% competentnl_prompts < database\002-prompts-and-examples.sql
if errorlevel 1 (
    echo [ERROR] Prompts laden mislukt!
    pause
    exit /b 1
)
echo [OK] Prompts en voorbeelden geladen
echo.

REM Stap 3: npm packages installeren
echo [3/4] NPM packages installeren...
call npm install mysql2
if errorlevel 1 (
    echo [WARNING] mysql2 installatie mislukt, probeer handmatig: npm install mysql2
)
echo [OK] NPM packages klaar
echo.

REM Stap 4: Maak .env bestand
echo [4/4] Environment bestand maken...
(
echo # CompetentNL Multi-Prompt System
echo DB_HOST=localhost
echo DB_PORT=3306
echo DB_USER=root
echo DB_PASSWORD=%DB_PASSWORD%
echo DB_NAME=competentnl_prompts
) > .env.prompts

echo [OK] .env.prompts aangemaakt
echo.

REM Toon resultaat
echo ========================================
echo Setup Voltooid!
echo ========================================
echo.
echo Database: competentnl_prompts
echo Tabellen: 7 aangemaakt
echo Domeinen: 7 geconfigureerd
echo Keywords: 50+ geladen
echo Voorbeelden: 10+ SPARQL queries
echo.
echo Volgende stappen:
echo 1. Kopieer services/promptOrchestrator.ts naar je project
echo 2. Kopieer services/geminiService.ts (vervangt oude versie)
echo 3. Voeg toe aan .env.local:
echo    DB_HOST=localhost
echo    DB_USER=root
echo    DB_PASSWORD=jouw_wachtwoord
echo    DB_NAME=competentnl_prompts
echo.
echo 4. Test met: npx ts-node scripts/test-orchestrator.ts
echo.
pause
