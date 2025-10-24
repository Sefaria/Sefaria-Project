#!/bin/bash
# Sefaria Development Container - Post-Start Script
# This script runs every time the container starts
#
# DERIVATION NOTES:
# - Service names (db, cache, postgres) from docker-compose.yml
# - Commands from package.json scripts and standard Django/database tools
# - Quick health checks instead of full setup (runs on every start)

# Colors for output
# [RECOMMENDATION] Use colors for better readability (same as postCreate.sh)
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "======================================"
echo "Sefaria Development Container"
echo "======================================"
echo ""

# Check service connectivity
# [RECOMMENDATION] Quick health checks to verify services are available
echo "📡 Service Status:"

# MongoDB
# [DERIVED] Service name 'db' from docker-compose.yml
# [RECOMMENDATION] Use mongosh (modern MongoDB shell)
if mongosh --host db --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} MongoDB (db:27017)"
else
    echo -e "   ${YELLOW}⚠${NC} MongoDB (connecting...)"
fi

# Redis
# [DERIVED] Service name 'cache' from docker-compose.yml
if redis-cli -h cache ping >/dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Redis (cache:6379)"
else
    echo -e "   ${YELLOW}⚠${NC} Redis (connecting...)"
fi

# PostgreSQL
# [DERIVED] Service name 'postgres' and user 'admin' from docker-compose.yml
if pg_isready -h postgres -U admin >/dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} PostgreSQL (postgres:5433)"
else
    echo -e "   ${YELLOW}⚠${NC} PostgreSQL (connecting...)"
fi

echo ""
# [DERIVED] Commands from package.json scripts and Django management commands
echo "🚀 Quick Start Commands:"
echo "   python manage.py runserver 0.0.0.0:8000  # Start Django server"
echo "   npm run watch-client                      # Watch & rebuild frontend"
echo "   npm start                                 # Start Node.js SSR server"
echo "   ./cli                                     # Open Sefaria CLI"
echo ""
# [DERIVED] Database CLI tools and service names from docker-compose.yml
echo "🔍 Database Access:"
echo "   mongosh --host db                         # MongoDB shell"
echo "   redis-cli -h cache                        # Redis CLI"
echo "   psql -h postgres -U admin -d sefaria      # PostgreSQL shell"
echo ""
echo "📚 For more help, see .devcontainer/README.md"
echo "======================================"
echo ""
