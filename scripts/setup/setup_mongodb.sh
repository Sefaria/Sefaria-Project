#!/bin/bash

###############################################################################
# Setup MongoDB Script
#
# Ensures MongoDB is running and optionally restores database dump
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

# Start MongoDB service
start_mongodb() {
  print_info "Checking MongoDB service..."

  # Check if MongoDB is already running
  if pgrep -x mongod > /dev/null; then
    print_success "MongoDB is already running"
    return 0
  fi

  print_info "Starting MongoDB service..."

  if [[ "$OS" == "macos" ]]; then
    brew services start mongodb-community

    # Wait for MongoDB to start
    print_info "Waiting for MongoDB to start..."
    for i in {1..10}; do
      if pgrep -x mongod > /dev/null; then
        print_success "MongoDB started successfully"
        return 0
      fi
      sleep 1
    done

    print_error "MongoDB failed to start"
    exit 1
  else
    print_error "Automatic MongoDB startup not supported on this OS"
    print_info "Please start MongoDB manually and re-run the setup"
    exit 1
  fi
}

# Test MongoDB connection
test_mongodb_connection() {
  print_info "Testing MongoDB connection..."

  # Try to connect to MongoDB
  if mongosh --eval "db.version()" --quiet > /dev/null 2>&1; then
    MONGO_VERSION=$(mongosh --eval "db.version()" --quiet 2>&1)
    print_success "MongoDB connection successful (version: $MONGO_VERSION)"
    return 0
  elif mongo --eval "db.version()" --quiet > /dev/null 2>&1; then
    # Fallback to legacy mongo shell
    MONGO_VERSION=$(mongo --eval "db.version()" --quiet 2>&1)
    print_success "MongoDB connection successful (version: $MONGO_VERSION)"
    return 0
  else
    print_error "Could not connect to MongoDB"
    print_info "Please ensure MongoDB is running on localhost:27017"
    exit 1
  fi
}

# Restore MongoDB dump
restore_mongodb_dump() {
  if [ "$SKIP_DUMP" = true ]; then
    print_info "Skipping MongoDB dump restore (--skip-dump flag)"
    return 0
  fi

  print_info "MongoDB dump will be restored automatically in the next step."
}

# Create empty history collection for small dump
create_history_collection() {
  print_info "Checking if 'history' collection needs to be created..."

  # Check if database exists
  DB_EXISTS=$(mongosh --eval "db.getMongo().getDBNames().includes('sefaria')" --quiet 2>/dev/null || echo "false")

  if [ "$DB_EXISTS" = "true" ]; then
    # Check if history collection exists
    HAS_HISTORY=$(mongosh sefaria --eval "db.getCollectionNames().includes('history')" --quiet 2>/dev/null || echo "false")

    if [ "$HAS_HISTORY" = "false" ]; then
      print_info "Creating 'history' collection..."
      mongosh sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || \
        mongo sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null
      print_success "Created 'history' collection"
    else
      print_success "'history' collection already exists"
    fi
  else
    print_info "Sefaria database doesn't exist yet - will be created during dump restore"
  fi
}

# Verify MongoDB setup
verify_mongodb() {
  print_info "Verifying MongoDB setup..."

  # Check if MongoDB is running
  if ! pgrep -x mongod > /dev/null; then
    print_error "MongoDB is not running"
    exit 1
  fi

  # Check connection
  test_mongodb_connection

  print_success "MongoDB setup verified"
}

# Main function
main() {
  print_info "Setting up MongoDB..."
  echo ""

  start_mongodb
  test_mongodb_connection
  restore_mongodb_dump
  create_history_collection
  verify_mongodb

  echo ""
  print_success "MongoDB setup complete!"
  print_info "MongoDB is running on localhost:27017"
  print_info "Database name: sefaria"
}

main
