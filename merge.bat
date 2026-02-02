@echo off
:: Quick merge current branch to main (no PR, no confirmation)
:: Usage: merge.bat

setlocal enabledelayedexpansion

:: Get current branch
for /f "tokens=*" %%a in ('git branch --show-current') do set CURRENT_BRANCH=%%a

if "%CURRENT_BRANCH%"=="main" (
    echo [ERROR] Already on main branch. Switch to a feature branch first.
    exit /b 1
)

echo.
echo ══════════════════════════════════════════════════════
echo   Merging: %CURRENT_BRANCH% -^> main
echo ══════════════════════════════════════════════════════
echo.

:: Pull latest from current branch
echo [1/5] Pulling latest from %CURRENT_BRANCH%...
git pull origin %CURRENT_BRANCH% 2>nul
if %errorlevel% neq 0 (
    echo [WARN] Could not pull, continuing anyway...
)

:: Switch to main
echo [2/5] Switching to main...
git checkout main
if %errorlevel% neq 0 (
    echo [ERROR] Failed to checkout main
    exit /b 1
)

:: Pull latest main
echo [3/5] Pulling latest main...
git pull origin main 2>nul

:: Merge
echo [4/5] Merging %CURRENT_BRANCH%...
git merge %CURRENT_BRANCH% --no-ff -m "Merge branch '%CURRENT_BRANCH%'"
if %errorlevel% neq 0 (
    echo [ERROR] Merge failed - resolve conflicts manually
    exit /b 1
)

:: Push
echo [5/5] Pushing to origin/main...
git push origin main
if %errorlevel% neq 0 (
    echo [ERROR] Push failed
    exit /b 1
)

echo.
echo ══════════════════════════════════════════════════════
echo   SUCCESS! Merged %CURRENT_BRANCH% into main
echo ══════════════════════════════════════════════════════
echo.

:: Show latest commits
echo Recent commits on main:
git log --oneline -3

echo.
echo Done!
