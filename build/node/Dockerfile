# sefaria-node on this branch is the new reader client (reader-next/), not the legacy SSR server (Dockerfile.legacy).
# The cluster sends page requests to it first; it renders the reader and library pages and hands everything else to Varnish/Django.
# Built by .github/workflows/continuous.yaml with the repository root as context.
FROM node:22-slim AS build
WORKDIR /app
COPY reader-next/package.json reader-next/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY reader-next/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
