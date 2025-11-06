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

database_has_data() {
  local has_db has_collections

  # Skip download when Mongo already holds the content (common on reruns)
  if ! command -v mongosh &> /dev/null; then
    return 1
  fi

  has_db=$(mongosh --quiet --eval "db.getMongo().getDBNames().includes('sefaria')" 2>/dev/null || echo "false")
  if [ "$has_db" != "true" ]; then
    return 1
  fi

  has_collections=$(mongosh --quiet sefaria --eval "db.getCollectionNames().length > 0" 2>/dev/null || echo "false")
  [ "$has_collections" = "true" ]
}

ensure_prerequisites() {
  print_info "Checking dump restore prerequisites..."

  if ! command -v mongorestore &> /dev/null; then
    print_error "mongorestore not found. Install MongoDB Database Tools and re-run setup."
    exit 1
  fi

  # Bail early if MongoDB itself is down so the user can start it first
  if ! pgrep -x mongod >/dev/null 2>&1; then
    print_error "MongoDB is not running. Start it with: brew services start mongodb-community"
    exit 1
  fi

  # Prefer curl but fall back to wget so we work on fresh macOS installs
  if command -v curl &> /dev/null; then
    DOWNLOADER="curl"
  elif command -v wget &> /dev/null; then
    DOWNLOADER="wget"
  else
    print_error "Neither curl nor wget is available for downloading the MongoDB dump."
    exit 1
  fi
}

required_space_bytes() {
  # The public dump is ~8GB today; keep a safety margin for indexes/logs
  poll_estimate=${1:-13}
  echo $((poll_estimate * 1024 * 1024 * 1024))
}

free_space_bytes() {
  df -Pk "$1" | awk 'NR==2 {print $4 * 1024}'
}

ensure_free_space() {
  local required additional message
  required=$(required_space_bytes)
  available=$(free_space_bytes "/opt/homebrew/var/mongodb")
  local required_gb available_gb

  if [ "$available" -lt "$required" ]; then
    required_gb=$((required / 1024 / 1024 / 1024))
    available_gb=$((available / 1024 / 1024 / 1024))
    printf "\n"
    print_error "MongoDB data volume is low on space."
    print_info "Required (estimated): ${required_gb}GB, Available: ${available_gb}GB"
    print_info "Free space under /opt/homebrew/var/mongodb or move the data directory, then rerun setup."
    exit 1
  fi
}

download_dump() {
  local dest="$1"
  # Why 3 retries: Large file downloads over consumer internet connections often fail
  # due to temporary network issues. 3 attempts balances reliability with not wasting
  # too much time on persistent network problems.
  local max_retries=3
  local retry=0

  print_info "Downloading MongoDB dump from ${PUBLIC_DUMP_URL}..."
  # Why inform about file size: Sets user expectations for download time and helps
  # them understand if the download appears stuck or is just progressing slowly.
  print_info "This is a large file (~1.6GB) and may take several minutes..."

  while [ $retry -lt $max_retries ]; do
    if [ $retry -gt 0 ]; then
      print_info "Retry attempt $retry of $((max_retries - 1))..."
    fi

    if [ "$DOWNLOADER" = "curl" ]; then
      # Why -C -: Enables resume capability so if download fails at 42%, next attempt
      # starts from 42% instead of 0%. Critical for large files over unreliable connections.
      # Why --progress-bar: Provides visual feedback that download is progressing, replacing
      # the default percentage output which can be unclear for multi-GB files.
      if curl -C - -fL "$PUBLIC_DUMP_URL" -o "$dest" --progress-bar; then
        print_success "Download complete ($(basename "$dest"))"
        return 0
      fi
    else
      # Why -c: wget's equivalent to curl's -C -, enables resuming partial downloads
      if wget -c -O "$dest" "$PUBLIC_DUMP_URL"; then
        print_success "Download complete ($(basename "$dest"))"
        return 0
      fi
    fi

    retry=$((retry + 1))
    if [ $retry -lt $max_retries ]; then
      # Why 5 second delay: Gives temporary network issues time to resolve before retrying.
      # Too short means retrying immediately during an outage; too long wastes user time.
      print_warning "Download interrupted. Retrying in 5 seconds..."
      sleep 5
    fi
  done

  print_error "Failed to download MongoDB dump after $max_retries attempts"
  # Why suggest restore_dump.sh: Gives users a way to retry without re-running entire
  # setup, especially useful if they've already completed other setup steps.
  print_info "You can retry the download later by running: ./scripts/setup/restore_dump.sh"
  exit 1
}

restore_dump() {
  local archive="$1"
  print_info "Extracting dump archive..."
  rm -rf dump/  # ensure old extractions don't accumulate
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
  # Why create a standalone restore script: Allows users to re-download and restore
  # the MongoDB dump without re-running the entire setup process. Useful for data
  # resets, troubleshooting, or recovering from failed initial setup.
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
# Why 3 retries in standalone script: Same network reliability concerns apply when
# users manually run this script, possibly even more so since they may be running
# it specifically because the download failed during initial setup.
max_retries=3
retry=0

echo "Downloading MongoDB dump (this is a large file ~1.6GB)..."

while [ $retry -lt $max_retries ]; do
  if [ $retry -gt 0 ]; then
    echo "Retry attempt $retry of $((max_retries - 1))..."
  fi

  if command -v curl &> /dev/null; then
    # Why -C - and --progress-bar: Same resume and progress feedback benefits as in
    # setup_mongo_dump.sh, ensuring consistent behavior between automated and manual runs.
    if curl -C - -fL "$PUBLIC_DUMP_URL" -o "$tmp_file" --progress-bar; then
      break
    fi
  else
    # Why -c: wget resume capability, consistent with main download function
    if wget -c -O "$tmp_file" "$PUBLIC_DUMP_URL"; then
      break
    fi
  fi

  retry=$((retry + 1))
  if [ $retry -lt $max_retries ]; then
    # Why 5 second delay: Same network recovery time as main script
    echo "Download interrupted. Retrying in 5 seconds..."
    sleep 5
  else
    echo "Failed to download MongoDB dump after $max_retries attempts" >&2
    rm -f "$tmp_file"
    exit 1
  fi
done

echo "Extracting and restoring dump..."
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

  if database_has_data; then
    print_info "MongoDB already contains data; skipping dump download."
    write_dump_state "restored" "MongoDB dump already present; restore skipped." "" "$PUBLIC_DUMP_URL" "public"
    create_restore_script
    return 0
  fi

  if [ "$DUMP_STATUS" = "restored" ]; then
    print_info "Dump already restored earlier; skipping download."
    create_restore_script
    exit 0
  fi

  ensure_prerequisites

  ensure_free_space

  tmp_archive=$(mktemp)
  download_dump "$tmp_archive"
  restore_dump "$tmp_archive"
  write_dump_state "restored" "MongoDB dump restored successfully from ${PUBLIC_DUMP_URL}." "" "$PUBLIC_DUMP_URL" "public"
  create_restore_script

  echo ""
  print_success "MongoDB dump setup complete!"
}

main
