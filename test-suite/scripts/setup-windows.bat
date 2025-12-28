@echo off
REM ============================================================
REM CompetentNL Test Suite - Windows Setup Script
REM ============================================================
REM Dit script installeert en configureert de test suite.

echo.
echo ============================================================
echo   CompetentNL Test Suite - Setup
echo ============================================================
echo.

REM Check of Node.js is geïnstalleerd
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is niet gevonden!
    echo         Installeer Node.js van https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [1] Node.js gevonden: 
node --version
echo.

REM Installeer dependencies
echo [2] Dependencies installeren...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install mislukt!
    pause
    exit /b 1
)
echo     OK
echo.

REM Check TypeScript
echo [3] TypeScript controleren...
call npx tsc --version
if %ERRORLEVEL% neq 0 (
    echo [WARN] TypeScript niet gevonden, installeren...
    call npm install -D typescript ts-node
)
echo     OK
echo.

REM Maak output directory
echo [4] Directories aanmaken...
if not exist "results" mkdir results
if not exist "dist" mkdir dist
echo     OK
echo.

REM Test backend connectivity
echo [5] Backend connectiviteit testen...
curl -s http://127.0.0.1:3001/health >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] Backend server niet bereikbaar op http://127.0.0.1:3001
    echo        Zorg dat de backend server draait voordat je tests uitvoert.
) else (
    echo     Backend OK
)
echo.

REM TypeScript type check
echo [6] TypeScript type check...
call npx tsc --noEmit 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] TypeScript type errors gevonden (dit kan normaal zijn)
) else (
    echo     OK
)
echo.

echo ============================================================
echo   Setup voltooid!
echo ============================================================
echo.
echo Volgende stappen:
echo.
echo   1. Zorg dat de backend server draait:
echo      cd .. ^&^& node server.js
echo.
echo   2. Run de tests:
echo      npm test
echo.
echo   3. Of open het Test Dashboard in de browser:
echo      - Integreer TestDashboard.tsx in je React app
echo      - Klik op het test-icoon in de sidebar
echo.
echo ============================================================
echo.
pause
