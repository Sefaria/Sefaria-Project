###############################################################################
# Check Prerequisites Script (Windows)
#
# Checks system requirements before installation
###############################################################################

$ErrorActionPreference = "Stop"

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Check disk space
function Test-DiskSpace {
    Write-Info "Checking disk space..."

    $systemDrive = $env:SystemDrive
    $drive = Get-PSDrive -Name $systemDrive.TrimEnd(':')
    $freeSpaceGB = [math]::Round($drive.Free / 1GB, 2)

    if ($freeSpaceGB -lt 10) {
        Write-ErrorMsg "Insufficient disk space: ${freeSpaceGB}GB free"
        Write-Info "At least 10GB of free space is required"
        exit 1
    }

    Write-Success "Disk space: ${freeSpaceGB}GB available"
}

# Check internet connection
function Test-Internet {
    Write-Info "Checking internet connection..."

    try {
        $response = Invoke-WebRequest -Uri "https://www.google.com/generate_204" -Method Head -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
            Write-Success "Internet connection available"
        } else {
            Write-Warning "Could not verify internet connectivity (unexpected status code: $($response.StatusCode))"
            Write-Info "Ensure you have internet access for downloading dependencies"
        }
    } catch {
        Write-Warning "Could not verify internet connectivity via HTTP"
        Write-Info "Ensure you have internet access for downloading dependencies"
    }
}

# Check PowerShell version
function Test-PowerShellVersion {
    Write-Info "Checking PowerShell version..."

    $version = $PSVersionTable.PSVersion
    if ($version.Major -lt 5) {
        Write-ErrorMsg "PowerShell 5.1 or later is required"
        Write-Info "Current version: $version"
        exit 1
    }

    Write-Success "PowerShell version: $version"
}

# Check if we're in the right directory
function Test-ProjectDirectory {
    Write-Info "Checking project directory..."

    if (-not (Test-Path "manage.py") -or -not (Test-Path "sefaria")) {
        Write-ErrorMsg "This script must be run from the Sefaria-Project root directory"
        Write-Info "Expected to find manage.py and sefaria\ directory"
        exit 1
    }

    Write-Success "Project directory is correct"
}

# Check Windows features
function Test-WindowsFeatures {
    Write-Info "Checking Windows features..."

    # Check if virtualization is enabled (useful for Docker if they need it later)
    try {
        $hyperV = Get-WindowsOptionalFeature -FeatureName Microsoft-Hyper-V-All -Online -ErrorAction SilentlyContinue
        if ($hyperV -and $hyperV.State -eq 'Enabled') {
            Write-Info "Hyper-V is enabled (good for future Docker usage)"
        }
    } catch {
        # Not critical, just informational
    }

    Write-Success "Windows features check complete"
}

# Main
Write-Info "Checking prerequisites..."
Write-Host ""

Test-PowerShellVersion
Test-ProjectDirectory
Test-DiskSpace
Test-Internet
Test-WindowsFeatures

Write-Host ""
Write-Success "All prerequisite checks passed!"
