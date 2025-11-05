#!/bin/bash

###############################################################################
# Sefaria Project Setup Script
#
# This script automates the setup of the Sefaria development environment.
# It can be run on a fresh Mac or Windows machine and will install all
# necessary dependencies and configure the project.
#
# Usage:
#   ./setup.sh [OPTIONS]
#
# Options:
#   --postgres          Use PostgreSQL instead of SQLite for Django DB
#   --skip-dump         Skip downloading and restoring MongoDB dump
#   --help              Show this help message
#
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SCRIPTS_DIR="${SCRIPT_DIR}/scripts/setup"

# Default options
USE_POSTGRES=false
SKIP_DUMP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --postgres)
      USE_POSTGRES=true
      shift
      ;;
    --skip-dump)
      SKIP_DUMP=true
      shift
      ;;
    --help)
      head -n 20 "$0" | tail -n 15
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run './setup.sh --help' for usage information"
      exit 1
      ;;
  esac
done

# Export options for subscripts
export USE_POSTGRES
export SKIP_DUMP
export SCRIPT_DIR

# Shared setup state file (used for cross-step summaries)
SETUP_STATE_FILE="${SCRIPT_DIR}/.setup_state"
rm -f "${SETUP_STATE_FILE}"
touch "${SETUP_STATE_FILE}"
export SETUP_STATE_FILE

# Utility functions
print_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ ERROR: $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ WARNING: $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

# Detect OS
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"

    # Check for Apple Silicon
    if [[ $(uname -m) != "arm64" ]]; then
      print_error "Intel Macs are not supported by this setup script"
      print_info "This script is designed for Apple Silicon (M1/M2/M3) Macs"
      print_info "For Intel Macs, please follow the manual installation instructions at:"
      print_info "https://developers.sefaria.org/docs/local-installation-instructions"
      exit 1
    fi
    print_success "Detected Apple Silicon Mac"

  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OS" == "Windows_NT" ]]; then
    print_error "Windows detected - please use the PowerShell setup script"
    print_info "For Windows 11, run the following in PowerShell (as Administrator):"
    print_info "  .\\setup.ps1"
    print_info ""
    print_info "This bash script is for macOS only."
    exit 1

  else
    print_error "Unsupported operating system: $OSTYPE"
    print_info "Supported platforms:"
    print_info "  - macOS (Apple Silicon only) - use ./setup.sh"
    print_info "  - Windows 11 - use .\\setup.ps1 in PowerShell"
    print_info ""
    print_info "For Intel Macs or Linux, see:"
    print_info "https://developers.sefaria.org/docs/local-installation-instructions"
    exit 1
  fi
  export OS
}

# Main setup flow
main() {
  print_header "Sefaria Project Setup"

  print_info "Starting setup for Sefaria development environment..."
  print_info "This will install all necessary dependencies and configure the project."
  echo ""

  # Detect OS
  detect_os
  print_success "Detected OS: $OS"

  if [ "$USE_POSTGRES" = true ]; then
    print_info "Using PostgreSQL for Django database"
  else
    print_info "Using SQLite for Django database (default)"
  fi

  # Step 1: Check prerequisites
  print_header "Step 1: Checking Prerequisites"
  if [ -f "${SETUP_SCRIPTS_DIR}/check_prerequisites.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/check_prerequisites.sh"
  else
    print_warning "check_prerequisites.sh not found, skipping..."
  fi

  # Step 2: Install system tools
  print_header "Step 2: Installing System Tools"
  if [ -f "${SETUP_SCRIPTS_DIR}/install_system_tools.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/install_system_tools.sh"
  else
    print_error "install_system_tools.sh not found!"
    exit 1
  fi

  # Step 3: Install Python and dependencies
  print_header "Step 3: Setting Up Python Environment"
  if [ -f "${SETUP_SCRIPTS_DIR}/install_python.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/install_python.sh"
  else
    print_error "install_python.sh not found!"
    exit 1
  fi

  # Step 4: Install Node and dependencies
  print_header "Step 4: Setting Up Node.js Environment"
  if [ -f "${SETUP_SCRIPTS_DIR}/install_node.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/install_node.sh"
  else
    print_error "install_node.sh not found!"
    exit 1
  fi

  # Step 5: Setup database (SQLite or PostgreSQL)
  print_header "Step 5: Setting Up Django Database"
  if [ -f "${SETUP_SCRIPTS_DIR}/setup_database.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/setup_database.sh"
  else
    print_error "setup_database.sh not found!"
    exit 1
  fi

  # Step 6: Setup MongoDB
  print_header "Step 6: Setting Up MongoDB"
  if [ -f "${SETUP_SCRIPTS_DIR}/setup_mongodb.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/setup_mongodb.sh"
  else
    print_error "setup_mongodb.sh not found!"
    exit 1
  fi

  # Step 7: Setup Google Cloud SDK (for database dumps)
  print_header "Step 7: Setting Up Google Cloud SDK"
  if [ -f "${SETUP_SCRIPTS_DIR}/setup_gcloud.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/setup_gcloud.sh"
  else
    print_warning "setup_gcloud.sh not found, skipping..."
  fi

  # Step 8: Finalize setup
  print_header "Step 8: Finalizing Setup"
  if [ -f "${SETUP_SCRIPTS_DIR}/finalize_setup.sh" ]; then
    bash "${SETUP_SCRIPTS_DIR}/finalize_setup.sh"
  else
    print_error "finalize_setup.sh not found!"
    exit 1
  fi

  # Complete!
  print_header "Setup Complete!"
  print_success "Sefaria development environment is ready!"
  print_info "Review the summary above for MongoDB status and next steps."
  print_info "Documentation: https://developers.sefaria.org/docs/local-installation-instructions"
  echo ""
}

# Run main function
main
