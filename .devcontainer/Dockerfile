# Sefaria Development Container
# Based on Python 3.9 slim with MongoDB tools and project-specific dependencies installed directly
# [DERIVED] Base image matches dev_docker/Dockerfile Python version (3.9) and already includes common-utils content
FROM mcr.microsoft.com/devcontainers/python:3.9

# Configure MongoDB repository for 4.4 tooling
# [DERIVED] MongoDB version aligns with docker-compose.yml service image (mongo:4.4)
# [RECOMMENDATION] Import MongoDB GPG key and repository before installing client tools
RUN curl -fsSL https://www.mongodb.org/static/pgp/server-4.4.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/mongodb-archive-keyring.gpg] http://repo.mongodb.org/apt/debian buster/mongodb-org/4.4 main" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list \
    && apt-get update

# Install project-specific system dependencies not provided by the base image
# [DERIVED] Build tools for Python native extensions (psycopg2 compilation)
# [DERIVED] Database client libraries and CLIs for PostgreSQL, Redis, and MongoDB
# [DERIVED] gettext for Django internationalization workflows
RUN apt-get install -y \
    build-essential \
    libpq-dev \
    postgresql-client \
    redis-tools \
    gettext \
    mongodb-mongosh \
    mongodb-database-tools \
    && rm -rf /var/lib/apt/lists/*

# Align container working directory with project mount
# [DERIVED] Matches docker-compose.yml volume mapping (. : /app)
WORKDIR /app

# Create log directory with proper permissions
# [DERIVED] Installation docs: "Create a directory called log under the root project folder"
RUN mkdir -p /app/log && chmod 777 /app/log
