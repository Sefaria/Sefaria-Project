# The new reader client: server rendering + static assets, one Node process (server/index.mjs) on PORT (3000).
# Build context: this folder (`docker build reader-next`). CI (.github/workflows/continuous.yaml) builds it as sefaria-reader-<branch>;
# the chart runs it as the reader-<env> rollout (nodejs.mode "optin") or in the node pods (nodejs.mode "reader"). sefaria-node stays the
# legacy SSR server (build/node/Dockerfile).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
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
