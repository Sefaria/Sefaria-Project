###############################################################################
# Sefaria Project Setup Script (Windows)
#
# This script automates the setup of the Sefaria development environment on
# Windows 11. It will install all necessary dependencies and configure the project.
#
# Usage:
#   .\setup.ps1 [OPTIONS]
#
# Options:
#   -Postgres          Use PostgreSQL instead of SQLite for Django DB
#   -SkipDump          Skip downloading and restoring MongoDB dump
#   -Help              Show this help message
#
# Requirements:
#   - Windows 11 (or Windows 10 21H2+)
#   - PowerShell 5.1 or later
#   - Administrator access
#   - Internet connection
#
###############################################################################

param(
    [switch]$Postgres,
    [switch]$SkipDump,
    [switch]$Help
)

# Requires PowerShell 5.1 or later
#Requires -Version 5.1

$ErrorActionPreference = "Stop"

# Script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SetupScriptsDir = Join-Path $ScriptDir "scripts\setup"

# Export options for subscripts
$env:USE_POSTGRES = if ($Postgres) { "true" } else { "false" }
$env:SKIP_DUMP = if ($SkipDump) { "true" } else { "false" }
$env:SCRIPT_DIR = $ScriptDir

# Color output functions
function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host $Message -ForegroundColor Blue
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "✗ ERROR: $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

# Check if running as Administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Detect OS version
function Test-WindowsVersion {
    $os = Get-CimInstance Win32_OperatingSystem
    $version = [System.Version]$os.Version

    # Windows 11 is version 10.0.22000 or higher
    # Windows 10 21H2 is version 10.0.19044 or higher
    if ($version.Major -lt 10) {
        Write-ErrorMsg "Windows 10 or later is required"
        Write-Info "Current version: $($os.Caption)"
        exit 1
    }

    if ($version.Build -lt 19044) {
        Write-Warning "Windows 10 21H2 or Windows 11 is recommended"
        Write-Info "Current version: $($os.Caption) (Build $($version.Build))"
        $response = Read-Host "Continue anyway? (y/n)"
        if ($response -ne 'y') {
            exit 1
        }
    }

    Write-Success "Detected: $($os.Caption) (Build $($version.Build))"
}

# Show help
function Show-Help {
    Get-Content $MyInvocation.ScriptName | Select-Object -First 20 | Select-Object -Skip 5
    exit 0
}

# Main setup flow
function Start-Setup {
    Write-Header "Sefaria Project Setup (Windows)"

    Write-Info "Starting setup for Sefaria development environment..."
    Write-Info "This will install all necessary dependencies and configure the project."
    Write-Host ""

    # Check administrator privileges
    if (-not (Test-Administrator)) {
        Write-ErrorMsg "This script must be run as Administrator"
        Write-Info "Right-click PowerShell and select 'Run as Administrator'"
        Write-Info "Then run: .\setup.ps1"
        exit 1
    }
    Write-Success "Running with Administrator privileges"

    # Check Windows version
    Test-WindowsVersion

    if ($Postgres) {
        Write-Info "Using PostgreSQL for Django database"
    } else {
        Write-Info "Using SQLite for Django database (default)"
    }

    # Step 1: Check prerequisites
    Write-Header "Step 1: Checking Prerequisites"
    $prereqScript = Join-Path $SetupScriptsDir "check_prerequisites.ps1"
    if (Test-Path $prereqScript) {
        & $prereqScript
    } else {
        Write-Warning "check_prerequisites.ps1 not found, skipping..."
    }

    # Step 2: Install system tools
    Write-Header "Step 2: Installing System Tools"
    $systemToolsScript = Join-Path $SetupScriptsDir "install_system_tools.ps1"
    if (Test-Path $systemToolsScript) {
        & $systemToolsScript
    } else {
        Write-ErrorMsg "install_system_tools.ps1 not found!"
        exit 1
    }

    # Step 3: Install Python and dependencies
    Write-Header "Step 3: Setting Up Python Environment"
    $pythonScript = Join-Path $SetupScriptsDir "install_python.ps1"
    if (Test-Path $pythonScript) {
        & $pythonScript
    } else {
        Write-ErrorMsg "install_python.ps1 not found!"
        exit 1
    }

    # Step 4: Install Node and dependencies
    Write-Header "Step 4: Setting Up Node.js Environment"
    $nodeScript = Join-Path $SetupScriptsDir "install_node.ps1"
    if (Test-Path $nodeScript) {
        & $nodeScript
    } else {
        Write-ErrorMsg "install_node.ps1 not found!"
        exit 1
    }

    # Step 5: Setup database (SQLite or PostgreSQL)
    Write-Header "Step 5: Setting Up Django Database"
    $dbScript = Join-Path $SetupScriptsDir "setup_database.ps1"
    if (Test-Path $dbScript) {
        & $dbScript
    } else {
        Write-ErrorMsg "setup_database.ps1 not found!"
        exit 1
    }

    # Step 6: Setup MongoDB
    Write-Header "Step 6: Setting Up MongoDB"
    $mongoScript = Join-Path $SetupScriptsDir "setup_mongodb.ps1"
    if (Test-Path $mongoScript) {
        & $mongoScript
    } else {
        Write-ErrorMsg "setup_mongodb.ps1 not found!"
        exit 1
    }

    # Step 7: Setup Google Cloud SDK (for database dumps)
    Write-Header "Step 7: Setting Up Google Cloud SDK"
    $gcloudScript = Join-Path $SetupScriptsDir "setup_gcloud.ps1"
    if (Test-Path $gcloudScript) {
        & $gcloudScript
    } else {
        Write-Warning "setup_gcloud.ps1 not found, skipping..."
    }

    # Step 8: Finalize setup
    Write-Header "Step 8: Finalizing Setup"
    $finalizeScript = Join-Path $SetupScriptsDir "finalize_setup.ps1"
    if (Test-Path $finalizeScript) {
        & $finalizeScript
    } else {
        Write-ErrorMsg "finalize_setup.ps1 not found!"
        exit 1
    }

    # Complete!
    Write-Header "Setup Complete!"
    Write-Success "Sefaria development environment is ready!"
    Write-Host ""
    Write-Info "Next steps:"
    Write-Host ""
    Write-Host "  Quick Start (Recommended):" -ForegroundColor Green
    Write-Host "    .\run.ps1    # Starts both servers automatically" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Or start servers manually:"
    Write-Host "    1. Start the Django server: python manage.py runserver"
    Write-Host "    2. In a separate terminal, start the Node server: npm run w"
    Write-Host "    3. Visit http://localhost:8000 in your browser"
    Write-Host ""
    Write-Info "For more information, see the documentation at:"
    Write-Host "  https://developers.sefaria.org/docs/local-installation-instructions"
    Write-Host ""
}

# Show help if requested
if ($Help) {
    Show-Help
}

# Run main function
Start-Setup
