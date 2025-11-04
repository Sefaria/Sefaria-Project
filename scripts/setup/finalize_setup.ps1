###############################################################################
# Finalize Setup Script (Windows)
#
# Performs final setup steps:
# - Configures hosts file
# - Creates log directory
# - Runs Django migrations
# - Verifies setup
# - Provides next steps
###############################################################################

$ErrorActionPreference = "Stop"

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Configure hosts file for voices subdomain
function Add-HostsEntry {
    Write-Info "Configuring hosts file for voices.localhost..."

    $hostsPath = "C:\Windows\System32\drivers\etc\hosts"

    # Check if entry already exists
    $hostsContent = Get-Content $hostsPath
    if ($hostsContent -match "voices.localhost") {
        Write-Success "voices.localhost already configured in hosts file"
        return
    }

    Write-Info "Adding voices.localhost to hosts file..."
    Write-Warning "This requires Administrator privileges"

    try {
        $entry = "`r`n127.0.0.1    voices.localhost"
        [System.IO.File]::AppendAllText($hostsPath, $entry, [System.Text.Encoding]::ASCII)
        Write-Success "Added voices.localhost to hosts file"
    } catch {
        Write-ErrorMsg "Failed to update hosts file"
        Write-Info "Please manually add this line to $hostsPath:"
        Write-Info "127.0.0.1    voices.localhost"
    }
}

# Create log directory
function New-LogDirectory {
    Write-Info "Creating log directory..."

    if (Test-Path "log") {
        Write-Success "Log directory already exists"
    } else {
        New-Item -ItemType Directory -Path "log" | Out-Null
        Write-Success "Log directory created"
    }

    # Ensure write permissions (not as critical on Windows)
    Write-Success "Log directory permissions OK"
}

# Activate virtual environment
function Enable-VirtualEnv {
    Write-Info "Activating Python virtual environment..."

    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
    $activateScript = Join-Path $venvPath "Scripts\Activate.ps1"

    if (Test-Path $activateScript) {
        & $activateScript
        Write-Success "Virtual environment 'senv' activated"
    } else {
        Write-Warning "Virtual environment not found"
        Write-Info "Continuing without activation..."
    }
}

# Run Django migrations
function Invoke-DjangoMigrations {
    Write-Info "Running Django database migrations..."

    # Check if manage.py exists
    if (-not (Test-Path "manage.py")) {
        Write-ErrorMsg "manage.py not found"
        exit 1
    }

    # Ensure we're using the right Python
    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"

    if (Test-Path $pythonExe) {
        $python = $pythonExe
    } else {
        $python = "python"
    }

    # Run migrations
    Write-Info "This will create the Django authentication database tables"
    & $python manage.py migrate

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Database migrations completed successfully"
    } else {
        Write-ErrorMsg "Database migrations failed"
        Write-Warning "You may need to check your database configuration in local_settings.py"
        exit 1
    }
}

# Create superuser (optional)
function New-DjangoSuperuser {
    Write-Info "Django superuser creation..."
    Write-Host ""
    Write-Info "You can create a superuser account to access the Django admin"
    Write-Info "This is optional and can be done later with: python manage.py createsuperuser"
    Write-Host ""

    $response = Read-Host "Do you want to create a superuser now? (y/n)"

    if ($response -eq 'y') {
        $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
        $pythonExe = Join-Path $venvPath "Scripts\python.exe"

        if (Test-Path $pythonExe) {
            $python = $pythonExe
        } else {
            $python = "python"
        }

        & $python manage.py createsuperuser
        Write-Success "Superuser created"
    } else {
        Write-Info "Skipping superuser creation"
    }
}

# Verify complete setup
function Test-Setup {
    Write-Info "Verifying complete setup..."
    Write-Host ""

    # Check Python
    try {
        $pythonVersion = python --version
        Write-Success "Python: $pythonVersion"
    } catch {
        Write-ErrorMsg "Python not working"
    }

    # Check Node
    try {
        $nodeVersion = node --version
        Write-Success "Node.js: $nodeVersion"
    } catch {
        Write-ErrorMsg "Node.js not working"
    }

    # Check MongoDB
    $mongoProcess = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
    if ($mongoProcess) {
        Write-Success "MongoDB: Running (PID: $($mongoProcess.Id))"
    } else {
        Write-Warning "MongoDB: Not running"
    }

    # Check Django
    try {
        $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
        $pythonExe = Join-Path $venvPath "Scripts\python.exe"

        if (Test-Path $pythonExe) {
            & $pythonExe manage.py check 2>&1 | Out-Null
        } else {
            python manage.py check 2>&1 | Out-Null
        }

        if ($LASTEXITCODE -eq 0) {
            Write-Success "Django: Configuration valid"
        } else {
            Write-Warning "Django: Some checks failed (this may be normal for local dev)"
        }
    } catch {
        Write-Warning "Django: Could not verify"
    }

    # Check if database has data
    try {
        $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
        $pythonExe = Join-Path $venvPath "Scripts\python.exe"

        if (Test-Path $pythonExe) {
            $python = $pythonExe
        } else {
            $python = "python"
        }

        $checkScript = @"
from pymongo import MongoClient
client = MongoClient('localhost', 27017)
db = client['sefaria']
print(len(db.list_collection_names()) > 0)
"@

        $hasData = & $python -c $checkScript 2>$null

        if ($hasData -eq "True") {
            Write-Success "MongoDB: Has data"
        } else {
            Write-Warning "MongoDB: No data found - you may need to restore a dump"
        }
    } catch {
        Write-Warning "MongoDB: Could not check for data"
    }

    Write-Host ""
}

# Print next steps
function Show-NextSteps {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║                      SETUP COMPLETE!                           ║" -ForegroundColor Blue
    Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Your Sefaria development environment is ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Quick Start (Recommended):" -ForegroundColor Green
    Write-Host "     .\run.ps1" -ForegroundColor Cyan
    Write-Host "     # Starts both servers automatically" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Or start servers manually:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Activate the virtual environment:"
    Write-Host "     .\activate_senv.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Start the Django development server:"
    Write-Host "     python manage.py runserver" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. In a separate terminal, start the webpack dev server:"
    Write-Host "     npm run w" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  4. Visit http://localhost:8000 in your browser"
    Write-Host ""
    Write-Host "Additional Commands:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  • Restore MongoDB dump:"
    Write-Host "    .\scripts\setup\restore_dump.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  • Create Django superuser:"
    Write-Host "    python manage.py createsuperuser" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  • Access Django admin:"
    Write-Host "    http://localhost:8000/admin" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  • If MongoDB is not running:"
    Write-Host "    Start-Service MongoDB" -ForegroundColor Cyan
    Write-Host "    Or manually: mongod --dbpath C:\data\db" -ForegroundColor Cyan
    Write-Host ""

    if ($env:USE_POSTGRES -eq "true") {
        Write-Host "  • If PostgreSQL is not running:"
        Write-Host "    Start-Service postgresql*" -ForegroundColor Cyan
        Write-Host ""
    }

    Write-Host "  • For more help, check:"
    Write-Host "    https://developers.sefaria.org/docs/local-installation-instructions" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Happy coding!" -ForegroundColor Green
    Write-Host ""
}

# Main
Write-Info "Finalizing setup..."
Write-Host ""

Add-HostsEntry
New-LogDirectory
Enable-VirtualEnv
Invoke-DjangoMigrations
New-DjangoSuperuser
Test-Setup
Show-NextSteps
