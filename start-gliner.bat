@echo off
:: Start GLiNER service minimized (no visible window)
:: The service will run in the background

title GLiNER Service Starter

echo Starting GLiNER PII Detection Service...

:: Check if already running
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8001/health' -TimeoutSec 2 -ErrorAction SilentlyContinue; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GLiNER service is already running on http://localhost:8001
    exit /b 0
)

:: Start Python in minimized window using powershell
echo [INFO] Starting GLiNER service in background...
powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'python' -ArgumentList 'services/python/gliner_service.py' -WindowStyle Hidden -WorkingDirectory '%~dp0'"

:: Wait a moment for startup
timeout /t 3 /nobreak >nul

:: Verify it started
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8001/health' -TimeoutSec 5 -ErrorAction SilentlyContinue; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GLiNER service started successfully on http://localhost:8001
) else (
    echo [WARN] GLiNER service may still be starting... check http://localhost:8001/health
)
