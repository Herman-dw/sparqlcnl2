@echo off
:: Quick merge - works from any branch
:: Usage: merge.bat [branch-name]
:: If on main: merges specified branch (or shows available branches)
:: If on feature branch: merges current branch to main

setlocal enabledelayedexpansion

:: Get current branch
for /f "tokens=*" %%a in ('git branch --show-current') do set CURRENT_BRANCH=%%a

echo.
echo ══════════════════════════════════════════════════════
echo   Git Quick Merge Tool
echo ══════════════════════════════════════════════════════
echo.

if "%CURRENT_BRANCH%"=="main" (
    echo [INFO] Je bent op main branch
    echo.

    :: Check if branch name was provided as argument
    if "%~1"=="" (
        echo Beschikbare remote branches om te mergen:
        echo.
        git branch -r --no-merged main 2>nul | findstr /v "HEAD"
        echo.
        echo Gebruik: merge.bat [branch-naam]
        echo Voorbeeld: merge.bat origin/claude/cv-upload-ui-integration-MnFBI
        echo.

        :: Or just pull latest main
        set /p CHOICE="Of wil je gewoon 'git pull origin main' doen? (j/N): "
        if /i "!CHOICE!"=="j" (
            echo.
            echo [PULL] git pull origin main...
            git pull origin main
            echo.
            echo [OK] Main is up-to-date!
        )
        goto :end
    )

    :: Merge specified branch
    set MERGE_BRANCH=%~1
    echo [MERGE] !MERGE_BRANCH! naar main...
    echo.

    git pull origin main 2>nul
    git merge !MERGE_BRANCH! --no-ff -m "Merge '!MERGE_BRANCH!' into main"
    if %errorlevel% neq 0 (
        echo [ERROR] Merge failed - loss conflicts handmatig op
        goto :end
    )

    echo.
    echo [PUSH] Pushing naar origin/main...
    git push origin main
    if %errorlevel% neq 0 (
        echo [ERROR] Push failed
        goto :end
    )

    echo.
    echo [OK] Merge succesvol!

) else (
    :: On feature branch - merge to main
    echo [INFO] Huidige branch: %CURRENT_BRANCH%
    echo [INFO] Mergen naar main...
    echo.

    :: Pull latest from current branch
    echo [1/5] Pulling %CURRENT_BRANCH%...
    git pull origin %CURRENT_BRANCH% 2>nul

    :: Switch to main
    echo [2/5] Switch naar main...
    git checkout main
    if %errorlevel% neq 0 (
        echo [WARN] Lokale main bestaat niet, aanmaken van origin/main...
        git checkout -b main origin/main 2>nul
        if %errorlevel% neq 0 (
            echo [ERROR] Kon main niet aanmaken
            goto :end
        )
    )

    :: Pull latest main
    echo [3/5] Pulling main...
    git pull origin main 2>nul

    :: Merge
    echo [4/5] Mergen %CURRENT_BRANCH%...
    git merge %CURRENT_BRANCH% --no-ff -m "Merge branch '%CURRENT_BRANCH%'"
    if %errorlevel% neq 0 (
        echo [ERROR] Merge failed - los conflicts handmatig op
        goto :end
    )

    :: Push
    echo [5/5] Pushing naar origin/main...
    git push origin main
    if %errorlevel% neq 0 (
        echo [ERROR] Push failed
        goto :end
    )

    echo.
    echo ══════════════════════════════════════════════════════
    echo   SUCCESS! %CURRENT_BRANCH% is gemerged naar main
    echo ══════════════════════════════════════════════════════
)

:end
echo.
echo Recent commits:
git log --oneline -5
echo.
