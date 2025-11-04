###############################################################################
# Install Python Script (Windows)
#
# Sets up Python environment with virtualenv and dependencies
###############################################################################

$ErrorActionPreference = "Stop"

# Get script directory and source version configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "versions.ps1")

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Refresh environment
function Update-Environment {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Verify Python installation
function Test-Python {
    Write-Info "Verifying Python installation..."

    try {
        $pythonVersion = python --version
        Write-Success "Python is available: $pythonVersion"

        # Check Python version
        $versionOutput = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
        $versionParts = $versionOutput.Split('.')
        $major = [int]$versionParts[0]
        $minor = [int]$versionParts[1]

        if ($major -lt $PYTHON_MIN_MAJOR -or ($major -eq $PYTHON_MIN_MAJOR -and $minor -lt $PYTHON_MIN_MINOR)) {
            Write-ErrorMsg "Python ${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR} or later is required"
            Write-Info "Current version: $versionOutput"
            Write-Info "Please install Python ${PYTHON_VERSION} or later"
            exit 1
        }
    } catch {
        Write-ErrorMsg "Python is not installed or not in PATH"
        Write-Info "Please run install_system_tools.ps1 first"
        exit 1
    }
}

# Install virtualenv
function Install-Virtualenv {
    Write-Info "Installing virtualenv..."

    try {
        python -m pip install --upgrade virtualenv
        Write-Success "virtualenv installed"
    } catch {
        Write-ErrorMsg "Failed to install virtualenv"
        exit 1
    }
}

# Create virtual environment
function New-VirtualEnv {
    Write-Info "Creating Python virtual environment 'senv'..."

    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"

    # Create .virtualenvs directory if it doesn't exist
    $venvsDir = Join-Path $env:USERPROFILE ".virtualenvs"
    if (-not (Test-Path $venvsDir)) {
        New-Item -ItemType Directory -Path $venvsDir -Force | Out-Null
    }

    # Remove existing virtual environment if it exists
    if (Test-Path $venvPath) {
        Write-Info "Removing existing virtual environment..."
        Remove-Item -Path $venvPath -Recurse -Force
    }

    # Create new virtual environment
    python -m venv $venvPath

    Write-Success "Virtual environment 'senv' created at: $venvPath"
    return $venvPath
}

# Activate virtual environment
function Enable-VirtualEnv {
    param([string]$VenvPath)

    Write-Info "Activating virtual environment..."

    $activateScript = Join-Path $VenvPath "Scripts\Activate.ps1"

    if (-not (Test-Path $activateScript)) {
        Write-ErrorMsg "Could not find activation script: $activateScript"
        exit 1
    }

    # Activate the virtual environment
    & $activateScript

    Write-Success "Virtual environment activated"
}

# Install Python dependencies
function Install-Requirements {
    Write-Info "Installing Python dependencies from requirements.txt..."

    if (-not (Test-Path "requirements.txt")) {
        Write-ErrorMsg "requirements.txt not found in current directory"
        exit 1
    }

    # Upgrade pip first
    Write-Info "Upgrading pip..."
    python -m pip install --upgrade pip

    # Install wheel for faster installations
    python -m pip install wheel

    # Install requirements
    Write-Info "Installing dependencies (this may take several minutes)..."
    python -m pip install -r requirements.txt

    Write-Success "Python dependencies installed successfully"
}

# Verify installation
function Test-PythonPackages {
    Write-Info "Verifying Python packages..."

    # Check if Django is installed
    try {
        $djangoVersion = python -c "import django; print(django.get_version())"
        Write-Success "Django version: $djangoVersion"
    } catch {
        Write-ErrorMsg "Django is not installed properly"
        exit 1
    }

    # Check if pymongo is installed
    try {
        python -c "import pymongo" 2>$null
        Write-Success "pymongo is installed"
    } catch {
        Write-ErrorMsg "pymongo is not installed properly"
        exit 1
    }

    Write-Success "Python environment verified"
}

# Create activation helper script
function New-ActivationHelper {
    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
    $helperScript = "activate_senv.ps1"

    $content = @"
# Sefaria Virtual Environment Activation Helper
# Run this script to activate the senv virtual environment
#
# Usage: .\activate_senv.ps1

`$venvPath = "$venvPath"
`$activateScript = Join-Path `$venvPath "Scripts\Activate.ps1"

if (Test-Path `$activateScript) {
    & `$activateScript
    Write-Host "Virtual environment 'senv' activated" -ForegroundColor Green
    Write-Host "Python: `$(python --version)" -ForegroundColor Cyan
} else {
    Write-Host "ERROR: Could not find virtual environment" -ForegroundColor Red
    Write-Host "Run setup.ps1 to create the environment" -ForegroundColor Yellow
}
"@

    Set-Content -Path $helperScript -Value $content
    Write-Success "Created activation helper: $helperScript"
}

# Main
Write-Info "Setting up Python environment..."
Write-Host ""

Update-Environment
Test-Python
Install-Virtualenv

$venvPath = New-VirtualEnv
Enable-VirtualEnv -VenvPath $venvPath

Install-Requirements
Test-PythonPackages
New-ActivationHelper

Write-Host ""
Write-Success "Python environment setup complete!"
Write-Host ""
Write-Info "To activate the virtual environment in a new terminal:"
Write-Host "  .\activate_senv.ps1"
Write-Host ""
Write-Info "Or manually:"
Write-Host "  $venvPath\Scripts\Activate.ps1"
