###############################################################################
# Install Node Script (Windows)
#
# Sets up Node.js environment and installs npm dependencies
###############################################################################

$ErrorActionPreference = "Stop"

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Refresh environment
function Update-Environment {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Verify Node.js installation
function Test-NodeJS {
    Write-Info "Verifying Node.js installation..."

    Update-Environment

    try {
        $nodeVersion = node --version
        $npmVersion = npm --version
        Write-Success "Node.js version: $nodeVersion"
        Write-Success "npm version: $npmVersion"
    } catch {
        Write-ErrorMsg "Node.js is not installed or not in PATH"
        Write-Info "Please run install_system_tools.ps1 first"
        exit 1
    }
}

# Clean npm cache
function Clear-NpmCache {
    Write-Info "Cleaning npm cache..."

    try {
        npm cache clean --force
        Write-Success "npm cache cleaned"
    } catch {
        Write-Warning "Could not clean npm cache (non-critical)"
    }
}

# Install npm dependencies
function Install-NpmPackages {
    Write-Info "Installing npm dependencies from package.json..."

    if (-not (Test-Path "package.json")) {
        Write-ErrorMsg "package.json not found in current directory"
        exit 1
    }

    # Check if node_modules exists
    if (Test-Path "node_modules") {
        Write-Info "node_modules directory exists"
        $response = Read-Host "Do you want to clean install? This will delete node_modules (y/n)"
        if ($response -eq 'y') {
            Write-Info "Removing node_modules directory..."
            Remove-Item -Path "node_modules" -Recurse -Force
            Write-Success "node_modules removed"
        }
    }

    # Install dependencies
    Write-Info "Installing npm dependencies (this may take several minutes)..."
    npm install

    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "npm install failed"
        exit 1
    }

    Write-Success "npm dependencies installed successfully"
}

# Verify installation
function Test-NpmPackages {
    Write-Info "Verifying npm packages..."

    # Check if node_modules exists
    if (-not (Test-Path "node_modules")) {
        Write-ErrorMsg "node_modules directory not found"
        exit 1
    }

    # Check if webpack is installed
    if (Test-Path "node_modules\.bin\webpack") {
        Write-Success "webpack is installed"
    } else {
        Write-Warning "webpack not found in node_modules"
    }

    # Count installed packages
    $packageCount = (Get-ChildItem "node_modules" -Directory).Count
    Write-Success "Installed $packageCount npm packages"
}

# Build assets
function Build-Assets {
    Write-Info "Building frontend assets..."

    # Check if there's a build script
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    if ($packageJson.scripts.build) {
        Write-Info "Running npm build script..."
        npm run build

        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Build script failed (non-critical at setup time)"
        } else {
            Write-Success "Frontend assets built successfully"
        }
    } else {
        Write-Info "No build script found, skipping initial build"
    }
}

# Main
Write-Info "Setting up Node.js environment..."
Write-Host ""

Update-Environment
Test-NodeJS
Clear-NpmCache
Install-NpmPackages
Test-NpmPackages

Write-Host ""
Write-Success "Node.js environment setup complete!"
Write-Host ""
Write-Info "To start the webpack dev server:"
Write-Host "  npm run w"
