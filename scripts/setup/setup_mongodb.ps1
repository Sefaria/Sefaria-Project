###############################################################################
# Setup MongoDB Script (Windows)
#
# Ensures MongoDB is running and optionally restores database dump
###############################################################################

$ErrorActionPreference = "Stop"

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Check if MongoDB is installed
function Test-MongoDBInstalled {
    try {
        $mongoVersion = mongod --version 2>&1
        if ($mongoVersion) {
            Write-Success "MongoDB is installed"
            return $true
        }
    } catch {
        Write-ErrorMsg "MongoDB is not installed"
        Write-Info "Please run install_system_tools.ps1"
        exit 1
    }
    return $false
}

# Start MongoDB service
function Start-MongoDBService {
    Write-Info "Checking MongoDB service..."

    # Check if MongoDB is already running
    $mongoProcess = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
    if ($mongoProcess) {
        Write-Success "MongoDB is already running (PID: $($mongoProcess.Id))"
        return
    }

    Write-Info "Starting MongoDB service..."

    # Try to start MongoDB as a Windows service
    $mongoService = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
    if ($mongoService) {
        Start-Service -Name "MongoDB"
        Start-Sleep -Seconds 3

        if ((Get-Service -Name "MongoDB").Status -eq 'Running') {
            Write-Success "MongoDB service started"
            return
        }
    }

    # If service doesn't exist, start MongoDB manually
    Write-Info "MongoDB service not found, starting MongoDB manually..."

    # Ensure data directory exists
    $mongoDataDir = "C:\data\db"
    if (-not (Test-Path $mongoDataDir)) {
        New-Item -ItemType Directory -Path $mongoDataDir -Force | Out-Null
        Write-Info "Created MongoDB data directory: $mongoDataDir"
    }

    # Start MongoDB in background
    try {
        Start-Process -FilePath "mongod" -ArgumentList "--dbpath `"$mongoDataDir`"" -WindowStyle Hidden
        Start-Sleep -Seconds 5

        # Verify it started
        $mongoProcess = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
        if ($mongoProcess) {
            Write-Success "MongoDB started (PID: $($mongoProcess.Id))"
        } else {
            Write-ErrorMsg "Failed to start MongoDB"
            exit 1
        }
    } catch {
        Write-ErrorMsg "Could not start MongoDB"
        Write-Info "Try starting it manually: mongod --dbpath `"C:\data\db`""
        exit 1
    }
}

# Test MongoDB connection
function Test-MongoDBConnection {
    Write-Info "Testing MongoDB connection..."

    # Try mongosh first (newer MongoDB versions)
    try {
        $mongoVersion = mongosh --eval "db.version()" --quiet 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "MongoDB connection successful (version: $mongoVersion)"
            return $true
        }
    } catch {
        # Try legacy mongo shell
        try {
            $mongoVersion = mongo --eval "db.version()" --quiet 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "MongoDB connection successful (version: $mongoVersion)"
                return $true
            }
        } catch {
            Write-ErrorMsg "Could not connect to MongoDB"
            Write-Info "Please ensure MongoDB is running on localhost:27017"
            exit 1
        }
    }
    return $false
}

# Restore MongoDB dump info
function Show-DumpRestoreInfo {
    if ($env:SKIP_DUMP -eq "true") {
        Write-Info "Skipping MongoDB dump restore (SkipDump flag set)"
        return
    }

    Write-Info "MongoDB dump restore requires Google Cloud SDK (gcloud)"
    Write-Info "This will be handled in the next step (setup_gcloud.ps1)"
    Write-Warning "You can restore the dump later using the restore_dump.ps1 script"
}

# Create empty history collection
function New-HistoryCollection {
    Write-Info "Checking if 'history' collection needs to be created..."

    try {
        # Check if database exists and has history collection
        $hasHistory = mongosh --eval "db.getMongo().getDB('sefaria').getCollectionNames().includes('history')" --quiet 2>&1

        if ($hasHistory -eq "false") {
            Write-Info "Creating 'history' collection..."
            mongosh sefaria --eval "db.createCollection('history')" --quiet 2>&1 | Out-Null
            Write-Success "Created 'history' collection"
        } else {
            Write-Success "'history' collection already exists"
        }
    } catch {
        # Try with legacy mongo shell
        try {
            mongo sefaria --eval "db.createCollection('history')" --quiet 2>&1 | Out-Null
            Write-Success "Created 'history' collection"
        } catch {
            Write-Info "Could not create history collection (database may not exist yet)"
            Write-Info "It will be created during dump restore"
        }
    }
}

# Verify MongoDB setup
function Test-MongoDBSetup {
    Write-Info "Verifying MongoDB setup..."

    # Check if MongoDB is running
    $mongoProcess = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
    if (-not $mongoProcess) {
        Write-ErrorMsg "MongoDB is not running"
        exit 1
    }

    # Check connection
    Test-MongoDBConnection

    Write-Success "MongoDB setup verified"
}

# Main
Write-Info "Setting up MongoDB..."
Write-Host ""

Test-MongoDBInstalled
Start-MongoDBService
Test-MongoDBConnection
Show-DumpRestoreInfo
New-HistoryCollection
Test-MongoDBSetup

Write-Host ""
Write-Success "MongoDB setup complete!"
Write-Info "MongoDB is running on localhost:27017"
Write-Info "Database name: sefaria"
Write-Host ""
Write-Warning "NOTE: You still need to restore the database dump"
Write-Info "This will be done in the next step using Google Cloud SDK"
