# Sefaria Local Development Setup Guide

**For Dummies Edition** - A simple, automated setup for the Sefaria development environment.

## TL;DR (Too Long; Didn't Read)

```bash
./setup.sh
```

That's it! The script will install everything you need and guide you through the process.

## Before You Start

### What You Need
- A Mac (macOS 10.14 or later) or Windows with WSL2
- Internet connection
- About 30 minutes of time
- 10+ GB of free disk space

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

```bash
./setup.sh
```

The script will:
- ✅ Check what's already installed on your machine
- ✅ Install all necessary tools (Homebrew, Python, Node.js, MongoDB, etc.)
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

```bash
./setup.sh --postgres
```

PostgreSQL is more similar to production but takes longer to set up. SQLite is fine for most development work.

### Skip Database Dump (Faster Setup for Testing)

```bash
./setup.sh --skip-dump
```

This skips downloading the ~GB database dump. Useful if you just want to test the code, not the actual content.

### Combine Options

```bash
./setup.sh --postgres --skip-dump
```

## After Setup

### Starting the Development Servers

Every time you want to work on Sefaria, you need two terminal windows:

**Terminal 1 - Django (Backend):**
```bash
pyenv activate senv
python manage.py runserver
```

**Terminal 2 - Webpack (Frontend):**
```bash
npm run w
```

Then open your browser to: **http://localhost:8000**

### Common Tasks

**Create Admin User:**
```bash
python manage.py createsuperuser
```
Then access admin at: http://localhost:8000/admin

**Restore Database Dump:**
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

### "Permission Denied" Error

Make the script executable:
```bash
chmod +x setup.sh
```

### Script Stops with an Error

The script will show a clear error message. Common issues:

**"MongoDB connection failed"**
```bash
brew services start mongodb-community
```

**"pyenv: command not found"**
```bash
source ~/.zshrc
```
Or restart your terminal.

**"Database dump download failed"**
- Make sure you're authenticated with Google Cloud
- Contact the team for access to the database dumps

### Need to Start Over?

Delete the virtual environment and re-run:
```bash
pyenv virtualenv-delete senv
./setup.sh
```

## What Gets Installed?

The setup script installs:

### Development Tools
- **Homebrew** - Package manager for macOS
- **pyenv** - Manages Python versions
- **nvm** - Manages Node.js versions
- **Git** - Already installed on Mac, verified by script

### Databases
- **MongoDB** - Stores Sefaria texts and data
- **PostgreSQL** (optional) - Django authentication database
- **SQLite** (default) - Simpler alternative to PostgreSQL

### Languages & Frameworks
- **Python 3.9.21** - Backend language
- **Node.js** (latest LTS) - Frontend build tools
- **Django 1.11** - Backend framework
- **React** - Frontend framework

### Other Tools
- **Google Cloud SDK** - Downloads database dumps
- **gettext** - Translation tools
- All required Python and Node.js packages

## File Structure After Setup

```
Sefaria-Project/
├── setup.sh                    # Main setup script (you run this)
├── scripts/setup/              # Individual setup scripts
│   ├── README.md              # Detailed documentation
│   ├── restore_dump.sh        # Restore database anytime
│   └── ...                    # Other setup scripts
├── sefaria/
│   └── local_settings.py      # Your local config (created by setup)
├── log/                        # Django logs (created by setup)
├── db.sqlite                   # Database (if using SQLite)
└── .python-version            # Tells pyenv to use Python 3.9.21
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
