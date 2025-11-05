#!/bin/bash

###############################################################################
# Install System Tools Script
#
# Installs core system dependencies:
# - Homebrew (macOS)
# - pyenv
# - nvm
# - MongoDB
# - PostgreSQL (if --postgres flag used)
# - gettext
###############################################################################

set -e

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

# Install Homebrew (macOS Apple Silicon only)
install_homebrew() {
  if [[ "$OS" != "macos" ]]; then
    return 0
  fi

  # Verify Apple Silicon
  if [[ $(uname -m) != "arm64" ]]; then
    print_error "This script only supports Apple Silicon Macs"
    exit 1
  fi

  if command -v brew &> /dev/null; then
    print_success "Homebrew already installed"
    return 0
  fi

  print_info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Add Homebrew to PATH for Apple Silicon Macs
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  eval "$(/opt/homebrew/bin/brew shellenv)"

  if command -v brew &> /dev/null; then
    print_success "Homebrew installed successfully"
  else
    print_error "Homebrew installation failed"
    exit 1
  fi
}

# Install pyenv
install_pyenv() {
  if command -v pyenv &> /dev/null; then
    print_success "pyenv already installed: $(pyenv --version)"
    ensure_pyenv_virtualenv_plugin
    configure_pyenv_shell
    return 0
  fi

  print_info "Installing pyenv..."

  if [[ "$OS" == "macos" ]]; then
    brew install pyenv pyenv-virtualenv
  else
    print_error "Unsupported OS for pyenv installation"
    print_info "Only macOS (Apple Silicon) is supported"
    exit 1
  fi

  # Add pyenv to shell configuration
  ensure_pyenv_virtualenv_plugin
  configure_pyenv_shell
}

# Ensure pyenv-virtualenv plugin is installed
ensure_pyenv_virtualenv_plugin() {
  if command -v pyenv &> /dev/null && pyenv commands 2>/dev/null | grep -q "^virtualenv$"; then
    print_success "pyenv-virtualenv plugin already available"
    return 0
  fi

  print_info "Installing pyenv-virtualenv plugin..."

  if [[ "$OS" == "macos" ]]; then
    if brew list pyenv-virtualenv &> /dev/null; then
      print_info "pyenv-virtualenv already installed via Homebrew"
    else
      brew install pyenv-virtualenv
    fi
  else
    print_error "Unsupported OS for pyenv-virtualenv installation"
    print_info "Only macOS (Apple Silicon) is supported"
    exit 1
  fi
}

# Configure pyenv in shell
configure_pyenv_shell() {
  print_info "Configuring pyenv in shell..."

  SHELL_CONFIG=""
  if [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
  elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_CONFIG="$HOME/.bash_profile"
  else
    print_warning "Could not find shell config file"
    SHELL_CONFIG="$HOME/.zshrc"
    touch "$SHELL_CONFIG"
  fi

  # Check if pyenv is already in config
  if ! grep -q 'pyenv init' "$SHELL_CONFIG"; then
    cat >> "$SHELL_CONFIG" << 'EOF'

# Pyenv configuration
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init --path)"
eval "$(pyenv init -)"
eval "$(pyenv virtualenv-init -)"
EOF
    print_success "Added pyenv to $SHELL_CONFIG"
  else
    print_info "pyenv already configured in $SHELL_CONFIG"
  fi

  # Source the config for current session
  export PYENV_ROOT="$HOME/.pyenv"
  export PATH="$PYENV_ROOT/bin:$PATH"
  eval "$(PYENV_SHELL=bash pyenv init --path)" || true
  eval "$(PYENV_SHELL=bash pyenv init -)" || true
  eval "$(PYENV_SHELL=bash pyenv virtualenv-init -)" || true

  print_success "pyenv installed and configured"
}

# Install nvm
install_nvm() {
  if command -v nvm &> /dev/null; then
    print_success "nvm already installed"
    return 0
  fi

  # Check if nvm directory exists
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    print_success "nvm already installed at ~/.nvm"
    # Source nvm for current session
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    return 0
  fi

  print_info "Installing nvm..."

  # Install nvm
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

  # Source nvm for current session
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  if [ -s "$NVM_DIR/nvm.sh" ]; then
    print_success "nvm installed successfully"
  else
    print_error "nvm installation failed"
    exit 1
  fi
}

# Install MongoDB
install_mongodb() {
  if [[ "$OS" != "macos" ]]; then
    print_error "Unsupported OS for MongoDB installation"
    print_info "Only macOS (Apple Silicon) is supported"
    exit 1
  fi

  if command -v mongod &> /dev/null; then
    print_success "MongoDB already installed"
  else
    print_info "Installing MongoDB..."
    brew tap mongodb/brew
    brew install mongodb-community
    print_success "MongoDB installed successfully"
  fi

  # Ensure service is running
  print_info "Starting MongoDB service..."
  brew services start mongodb-community
  print_success "MongoDB service started"

  # Ensure mongosh is available
  if ! command -v mongosh &> /dev/null; then
    print_info "Installing mongosh client..."
    brew install mongosh
  fi

  # Ensure database tools are available (mongorestore, etc.)
  if ! command -v mongorestore &> /dev/null; then
    print_info "Installing MongoDB database tools..."
    brew install mongodb-database-tools
  fi

  if command -v mongosh &> /dev/null; then
    print_success "mongosh available"
  else
    print_warning "mongosh still missing after installation attempt"
  fi

  if command -v mongorestore &> /dev/null; then
    print_success "MongoDB database tools available"
  else
    print_warning "mongorestore still missing after installation attempt"
  fi
}

# Install PostgreSQL
install_postgresql() {
  if [ "$USE_POSTGRES" != true ]; then
    print_info "Skipping PostgreSQL installation (using SQLite)"
    return 0
  fi

  if command -v psql &> /dev/null; then
    print_success "PostgreSQL already installed"

    # Start PostgreSQL if not running
    if ! pg_isready &> /dev/null; then
      print_info "Starting PostgreSQL service..."
      if [[ "$OS" == "macos" ]]; then
        brew services start postgresql@14
      fi
    fi

    return 0
  fi

  print_info "Installing PostgreSQL..."

  if [[ "$OS" == "macos" ]]; then
    brew install postgresql@14

    # Start PostgreSQL service
    print_info "Starting PostgreSQL service..."
    brew services start postgresql@14

    # Add PostgreSQL to PATH
    echo 'export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"' >> ~/.zprofile
    export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"

    print_success "PostgreSQL installed and started"
  else
    print_error "Unsupported OS for PostgreSQL installation"
    print_info "Only macOS (Apple Silicon) is supported"
    exit 1
  fi
}

# Install gettext
install_gettext() {
  if command -v msgfmt &> /dev/null; then
    print_success "gettext already installed"
    return 0
  fi

  print_info "Installing gettext..."

  if [[ "$OS" == "macos" ]]; then
    brew install gettext
    # Link gettext (Homebrew doesn't link it by default)
    brew link --force gettext
    print_success "gettext installed successfully"
  else
    print_error "Unsupported OS for gettext installation"
    print_info "Only macOS (Apple Silicon) is supported"
    exit 1
  fi
}

# Install development libraries (needed for Python packages)
install_dev_libraries() {
  print_info "Installing development libraries..."

  if [[ "$OS" == "macos" ]]; then
    # Install PostgreSQL development libraries (needed even if not using PostgreSQL)
    if ! brew list libpq &> /dev/null; then
      brew install libpq
      print_success "PostgreSQL development libraries installed"
    else
      print_success "PostgreSQL development libraries already installed"
    fi
  else
    print_info "Skipping development libraries (macOS only)"
  fi
}

# Main function
main() {
  print_info "Installing system tools..."
  echo ""

  install_homebrew
  install_pyenv
  install_nvm
  install_gettext
  install_dev_libraries
  install_mongodb
  install_postgresql

  echo ""
  print_success "System tools installation complete!"
}

main
