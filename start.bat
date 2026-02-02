@echo off
title CompetentNL SPARQL Agent - Startup
color 0B

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║          CompetentNL SPARQL Agent - Quick Start               ║
echo ║           v4.2.0 - with Auto-start GLiNER Service             ║
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
:: STAP 3: Check databases
:: ============================================================
echo.
echo [STAP 3] Databases controleren...

if exist "%MARIADB_PATH%\mysql.exe" (
    :: Check competentnl_rag database
    "%MARIADB_PATH%\mysql.exe" -u root -e "USE competentnl_rag; SELECT COUNT(*) FROM occupation_labels;" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Database competentnl_rag is klaar
    ) else (
        echo [WARN] Database competentnl_rag niet gevonden
        echo [INFO] Voer uit: mysql -u root -p competentnl_rag ^< database/001-complete-setup.sql
    )

    :: Check competentnl_prompts database
    "%MARIADB_PATH%\mysql.exe" -u root -e "USE competentnl_prompts; SELECT COUNT(*) FROM prompts;" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Database competentnl_prompts is klaar
    ) else (
        echo [WARN] Database competentnl_prompts niet gevonden
        echo [INFO] Voer uit: mysql -u root -p competentnl_prompts ^< database/002-prompts-and-examples.sql
    )

    :: Check CV processing tables
    "%MARIADB_PATH%\mysql.exe" -u root -e "USE competentnl_rag; SELECT COUNT(*) FROM user_cvs;" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] CV Processing tables aanwezig
    ) else (
        echo [INFO] CV Processing tables niet gevonden ^(optioneel^)
        echo [INFO] Voor CV upload: mysql -u root -p competentnl_rag ^< database/003-cv-privacy-tables.sql
    )
) else (
    echo [WARN] MariaDB niet gevonden op: %MARIADB_PATH%
    echo [INFO] Pas MARIADB_PATH aan in dit script
)

:: ============================================================
:: STAP 4: GLiNER Service Setup en Start (voor CV Processing)
:: ============================================================
echo.
echo [STAP 4] GLiNER Service ^(PII detectie voor CV upload^)...

:: Check of GLiNER al draait op port 8001
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8001/health' -TimeoutSec 2 -ErrorAction SilentlyContinue; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GLiNER service draait al op http://localhost:8001
    goto :gliner_done
)

:: GLiNER draait niet, probeer te starten
echo [INFO] GLiNER service niet actief, proberen te starten...

:: Check of Python beschikbaar is
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Python niet gevonden - GLiNER kan niet starten
    echo [INFO] Installeer Python 3.11+ van https://python.org
    goto :gliner_done
)

:: Check of venv bestaat, zo niet maak aan
if not exist "services\python\venv" (
    echo [INFO] Python virtual environment aanmaken...
    python -m venv services\python\venv
    if %errorlevel% neq 0 (
        echo [WARN] Kon venv niet aanmaken
        goto :gliner_done
    )
    echo [OK] Virtual environment aangemaakt

    echo [INFO] Dependencies installeren ^(dit kan enkele minuten duren bij eerste keer^)...
    call services\python\venv\Scripts\activate.bat
    pip install --quiet --upgrade pip
    pip install --quiet fastapi uvicorn pydantic python-multipart aiofiles orjson
    pip install --quiet torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
    pip install --quiet gliner onnxruntime huggingface_hub
    if %errorlevel% neq 0 (
        echo [WARN] Fout bij installeren dependencies
        goto :gliner_done
    )
    echo [OK] Dependencies geinstalleerd
)

:: Start GLiNER service in apart venster
echo [INFO] GLiNER service starten in apart venster...
start "GLiNER PII Service" cmd /k "cd /d %~dp0services\python && call venv\Scripts\activate.bat && python gliner_service.py"

:: Wacht even tot service opstart
echo [INFO] Wachten op GLiNER service startup...
timeout /t 5 >nul

:: Verificatie dat service draait
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8001/health' -TimeoutSec 5 -ErrorAction SilentlyContinue; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GLiNER service succesvol gestart op http://localhost:8001
) else (
    echo [WARN] GLiNER service nog niet klaar ^(model laden kan 30-60 sec duren^)
    echo [INFO] Check het GLiNER venster voor status
)

:gliner_done

:: ============================================================
:: STAP 5: Check .env.local
:: ============================================================
echo.
echo [STAP 5] Environment controleren...

if exist ".env.local" (
    echo [OK] .env.local gevonden

    :: Check for CV processing encryption key
    findstr /C:"ENCRYPTION_KEY" .env.local >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] ENCRYPTION_KEY geconfigureerd
    ) else (
        echo [INFO] ENCRYPTION_KEY niet gevonden ^(nodig voor CV processing^)
        echo [INFO] Zie SETUP_CV_PROCESSING.md voor setup instructies
    )
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
:: STAP 6: Check node_modules
:: ============================================================
echo.
echo [STAP 6] Dependencies controleren...

if exist "node_modules" (
    echo [OK] node_modules gevonden
) else (
    echo [INFO] npm install uitvoeren...
    call npm install
)

:: ============================================================
:: STAP 7: Start applicatie
:: ============================================================
echo.
echo [STAP 7] Applicatie starten...
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  Backend:  http://localhost:%BACKEND_PORT%                            ║
echo ║  Frontend: http://localhost:%FRONTEND_PORT% of http://localhost:5173  ║
echo ║  GLiNER:   http://localhost:8001 ^(PII detectie^)           ║
echo ║  CV API:   http://localhost:%BACKEND_PORT%/api/cv                     ║
echo ╠════════════════════════════════════════════════════════════╣
echo ║  Test CV upload: open test-cv-upload.html in browser       ║
echo ║  Sluit BEIDE vensters om alle services te stoppen          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Start de applicatie
call npm run dev

pause
