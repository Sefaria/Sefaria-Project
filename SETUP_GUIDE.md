# Sefaria Local Development Setup Guide

**For Dummies Edition** - A simple, automated setup for the Sefaria development environment.

## TL;DR (Too Long; Didn't Read)

**macOS (Apple Silicon):**
```bash
./setup.sh
```

That's it! The script will install everything you need and guide you through the process.

## Before You Start

### What You Need

**macOS:**
- **Apple Silicon Mac** (M1/M2/M3) running macOS 12 or later
  - **Note**: Intel Macs are not supported by this automated setup
  - For Intel Macs or Linux, see [manual installation](https://developers.sefaria.org/docs/local-installation-instructions)
  - Windows users should also follow the manual installation instructions

**Both Platforms:**
- Internet connection
- About 30 minutes of time
- Sufficient free disk space for dependencies and database

### What You Don't Need
- Prior development experience
- Existing Python/Node installations (the script handles everything)
- Manual configuration (it's all automated!)

## Setup Steps

### 1. Get the Code

If you haven't already, clone the repository:
```bash
git clone https://github.com/Sefaria/Sefaria-Project.git
cd Sefaria-Project
```

### 2. Run the Setup Script

**macOS:**
```bash
./setup.sh
```

The script will:
- ✅ Check what's already installed on your machine
- ✅ Install all necessary tools (Python, Node.js, MongoDB, etc.)
  - macOS: via Homebrew, pyenv, nvm
- ✅ Set up Python and Node.js environments
- ✅ Create configuration files
- ✅ Download and restore the database
- ✅ Run initial Django setup
- ✅ Verify everything works

### 3. Wait and Follow Prompts

The script will:
- Display progress messages in color
- Ask for confirmation at key steps (like authentication)
- Stop with clear error messages if something goes wrong
- Take 15-30 minutes depending on your internet speed

### 4. Start Developing!

Once complete, you'll see a success message with next steps.

## Advanced Options

### Use PostgreSQL Instead of SQLite

**macOS:**
```bash
./setup.sh --postgres
```

PostgreSQL is more similar to production but takes longer to set up. SQLite is fine for most development work.

### Skip Database Dump (Faster Setup for Testing)

**macOS:**
```bash
./setup.sh --skip-dump
```

This skips downloading the ~GB database dump. Useful if you just want to test the code, not the actual content.

### Combine Options

**macOS:**
```bash
./setup.sh --postgres --skip-dump
```

## After Setup

### Starting the Development Servers

**Quick Start (Recommended):**

Run both servers with one command:

**macOS:**
```bash
./run.sh
```

This will:
- Check that everything is installed
- Start MongoDB if not running
- Start both Django and webpack servers
- Show logs from both servers

Then open your browser to: **http://localhost:8000**

**Alternative - Manual Start:**

If you prefer separate terminals:

**macOS - Terminal 1 (Django Backend):**
```bash
pyenv activate senv
python manage.py runserver
```

**Terminal 2 (Webpack Frontend):**
```bash
npm run w
```

**Run Script Options:**

**macOS:**
```bash
./run.sh           # Run both servers (default)
./run.sh --django  # Run only Django
./run.sh --webpack # Run only webpack
```

### Common Tasks

**Create Admin User:**
```bash
python manage.py createsuperuser
```
Then access admin at: http://localhost:8000/admin

**Restore Database Dump:**

**Note:** The restore_dump script is generated during setup and can be used to re-download the latest database dump.

**macOS:**
```bash
./scripts/setup/restore_dump.sh
```

**Update Dependencies:**
```bash
pyenv activate senv
pip install -r requirements.txt
npm install
```

## Troubleshooting

### macOS Specific

**"Permission Denied" Error:**
```bash
chmod +x setup.sh
```

**"MongoDB connection failed":**
```bash
brew services start mongodb-community
```

**"pyenv: command not found":**
```bash
source ~/.zshrc
```
Or restart your terminal.

**Need to Start Over?**
```bash
pyenv virtualenv-delete senv
./setup.sh
```

### Both Platforms

**"Database dump download failed":**
- Make sure you're authenticated with Google Cloud
- Contact the team for access to the database dumps

## What Gets Installed?

The setup script installs:

### Development Tools

**macOS:**
- **Homebrew** - Package manager for macOS
- **pyenv** - Manages Python versions
- **nvm** - Manages Node.js versions
- **Git** - Already installed on Mac, verified by script

### Databases
- **MongoDB** - Stores Sefaria texts and data
- **PostgreSQL** (optional) - Django authentication database
- **SQLite** (default) - Simpler alternative to PostgreSQL

### Languages & Frameworks
- **Python 3.9.x** (currently 3.9.21) - Backend language
- **Node.js** (latest LTS) - Frontend build tools
- **Django 1.11** - Backend framework
- **React** - Frontend framework

### Other Tools
- **Google Cloud SDK** - Downloads database dumps (optional, only needed if restoring production data)
- **gettext** - Translation tools
- **Redis** - Optional, only required for server-side rendering (SSR) with Node.js
- All required Python and Node.js packages

## File Structure After Setup

```
Sefaria-Project/
├── setup.sh                    # Main setup script (macOS)
├── run.sh                      # Run dev servers (macOS)
├── scripts/setup/              # Individual setup scripts
│   ├── README.md              # Detailed documentation
│   ├── restore_dump.sh        # Restore database (macOS, generated during setup)
│   └── ...                    # Other setup scripts (.sh for macOS)
├── sefaria/
│   └── local_settings.py      # Your local config (created by setup)
├── log/                        # Django logs (created by setup)
├── db.sqlite                   # Database (if using SQLite)
└── .python-version            # Tells pyenv to use senv virtualenv (macOS only)
```

## For QA and Product Teams

This setup is designed for you! You don't need to:
- Understand what Docker is
- Know what a virtual environment is
- Edit configuration files manually
- Know Python or Node.js

Just run `./setup.sh` and follow the prompts. If something goes wrong, the script will tell you exactly what happened in plain English.

## Getting Help

1. **Check the detailed README:**
   ```bash
   cat scripts/setup/README.md
   ```

2. **Check the official docs:**
   https://developers.sefaria.org/docs/local-installation-instructions

3. **Ask the development team** - They're here to help!

## Tips

- ☕ Grab coffee during the initial setup - it takes 15-30 minutes
- 💾 The database dump is several GB - make sure you have space
- 🔄 You can run the script multiple times safely
- 📝 Each subscript can be run independently for debugging
- 🎯 Use `--skip-dump` for quick setup if you don't need the full database

## What's Next?

After setup, you can:
- Start the development servers
- Access the site at http://localhost:8000
- Make code changes and see them live
- Run tests with `pytest`
- Access Django admin at http://localhost:8000/admin

Happy coding! 🎉
