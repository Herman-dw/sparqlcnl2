#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Merge current branch to main
.DESCRIPTION
    Merges the current feature branch into main and pushes to remote
.EXAMPLE
    .\merge-to-main.ps1
#>

param(
    [switch]$DeleteBranch = $false
)

# Get current branch
$currentBranch = git branch --show-current

if ($currentBranch -eq "main") {
    Write-Host "[ERROR] Already on main branch. Switch to a feature branch first." -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Current branch: $currentBranch" -ForegroundColor Cyan

# Confirm
$confirm = Read-Host "Merge '$currentBranch' into main? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "[CANCELLED]" -ForegroundColor Yellow
    exit 0
}

# Pull latest from current branch
Write-Host "`n[PULL] Pulling latest changes from $currentBranch..." -ForegroundColor Cyan
git pull origin $currentBranch
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to pull from $currentBranch" -ForegroundColor Red
    exit 1
}

# Switch to main
Write-Host "`n[CHECKOUT] Switching to main..." -ForegroundColor Cyan
git checkout main
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to checkout main" -ForegroundColor Red
    exit 1
}

# Pull latest main
Write-Host "`n[PULL] Pulling latest main..." -ForegroundColor Cyan
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to pull main" -ForegroundColor Red
    exit 1
}

# Merge
Write-Host "`n[MERGE] Merging $currentBranch into main..." -ForegroundColor Cyan
git merge $currentBranch --no-ff -m "Merge branch '$currentBranch'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Merge failed - resolve conflicts manually" -ForegroundColor Red
    exit 1
}

# Push to main
Write-Host "`n[PUSH] Pushing to origin/main..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to push to main" -ForegroundColor Red
    exit 1
}

Write-Host "`n[SUCCESS] Successfully merged $currentBranch into main!" -ForegroundColor Green

# Delete branch if requested
if ($DeleteBranch) {
    Write-Host "`n[DELETE] Deleting branch $currentBranch..." -ForegroundColor Cyan
    git branch -d $currentBranch
    git push origin --delete $currentBranch
    Write-Host "[SUCCESS] Branch deleted" -ForegroundColor Green
}

Write-Host "`n[LOG] Latest commits on main:" -ForegroundColor Cyan
git log --oneline -5

Write-Host "`n[DONE] Merge completed successfully!" -ForegroundColor Green
