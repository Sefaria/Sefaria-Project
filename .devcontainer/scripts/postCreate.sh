#!/bin/bash
# Sefaria Development Container - Post-Creation Setup Script
# This script runs once after the container is created
#
# DERIVATION NOTES:
# - Service names (db, cache, postgres) from docker-compose.yml
# - MongoDB dump URLs from installation documentation
# - Django migrations: Standard Django practice
# - npm build commands: From package.json scripts
# - Wait logic: Standard best practice for multi-service containers

set -e

echo "======================================"
echo "Sefaria Development Container Setup"
echo "======================================"
echo ""

# Colors for output
# [RECOMMENDATION] Use colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
# [RECOMMENDATION] Helper functions for consistent output formatting
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "ℹ $1"
}

# ====================
# Step 1: Wait for Services
# ====================
echo "Step 1: Waiting for services to be ready..."

# Wait for MongoDB
# [DERIVED] Service name 'db' from docker-compose.yml
# [RECOMMENDATION] Use mongosh (modern MongoDB shell) instead of deprecated mongo
print_info "Waiting for MongoDB..."
max_attempts=30
attempt=0
until mongosh --host db --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        print_error "MongoDB did not become ready in time"
        exit 1
    fi
    sleep 2
done
print_success "MongoDB is ready"

# Wait for Redis
# [DERIVED] Service name 'cache' from docker-compose.yml
print_info "Waiting for Redis..."
attempt=0
until redis-cli -h cache ping >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        print_error "Redis did not become ready in time"
        exit 1
    fi
    sleep 2
done
print_success "Redis is ready"

# Wait for PostgreSQL
# [DERIVED] Service name 'postgres' and user 'admin' from docker-compose.yml
print_info "Waiting for PostgreSQL..."
attempt=0
until pg_isready -h postgres -U admin >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        print_error "PostgreSQL did not become ready in time"
        exit 1
    fi
    sleep 2
done
print_success "PostgreSQL is ready"

echo ""

# ====================
# Step 2: Configure Git
# ====================
# [RECOMMENDATION] Prevent git dubious ownership warnings when editing through VS Code
echo "Step 2: Configuring git ownership..."

git config --global --add safe.directory /app
print_success "Git safe.directory configured"

echo ""

# ====================
# Step 3: Install Python Dependencies
# ====================
# [DERIVED] requirements.txt drives Django backend dependencies
# [RECOMMENDATION] Upgrade pip and handle psycopg2 build failures gracefully
echo "Step 3: Installing Python dependencies..."

cd /app
print_info "Upgrading pip and installing requirements..."
if ! (pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt); then
    print_warning "Initial install failed, attempting psycopg2-binary fallback..."
    sed -i 's/^psycopg2==2\.8\.6/psycopg2-binary==2.8.6/' requirements.txt
    pip install --no-cache-dir -r requirements.txt
fi
print_success "Python dependencies installed"

echo ""

# ====================
# Step 4: Configure Local Settings
# ====================
echo "Step 4: Configuring local settings..."

# [DERIVED] Copy devcontainer-specific settings to sefaria/local_settings.py
# Source file: .devcontainer/local_settings_devcontainer.py
# Destination: Standard Django local_settings.py location
if [ ! -f "/app/sefaria/local_settings.py" ]; then
    cp /app/.devcontainer/local_settings_devcontainer.py /app/sefaria/local_settings.py
    print_success "Created local_settings.py"
else
    print_warning "local_settings.py already exists, skipping"
fi

echo ""


# ====================
# Step 5: MongoDB Database Setup
# ====================
echo "Step 5: Setting up MongoDB database..."

BACKUP_DIR="/app/.devcontainer/sefaria-mongo-backup"
SMALL_DUMP="$BACKUP_DIR/dump_small.tar.gz"
FULL_DUMP="$BACKUP_DIR/dump.tar.gz"

# Check if MongoDB already has data
non_system_db_count=$(mongosh --host db --quiet --eval "db.getMongo().getDBNames().filter(dbName => !['admin','config','local'].includes(dbName)).length")

if [ "${non_system_db_count}" -eq 0 ]; then
    print_info "MongoDB is empty - restoring dataset automatically..."
    mkdir -p "$BACKUP_DIR"

    if [ -f "$SMALL_DUMP" ]; then
        print_info "Detected pre-loaded small dump at $SMALL_DUMP"
        bash /app/.devcontainer/scripts/restore_mongo_dump.sh --small
    elif [ -f "$FULL_DUMP" ]; then
        print_info "Detected pre-loaded full dump at $FULL_DUMP"
        bash /app/.devcontainer/scripts/restore_mongo_dump.sh --full
    else
        print_info "No pre-loaded dump found. Downloading small dump..."
        bash /app/.devcontainer/scripts/restore_mongo_dump.sh --small
    fi

    print_success "MongoDB restore completed"

    print_info "Ensuring history collection exists..."
    mongosh --host db sefaria --quiet --eval "if (!db.getCollectionNames().includes('history')) { db.createCollection('history'); }" >/dev/null
    print_success "History collection verified"
else
    print_success "MongoDB already contains data"
    has_history=$(mongosh --host db sefaria --quiet --eval "db.getCollectionNames().includes('history')")
    if [ "$has_history" = "false" ]; then
        print_info "History collection missing. Creating it now..."
        mongosh --host db sefaria --quiet --eval "db.createCollection('history')" >/dev/null
        print_success "History collection created"
    fi
fi

echo ""

# ====================
# Step 6: Django Setup
# ====================
echo "Step 6: Running Django migrations..."

# [DERIVED] Django migrations: Standard Django setup step
# Mentioned in installation docs: "Run Django migrations"
cd /app
python manage.py migrate --noinput
print_success "Django migrations completed"

echo ""

# ====================
# Step 7: Frontend Setup
# ====================
echo "Step 7: Building frontend assets..."

# Check if node_modules is missing or empty (named volume mounts as empty dir)
if [ ! -d "/app/node_modules" ] || [ -z "$(ls -A /app/node_modules 2>/dev/null)" ]; then
    print_info "Installing Node.js dependencies..."
    npm install
    print_success "Node.js dependencies installed"
fi

# Run npm setup script (installs nodemon, babel-cli, forever globally)
# [DERIVED] Mirrors manual 'npm run setup' instructions
print_info "Running npm setup tasks (npm run setup)..."
npm run setup
print_success "npm setup completed"

# Build client-side bundles
# [DERIVED] npm run build-client from package.json scripts
# From package.json: "build-client": "webpack --config ./node/webpack.client.js"
print_info "Building webpack bundles (this may take a few minutes)..."
npm run build-client
print_success "Frontend assets built"

echo ""

# ====================
# Step 8: Bootstrapping VS Code debug configuration
# ====================
# [RECOMMENDATION] Provide default debug targets while keeping per-developer overrides optional.
# [DERIVED] Runs only when the devcontainer is opened in VS Code Desktop (REMOTE_CONTAINERS_IPC)
#           or GitHub Codespaces (CODESPACES=true). Skips other entrypoints such as devcontainer CLI.
echo "Step 8: Bootstrapping VS Code debug configuration..."

debug_env=""
if [[ "${CODESPACES:-}" == "true" ]]; then
    debug_env="GitHub Codespaces"
elif [[ -n "${REMOTE_CONTAINERS_IPC:-}" ]]; then
    debug_env="VS Code Desktop"
fi

if [[ -n "${debug_env}" ]]; then
    print_info "Detected ${debug_env} environment - ensuring .vscode/launch.json"
    launch_template=".devcontainer/launch.template.json"
    launch_target=".vscode/launch.json"

    if [[ ! -f "${launch_template}" ]]; then
        print_warning "Launch template ${launch_template} not found; skipping debug configuration bootstrap"
    elif [[ -f "${launch_target}" ]]; then
        print_warning "Existing ${launch_target} detected; leaving developer overrides intact"
    else
        mkdir -p ".vscode"
        cp "${launch_template}" "${launch_target}"
        print_success "Created ${launch_target} from template"
    fi
else
    print_info "Not running inside VS Code - skipping debug configuration bootstrap"
fi

echo ""

# ====================
# Step 9: Final Setup
# ====================
echo "======================================"
echo "🎉 Setup Complete!"
echo "======================================"
echo ""
echo "Your Sefaria development environment is ready!"
echo ""
# [DERIVED] Port numbers from docker-compose.yml service definitions
echo "📍 Important URLs:"
echo "   • Django Web Server: http://localhost:8000"
echo "   • Node.js SSR Server: http://localhost:3000"
echo "   • MongoDB: localhost:27017"
echo "   • Redis: localhost:6379"
echo "   • PostgreSQL: localhost:5433"
echo ""
# [DERIVED] Commands from package.json scripts and Django commands
echo "🚀 Common Commands:"
echo "   • Start Django: python manage.py runserver 0.0.0.0:8000"
echo "   • Watch frontend: npm run watch-client"
echo "   • Start Node.js SSR: npm start"
echo "   • Sefaria CLI: ./cli"
echo "   • MongoDB shell: mongosh --host db"
echo "   • Redis CLI: redis-cli -h cache"
echo ""
echo "📚 Documentation:"
echo "   • See .devcontainer/README.md for more information"
echo "   • Visit https://developers.sefaria.org for full docs"
echo ""
echo "======================================"
echo ""
