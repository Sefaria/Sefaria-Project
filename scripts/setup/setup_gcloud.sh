#!/bin/bash

###############################################################################
# Setup Google Cloud SDK Script
#
# Installs Google Cloud SDK and handles database dump restoration
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

# Check if gcloud is installed
check_gcloud() {
  if command -v gcloud &> /dev/null; then
    print_success "Google Cloud SDK already installed: $(gcloud --version | head -1)"
    return 0
  else
    return 1
  fi
}

# Install Google Cloud SDK
install_gcloud() {
  print_info "Installing Google Cloud SDK..."

  if [[ "$OS" == "macos" ]]; then
    # Install via Homebrew
    brew install --cask google-cloud-sdk

    # Source gcloud components
    if [ -f "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc" ]; then
      source "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc"
    fi

    # Add to shell config
    SHELL_CONFIG="$HOME/.zshrc"
    if ! grep -q "google-cloud-sdk" "$SHELL_CONFIG" 2>/dev/null; then
      echo '' >> "$SHELL_CONFIG"
      echo '# Google Cloud SDK' >> "$SHELL_CONFIG"
      echo 'source "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc"' >> "$SHELL_CONFIG"
      echo 'source "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.bash.inc"' >> "$SHELL_CONFIG"
    fi

    print_success "Google Cloud SDK installed"
  else
    print_info "Please install Google Cloud SDK manually:"
    print_info "https://cloud.google.com/sdk/docs/install"
    exit 1
  fi
}

# Authenticate with Google Cloud
authenticate_gcloud() {
  print_info "Authenticating with Google Cloud..."
  echo ""
  print_warning "You will need to authenticate with your Google account"
  print_info "A browser window will open for authentication"
  echo ""
  read -p "Press Enter to continue with authentication..."

  # Run gcloud auth login
  if gcloud auth login; then
    print_success "Authentication successful"
  else
    print_error "Authentication failed"
    print_info "You can run 'gcloud auth login' manually later"
    return 1
  fi
}

# Set default project
set_gcloud_project() {
  print_info "Setting up Google Cloud project..."

  # List available projects
  print_info "Fetching your Google Cloud projects..."
  gcloud projects list 2>/dev/null || {
    print_warning "Could not list projects - you may need to configure this manually"
    return 1
  }

  echo ""
  print_info "If you have access to the Sefaria project, set it as default:"
  print_info "Run: gcloud config set project PROJECT_ID"
  echo ""
}

# Download and restore MongoDB dump
restore_dump() {
  if [ "$SKIP_DUMP" = true ]; then
    print_info "Skipping MongoDB dump restore (--skip-dump flag)"
    return 0
  fi

  print_info "Preparing to download and restore MongoDB dump..."
  echo ""

  # Check if gsutil is available
  if ! command -v gsutil &> /dev/null; then
    print_error "gsutil not found"
    print_info "Please ensure Google Cloud SDK is properly installed"
    exit 1
  fi

  print_warning "This will download a database dump from Google Cloud Storage"
  print_info "The dump file is several GB and may take time to download"
  echo ""
  read -p "Do you want to download and restore the dump now? (y/n) " -n 1 -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Skipping dump restore"
    print_info "You can restore later using: ./scripts/setup/restore_dump.sh"
    return 0
  fi

  # Locate most recent dump in GCS
  BUCKET_PATH="gs://sefaria-mongo-backup"
  LATEST_ENTRY=$(gsutil ls -l "${BUCKET_PATH}/private_dump_small_*.tar.gz" 2>/dev/null | awk 'NF==3 {print $2 "|" $3}' | sort | tail -n 1)

  if [ -z "$LATEST_ENTRY" ]; then
    print_error "Could not find any dump files in ${BUCKET_PATH}"
    print_info "You can restore later using: ./scripts/setup/restore_dump.sh"
    return 1
  fi

  DUMP_GCS_PATH="${LATEST_ENTRY#*|}"
  DUMP_FILE="$(basename "$DUMP_GCS_PATH")"

  print_info "Downloading MongoDB dump ($DUMP_FILE)..."
  if gsutil cp "$DUMP_GCS_PATH" "$DUMP_FILE" 2>&1; then
    print_success "Dump downloaded successfully"
  else
    print_error "Failed to download dump from $DUMP_GCS_PATH"
    print_info "You can restore later using: ./scripts/setup/restore_dump.sh"
    return 1
  fi

  # Extract dump
  print_info "Extracting dump archive..."
  if tar xzvf "$DUMP_FILE"; then
    print_success "Dump extracted successfully"
  else
    print_error "Failed to extract dump"
    exit 1
  fi

  # Restore to MongoDB
  print_info "Restoring dump to MongoDB (this may take several minutes)..."
  if mongorestore --drop; then
    print_success "MongoDB dump restored successfully"
  else
    print_error "Failed to restore MongoDB dump"
    exit 1
  fi

  # Create history collection if using small dump
  print_info "Creating 'history' collection for small dump..."
  mongosh sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || \
    mongo sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || true

  # Clean up
  print_info "Cleaning up dump files..."
  rm -f "$DUMP_FILE"
  rm -rf dump/

  print_success "Dump restoration complete!"
}

# Create standalone restore script
create_restore_script() {
  print_info "Creating standalone restore_dump.sh script..."

  cat > scripts/setup/restore_dump.sh << 'EOF'
#!/bin/bash

###############################################################################
# Restore MongoDB Dump Script
#
# Downloads and restores the Sefaria MongoDB dump from Google Cloud Storage
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ ERROR: $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ WARNING: $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

main() {
  print_info "MongoDB Dump Restoration Script"
  echo ""

  # Check prerequisites
  if ! command -v gsutil &> /dev/null; then
    print_error "gsutil not found - Google Cloud SDK not installed"
    print_info "Run ./setup.sh to install Google Cloud SDK"
    exit 1
  fi

  if ! pgrep -x mongod > /dev/null; then
    print_error "MongoDB is not running"
    print_info "Start MongoDB with: brew services start mongodb-community"
    exit 1
  fi

  # Download dump
  print_info "Downloading MongoDB dump from Google Cloud Storage..."
  BUCKET_PATH="gs://sefaria-mongo-backup"
  LATEST_ENTRY=$(gsutil ls -l "${BUCKET_PATH}/private_dump_small_*.tar.gz" 2>/dev/null | awk 'NF==3 {print $2 "|" $3}' | sort | tail -n 1)

  if [ -z "$LATEST_ENTRY" ]; then
    print_error "Could not find any dump files in ${BUCKET_PATH}"
    exit 1
  fi

  DUMP_GCS_PATH="${LATEST_ENTRY#*|}"
  DUMP_FILE="$(basename "$DUMP_GCS_PATH")"

  gsutil cp "$DUMP_GCS_PATH" "$DUMP_FILE"
  print_success "Download complete ($DUMP_FILE)"

  # Extract
  print_info "Extracting archive..."
  tar xzvf "$DUMP_FILE"
  print_success "Extraction complete"

  # Restore
  print_info "Restoring to MongoDB..."
  mongorestore --drop
  print_success "Restore complete"

  # Create history collection
  print_info "Creating history collection..."
  mongosh sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || \
    mongo sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null

  # Cleanup
  print_info "Cleaning up..."
  rm -f "$DUMP_FILE"
  rm -rf dump/

  print_success "MongoDB dump restored successfully!"
}

main
EOF

  chmod +x scripts/setup/restore_dump.sh
  print_success "Created scripts/setup/restore_dump.sh"
}

# Main function
main() {
  print_info "Setting up Google Cloud SDK..."
  echo ""

  # Check and install gcloud
  if ! check_gcloud; then
    install_gcloud
  fi

  # Verify installation
  if ! command -v gcloud &> /dev/null; then
    print_error "Google Cloud SDK installation failed"
    exit 1
  fi

  # Authenticate (skip if --skip-dump is set)
  if [ "$SKIP_DUMP" = true ]; then
    print_info "Skipping Google Cloud authentication (--skip-dump flag)"
    print_info "If you need to restore the dump later, run: gcloud auth login"
  else
    print_info "Checking Google Cloud authentication..."
    if gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
      print_success "Already authenticated with Google Cloud"
    else
      print_warning "You need Google Cloud authentication to download database dumps"
      authenticate_gcloud || {
        print_warning "Authentication failed or was skipped"
        print_info "You can authenticate later with: gcloud auth login"
        print_info "Then restore the dump with: ./scripts/setup/restore_dump.sh"
      }
    fi
  fi

  # Set project (optional)
  set_gcloud_project

  # Create restore script for future use
  create_restore_script

  # Restore dump
  restore_dump

  echo ""
  print_success "Google Cloud SDK setup complete!"
  print_info "You can restore the dump later using: ./scripts/setup/restore_dump.sh"
}

main
