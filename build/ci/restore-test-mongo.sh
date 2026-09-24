#!/usr/bin/env bash
# Start a throwaway MongoDB on a GitHub-hosted runner and restore Sefaria's public
# small dump into it, for the tests marked needs_corpus (they need real texts,
# links and the full library, which the mocked Mongo cannot hold).
#
# Same recipe as build/standalone-db/Dockerfile: mongo:4.4 (the version the helm
# charts run) and dump_small restored into the `sefaria` database. The dump is
# public and anonymously readable, so no cloud credentials are involved, and each
# run gets its own fresh database, so concurrent PRs cannot see each other's writes.
#
# Disk: the runner's root volume has ~14 GB free, too little for the ~2.5 GB
# tarball plus its extracted copy plus the restored data. Everything goes on /mnt,
# and the tarball is streamed straight into tar so it never lands on disk.
set -euo pipefail

DUMP_URL=${DUMP_URL:-https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz}
MONGO_IMAGE=${MONGO_IMAGE:-mongo:4.4}
WORK=${WORK:-/mnt/test-mongo}
PORT=${PORT:-27017}

phase() { echo "::group::$1"; PHASE_START=$(date +%s); }
done_phase() { echo "$1 took $(( $(date +%s) - PHASE_START ))s"; echo "::endgroup::"; }

# /mnt on a hosted runner is root-owned; the runner user has passwordless sudo.
if ! mkdir -p "$WORK/data" "$WORK/dump" 2>/dev/null; then
  sudo mkdir -p "$WORK/data" "$WORK/dump"
  sudo chown -R "$(id -u):$(id -g)" "$WORK"
fi

phase "Start $MONGO_IMAGE"
docker run -d --name test-mongo -p "127.0.0.1:$PORT:27017" -v "$WORK/data:/data/db" "$MONGO_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec test-mongo mongo --quiet --eval 'db.runCommand({ping: 1}).ok' 2>/dev/null | grep -q 1 && break
  sleep 1
done
docker exec test-mongo mongo --quiet --eval 'db.runCommand({ping: 1}).ok' | grep -q 1
done_phase "start"

phase "Download and extract dump_small"
curl -fsSL --retry 3 "$DUMP_URL" | tar -xz -C "$WORK/dump"
du -sh "$WORK/dump"
done_phase "download+extract"

phase "Restore into database sefaria"
docker run --rm --network host -v "$WORK/dump:/dump" "$MONGO_IMAGE" \
  mongorestore --host "127.0.0.1:$PORT" --drop --numParallelCollections 4 --quiet \
  -d sefaria /dump/dump/sefaria
done_phase "restore"

rm -rf "$WORK/dump"
docker exec test-mongo mongo --quiet sefaria --eval 'printjson({index: db.index.countDocuments({}), texts: db.texts.estimatedDocumentCount()})'
df -h / /mnt | sed 's/^/  /'
