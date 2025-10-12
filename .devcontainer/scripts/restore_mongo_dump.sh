#!/bin/bash
# Restore a Sefaria MongoDB dump inside the devcontainer.
# Usage: ./restore_mongo_dump.sh [--small|--full] [--workdir DIR]
# Defaults to the small dump recommended for development.

set -euo pipefail

show_help() {
    cat <<'USAGE'
Usage: ./restore_mongo_dump.sh [OPTIONS]

Options:
  --small           Restore the small dump (default).
  --full            Restore the full dump with revision history.
  --workdir DIR     Directory to store/download archives (default: /app/.devcontainer/sefaria-mongo-backup)
    --keep-archive    Keep the downloaded archive after restore (default: delete)
    --force           Force re-download even if the archive already exists
  -h, --help        Show this help message and exit

Examples:
  ./restore_mongo_dump.sh                                  # Restore using default backup directory
  ./restore_mongo_dump.sh --full                           # Restore the full dump
  ./restore_mongo_dump.sh --workdir /custom/dir            # Use a custom directory

The script must be executed from inside the devcontainer so it can reach the
MongoDB service at host "db".
USAGE
}

dump_type="small"
workdir="/app/.devcontainer/sefaria-mongo-backup"
keep_archive=false
force_download=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --small)
            dump_type="small"
            shift
            ;;
        --full)
            dump_type="full"
            shift
            ;;
        --workdir)
            if [[ $# -lt 2 ]]; then
                echo "Missing value for --workdir" >&2
                exit 1
            fi
            workdir="$2"
            shift 2
            ;;
        --keep-archive)
            keep_archive=true
            shift
            ;;
        --force|--force-download)
            force_download=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_help >&2
            exit 1
            ;;
    esac
done

case "$dump_type" in
    small)
        dump_url="https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz"
        archive_name="dump_small.tar.gz"
        ;;
    full)
        dump_url="https://storage.googleapis.com/sefaria-mongo-backup/dump.tar.gz"
        archive_name="dump.tar.gz"
        ;;
    *)
        echo "Unsupported dump type: $dump_type" >&2
        exit 1
        ;;
esac

if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required but not installed." >&2
    exit 1
fi

if ! command -v mongorestore >/dev/null 2>&1; then
    echo "mongorestore is required but not installed." >&2
    exit 1
fi

if ! command -v mongosh >/dev/null 2>&1; then
    echo "mongosh is required but not installed." >&2
    exit 1
fi

mkdir -p "$workdir"
cd "$workdir"

echo "Downloading $dump_type dump from $dump_url ..."
if [[ -f "$archive_name" ]]; then
    if [[ "$force_download" == true ]]; then
        echo "Force flag set; removing existing archive before download."
        rm -f "$archive_name"
    else
        echo "Archive already exists at $workdir/$archive_name; reusing."
    fi
fi

if [[ ! -f "$archive_name" ]]; then
    curl -L -o "$archive_name" "$dump_url"
fi

restore_dir=$(python - "$archive_name" <<'PY'
import sys, tarfile
archive = sys.argv[1]
with tarfile.open(archive, 'r:gz') as tf:
    for member in tf.getmembers():
        name = member.name.lstrip('./')
        if not name:
            continue
        top = name.split('/', 1)[0]
        if top not in ('', '.', '..'):
            print(top)
            break
PY
)

if [[ -z "$restore_dir" ]]; then
    echo "Failed to determine restore directory from archive." >&2
    exit 1
fi

if [[ "$restore_dir" == "." || "$restore_dir" == ".." ]]; then
    echo "Unexpected restore directory: $restore_dir" >&2
    exit 1
fi

restore_path="./$restore_dir"

echo "Extracting archive..."
if [[ -d "$restore_path" ]]; then
    echo "Cleaning previous extraction at $restore_path..."
    rm -rf "$restore_path"
fi
tar -xzf "$archive_name"

if [[ ! -d "$restore_path" ]]; then
    echo "Expected directory '$restore_dir' not found after extraction." >&2
    exit 1
fi

echo "Restoring MongoDB data from $restore_dir ..."
mongorestore --host "${MONGO_HOST:-db}" --port "${MONGO_PORT:-27017}" --drop "$restore_path"

echo "MongoDB restore complete."

if [[ "$dump_type" == "small" ]]; then
    echo "Ensuring history collection exists for the small dump..."
    mongosh --host "${MONGO_HOST:-db}" "${SEFARIA_DB:-sefaria}" --eval "if (!db.getCollectionNames().includes('history')) { db.createCollection('history'); }" >/dev/null
    echo "History collection verified."
fi

if [[ "$keep_archive" == false ]]; then
    echo "Cleaning up downloaded archive."
    rm -f "$archive_name"
fi

echo "Restore finished successfully."
