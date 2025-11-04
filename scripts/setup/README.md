# Sefaria Setup Scripts

Automated setup scripts for the Sefaria development environment. These scripts will install all dependencies and configure your local development environment.

## Quick Start

For a fresh setup on macOS, simply run:

```bash
./setup.sh
```

This will:
1. Install all system dependencies (Homebrew, pyenv, nvm, MongoDB, etc.)
2. Set up Python 3.9 with a virtual environment
3. Install Node.js and npm dependencies
4. Configure Django database (SQLite by default)
5. Set up MongoDB
6. Install and configure Google Cloud SDK for database dumps
7. Run Django migrations
8. Verify the complete setup

## Usage

### Basic Usage

```bash
./setup.sh
```

### Options

- `--postgres` - Use PostgreSQL instead of SQLite for Django database
- `--skip-dump` - Skip downloading and restoring the MongoDB dump
- `--help` - Show help message

### Examples

```bash
# Use PostgreSQL instead of SQLite
./setup.sh --postgres

# Skip MongoDB dump restore (faster setup for testing)
./setup.sh --skip-dump

# Combine options
./setup.sh --postgres --skip-dump
```

## Individual Subscripts

Each part of the setup can be run independently for debugging or partial setups:

### 1. Check Prerequisites
```bash
./scripts/setup/check_prerequisites.sh
```
Checks for existing installations and potential conflicts.

### 2. Install System Tools
```bash
./scripts/setup/install_system_tools.sh
```
Installs:
- Homebrew (macOS package manager)
- pyenv (Python version manager)
- nvm (Node version manager)
- MongoDB
- PostgreSQL (if `--postgres` flag used)
- gettext (for translations)
- Development libraries

### 3. Install Python
```bash
./scripts/setup/install_python.sh
```
- Installs Python 3.9.21 via pyenv
- Creates virtual environment named 'senv'
- Installs all requirements from `requirements.txt`

### 4. Install Node.js
```bash
./scripts/setup/install_node.sh
```
- Installs latest LTS Node.js via nvm
- Runs `npm install`
- Builds client assets

### 5. Setup Database
```bash
./scripts/setup/setup_database.sh
```
- Creates `sefaria/local_settings.py` from template
- Configures for SQLite or PostgreSQL
- Creates PostgreSQL database if needed

### 6. Setup MongoDB
```bash
./scripts/setup/setup_mongodb.sh
```
- Starts MongoDB service
- Tests MongoDB connection
- Prepares for dump restoration

### 7. Setup Google Cloud SDK
```bash
./scripts/setup/setup_gcloud.sh
```
- Installs Google Cloud SDK
- Handles authentication
- Downloads and restores MongoDB dump
- Creates standalone `restore_dump.sh` script

### 8. Finalize Setup
```bash
./scripts/setup/finalize_setup.sh
```
- Creates log directory with correct permissions
- Runs Django migrations
- Optionally creates superuser
- Verifies complete setup
- Displays next steps

### 9. Restore Database Dump (Standalone)
```bash
./scripts/setup/restore_dump.sh
```
Standalone script to download and restore MongoDB dump. Created by `setup_gcloud.sh`.

## Requirements

### macOS
- macOS 10.14 or later
- Command Line Tools for Xcode
- Internet connection

### Windows
- Windows 10 or later with WSL2
- Internet connection

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
