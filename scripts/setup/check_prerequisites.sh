#!/bin/bash

###############################################################################
# Check Prerequisites Script
#
# Checks for existing installations and potential conflicts
###############################################################################

set -e

# Source utility functions from main script
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ ERROR: $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ WARNING: $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

# Track if we found any issues
FOUND_ISSUES=false

# Check if running in project directory
check_directory() {
  if [ ! -f "manage.py" ] || [ ! -d "sefaria" ]; then
    print_error "This script must be run from the Sefaria-Project root directory"
    print_info "Expected to find manage.py and sefaria/ directory"
    exit 1
  fi
  print_success "Running from correct directory"
}

# Check for existing virtual environments that might conflict
check_virtualenvs() {
  print_info "Checking for existing virtual environments..."

  if [ -d "venv" ] || [ -d "env" ] || [ -d ".venv" ]; then
    print_warning "Found existing virtualenv directory (venv/env/.venv)"
    print_info "We will use pyenv virtualenv instead (named 'senv')"
  fi

  # Check if pyenv already has senv
  if command -v pyenv &> /dev/null; then
    if pyenv versions | grep -q "senv"; then
      print_warning "Found existing 'senv' virtualenv in pyenv"
      print_info "Will use existing senv virtualenv"
    fi
  fi
}

# Check for existing package managers
check_package_managers() {
  print_info "Checking for package managers..."

  if [[ "$OS" == "macos" ]]; then
    if command -v brew &> /dev/null; then
      print_success "Homebrew already installed: $(brew --version | head -1)"
    else
      print_info "Homebrew not found - will install"
    fi
  fi
}

# Check for existing Python installations
check_python() {
  print_info "Checking Python installations..."

  if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    print_info "Found system Python: $PYTHON_VERSION"
  fi

  if command -v pyenv &> /dev/null; then
    print_success "pyenv already installed: $(pyenv --version)"
    pyenv versions
  else
    print_info "pyenv not found - will install"
  fi
}

# Check for existing Node installations
check_node() {
  print_info "Checking Node.js installations..."

  if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_info "Found Node.js: $NODE_VERSION"
  fi

  if command -v nvm &> /dev/null; then
    print_success "nvm already installed"
  elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    print_success "nvm already installed at ~/.nvm"
  else
    print_info "nvm not found - will install"
  fi
}

# Check for MongoDB
check_mongodb() {
  print_info "Checking MongoDB installation..."

  if command -v mongod &> /dev/null; then
    MONGO_VERSION=$(mongod --version 2>&1 | grep "db version" | head -1)
    print_success "MongoDB already installed: $MONGO_VERSION"

    # Check if MongoDB is running
    if pgrep -x mongod > /dev/null; then
      print_success "MongoDB is running"
    else
      print_info "MongoDB is installed but not running - will start later"
    fi
  else
    print_info "MongoDB not found - will install"
  fi
}

# Check for PostgreSQL (if --postgres flag used)
check_postgresql() {
  print_info "Checking PostgreSQL installation..."

  if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version)
    print_success "PostgreSQL already installed: $PSQL_VERSION"

    # Check if PostgreSQL is running
    if pg_isready &> /dev/null; then
      print_success "PostgreSQL is running"
    else
      print_warning "PostgreSQL is installed but not running"
      print_info "Will attempt to start PostgreSQL during setup"
    fi
  else
    if [ "$USE_POSTGRES" = true ]; then
      print_info "PostgreSQL not found - will install"
    else
      print_info "PostgreSQL not found - using SQLite (default)"
    fi
  fi
}

# Check for Git
check_git() {
  print_info "Checking Git installation..."

  if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    print_success "Git already installed: $GIT_VERSION"
  else
    print_error "Git is not installed!"
    print_info "Git is required. Please install Git and try again."
    exit 1
  fi
}

# Check for gettext
check_gettext() {
  print_info "Checking gettext installation..."

  if command -v msgfmt &> /dev/null; then
    print_success "gettext already installed"
  else
    print_info "gettext not found - will install"
  fi
}

# Check disk space
check_disk_space() {
  print_info "Checking available disk space..."

  if [[ "$OS" == "macos" ]]; then
    AVAILABLE_GB=$(df -h . | awk 'NR==2 {print $4}' | sed 's/Gi//g' | sed 's/G//g')
    print_info "Available disk space: ${AVAILABLE_GB}GB"

    # Warn if less than 10GB available
    if (( $(echo "$AVAILABLE_GB < 10" | bc -l) )); then
      print_warning "Low disk space! Recommend at least 10GB free for Sefaria setup"
      FOUND_ISSUES=true
    fi
  fi
}

# Check for existing local_settings.py
check_local_settings() {
  print_info "Checking for existing configuration..."

  if [ -f "sefaria/local_settings.py" ]; then
    print_warning "Found existing sefaria/local_settings.py"
    print_info "Will backup existing file before creating new one"
  else
    print_info "No local_settings.py found - will create from template"
  fi
}

# Main function
main() {
  print_info "Running prerequisite checks..."
  echo ""

  check_directory
  check_git
  check_disk_space
  check_package_managers
  check_virtualenvs
  check_python
  check_node
  check_mongodb
  check_postgresql
  check_gettext
  check_local_settings

  echo ""
  if [ "$FOUND_ISSUES" = true ]; then
    print_warning "Found some issues, but will continue with installation"
  else
    print_success "Prerequisite checks passed!"
  fi
}

main
