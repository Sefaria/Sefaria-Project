# The new reader client: server rendering + static assets, one Node process (server/index.mjs) on PORT (3000).
# In Sefaria-Project this folder is reader/ and build/node/Dockerfile builds it as the sefaria-node image.
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
