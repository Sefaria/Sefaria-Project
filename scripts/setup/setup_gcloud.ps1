###############################################################################
# Setup Google Cloud SDK Script (Windows)
#
# Configures Google Cloud SDK and provides database dump restore capability
###############################################################################

$ErrorActionPreference = "Continue"  # Non-critical script

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Refresh environment
function Update-Environment {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Check if gcloud is installed
function Test-GCloud {
    Update-Environment

    try {
        $gcloudVersion = gcloud --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Google Cloud SDK is installed"
            return $true
        }
    } catch {
        Write-Warning "Google Cloud SDK is not installed"
        return $false
    }
    return $false
}

# Initialize gcloud
function Initialize-GCloud {
    if (-not (Test-GCloud)) {
        Write-Warning "Skipping gcloud initialization (not installed)"
        Write-Info "Install it with: winget install Google.CloudSDK"
        return
    }

    Write-Info "Google Cloud SDK is available"
    Write-Info "You can authenticate with: gcloud auth login"
    Write-Info "This is optional and only needed for downloading database dumps"
}

# Create restore_dump.ps1 script
function New-RestoreDumpScript {
    Write-Info "Creating database dump restore script..."

    $scriptContent = @'
###############################################################################
# Restore MongoDB Dump Script (Windows)
#
# Downloads and restores the latest Sefaria MongoDB dump from Google Cloud
#
# Usage:
#   .\restore_dump.ps1              # Restore latest dump
#   .\restore_dump.ps1 -DumpDate "2024-01-15"  # Restore specific date
###############################################################################

param(
    [string]$DumpDate = ""
)

$ErrorActionPreference = "Stop"

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Configuration
$GCS_BUCKET = "gs://sefaria-mongo-backup"
$DUMP_DIR = "mongo_dumps"

# Check gcloud
try {
    $null = gcloud --version
} catch {
    Write-ErrorMsg "Google Cloud SDK (gcloud) is not installed"
    Write-Info "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
}

# Authenticate if needed
Write-Info "Checking authentication..."
$authList = gcloud auth list --format="value(account)" 2>&1
if (-not $authList -or $authList.Count -eq 0) {
    Write-Info "Not authenticated. Running gcloud auth login..."
    gcloud auth login
}

# Create dump directory
if (-not (Test-Path $DUMP_DIR)) {
    New-Item -ItemType Directory -Path $DUMP_DIR | Out-Null
}

# Determine dump file
if ($DumpDate) {
    $dumpFile = "dump_small_$DumpDate.tar.gz"
} else {
    Write-Info "Finding latest dump file..."
    $latestDump = gsutil ls "$GCS_BUCKET/dump_small_*.tar.gz" | Sort-Object -Descending | Select-Object -First 1
    if (-not $latestDump) {
        Write-ErrorMsg "No dump files found in $GCS_BUCKET"
        exit 1
    }
    $dumpFile = Split-Path -Leaf $latestDump
}

$gcsPath = "$GCS_BUCKET/$dumpFile"
$localPath = Join-Path $DUMP_DIR $dumpFile

# Download dump
Write-Info "Downloading $dumpFile from Google Cloud Storage..."
gsutil cp $gcsPath $localPath

if (-not (Test-Path $localPath)) {
    Write-ErrorMsg "Failed to download dump file"
    exit 1
}

Write-Success "Downloaded dump file: $localPath"

# Extract dump
Write-Info "Extracting dump file..."
$extractDir = Join-Path $DUMP_DIR "dump"
if (Test-Path $extractDir) {
    Remove-Item -Path $extractDir -Recurse -Force
}

tar -xzf $localPath -C $DUMP_DIR

if (-not (Test-Path $extractDir)) {
    Write-ErrorMsg "Failed to extract dump file"
    exit 1
}

Write-Success "Extracted dump to: $extractDir"

# Restore to MongoDB
Write-Info "Restoring to MongoDB..."
Write-Warning "This will replace the existing 'sefaria' database"

$sefariaDir = Join-Path $extractDir "sefaria"
if (-not (Test-Path $sefariaDir)) {
    Write-ErrorMsg "Dump directory structure is unexpected"
    exit 1
}

mongorestore --drop --db sefaria $sefariaDir

if ($LASTEXITCODE -eq 0) {
    Write-Success "Database restored successfully!"
} else {
    Write-ErrorMsg "Database restore failed"
    exit 1
}

# Cleanup
Write-Info "Cleaning up temporary files..."
Remove-Item -Path $localPath -Force
Remove-Item -Path $extractDir -Recurse -Force

Write-Host ""
Write-Success "MongoDB dump restore complete!"
Write-Info "Database: sefaria"
Write-Info "Host: localhost:27017"
'@

    $scriptPath = Join-Path "scripts" "setup" "restore_dump.ps1"
    Set-Content -Path $scriptPath -Value $scriptContent -Encoding UTF8
    Write-Success "Created restore_dump.ps1 script"
}

# Main
Write-Info "Setting up Google Cloud SDK..."
Write-Host ""

Initialize-GCloud
New-RestoreDumpScript

Write-Host ""
Write-Success "Google Cloud SDK setup complete!"
Write-Host ""
Write-Info "To restore a MongoDB dump:"
Write-Host "  .\scripts\setup\restore_dump.ps1"
Write-Host ""
Write-Info "Note: You'll need to authenticate with Google Cloud first:"
Write-Host "  gcloud auth login"
