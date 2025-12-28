@echo off
title CompetentNL - Stop All
color 0C

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║           CompetentNL SPARQL Agent - Stop All                 ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

echo [INFO] Node processen stoppen...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node processen gestopt
) else (
    echo [OK] Geen Node processen actief
)

echo.
echo [INFO] Poorten vrijgeven...

:: Poort 3001 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo [INFO] Proces op poort 3001 stoppen (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: Poort 3000 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [INFO] Proces op poort 3000 stoppen (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: Poort 5173 (Vite)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo [INFO] Proces op poort 5173 stoppen (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [OK] Alle CompetentNL processen gestopt!
echo.
pause
