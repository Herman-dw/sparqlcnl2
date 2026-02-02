#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create a full database backup
.DESCRIPTION
    Creates a backup of both competentnl_rag and competentnl_prompts databases
.EXAMPLE
    .\create-backup.ps1
#>

$MARIADB_PATH = "C:\Program Files\MariaDB 11.8\bin"
$BACKUP_DIR = "database"
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HHmmss"
$BACKUP_FILE = "$BACKUP_DIR\database-backup-$TIMESTAMP.sql"

Write-Host "[BACKUP] Starting database backup..." -ForegroundColor Cyan

# Check if MariaDB exists
if (-not (Test-Path "$MARIADB_PATH\mysqldump.exe")) {
    Write-Host "[ERROR] mysqldump.exe not found at: $MARIADB_PATH" -ForegroundColor Red
    Write-Host "[INFO] Update MARIADB_PATH in this script" -ForegroundColor Yellow
    exit 1
}

# Create backup directory if it doesn't exist
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

# Create backup
Write-Host "[BACKUP] Creating backup of competentnl_rag and competentnl_prompts..." -ForegroundColor Cyan
& "$MARIADB_PATH\mysqldump.exe" -u root -p --databases competentnl_rag competentnl_prompts --single-transaction --quick --lock-tables=false > $BACKUP_FILE

if ($LASTEXITCODE -eq 0) {
    $fileSize = (Get-Item $BACKUP_FILE).Length / 1MB
    Write-Host "[SUCCESS] Backup created: $BACKUP_FILE" -ForegroundColor Green
    Write-Host "[INFO] Size: $($fileSize.ToString('0.00')) MB" -ForegroundColor Cyan

    # Also create a 'latest' backup
    $LATEST_FILE = "$BACKUP_DIR\database-backup-latest.sql"
    Copy-Item $BACKUP_FILE $LATEST_FILE -Force
    Write-Host "[INFO] Latest backup: $LATEST_FILE" -ForegroundColor Cyan

    # Show what was backed up
    Write-Host "`n[INFO] Backed up databases:" -ForegroundColor Cyan
    Write-Host "  - competentnl_rag (main data + CV processing)" -ForegroundColor White
    Write-Host "  - competentnl_prompts (prompts + logging)" -ForegroundColor White

} else {
    Write-Host "[ERROR] Backup failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n[DONE] Backup completed successfully!" -ForegroundColor Green
