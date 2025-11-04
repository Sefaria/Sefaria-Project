###############################################################################
# Install System Tools Script (Windows)
#
# Installs core system dependencies:
# - winget (verify it's available)
# - Python 3.10
# - Node.js LTS
# - MongoDB Community
# - PostgreSQL (if -Postgres flag used)
# - Git
# - gettext tools
###############################################################################

$ErrorActionPreference = "Stop"

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Refresh environment variables
function Update-Environment {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Check if winget is available
function Test-Winget {
    Write-Info "Checking winget availability..."

    try {
        $wingetVersion = winget --version
        Write-Success "winget is available: $wingetVersion"
        return $true
    } catch {
        Write-Warning "winget not found"
        return $false
    }
}

# Install winget if not available (Windows 10)
function Install-Winget {
    if (Test-Winget) {
        return
    }

    Write-Info "Installing winget..."
    Write-Info "Downloading App Installer from Microsoft Store..."

    try {
        # Download and install App Installer which includes winget
        $downloadUrl = "https://aka.ms/getwinget"
        Start-Process $downloadUrl

        Write-Warning "Please install App Installer from the Microsoft Store"
        Write-Warning "After installation, re-run this script"
        exit 1
    } catch {
        Write-ErrorMsg "Could not install winget automatically"
        Write-Info "Please install winget manually:"
        Write-Info "1. Open Microsoft Store"
        Write-Info "2. Search for 'App Installer'"
        Write-Info "3. Install it"
        Write-Info "4. Re-run this script"
        exit 1
    }
}

# Install Python
function Install-Python {
    Write-Info "Checking Python installation..."

    # Check if Python 3.9 is already installed
    try {
        $pythonVersion = python --version 2>&1
        if ($pythonVersion -match "Python 3\.9") {
            Write-Success "Python already installed: $pythonVersion"
            return
        }
        # Warn if a different version is installed
        if ($pythonVersion -match "Python 3\.\d+") {
            Write-Warning "Python $pythonVersion is installed, but 3.9 is recommended"
            Write-Info "You may encounter compatibility issues with Python 3.10+"
            $response = Read-Host "Continue with existing Python version? (y/n)"
            if ($response -eq 'y') {
                return
            }
        }
    } catch {
        # Python not found, continue with installation
    }

    Write-Info "Installing Python 3.9..."
    winget install -e --id Python.Python.3.9 --silent --accept-package-agreements --accept-source-agreements

    Update-Environment

    # Verify installation
    try {
        $pythonVersion = python --version
        Write-Success "Python installed: $pythonVersion"
    } catch {
        Write-ErrorMsg "Python installation failed"
        Write-Info "Please install Python 3.9 manually from python.org"
        exit 1
    }

    # Ensure pip is up to date
    Write-Info "Updating pip..."
    python -m pip install --upgrade pip
}

# Install Node.js
function Install-NodeJS {
    Write-Info "Checking Node.js installation..."

    try {
        $nodeVersion = node --version
        Write-Success "Node.js already installed: $nodeVersion"
        return
    } catch {
        # Node not found, continue with installation
    }

    Write-Info "Installing Node.js LTS..."
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements

    Update-Environment

    # Verify installation
    try {
        $nodeVersion = node --version
        Write-Success "Node.js installed: $nodeVersion"
    } catch {
        Write-ErrorMsg "Node.js installation failed"
        Write-Info "Please install Node.js manually from nodejs.org"
        exit 1
    }
}

# Install MongoDB
function Install-MongoDB {
    Write-Info "Checking MongoDB installation..."

    try {
        $mongoVersion = mongod --version
        if ($mongoVersion) {
            Write-Success "MongoDB already installed"
            return
        }
    } catch {
        # MongoDB not found, continue with installation
    }

    Write-Info "Installing MongoDB Community Server..."
    winget install -e --id MongoDB.MongoDBServer --silent --accept-package-agreements --accept-source-agreements

    Update-Environment

    # Create data directory
    $mongoDataDir = "C:\data\db"
    if (-not (Test-Path $mongoDataDir)) {
        Write-Info "Creating MongoDB data directory: $mongoDataDir"
        New-Item -ItemType Directory -Path $mongoDataDir -Force | Out-Null
    }

    # Create log directory
    $mongoLogDir = "C:\data\log"
    if (-not (Test-Path $mongoLogDir)) {
        New-Item -ItemType Directory -Path $mongoLogDir -Force | Out-Null
    }

    Write-Success "MongoDB installed successfully"
    Write-Info "MongoDB data directory: $mongoDataDir"
}

# Install MongoDB client utilities (mongosh & database tools)
function Install-MongoTools {
    Write-Info "Ensuring MongoDB client tools are installed..."

    $haveMongosh = $false
    try {
        $null = mongosh --version
        $haveMongosh = $true
    } catch {
        Write-Info "mongosh not found - installing..."
        try {
            winget install -e --id MongoDB.mongosh --silent --accept-package-agreements --accept-source-agreements
            Update-Environment
            $null = mongosh --version
            Write-Success "mongosh installed"
            $haveMongosh = $true
        } catch {
            Write-Warning "Failed to install mongosh automatically"
        }
    }

    try {
        $null = mongorestore --version
        Write-Success "MongoDB Database Tools already installed"
    } catch {
        Write-Info "MongoDB Database Tools not found - installing..."
        try {
            winget install -e --id MongoDB.DatabaseTools --silent --accept-package-agreements --accept-source-agreements
            Update-Environment
            $null = mongorestore --version
            Write-Success "MongoDB Database Tools installed"
        } catch {
            Write-Warning "Failed to install MongoDB Database Tools automatically"
            if (-not $haveMongosh) {
                Write-Warning "mongosh is also missing; please install client tools manually from https://www.mongodb.com/try/download"
            }
        }
    }
}

# Install PostgreSQL
function Install-PostgreSQL {
    if ($env:USE_POSTGRES -ne "true") {
        Write-Info "Skipping PostgreSQL installation (using SQLite)"
        return
    }

    Write-Info "Checking PostgreSQL installation..."

    try {
        $pgVersion = psql --version
        if ($pgVersion) {
            Write-Success "PostgreSQL already installed: $pgVersion"
            return
        }
    } catch {
        # PostgreSQL not found, continue with installation
    }

    Write-Info "Installing PostgreSQL..."
    winget install -e --id PostgreSQL.PostgreSQL --silent --accept-package-agreements --accept-source-agreements

    Update-Environment

    Write-Success "PostgreSQL installed successfully"
    Write-Warning "You may need to set a password for the postgres user"
}

# Install Git
function Install-Git {
    Write-Info "Checking Git installation..."

    try {
        $gitVersion = git --version
        Write-Success "Git already installed: $gitVersion"
        return
    } catch {
        # Git not found, continue with installation
    }

    Write-Info "Installing Git..."
    winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements

    Update-Environment

    # Verify installation
    try {
        $gitVersion = git --version
        Write-Success "Git installed: $gitVersion"
    } catch {
        Write-ErrorMsg "Git installation failed"
        exit 1
    }
}

# Install gettext tools (for translations)
function Install-Gettext {
    Write-Info "Checking gettext installation..."

    try {
        $msgfmtVersion = msgfmt --version
        if ($msgfmtVersion) {
            Write-Success "gettext already installed"
            return
        }
    } catch {
        # gettext not found, continue
    }

    Write-Info "Installing gettext tools..."

    # Download gettext for Windows
    $gettextUrl = "https://github.com/mlocati/gettext-iconv-windows/releases/latest/download/gettext0.21-iconv1.16-shared-64.zip"
    $tempZip = "$env:TEMP\gettext.zip"
    $gettextDir = "C:\Program Files\gettext"

    try {
        Write-Info "Downloading gettext..."
        Invoke-WebRequest -Uri $gettextUrl -OutFile $tempZip -UseBasicParsing

        Write-Info "Extracting gettext..."
        if (Test-Path $gettextDir) {
            Remove-Item -Path $gettextDir -Recurse -Force
        }
        Expand-Archive -Path $tempZip -DestinationPath $gettextDir -Force

        # Add to PATH
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $gettextBinDir = Join-Path $gettextDir "bin"
        if ($currentPath -notlike "*$gettextBinDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$gettextBinDir", "Machine")
        }

        Update-Environment

        Remove-Item -Path $tempZip -Force

        Write-Success "gettext installed successfully"
    } catch {
        Write-Warning "Could not install gettext automatically"
        Write-Info "gettext is optional but recommended for translation support"
    }
}

# Install Google Cloud SDK
function Install-GCloudSDK {
    Write-Info "Checking Google Cloud SDK..."

    try {
        $gcloudVersion = gcloud --version
        if ($gcloudVersion) {
            Write-Success "Google Cloud SDK already installed"
            return
        }
    } catch {
        # gcloud not found, continue
    }

    Write-Info "Installing Google Cloud SDK..."

    # Download the installer
    $installerUrl = "https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe"
    $installerPath = "$env:TEMP\GoogleCloudSDKInstaller.exe"

    try {
        Write-Info "Downloading Google Cloud SDK installer..."
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing

        Write-Info "Running Google Cloud SDK installer..."
        Write-Warning "Please complete the installation wizard"
        Start-Process -FilePath $installerPath -Wait

        Update-Environment

        Remove-Item -Path $installerPath -Force

        Write-Success "Google Cloud SDK installation initiated"
        Write-Info "You may need to restart your terminal after installation"
    } catch {
        Write-Warning "Could not install Google Cloud SDK automatically"
        Write-Info "You can install it manually from: https://cloud.google.com/sdk/docs/install"
    }
}

# Main
Write-Info "Installing system tools..."
Write-Host ""

Install-Winget
Install-Git
Install-Python
Install-NodeJS
Install-MongoDB
Install-MongoTools
Install-PostgreSQL
Install-Gettext
Install-GCloudSDK

Write-Host ""
Write-Success "System tools installation complete!"
Write-Warning "Please restart your terminal for all changes to take effect"
