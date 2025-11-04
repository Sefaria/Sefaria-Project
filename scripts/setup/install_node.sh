#!/bin/bash

###############################################################################
# Install Node.js Script
#
# Installs Node.js using nvm and runs npm install
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

# Ensure nvm is available
ensure_nvm() {
  # Source nvm if not already available
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  if ! command -v nvm &> /dev/null; then
    print_error "nvm is not available"
    print_info "Please restart your shell and try again, or run: source ~/.zshrc"
    exit 1
  fi

  print_success "nvm is available"
}

# Install Node.js
install_node() {
  print_info "Installing Node.js..."

  # Check if Node is already installed
  if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js already installed: $NODE_VERSION"
    print_info "Using existing Node.js installation"
    return 0
  fi

  # Install latest LTS version
  print_info "Installing latest LTS version of Node.js (this may take a minute)..."
  nvm install --lts

  # Use the installed version
  nvm use --lts

  # Set as default
  nvm alias default node

  if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installed successfully: $NODE_VERSION"
  else
    print_error "Node.js installation failed"
    exit 1
  fi
}

# Install npm dependencies
install_npm_dependencies() {
  print_info "Installing npm dependencies from package.json..."

  if [ ! -f "package.json" ]; then
    print_error "package.json not found!"
    exit 1
  fi

  # Install dependencies
  print_info "Running npm install (this may take several minutes)..."
  npm install

  print_success "npm dependencies installed successfully"
}

# Run npm setup
run_npm_setup() {
  print_info "Running npm setup..."

  # Check if setup script exists in package.json
  if grep -q '"setup"' package.json; then
    npm run setup
    print_success "npm setup completed"
  else
    print_info "No setup script found in package.json, skipping"
  fi
}

# Build client assets
build_client() {
  print_info "Building client assets..."

  # Check if build-client script exists
  if grep -q '"build-client"' package.json; then
    print_info "Running npm run build-client (this may take a few minutes)..."
    npm run build-client
    print_success "Client assets built successfully"
  else
    print_warning "build-client script not found in package.json"
    print_info "You may need to run 'npm run build' or 'npm run w' later"
  fi
}

# Verify installation
verify_installation() {
  print_info "Verifying Node.js installation..."

  # Check Node version
  if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_info "Node.js version: $NODE_VERSION"
  else
    print_error "Node.js not found"
    exit 1
  fi

  # Check npm version
  if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_info "npm version: $NPM_VERSION"
  else
    print_error "npm not found"
    exit 1
  fi

  # Check if node_modules exists
  if [ -d "node_modules" ]; then
    print_success "node_modules directory exists"
  else
    print_error "node_modules directory not found - npm install may have failed"
    exit 1
  fi

  # Check for critical packages
  if [ -d "node_modules/react" ]; then
    print_success "React installed successfully"
  else
    print_warning "React not found in node_modules"
  fi
}

# Main function
main() {
  print_info "Setting up Node.js environment..."
  echo ""

  ensure_nvm
  install_node
  install_npm_dependencies
  run_npm_setup
  build_client
  verify_installation

  echo ""
  print_success "Node.js environment setup complete!"
  print_info "To watch for changes, run: npm run w"
}

main
