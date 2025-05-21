FROM oven/bun:latest AS builder
WORKDIR /app

# Install all dependencies (including dev) for Webpack
COPY package.json bun.lock ./
RUN bun install

# Copy source and build production bundle via Webpack
COPY . ./
RUN bun run build-prod


# Stage 2: Runtime image with Bun
FROM oven/bun:latest AS release
WORKDIR /app

# Copy production dependencies
COPY package.json bun.lock ./
RUN bun install
# Copy built bundles and server code
COPY --from=builder /app/static/bundles ./static/bundles
COPY --from=builder /app/node ./node

# Expose application port and run
EXPOSE 3000
CMD ["bun", "static/bundles/server/server-bundle.js"]