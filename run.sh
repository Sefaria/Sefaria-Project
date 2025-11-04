#!/bin/bash

###############################################################################
# Sefaria Development Server Runner
#
# This script checks that all dependencies are installed and runs both
# the Django backend server and the webpack dev server in parallel.
#
# Usage:
#   ./run.sh              # Run both servers
#   ./run.sh --django     # Run only Django server
#   ./run.sh --webpack    # Run only webpack dev server
#   ./run.sh --help       # Show help
#
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
RUN_DJANGO=true
RUN_WEBPACK=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --django)
      RUN_WEBPACK=false
      shift
      ;;
    --webpack)
      RUN_DJANGO=false
      shift
      ;;
    --help)
      head -n 15 "$0" | tail -n 10
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run './run.sh --help' for usage information"
      exit 1
      ;;
  esac
done

# Utility functions
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ ERROR: $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ WARNING: $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

print_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

# Check if we're in the right directory
check_directory() {
  if [ ! -f "manage.py" ] || [ ! -d "sefaria" ]; then
    print_error "This script must be run from the Sefaria-Project root directory"
    print_info "Expected to find manage.py and sefaria/ directory"
    exit 1
  fi
}

# Check Python environment
check_python() {
  print_info "Checking Python environment..."

  # Check if pyenv is available
  if ! command -v pyenv &> /dev/null; then
    print_error "pyenv not found"
    print_info "Run ./setup.sh to install the development environment"
    exit 1
  fi

  # Source pyenv
  export PYENV_ROOT="$HOME/.pyenv"
  export PATH="$PYENV_ROOT/bin:$PATH"
  eval "$(pyenv init --path)" || true
  eval "$(pyenv init -)" || true
  eval "$(pyenv virtualenv-init -)" || true

  # Check if senv exists
  if ! pyenv versions | grep -q "senv"; then
    print_error "Virtual environment 'senv' not found"
    print_info "Run ./setup.sh to create the Python environment"
    exit 1
  fi

  # Activate senv
  export PYENV_VERSION=senv

  # Check if Django is installed
  if ! python -c "import django" 2>/dev/null; then
    print_error "Django not installed in virtual environment"
    print_info "Run: pip install -r requirements.txt"
    exit 1
  fi

  print_success "Python environment OK"
}

# Check Node environment
check_node() {
  print_info "Checking Node.js environment..."

  # Check if nvm is available
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  if ! command -v node &> /dev/null; then
    print_error "Node.js not found"
    print_info "Run ./setup.sh to install the development environment"
    exit 1
  fi

  # Check if node_modules exists
  if [ ! -d "node_modules" ]; then
    print_error "node_modules directory not found"
    print_info "Run: npm install"
    exit 1
  fi

  print_success "Node.js environment OK"
}

# Check MongoDB
check_mongodb() {
  print_info "Checking MongoDB..."

  if ! command -v mongod &> /dev/null; then
    print_error "MongoDB not installed"
    print_info "Run ./setup.sh to install MongoDB"
    exit 1
  fi

  # Check if MongoDB is running
  if ! pgrep -x mongod > /dev/null; then
    print_warning "MongoDB is not running"
    print_info "Starting MongoDB..."
    brew services start mongodb-community
    sleep 2
  fi

  # Test connection
  if mongosh --eval "db.version()" --quiet > /dev/null 2>&1 || \
     mongo --eval "db.version()" --quiet > /dev/null 2>&1; then
    print_success "MongoDB is running"
  else
    print_error "Cannot connect to MongoDB"
    print_info "Try: brew services restart mongodb-community"
    exit 1
  fi
}

# Check local_settings.py
check_local_settings() {
  print_info "Checking configuration..."

  if [ ! -f "sefaria/local_settings.py" ]; then
    print_error "sefaria/local_settings.py not found"
    print_info "Run ./setup.sh to create local configuration"
    exit 1
  fi

  print_success "Configuration OK"
}

# Run Django server
run_django_server() {
  print_header "Starting Django Server"
  print_info "Django will be available at: http://localhost:8000"
  print_info "Admin interface at: http://localhost:8000/admin"
  echo ""

  # Ensure virtualenv is active
  export PYENV_VERSION=senv

  # Run server
  python manage.py runserver
}

# Run webpack dev server
run_webpack_server() {
  print_header "Starting Webpack Dev Server"
  print_info "Webpack will watch for file changes and rebuild automatically"
  echo ""

  # Run webpack watch
  npm run w
}

# Run both servers
run_both_servers() {
  print_header "Starting Development Servers"
  print_info "Django: http://localhost:8000"
  print_info "Webpack: watching for changes"
  echo ""
  print_warning "Press Ctrl+C to stop both servers"
  echo ""

  # Create a cleanup function
  cleanup() {
    echo ""
    print_info "Shutting down servers..."
    kill $DJANGO_PID $WEBPACK_PID 2>/dev/null || true
    exit 0
  }

  # Trap Ctrl+C
  trap cleanup INT TERM

  # Ensure virtualenv is active
  export PYENV_VERSION=senv

  # Start Django in background
  print_info "Starting Django server..."
  python manage.py runserver 2>&1 | sed 's/^/[Django] /' &
  DJANGO_PID=$!

  # Give Django a moment to start
  sleep 2

  # Start webpack in background
  print_info "Starting Webpack dev server..."
  npm run w 2>&1 | sed 's/^/[Webpack] /' &
  WEBPACK_PID=$!

  print_success "Both servers started!"
  echo ""
  print_info "Django PID: $DJANGO_PID"
  print_info "Webpack PID: $WEBPACK_PID"
  echo ""
  print_info "Logs will appear below (prefixed with [Django] or [Webpack]):"
  echo ""

  # Wait for both processes
  wait $DJANGO_PID $WEBPACK_PID
}

# Main function
main() {
  print_header "Sefaria Development Server"

  # Check environment
  check_directory
  check_local_settings
  check_mongodb

  if [ "$RUN_DJANGO" = true ]; then
    check_python
  fi

  if [ "$RUN_WEBPACK" = true ]; then
    check_node
  fi

  echo ""
  print_success "All checks passed!"
  echo ""

  # Run appropriate servers
  if [ "$RUN_DJANGO" = true ] && [ "$RUN_WEBPACK" = true ]; then
    run_both_servers
  elif [ "$RUN_DJANGO" = true ]; then
    run_django_server
  elif [ "$RUN_WEBPACK" = true ]; then
    run_webpack_server
  fi
}

# Run main function
main
