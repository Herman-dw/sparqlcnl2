@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════╗
echo ║   CompetentNL SPARQL Agent - Opstarten     ║
echo ╚════════════════════════════════════════════╝
echo.

:: Check Node.js
echo [1/4] Controleren Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo X Node.js niet gevonden. Installeer via https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo √ Node.js gevonden: %NODE_VERSION%

:: Check npm
echo [2/4] Controleren npm...
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo X npm niet gevonden.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo √ npm gevonden: %NPM_VERSION%

:: Check dependencies
echo [3/4] Controleren dependencies...
if not exist "node_modules" (
    echo   → node_modules niet gevonden, installeren...
    call npm install
    echo √ Dependencies geinstalleerd
) else (
    echo √ Dependencies aanwezig
)

:: Check .env.local
echo [4/4] Controleren configuratie...
if not exist ".env.local" (
    echo   → .env.local niet gevonden, aanmaken...
    (
        echo # CompetentNL API Configuratie
        echo COMPETENTNL_ENDPOINT=https://sparql.competentnl.nl
        echo COMPETENTNL_API_KEY=
        echo.
        echo # Gemini API Key ^(voor AI functionaliteit^)
        echo GEMINI_API_KEY=
    ) > .env.local
    echo.
    echo   ! .env.local aangemaakt - vul je API keys in!
    echo.
    echo   Open .env.local en voeg toe:
    echo     - COMPETENTNL_API_KEY ^(optioneel^)
    echo     - GEMINI_API_KEY ^(vereist voor AI^)
    echo.
    pause
) else (
    echo √ .env.local gevonden
)

echo.
echo ════════════════════════════════════════════
echo   Alles klaar! Servers starten...
echo ════════════════════════════════════════════
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:3001
echo.
echo   Tip: Ctrl+C om te stoppen
echo.

:: Open browser na 3 seconden
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start de applicatie
call npm start
