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
max_retries=3
retry=0

echo "Downloading MongoDB dump (this is a large file ~1.6GB)..."

while [ $retry -lt $max_retries ]; do
  if [ $retry -gt 0 ]; then
    echo "Retry attempt $retry of $((max_retries - 1))..."
  fi

  if command -v curl &> /dev/null; then
    if curl -C - -fL "$PUBLIC_DUMP_URL" -o "$tmp_file" --progress-bar; then
      break
    fi
  else
    if wget -c -O "$tmp_file" "$PUBLIC_DUMP_URL"; then
      break
    fi
  fi

  retry=$((retry + 1))
  if [ $retry -lt $max_retries ]; then
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
