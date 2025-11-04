#!/bin/bash

###############################################################################
# Finalize Setup Script
#
# Performs final setup steps:
# - Creates log directory
# - Runs Django migrations
# - Verifies setup
# - Provides next steps
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

# Ensure virtualenv is activated
ensure_virtualenv() {
  print_info "Ensuring Python virtual environment is active..."

  # Source pyenv
  export PYENV_ROOT="$HOME/.pyenv"
  export PATH="$PYENV_ROOT/bin:$PATH"
  eval "$(pyenv init --path)" || true
  eval "$(pyenv init -)" || true
  eval "$(pyenv virtualenv-init -)" || true

  # Activate senv
  export PYENV_VERSION=senv

  # Verify we're in the right environment
  if python -c "import sys; sys.exit(0 if 'senv' in sys.prefix else 1)" 2>/dev/null; then
    print_success "Virtual environment 'senv' is active"
  else
    print_warning "Virtual environment may not be active"
    print_info "Attempting to activate..."
    pyenv activate senv || true
  fi
}

# Configure hosts file for voices subdomain
configure_hosts_file() {
  print_info "Configuring hosts file for voices.localhost..."

  # Check if entry already exists
  if grep -q "voices.localhost" /etc/hosts 2>/dev/null; then
    print_success "voices.localhost already configured in /etc/hosts"
    return 0
  fi

  print_info "Adding voices.localhost to /etc/hosts..."
  print_warning "This requires sudo access"

  if [[ "$OS" == "macos" ]]; then
    if echo "127.0.0.1    voices.localhost" | sudo tee -a /etc/hosts > /dev/null; then
      print_success "Added voices.localhost to /etc/hosts"
    else
      print_error "Failed to update /etc/hosts"
      print_info "You can manually add this line to /etc/hosts:"
      print_info "127.0.0.1    voices.localhost"
    fi
  else
    print_error "Unsupported OS for hosts file configuration"
    exit 1
  fi
}

# Create log directory
create_log_directory() {
  print_info "Creating log directory..."

  if [ -d "log" ]; then
    print_success "Log directory already exists"
  else
    mkdir log
    print_success "Log directory created"
  fi

  # Set permissions
  chmod 777 log
  print_success "Log directory permissions set"
}

# Run Django migrations
run_migrations() {
  print_info "Running Django database migrations..."

  # Check if manage.py exists
  if [ ! -f "manage.py" ]; then
    print_error "manage.py not found"
    exit 1
  fi

  # Run migrations
  print_info "This will create the Django authentication database tables"
  if python manage.py migrate; then
    print_success "Database migrations completed successfully"
  else
    print_error "Database migrations failed"
    print_warning "You may need to check your database configuration in local_settings.py"
    exit 1
  fi
}

# Create superuser (optional)
create_superuser() {
  print_info "Django superuser creation..."
  echo ""
  print_info "You can create a superuser account to access the Django admin"
  print_info "This is optional and can be done later with: python manage.py createsuperuser"
  echo ""
  read -p "Do you want to create a superuser now? (y/n) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    python manage.py createsuperuser
    print_success "Superuser created"
  else
    print_info "Skipping superuser creation"
  fi
}

# Verify complete setup
verify_setup() {
  print_info "Verifying complete setup..."
  echo ""

  # Check Python
  if python --version &> /dev/null; then
    PYTHON_VERSION=$(python --version)
    print_success "Python: $PYTHON_VERSION"
  else
    print_error "Python not working"
  fi

  # Check Node
  if node --version &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js: $NODE_VERSION"
  else
    print_error "Node.js not working"
  fi

  # Check MongoDB
  if pgrep -x mongod > /dev/null; then
    print_success "MongoDB: Running"
  else
    print_warning "MongoDB: Not running"
  fi

  # Check Django
  if python manage.py check --deploy --fail-level WARNING 2>/dev/null; then
    print_success "Django: Configuration valid"
  else
    print_warning "Django: Some checks failed (this is normal for local dev)"
  fi

  # Check if database has data
  DB_HAS_DATA=$(python -c "
from pymongo import MongoClient
client = MongoClient('localhost', 27017)
db = client['sefaria']
print(len(db.list_collection_names()) > 0)
" 2>/dev/null || echo "False")

  if [ "$DB_HAS_DATA" = "True" ]; then
    print_success "MongoDB: Has data"
  else
    print_warning "MongoDB: No data found - you may need to restore a dump"
  fi

  echo ""
}

# Print next steps
print_next_steps() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║                      SETUP COMPLETE!                           ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${GREEN}Your Sefaria development environment is ready!${NC}"
  echo ""
  echo -e "${YELLOW}Next Steps:${NC}"
  echo ""
  echo "  1. Activate the virtual environment (if not already active):"
  echo -e "     ${BLUE}pyenv activate senv${NC}"
  echo ""
  echo "  2. Start the Django development server:"
  echo -e "     ${BLUE}python manage.py runserver${NC}"
  echo ""
  echo "  3. In a separate terminal, start the webpack dev server:"
  echo -e "     ${BLUE}npm run w${NC}"
  echo ""
  echo "  4. Visit http://localhost:8000 in your browser"
  echo ""
  echo -e "${YELLOW}Additional Commands:${NC}"
  echo ""
  echo "  • Restore MongoDB dump:"
  echo -e "    ${BLUE}./scripts/setup/restore_dump.sh${NC}"
  echo ""
  echo "  • Create Django superuser:"
  echo -e "    ${BLUE}python manage.py createsuperuser${NC}"
  echo ""
  echo "  • Access Django admin:"
  echo -e "    ${BLUE}http://localhost:8000/admin${NC}"
  echo ""
  echo "  • Run tests:"
  echo -e "    ${BLUE}pytest${NC}"
  echo ""
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo ""
  echo "  • If MongoDB is not running:"
  echo -e "    ${BLUE}brew services start mongodb-community${NC}"
  echo ""
  if [ "$USE_POSTGRES" = true ]; then
    echo "  • If PostgreSQL is not running:"
    echo -e "    ${BLUE}brew services start postgresql@14${NC}"
    echo ""
  fi
  echo "  • If you encounter issues, check:"
  echo -e "    ${BLUE}https://developers.sefaria.org/docs/local-installation-instructions${NC}"
  echo ""
  echo -e "${GREEN}Happy coding!${NC}"
  echo ""
}

# Main function
main() {
  print_info "Finalizing setup..."
  echo ""

  ensure_virtualenv
  configure_hosts_file
  create_log_directory
  run_migrations
  create_superuser
  verify_setup
  print_next_steps
}

main
