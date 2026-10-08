# syntax=docker/dockerfile:1
FROM node:24-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates wget && rm -rf /var/lib/apt/lists/*

FROM base AS manifests
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY packages/runtime/package.json ./packages/runtime/
COPY mcp-server/package.json ./mcp-server/
COPY bots/package.json ./bots/

FROM manifests AS deps
RUN npm ci --workspace server --workspace mcp-server --include-workspace-root

FROM deps AS source
COPY . .
RUN npx prisma generate

FROM source AS web-builder
RUN npm run build

FROM source AS mcp-builder
RUN npm run build:mcp

FROM manifests AS web-deps
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev --omit=optional --workspace server --include-workspace-root=false

FROM manifests AS mcp-deps
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev --omit=optional --workspace mcp-server --include-workspace-root=false

FROM base AS migration-deps
COPY packages/migrations/package.json packages/migrations/package-lock.json ./
RUN npm ci --omit=dev

FROM base AS migrations
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:$PATH"
COPY --from=migration-deps /app/node_modules ./node_modules
COPY prisma ./prisma
USER node
CMD ["prisma", "migrate", "deploy"]

FROM base AS mcp
ENV NODE_ENV=production MCP_TRANSPORT=http MCP_PORT=3001
COPY --from=mcp-deps /app/node_modules ./node_modules
COPY --from=mcp-deps /app/packages/runtime ./packages/runtime
COPY --from=mcp-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=mcp-builder /app/mcp-server/dist ./mcp-server/dist
COPY mcp-server/package.json ./mcp-server/
USER node
EXPOSE 3001
CMD ["node", "mcp-server/dist/index.js"]

FROM base AS web
ENV NODE_ENV=production PORT=3000 APP_HOST=0.0.0.0
COPY --from=web-deps /app/node_modules ./node_modules
COPY --from=web-deps /app/packages/runtime ./packages/runtime
COPY --from=web-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=web-builder /app/dist ./dist
COPY package.json ./
COPY server/package.json ./server/
USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
