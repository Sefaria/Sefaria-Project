FROM oven/bun:latest AS builder
WORKDIR /app

# Install all dependencies (including dev) for Webpack
COPY package.json bun.lock ./
RUN bun install

# Copy source and build production bundle via Webpack
COPY . ./
RUN bun run build-prod

FROM us-east1-docker.pkg.dev/production-deployment/containers/base-web:3.9-bullseye AS release
WORKDIR /app/

# Copy built bundles and server code
COPY --from=builder /app/static/bundles ./static/bundles
COPY --from=builder /app/node ./node

# Copied separately to allow for caching of the `pip install` build step
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt


COPY . /app/

RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80
