# Windows System Tools Installation Script
# PowerShell script for installing development dependencies on Windows

param(
    [switch]$UsePostgres = $false
)

# Colors for output
$script:ErrorColor = "Red"
$script:SuccessColor = "Green"
$script:WarningColor = "Yellow"
$script:InfoColor = "Cyan"

function Print-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor $script:SuccessColor
}

function Print-Error {
    param([string]$Message)
    Write-Host "✗ ERROR: $Message" -ForegroundColor $script:ErrorColor
}

function Print-Warning {
    param([string]$Message)
    Write-Host "⚠ WARNING: $Message" -ForegroundColor $script:WarningColor
}

function Print-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor $script:InfoColor
}

# Check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Print-Error "This script must be run as Administrator"
    Print-Info "Right-click PowerShell and select 'Run as Administrator'"
    exit 1
}

# Install Chocolatey package manager
function Install-Chocolatey {
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Print-Success "Chocolatey already installed"
        return
    }

    Print-Info "Installing Chocolatey package manager..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Print-Success "Chocolatey installed successfully"
    } else {
        Print-Error "Chocolatey installation failed"
        exit 1
    }
}

# Install Python via Chocolatey
function Install-Python {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $version = python --version 2>&1
        Print-Success "Python already installed: $version"
        return
    }

    Print-Info "Installing Python 3.9..."
    choco install python39 -y

    # Refresh environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (Get-Command python -ErrorAction SilentlyContinue) {
        Print-Success "Python installed successfully"
    } else {
        Print-Error "Python installation failed"
        exit 1
    }
}

# Install Node.js
function Install-NodeJS {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $version = node --version
        Print-Success "Node.js already installed: $version"
        return
    }

    Print-Info "Installing Node.js LTS..."
    choco install nodejs-lts -y

    # Refresh environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (Get-Command node -ErrorAction SilentlyContinue) {
        Print-Success "Node.js installed successfully"
    } else {
        Print-Error "Node.js installation failed"
        exit 1
    }
}

# Install MongoDB
function Install-MongoDB {
    if (Get-Command mongod -ErrorAction SilentlyContinue) {
        Print-Success "MongoDB already installed"
        return
    }

    Print-Info "Installing MongoDB..."
    choco install mongodb -y

    # Refresh environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Print-Success "MongoDB installed successfully"
    Print-Info "You may need to create MongoDB data directory: C:\data\db"
}

# Install PostgreSQL (optional)
function Install-PostgreSQL {
    if (-not $UsePostgres) {
        Print-Info "Skipping PostgreSQL installation (using SQLite)"
        return
    }

    if (Get-Command psql -ErrorAction SilentlyContinue) {
        Print-Success "PostgreSQL already installed"
        return
    }

    Print-Info "Installing PostgreSQL..."
    choco install postgresql -y

    # Refresh environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Print-Success "PostgreSQL installed successfully"
}

# Install Git
function Install-Git {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $version = git --version
        Print-Success "Git already installed: $version"
        return
    }

    Print-Info "Installing Git..."
    choco install git -y

    # Refresh environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Print-Success "Git installed successfully"
}

# Install Google Cloud SDK
function Install-GCloudSDK {
    if (Get-Command gcloud -ErrorAction SilentlyContinue) {
        Print-Success "Google Cloud SDK already installed"
        return
    }

    Print-Info "Installing Google Cloud SDK..."
    choco install gcloudsdk -y

    # Refresh environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Print-Success "Google Cloud SDK installed successfully"
}

# Main execution
Print-Info "Installing system tools for Windows..."
Write-Host ""

Install-Chocolatey
Install-Git
Install-Python
Install-NodeJS
Install-MongoDB
Install-PostgreSQL
Install-GCloudSDK

Write-Host ""
Print-Success "System tools installation complete!"
Print-Info "You may need to restart your terminal for all changes to take effect"
