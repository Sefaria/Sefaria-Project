#!/bin/bash

###############################################################################
# Install Python Script
#
# Installs Python using pyenv and sets up virtual environment
# Installs all Python dependencies from requirements.txt
###############################################################################

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source version configuration
source "${SCRIPT_DIR}/versions.sh"

# Source utility functions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ ERROR: $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ WARNING: $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

# Ensure pyenv is available
ensure_pyenv() {
  # Source pyenv if not already available
  if ! command -v pyenv &> /dev/null; then
    export PYENV_ROOT="$HOME/.pyenv"
    export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init --path)" || true
    eval "$(pyenv init -)" || true
    eval "$(pyenv virtualenv-init -)" || true
  fi

  if ! command -v pyenv &> /dev/null; then
    print_error "pyenv is not available"
    print_info "Please restart your shell and try again, or run: source ~/.zshrc"
    exit 1
  fi

  print_success "pyenv is available"
}

# Install Python
install_python() {
  print_info "Checking for Python ${PYTHON_VERSION}..."

  # Check if Python version is already installed
  if pyenv versions | grep -q "${PYTHON_VERSION}"; then
    print_success "Python ${PYTHON_VERSION} already installed"
    return 0
  fi

  print_info "Installing Python ${PYTHON_VERSION} (this may take a few minutes)..."

  # Try to install specified version
  if pyenv install "${PYTHON_VERSION}"; then
    print_success "Python ${PYTHON_VERSION} installed successfully"
  else
    print_warning "Python ${PYTHON_VERSION} not available"
    print_info "Attempting to install latest Python ${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR}.x..."

    # Get latest available version matching major.minor
    LATEST_VERSION=$(pyenv install --list | grep -E "^  ${PYTHON_MIN_MAJOR}\.${PYTHON_MIN_MINOR}\.[0-9]+$" | tail -1 | tr -d ' ')

    if [ -z "$LATEST_VERSION" ]; then
      print_error "No Python ${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR}.x version available"
      exit 1
    fi

    print_info "Installing Python ${LATEST_VERSION}..."
    pyenv install "${LATEST_VERSION}"
    PYTHON_VERSION="${LATEST_VERSION}"
    print_success "Python ${PYTHON_VERSION} installed successfully"
  fi
}

# Create virtual environment
create_virtualenv() {
  print_info "Setting up virtual environment 'senv'..."

  # Check if senv already exists
  if pyenv versions | grep -q "/envs/senv"; then
    print_warning "Virtual environment 'senv' already exists"
    print_info "Using existing virtual environment"
    return 0
  fi

  # Create virtualenv
  pyenv virtualenv "${PYTHON_VERSION}" senv

  if pyenv versions | grep -q "senv"; then
    print_success "Virtual environment 'senv' created successfully"
  else
    print_error "Virtual environment creation failed"
    exit 1
  fi
}

# Set local Python version
set_local_python() {
  print_info "Setting local Python version to senv..."

  # Create .python-version file
  echo "senv" > .python-version

  print_success "Local Python version set to senv"

  # Activate the virtualenv for current session
  eval "$(pyenv init -)"
  eval "$(pyenv virtualenv-init -)"
  pyenv activate senv || true
}

# Install Python dependencies
install_python_dependencies() {
  print_info "Installing Python dependencies from requirements.txt..."

  if [ ! -f "requirements.txt" ]; then
    print_error "requirements.txt not found!"
    exit 1
  fi

  # Ensure we're using the senv virtualenv
  export PYENV_VERSION=senv

  # Upgrade pip first
  print_info "Upgrading pip..."
  pip install --upgrade pip

  # Install requirements
  print_info "Installing requirements (this may take several minutes)..."
  pip install -r requirements.txt

  print_success "Python dependencies installed successfully"
}

# Verify installation
verify_installation() {
  print_info "Verifying Python installation..."

  # Check Python version
  PYTHON_VERSION=$(python --version 2>&1)
  print_info "Python version: $PYTHON_VERSION"

  # Check if in correct virtualenv
  if python -c "import sys; sys.exit(0 if 'senv' in sys.prefix else 1)" 2>/dev/null; then
    print_success "Using correct virtual environment"
  else
    print_warning "Not in senv virtual environment"
    print_info "Run 'pyenv activate senv' to activate"
  fi

  # Test that Django is installed
  if python -c "import django" 2>/dev/null; then
    print_success "Django installed successfully"
  else
    print_error "Django not found - installation may have failed"
    exit 1
  fi

  # Test that pymongo is installed
  if python -c "import pymongo" 2>/dev/null; then
    print_success "pymongo installed successfully"
  else
    print_error "pymongo not found - installation may have failed"
    exit 1
  fi
}

# Main function
main() {
  print_info "Setting up Python environment..."
  echo ""

  ensure_pyenv
  install_python
  create_virtualenv
  set_local_python
  install_python_dependencies
  verify_installation

  echo ""
  print_success "Python environment setup complete!"
  print_info "Virtual environment 'senv' is activated for this project"
}

main
