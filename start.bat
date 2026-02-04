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
:: STAP 1: Stop bestaande processen
:: ============================================================
echo [STAP 1] Bestaande processen stoppen...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node processen gestopt
) else (
    echo [OK] Geen Node processen actief
)

:: Stop ook Python GLiNER als die draait
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *gliner*" >nul 2>&1
:: Kill any python process using port 8001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001"') do (
    taskkill /F /PID %%a >nul 2>&1
)
:: Kill any process using port 3000 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
:: Kill any process using port 3001 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [OK] Poorten 3000, 3001 en 8001 vrijgemaakt
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
echo [TIP] Bij problemen, start handmatig in apart venster:
echo       cd services\python ^&^& venv\Scripts\activate ^&^& python gliner_service.py

:: Check of Python beschikbaar is
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Python niet gevonden - GLiNER kan niet starten
    echo [INFO] Installeer Python 3.11+ van https://python.org
    goto :gliner_done
)

:: Bepaal welke venv directory bestaat (venv311 heeft voorkeur - vereist Python 3.11)
set VENV_DIR=
if exist "services\python\venv311\Scripts\activate.bat" (
    set VENV_DIR=venv311
) else if exist "services\python\venv\Scripts\activate.bat" (
    echo [WARN] Oude venv gevonden - overweeg te verwijderen en venv311 te gebruiken
    set VENV_DIR=venv
)

:: Als geen venv bestaat, maak venv311 aan met Python 3.11
if "%VENV_DIR%"=="" (
    echo [INFO] Python 3.11 virtual environment aanmaken...

    :: Probeer eerst py -3.11, dan python
    py -3.11 -m venv services\python\venv311 2>nul
    if %errorlevel% neq 0 (
        echo [INFO] py -3.11 niet gevonden, probeer python...
        python -m venv services\python\venv311
        if %errorlevel% neq 0 (
            echo [WARN] Kon venv311 niet aanmaken
            echo [INFO] Installeer Python 3.11+ van https://python.org
            goto :gliner_done
        )
    )
    set VENV_DIR=venv311
    echo [OK] Virtual environment venv311 aangemaakt

    echo [INFO] Dependencies installeren ^(dit kan enkele minuten duren bij eerste keer^)...
    cmd /c "cd /d %~dp0services\python && call %VENV_DIR%\Scripts\activate.bat && pip install --quiet --upgrade pip && pip install --quiet fastapi uvicorn pydantic python-multipart aiofiles orjson && pip install --quiet torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu && pip install --quiet gliner onnxruntime huggingface_hub"
    if %errorlevel% neq 0 (
        echo [WARN] Fout bij installeren dependencies
        goto :gliner_done
    )
    echo [OK] Dependencies geinstalleerd
) else (
    echo [OK] Virtual environment gevonden: %VENV_DIR%
)

:: Laad HF_TOKEN uit .env.local als die bestaat
set HF_TOKEN_CMD=
if exist ".env.local" (
    for /f "tokens=1,2 delims==" %%a in ('findstr /R "^HF_TOKEN=" .env.local 2^>nul') do (
        set HF_TOKEN_CMD=set HF_TOKEN=%%b ^&^& set HUGGINGFACE_HUB_TOKEN=%%b ^&^&
        echo [OK] HF_TOKEN geladen uit .env.local
    )
)

:: Start GLiNER service in apart minimized venster (zodat het blijft draaien)
echo [INFO] GLiNER service starten in achtergrond...
echo [INFO] Eerste keer kan lang duren ^(model downloaden ~100MB^)
start /MIN "GLiNER Service" cmd /c "cd /d %~dp0services\python && call %VENV_DIR%\Scripts\activate.bat && %HF_TOKEN_CMD% python gliner_service.py"

:: Wacht op GLiNER service met retry loop (max 60 seconden)
echo [INFO] Wachten op GLiNER service startup...
set /a GLINER_RETRIES=0
set /a GLINER_MAX_RETRIES=12

:gliner_wait_loop
timeout /t 5 >nul
set /a GLINER_RETRIES+=1
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8001/health' -TimeoutSec 3 -ErrorAction SilentlyContinue; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GLiNER service succesvol gestart op http://localhost:8001
    goto :gliner_done
)
echo [INFO] Wachten op GLiNER... ^(%GLINER_RETRIES%/%GLINER_MAX_RETRIES%^)
if %GLINER_RETRIES% lss %GLINER_MAX_RETRIES% goto :gliner_wait_loop

:: Max retries bereikt
echo [WARN] GLiNER service niet beschikbaar na 60 seconden
echo [INFO] CV upload werkt niet zonder GLiNER
echo [INFO] Start handmatig: cd services\python ^&^& venv\Scripts\activate ^&^& python gliner_service.py

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
echo.
echo [START] npm run dev starten...
echo.
npm run dev

:: Als we hier komen is npm gestopt of gecrasht
echo.
echo [INFO] Applicatie is gestopt.
pause
