#!/usr/bin/env bash
# One-command local copy of sefaria.org (public texts, no search) using Docker.
# Safe to re-run: finished steps are skipped.
#
#   ./dev_docker/setup_local.sh      then open http://localhost:8000
#
# Needs Docker (Desktop) running and ~15GB free disk during the first run.
set -euo pipefail

cd "$(dirname "$0")/.."

DUMP_URL="${DUMP_URL:-https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz}"
DUMP_DIR="$PWD/dump"
SITE_URL="http://localhost:8000"

step() { printf '\n==> %s\n' "$*"; }

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed. Get Docker Desktop: https://www.docker.com/products/docker-desktop/"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running. Open Docker Desktop, wait until it says 'Engine running', and re-run."; exit 1; }

step "Django settings"
if [ -f sefaria/local_settings.py ]; then
    echo "sefaria/local_settings.py already exists; leaving it alone."
else
    cp dev_docker/local_settings.py sefaria/local_settings.py
    echo "Created sefaria/local_settings.py"
fi

step "Starting MongoDB, Postgres and Redis"
docker compose up -d db postgres cache
until docker compose exec -T db mongo --quiet --eval 'db.runCommand({ping: 1}).ok' >/dev/null 2>&1; do sleep 2; done

step "Loading the public text library into MongoDB"
books=$(docker compose exec -T db mongo --quiet sefaria --eval 'db.index.count()' | tr -d '[:space:]')
if [ "${books:-0}" -gt 0 ]; then
    echo "Already loaded ($books books)."
else
    if [ ! -d "$DUMP_DIR/sefaria" ]; then
        # webpages* (~5GB) indexes external sites that cite Sefaria; not needed locally.
        echo "Downloading and unpacking $DUMP_URL (~2.5GB, ~7GB unpacked)..."
        curl -fL "$DUMP_URL" | tar --exclude '*webpages*' -xzf -
    fi
    docker compose run --rm --no-deps -v "$DUMP_DIR:/dump:ro" db \
        mongorestore --host db --drop --quiet /dump
    rm -rf "$DUMP_DIR"
fi

step "Building the React front end"
if [ -f node/webpack-stats.client.json ] && [ -d static/bundles/client ]; then
    echo "Already built (delete static/bundles to rebuild)."
else
    docker run --rm -e HUSKY=0 -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
        -v "$PWD:/app" -w /app node:20 sh -c "npm ci && npm run build"
fi

step "Setting up Postgres tables (first run also builds the web image)"
docker compose run --rm web sh -c "python manage.py migrate sites && python manage.py migrate"

step "Starting the web server"
docker compose up -d web
echo "Waiting for $SITE_URL (first start loads the whole library, a few minutes)..."
for _ in $(seq 1 120); do
    if curl -fs -o /dev/null "$SITE_URL/texts"; then
        printf '\nSefaria is running at %s\n' "$SITE_URL"
        echo "Logs: docker compose logs -f web    Stop: docker compose stop"
        exit 0
    fi
    sleep 5
done
echo "Server did not come up in 10 minutes. Check: docker compose logs web"
exit 1
