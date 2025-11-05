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
