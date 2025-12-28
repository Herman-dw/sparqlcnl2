@echo off
title CompetentNL SPARQL Agent - Startup
color 0B

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║          CompetentNL SPARQL Agent - Quick Start               ║
echo ║                        v4.0.0                                 ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

:: Configuratie
set BACKEND_PORT=3001
set FRONTEND_PORT=3000
set MARIADB_PATH=C:\Program Files\MariaDB 11.8\bin

:: ============================================================
:: STAP 1: Stop bestaande Node processen
:: ============================================================
echo [STAP 1] Node processen stoppen...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node processen gestopt
) else (
    echo [OK] Geen Node processen actief
)
timeout /t 1 >nul

:: ============================================================
:: STAP 2: Check MariaDB
:: ============================================================
echo.
echo [STAP 2] MariaDB controleren...

:: Check of MariaDB service draait
sc query MariaDB >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] MariaDB service gevonden
    
    :: Check status
    for /f "tokens=3 delims=: " %%a in ('sc query MariaDB ^| findstr "STATE"') do (
        if "%%a"=="RUNNING" (
            echo [OK] MariaDB draait
        ) else (
            echo [WARN] MariaDB starten...
            net start MariaDB
        )
    )
) else (
    :: Probeer MySQL service
    sc query MySQL >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] MySQL service gevonden
        net start MySQL >nul 2>&1
    ) else (
        echo [WARN] Geen MariaDB/MySQL service gevonden
        echo [INFO] Controleer of MariaDB draait
    )
)

:: ============================================================
:: STAP 3: Check database
:: ============================================================
echo.
echo [STAP 3] Database controleren...

if exist "%MARIADB_PATH%\mysql.exe" (
    "%MARIADB_PATH%\mysql.exe" -u root -e "USE competentnl_rag; SELECT COUNT(*) FROM occupation_labels;" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Database competentnl_rag is klaar
    ) else (
        echo [WARN] Database niet gevonden of niet klaar
        echo [INFO] Voer database-setup.sql handmatig uit
        
        if exist "database-setup.sql" (
            echo.
            set /p SETUP="Wil je database-setup.sql nu uitvoeren? (j/n): "
            if /i "%SETUP%"=="j" (
                echo [INFO] Database setup uitvoeren...
                type database-setup.sql | "%MARIADB_PATH%\mysql.exe" -u root
                echo [OK] Database setup voltooid
            )
        )
    )
) else (
    echo [WARN] MariaDB niet gevonden op: %MARIADB_PATH%
    echo [INFO] Pas MARIADB_PATH aan in dit script
)

:: ============================================================
:: STAP 4: Check .env.local
:: ============================================================
echo.
echo [STAP 4] Environment controleren...

if exist ".env.local" (
    echo [OK] .env.local gevonden
) else (
    echo [WARN] .env.local niet gevonden!
    if exist ".env.example" (
        copy .env.example .env.local >nul
        echo [OK] .env.local aangemaakt van .env.example
        echo [INFO] Pas de waarden aan in .env.local!
    ) else (
        echo [ERROR] Maak een .env.local bestand aan met de juiste configuratie
    )
)

:: ============================================================
:: STAP 5: Check node_modules
:: ============================================================
echo.
echo [STAP 5] Dependencies controleren...

if exist "node_modules" (
    echo [OK] node_modules gevonden
) else (
    echo [INFO] npm install uitvoeren...
    call npm install
)

:: ============================================================
:: STAP 6: Start applicatie
:: ============================================================
echo.
echo [STAP 6] Applicatie starten...
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  Backend:  http://localhost:%BACKEND_PORT%                            ║
echo ║  Frontend: http://localhost:%FRONTEND_PORT% of http://localhost:5173  ║
echo ╠════════════════════════════════════════════════════════════╣
echo ║  Sluit dit venster om de servers te stoppen                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Start de applicatie
call npm run dev

pause
