#!/bin/bash

###############################################################################
# MongoDB Dump Setup Script
#
# Downloads and restores the Sefaria MongoDB dump using the public archive.
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
STATE_FILE="${SETUP_STATE_FILE:-"${PROJECT_ROOT}/.setup_state"}"
RESTORE_SCRIPT_PATH="${PROJECT_ROOT}/scripts/setup/restore_dump.sh"
PUBLIC_DUMP_URL="https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz"
DOWNLOADER=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ ERROR: $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ WARNING: $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

write_dump_state() {
  local status="$1"
  local message="$2"
  local detail="$3"
  local latest_path="$4"
  local source="$5"

  local tmp_file
  tmp_file=$(mktemp)

  if [ -f "$STATE_FILE" ]; then
    grep -v '^DUMP_' "$STATE_FILE" > "$tmp_file" || true
  fi

  {
    echo "DUMP_STATUS=$status"
    printf 'DUMP_MESSAGE=%q\n' "$message"
    printf 'DUMP_DETAIL=%q\n' "$detail"
    printf 'DUMP_LATEST_PATH=%q\n' "$latest_path"
    printf 'DUMP_SOURCE=%q\n' "$source"
  } >> "$tmp_file"

  mv "$tmp_file" "$STATE_FILE"
}

load_setup_state() {
  if [ -f "$STATE_FILE" ]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
  else
    DUMP_STATUS=""
    DUMP_MESSAGE=""
    DUMP_DETAIL=""
    DUMP_LATEST_PATH=""
    DUMP_SOURCE=""
  fi
}

ensure_prerequisites() {
  print_info "Checking dump restore prerequisites..."

  if ! command -v mongorestore &> /dev/null; then
    print_error "mongorestore not found. Install MongoDB Database Tools and re-run setup."
    exit 1
  fi

  if ! pgrep -x mongod >/dev/null 2>&1; then
    print_error "MongoDB is not running. Start it with: brew services start mongodb-community"
    exit 1
  fi

  if command -v curl &> /dev/null; then
    DOWNLOADER="curl"
  elif command -v wget &> /dev/null; then
    DOWNLOADER="wget"
  else
    print_error "Neither curl nor wget is available for downloading the MongoDB dump."
    exit 1
  fi
}

download_dump() {
  local dest="$1"
  print_info "Downloading MongoDB dump from ${PUBLIC_DUMP_URL}..."

  if [ "$DOWNLOADER" = "curl" ]; then
    if ! curl -fL "$PUBLIC_DUMP_URL" -o "$dest"; then
      print_error "Failed to download MongoDB dump from ${PUBLIC_DUMP_URL}"
      exit 1
    fi
  else
    if ! wget -O "$dest" "$PUBLIC_DUMP_URL"; then
      print_error "Failed to download MongoDB dump from ${PUBLIC_DUMP_URL}"
      exit 1
    fi
  fi

  print_success "Download complete ($(basename "$dest"))"
}

restore_dump() {
  local archive="$1"
  print_info "Extracting dump archive..."
  tar xzf "$archive"
  print_success "Extraction complete"

  print_info "Restoring dump to MongoDB (this may take several minutes)..."
  mongorestore --drop
  print_success "MongoDB dump restored successfully"

  print_info "Ensuring 'history' collection exists..."
  mongosh sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || \
    mongo sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || true
  print_success "History collection ensured"

  print_info "Cleaning up downloaded files..."
  rm -f "$archive"
  rm -rf dump/
}

create_restore_script() {
  cat > "$RESTORE_SCRIPT_PATH" <<'INNER'
#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PUBLIC_DUMP_URL="https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz"

if ! command -v mongorestore &> /dev/null; then
  echo "mongorestore not found. Install MongoDB Database Tools and rerun." >&2
  exit 1
fi

if ! pgrep -x mongod >/dev/null 2>&1; then
  echo "MongoDB is not running. Start it (e.g. brew services start mongodb-community)." >&2
  exit 1
fi

tmp_file=$(mktemp)
if command -v curl &> /dev/null; then
  curl -fL "$PUBLIC_DUMP_URL" -o "$tmp_file"
else
  wget -O "$tmp_file" "$PUBLIC_DUMP_URL"
fi

tar xzf "$tmp_file"
mongorestore --drop
mongosh sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || \
  mongo sefaria --eval "db.createCollection('history')" --quiet 2>/dev/null || true
rm -f "$tmp_file"
rm -rf dump/

echo "MongoDB dump restored successfully."
INNER
  chmod +x "$RESTORE_SCRIPT_PATH"
  print_success "Created scripts/setup/restore_dump.sh"
}

main() {
  print_info "Downloading and restoring MongoDB dump..."
  echo ""

  load_setup_state

  if [ "$SKIP_DUMP" = true ]; then
    print_info "Skipping MongoDB dump restore (--skip-dump flag)"
    write_dump_state "skipped" "MongoDB dump restoration skipped by --skip-dump flag." "" "$PUBLIC_DUMP_URL" "skipped"
    create_restore_script
    print_success "MongoDB dump setup skipped."
    return 0
  fi

  if [ "$DUMP_STATUS" = "restored" ]; then
    print_info "Dump already restored earlier; skipping download."
    create_restore_script
    exit 0
  fi

  ensure_prerequisites

  tmp_archive=$(mktemp)
  download_dump "$tmp_archive"
  restore_dump "$tmp_archive"
  write_dump_state "restored" "MongoDB dump restored successfully from ${PUBLIC_DUMP_URL}." "" "$PUBLIC_DUMP_URL" "public"
  create_restore_script

  echo ""
  print_success "MongoDB dump setup complete!"
}

main
