###############################################################################
# Sefaria Development Server Runner (Windows)
#
# This script checks that all dependencies are installed and runs both
# the Django backend server and the webpack dev server in parallel.
#
# Usage:
#   .\run.ps1              # Run both servers
#   .\run.ps1 -Django      # Run only Django server
#   .\run.ps1 -Webpack     # Run only webpack dev server
#   .\run.ps1 -Help        # Show help
#
###############################################################################

param(
    [switch]$Django,
    [switch]$Webpack,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Default options - run both if neither specified
$RunDjango = $true
$RunWebpack = $true

if ($Django -and -not $Webpack) {
    $RunWebpack = $false
}

if ($Webpack -and -not $Django) {
    $RunDjango = $false
}

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

# Show help
function Show-Help {
    Get-Content $MyInvocation.ScriptName | Select-Object -First 15 | Select-Object -Skip 5
    exit 0
}

# Check if we're in the right directory
function Test-ProjectDirectory {
    if (-not (Test-Path "manage.py") -or -not (Test-Path "sefaria")) {
        Write-ErrorMsg "This script must be run from the Sefaria-Project root directory"
        Write-Info "Expected to find manage.py and sefaria\ directory"
        exit 1
    }
}

# Check Python environment
function Test-PythonEnvironment {
    Write-Info "Checking Python environment..."

    # Check if virtual environment exists
    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
    if (-not (Test-Path $venvPath)) {
        Write-ErrorMsg "Virtual environment 'senv' not found"
        Write-Info "Run .\setup.ps1 to create the Python environment"
        exit 1
    }

    # Check if Django is installed
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"
    try {
        & $pythonExe -c "import django" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Django not installed in virtual environment"
            Write-Info "Run: pip install -r requirements.txt"
            exit 1
        }
    } catch {
        Write-ErrorMsg "Django not installed in virtual environment"
        Write-Info "Run: pip install -r requirements.txt"
        exit 1
    }

    Write-Success "Python environment OK"
}

# Check Node environment
function Test-NodeEnvironment {
    Write-Info "Checking Node.js environment..."

    try {
        $nodeVersion = node --version
    } catch {
        Write-ErrorMsg "Node.js not found"
        Write-Info "Run .\setup.ps1 to install the development environment"
        exit 1
    }

    # Check if node_modules exists
    if (-not (Test-Path "node_modules")) {
        Write-ErrorMsg "node_modules directory not found"
        Write-Info "Run: npm install"
        exit 1
    }

    Write-Success "Node.js environment OK"
}

# Check MongoDB
function Test-MongoDB {
    Write-Info "Checking MongoDB..."

    try {
        $null = mongod --version 2>&1
    } catch {
        Write-ErrorMsg "MongoDB not installed"
        Write-Info "Run .\setup.ps1 to install MongoDB"
        exit 1
    }

    # Check if MongoDB is running
    $mongoProcess = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
    if (-not $mongoProcess) {
        Write-Warning "MongoDB is not running"
        Write-Info "Starting MongoDB..."

        # Try to start as service
        $mongoService = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
        if ($mongoService) {
            Start-Service -Name "MongoDB"
            Start-Sleep -Seconds 3
        } else {
            # Start manually
            $mongoDataDir = "C:\data\db"
            if (-not (Test-Path $mongoDataDir)) {
                New-Item -ItemType Directory -Path $mongoDataDir -Force | Out-Null
            }
            Start-Process -FilePath "mongod" -ArgumentList "--dbpath `"$mongoDataDir`"" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }
    }

    # Test connection
    try {
        $null = mongosh --eval "db.version()" --quiet 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "MongoDB is running"
            return
        }
    } catch {
        # Try legacy mongo shell
        try {
            $null = mongo --eval "db.version()" --quiet 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "MongoDB is running"
                return
            }
        } catch {
            Write-ErrorMsg "Cannot connect to MongoDB"
            Write-Info "Try: mongod --dbpath C:\data\db"
            exit 1
        }
    }
}

# Check local_settings.py
function Test-LocalSettings {
    Write-Info "Checking configuration..."

    if (-not (Test-Path "sefaria\local_settings.py")) {
        Write-ErrorMsg "sefaria\local_settings.py not found"
        Write-Info "Run .\setup.ps1 to create local configuration"
        exit 1
    }

    Write-Success "Configuration OK"
}

# Run Django server
function Start-DjangoServer {
    Write-Header "Starting Django Server"
    Write-Info "Django will be available at: http://localhost:8000"
    Write-Info "Admin interface at: http://localhost:8000/admin"
    Write-Host ""

    # Use virtual environment Python
    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"

    if (Test-Path $pythonExe) {
        & $pythonExe manage.py runserver
    } else {
        python manage.py runserver
    }
}

# Run webpack dev server
function Start-WebpackServer {
    Write-Header "Starting Webpack Dev Server"
    Write-Info "Webpack will watch for file changes and rebuild automatically"
    Write-Host ""

    npm run w
}

# Run both servers
function Start-BothServers {
    Write-Header "Starting Development Servers"
    Write-Info "Django: http://localhost:8000"
    Write-Info "Webpack: watching for changes"
    Write-Host ""
    Write-Warning "Press Ctrl+C to stop both servers"
    Write-Host ""

    # Use virtual environment Python
    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"

    if (Test-Path $pythonExe) {
        $python = $pythonExe
    } else {
        $python = "python"
    }

    # Start Django in background
    Write-Info "Starting Django server..."
    $djangoJob = Start-Job -ScriptBlock {
        param($python, $projectPath)
        Set-Location $projectPath
        & $python manage.py runserver 2>&1 | ForEach-Object {
            if ($_ -ne $null) {
                "[Django] $($_.ToString())"
            }
        }
    } -ArgumentList $python, $PWD

    Start-Sleep -Seconds 3

    # Start webpack in background
    Write-Info "Starting Webpack dev server..."
    $webpackJob = Start-Job -ScriptBlock {
        param($projectPath)
        Set-Location $projectPath
        npm run w 2>&1 | ForEach-Object {
            if ($_ -ne $null) {
                "[Webpack] $($_.ToString())"
            }
        }
    } -ArgumentList $PWD

    Write-Success "Both servers started!"
    Write-Host ""
    Write-Info "Django Job ID: $($djangoJob.Id)"
    Write-Info "Webpack Job ID: $($webpackJob.Id)"
    Write-Host ""
    Write-Info "Logs will appear below (prefixed with [Django] or [Webpack]):"
    Write-Host ""

    # Stream output from both jobs
    try {
        while ($true) {
            Receive-Job -Job $djangoJob
            Receive-Job -Job $webpackJob
            Start-Sleep -Milliseconds 100

            # Check if jobs are still running
            if ($djangoJob.State -ne 'Running' -and $webpackJob.State -ne 'Running') {
                break
            }
        }
    } finally {
        # Cleanup
        Write-Host ""
        Write-Info "Shutting down servers..."
        Stop-Job -Job $djangoJob, $webpackJob -ErrorAction SilentlyContinue
        Remove-Job -Job $djangoJob, $webpackJob -Force -ErrorAction SilentlyContinue
    }
}

# Main function
function Start-Main {
    if ($Help) {
        Show-Help
    }

    Write-Header "Sefaria Development Server"

    # Check environment
    Test-ProjectDirectory
    Test-LocalSettings
    Test-MongoDB

    if ($RunDjango) {
        Test-PythonEnvironment
    }

    if ($RunWebpack) {
        Test-NodeEnvironment
    }

    Write-Host ""
    Write-Success "All checks passed!"
    Write-Host ""

    # Run appropriate servers
    if ($RunDjango -and $RunWebpack) {
        Start-BothServers
    } elseif ($RunDjango) {
        Start-DjangoServer
    } elseif ($RunWebpack) {
        Start-WebpackServer
    }
}

# Run main function
Start-Main
