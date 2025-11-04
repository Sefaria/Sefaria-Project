# Windows 11 Setup for Sefaria Development

This document provides Windows-specific information for setting up the Sefaria development environment.

## Quick Start

**Windows 11 (PowerShell as Administrator):**

1. Open PowerShell as Administrator (Right-click → "Run as Administrator")
2. Navigate to the project directory:
   ```powershell
   cd path\to\Sefaria-Project
   ```
3. Run the setup script:
   ```powershell
   .\setup.ps1
   ```

That's it! The script will automatically install everything you need.

## Requirements

- **Windows 11** (or Windows 10 version 21H2 or later)
- **PowerShell 5.1 or later** (included with Windows)
- **Administrator privileges** (required for installing software)
- **Internet connection**
- **10+ GB of free disk space**

## What Gets Installed

The setup script automatically installs:

### Core Tools
- **Python 3.10+** - Backend language
- **Node.js LTS** - Frontend build tools
- **MongoDB Community Server** - Database for Sefaria texts
- **Git** - Version control (if not already installed)

### Optional Tools
- **PostgreSQL** - Alternative database (if you use `-Postgres` flag)
- **Google Cloud SDK** - For downloading database dumps
- **gettext** - Translation tools

All installations are performed via **winget** (Windows Package Manager), which is built into Windows 11.

## Setup Options

### Basic Setup (Recommended)
```powershell
.\setup.ps1
```
Uses SQLite for Django database (simpler, faster).

### With PostgreSQL
```powershell
.\setup.ps1 -Postgres
```
Uses PostgreSQL instead of SQLite (more similar to production).

### Skip Database Dump (Faster)
```powershell
.\setup.ps1 -SkipDump
```
Skips downloading the large MongoDB dump. Good for testing setup.

### Combine Options
```powershell
.\setup.ps1 -Postgres -SkipDump
```

## Running the Development Servers

### Quick Start (Both Servers)
```powershell
.\run.ps1
```

This automatically:
- Checks that everything is installed
- Starts MongoDB if not running
- Starts Django backend server
- Starts webpack dev server
- Shows combined logs

Then visit: **http://localhost:8000**

### Individual Servers

**Django only:**
```powershell
.\run.ps1 -Django
```

**Webpack only:**
```powershell
.\run.ps1 -Webpack
```

### Manual Start (Separate Windows)

**PowerShell Window 1 - Django Backend:**
```powershell
.\activate_senv.ps1
python manage.py runserver
```

**PowerShell Window 2 - Webpack Frontend:**
```powershell
npm run w
```

## Common Tasks

### Activate Virtual Environment
```powershell
.\activate_senv.ps1
```

### Create Django Admin User
```powershell
python manage.py createsuperuser
```
Then visit: http://localhost:8000/admin

### Restore Database Dump
```powershell
.\scripts\setup\restore_dump.ps1
```

### Update Dependencies
```powershell
# Python packages
.\activate_senv.ps1
pip install -r requirements.txt

# Node packages
npm install
```

## Troubleshooting

### "Running scripts is disabled on this system"

PowerShell execution policy is blocking scripts. Fix it:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "MongoDB is not running"

Start MongoDB service:
```powershell
Start-Service MongoDB
```

Or start it manually:
```powershell
mongod --dbpath C:\data\db
```

### "Virtual environment not found"

Recreate it:
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.virtualenvs\senv"
.\setup.ps1
```

### winget not available

winget is built into Windows 11. If you're on Windows 10:
1. Open Microsoft Store
2. Search for "App Installer"
3. Install/Update it

### Installation fails with "Access Denied"

Make sure you're running PowerShell as Administrator:
1. Right-click PowerShell
2. Select "Run as Administrator"

### MongoDB connection fails

Check if MongoDB is running:
```powershell
Get-Process -Name mongod
```

If not running, start it:
```powershell
# As a service (if installed as service)
Start-Service MongoDB

# Or manually
mongod --dbpath C:\data\db
```

### PostgreSQL connection fails (if using -Postgres)

Start PostgreSQL service:
```powershell
Start-Service postgresql*
```

## File Locations

### Virtual Environment
```
C:\Users\<YourUsername>\.virtualenvs\senv
```

### MongoDB Data
```
C:\data\db
```

### MongoDB Logs
```
C:\data\log
```

### Project Configuration
```
<project>\sefaria\local_settings.py
```

### Project Logs
```
<project>\log\sefaria.log
```

## Key Differences from macOS Setup

| Feature | macOS | Windows |
|---------|-------|---------|
| Package Manager | Homebrew | winget |
| Python Manager | pyenv | Direct install |
| Node Manager | nvm | Direct install |
| Virtual Env Location | `.pyenv/versions/senv` | `%USERPROFILE%\.virtualenvs\senv` |
| MongoDB Service | `brew services` | Windows Service or manual |
| Hosts File | `/etc/hosts` | `C:\Windows\System32\drivers\etc\hosts` |
| Path Separator | `/` | `\` |
| Script Extension | `.sh` | `.ps1` |

## Architecture

The Windows setup uses PowerShell scripts (`.ps1`) that are parallel to the macOS bash scripts (`.sh`):

```
Sefaria-Project/
├── setup.ps1                    # Main Windows setup
├── run.ps1                      # Run dev servers (Windows)
├── activate_senv.ps1            # Activate venv (created during setup)
└── scripts/setup/
    ├── check_prerequisites.ps1
    ├── install_system_tools.ps1
    ├── install_python.ps1
    ├── install_node.ps1
    ├── setup_database.ps1
    ├── setup_mongodb.ps1
    ├── setup_gcloud.ps1
    ├── finalize_setup.ps1
    └── restore_dump.ps1
```

Each PowerShell script mirrors the functionality of its bash counterpart but uses Windows-native tools and conventions.

## Getting Help

1. **Check the main setup guide:** [SETUP_GUIDE.md](SETUP_GUIDE.md)
2. **Check the setup scripts README:** [scripts/setup/README.md](scripts/setup/README.md)
3. **Official documentation:** https://developers.sefaria.org/docs/local-installation-instructions
4. **Ask the development team**

## Tips for Windows Users

- ✅ Use **PowerShell** (not Command Prompt)
- ✅ Always run as **Administrator** when running setup scripts
- ✅ Use **PowerShell ISE** or **Windows Terminal** for better experience
- ✅ **winget** handles all installations automatically
- ✅ Virtual environment is stored in your user profile
- ✅ MongoDB can run as a Windows Service (auto-start on boot)
- ⚠️ Windows Defender may scan installations (slower first run)
- ⚠️ Antivirus might quarantine some tools - add exceptions if needed
- ⚠️ Some npm packages may need build tools - winget handles this

## WSL2 vs Native Windows

This setup is for **native Windows** (not WSL2).

**Advantages of native Windows:**
- Full Windows tool integration
- Better performance for Windows-native tools
- No virtualization overhead
- Direct file system access
- Works with Windows IDEs

**If you prefer WSL2:**
Use the Linux/bash setup scripts in WSL2 Ubuntu instead of these PowerShell scripts.

## Next Steps

After successful setup:

1. ✅ Start the dev servers: `.\run.ps1`
2. ✅ Visit http://localhost:8000
3. ✅ Create admin user: `python manage.py createsuperuser`
4. ✅ Access admin panel: http://localhost:8000/admin
5. ✅ Start coding!

Happy coding on Windows! 🎉
