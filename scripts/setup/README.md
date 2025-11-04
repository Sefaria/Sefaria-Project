# Sefaria Setup Scripts

Automated setup scripts for the Sefaria development environment. These scripts will install all dependencies and configure your local development environment.

**Supports:** macOS (Apple Silicon) and Windows 11

## Quick Start

**macOS (Apple Silicon):**
```bash
./setup.sh
```

**Windows 11 (PowerShell as Administrator):**
```powershell
.\setup.ps1
```

This will:
1. Install all system dependencies (Python, Node.js, MongoDB, etc.)
2. Set up Python with a virtual environment
3. Install Node.js and npm dependencies
4. Configure Django database (SQLite by default)
5. Set up MongoDB
6. Install and configure Google Cloud SDK for database dumps
7. Run Django migrations
8. Verify the complete setup

## Usage

### Basic Usage

**macOS:**
```bash
./setup.sh
```

**Windows:**
```powershell
.\setup.ps1
```

### Options

**macOS:**
- `--postgres` - Use PostgreSQL instead of SQLite for Django database
- `--skip-dump` - Skip downloading and restoring the MongoDB dump
- `--help` - Show help message

**Windows:**
- `-Postgres` - Use PostgreSQL instead of SQLite for Django database
- `-SkipDump` - Skip downloading and restoring the MongoDB dump
- `-Help` - Show help message

### Examples

**macOS:**
```bash
# Use PostgreSQL instead of SQLite
./setup.sh --postgres

# Skip MongoDB dump restore (faster setup for testing)
./setup.sh --skip-dump

# Combine options
./setup.sh --postgres --skip-dump
```

**Windows:**
```powershell
# Use PostgreSQL instead of SQLite
.\setup.ps1 -Postgres

# Skip MongoDB dump restore (faster setup for testing)
.\setup.ps1 -SkipDump

# Combine options
.\setup.ps1 -Postgres -SkipDump
```

## Individual Subscripts

Each part of the setup can be run independently for debugging or partial setups.

**Note:** Replace `.sh` with `.ps1` for Windows PowerShell scripts.

### 1. Check Prerequisites
**macOS:** `./scripts/setup/check_prerequisites.sh`
**Windows:** `.\scripts\setup\check_prerequisites.ps1`

Checks for existing installations and potential conflicts.

### 2. Install System Tools
**macOS:** `./scripts/setup/install_system_tools.sh`
**Windows:** `.\scripts\setup\install_system_tools.ps1`

Installs:
- **macOS:** Homebrew, pyenv, nvm, MongoDB, PostgreSQL (optional), gettext
- **Windows:** Python, Node.js, MongoDB, PostgreSQL (optional), gettext, Git via winget

### 3. Install Python
**macOS:** `./scripts/setup/install_python.sh`
**Windows:** `.\scripts\setup\install_python.ps1`

- **macOS:** Installs Python 3.9.21 via pyenv
- **Windows:** Uses installed Python 3.10+
- Creates virtual environment named 'senv'
- Installs all requirements from `requirements.txt`

### 4. Install Node.js
**macOS:** `./scripts/setup/install_node.sh`
**Windows:** `.\scripts\setup\install_node.ps1`

- Installs latest LTS Node.js (via nvm on macOS, direct on Windows)
- Runs `npm install`
- Builds client assets

### 5. Setup Database
**macOS:** `./scripts/setup/setup_database.sh`
**Windows:** `.\scripts\setup\setup_database.ps1`

- Creates `sefaria/local_settings.py` from template
- Configures for SQLite or PostgreSQL
- Creates PostgreSQL database if needed

### 6. Setup MongoDB
**macOS:** `./scripts/setup/setup_mongodb.sh`
**Windows:** `.\scripts\setup\setup_mongodb.ps1`

- Starts MongoDB service (or process)
- Tests MongoDB connection
- Prepares for dump restoration

### 7. Setup Google Cloud SDK
**macOS:** `./scripts/setup/setup_gcloud.sh`
**Windows:** `.\scripts\setup\setup_gcloud.ps1`

- Installs/verifies Google Cloud SDK
- Handles authentication
- Creates standalone restore script

### 8. Finalize Setup
**macOS:** `./scripts/setup/finalize_setup.sh`
**Windows:** `.\scripts\setup\finalize_setup.ps1`

- Configures hosts file for voices.localhost
- Creates log directory with correct permissions
- Runs Django migrations
- Optionally creates superuser
- Verifies complete setup
- Displays next steps

### 9. Restore Database Dump (Standalone)
**macOS:** `./scripts/setup/restore_dump.sh`
**Windows:** `.\scripts\setup\restore_dump.ps1`

Standalone script to download and restore MongoDB dump. Created by setup process.

## Requirements

### macOS (Apple Silicon Only)
- **Apple Silicon (M1/M2/M3) Macs only**
- macOS 12 (Monterey) or later recommended
- Command Line Tools for Xcode (installed automatically)
- Internet connection

**Note**: Intel Macs are not supported by this automated setup. For Intel Macs or Linux, please follow the [manual installation instructions](https://developers.sefaria.org/docs/local-installation-instructions).

### Windows
- **Windows 11** (or Windows 10 21H2+)
- PowerShell 5.1 or later (included with Windows)
- Administrator access (required for installations)
- Internet connection

**Note**: Native Windows is supported. WSL2/Linux subsystem is not required.

## What Gets Installed

### System Tools
- **Homebrew** - macOS package manager
- **pyenv** - Python version manager
- **nvm** - Node.js version manager
- **MongoDB 4.4+** - NoSQL database for Sefaria texts
- **PostgreSQL 14** (optional) - Relational database for Django
- **gettext** - GNU internationalization utilities
- **Google Cloud SDK** - For accessing database dumps

### Python Environment
- **Python 3.9.21** - Installed via pyenv
- **Virtual environment 'senv'** - Project-specific Python environment
- **All Python packages** from `requirements.txt` including:
  - Django 1.11.x
  - pymongo
  - Django REST Framework
  - And 100+ other dependencies

### Node.js Environment
- **Node.js** (latest LTS version)
- **npm** packages from `package.json` including:
  - React
  - Webpack
  - Babel
  - Jest
  - And many other frontend dependencies

## Directory Structure

```
Sefaria-Project/
├── setup.sh                          # Main setup script
├── scripts/
│   └── setup/
│       ├── README.md                 # This file
│       ├── check_prerequisites.sh    # Check existing installations
│       ├── install_system_tools.sh   # Install system dependencies
│       ├── install_python.sh         # Setup Python environment
│       ├── install_node.sh           # Setup Node.js environment
│       ├── setup_database.sh         # Configure Django database
│       ├── setup_mongodb.sh          # Setup MongoDB
│       ├── setup_gcloud.sh           # Setup Google Cloud SDK
│       ├── finalize_setup.sh         # Final setup steps
│       └── restore_dump.sh           # Restore MongoDB dump (created during setup)
├── sefaria/
│   └── local_settings.py             # Created by setup (git-ignored)
├── log/                               # Created by setup
└── db.sqlite                          # Created by Django (if using SQLite)
```

## Configuration Files

### sefaria/local_settings.py

Created automatically by the setup script. Contains:
- Database configuration (SQLite or PostgreSQL)
- MongoDB connection settings
- Django secret key
- Cache configuration
- Email backend (console for local dev)
- Search configuration (uses production search)
- Node server settings
- Debug and development settings

You can manually edit this file after setup if needed.

### .python-version

Created automatically to pin the project to Python 3.9.21/senv virtualenv.

## Troubleshooting

### "pyenv: command not found"

After installation, restart your terminal or run:
```bash
source ~/.zshrc  # or ~/.bashrc
```

### "MongoDB connection failed"

Start MongoDB manually:
```bash
brew services start mongodb-community
```

### "PostgreSQL connection failed"

Start PostgreSQL manually:
```bash
brew services start postgresql@14
```

### "pip install failed"

Ensure you're in the virtual environment:
```bash
pyenv activate senv
```

### "npm install failed"

Try clearing npm cache:
```bash
npm cache clean --force
npm install
```

### "Database dump download failed"

1. Ensure you're authenticated with Google Cloud:
   ```bash
   gcloud auth login
   ```

2. Check if you have access to the sefaria-mongo-backup bucket

3. Contact the team for the latest dump file

### "Permission denied" errors

Make scripts executable:
```bash
chmod +x setup.sh
chmod +x scripts/setup/*.sh
```

## After Setup

Once setup is complete, you can start developing:

1. **Activate virtual environment:**
   ```bash
   pyenv activate senv
   ```

2. **Start Django server:**
   ```bash
   python manage.py runserver
   ```

3. **In a separate terminal, start webpack watch:**
   ```bash
   npm run w
   ```

4. **Visit your local site:**
   ```
   http://localhost:8000
   ```

5. **Access Django admin:**
   ```
   http://localhost:8000/admin
   ```

## Maintenance

### Updating Dependencies

**Python packages:**
```bash
pyenv activate senv
pip install -r requirements.txt --upgrade
```

**Node packages:**
```bash
npm update
```

### Restoring Fresh Database Dump

```bash
./scripts/setup/restore_dump.sh
```

### Cleaning Up

To remove virtual environment and start fresh:
```bash
pyenv virtualenv-delete senv
./scripts/setup/install_python.sh
```

## For QA and Non-Developers

This setup script is designed to be user-friendly for non-developers:

1. **Clone the repository** (or get it from the team)
2. **Open Terminal** and navigate to the Sefaria-Project folder
3. **Run:** `./setup.sh`
4. **Follow the prompts** - the script will guide you through each step
5. **When authentication is needed**, a browser window will open
6. **If something goes wrong**, the script will stop and show a clear error message

The entire process takes 15-30 minutes depending on your internet speed.

## Getting Help

- **Documentation:** https://developers.sefaria.org/docs/local-installation-instructions
- **Issues:** Contact the development team
- **Logs:** Check the `log/` directory for Django logs

## Contributing

When modifying these scripts:

1. Test on a fresh machine/VM if possible
2. Ensure error messages are clear and actionable
3. Update this README with any new options or changes
4. Make sure scripts are idempotent (can be run multiple times safely)

## License

Part of the Sefaria Project. See main repository for license information.
