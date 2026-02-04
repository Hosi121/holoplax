# syntax=docker/dockerfile:1

FROM node:20-slim AS base

FROM base AS deps
WORKDIR /app

# Copy root package files for prisma schema access
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY mcp-server/package.json mcp-server/package-lock.json ./mcp-server/

# Install root dependencies (for prisma client)
RUN npm ci

# Install mcp-server dependencies
WORKDIR /app/mcp-server
RUN npm ci

FROM base AS builder
WORKDIR /app

# Copy from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/mcp-server/node_modules ./mcp-server/node_modules

# Copy source
COPY prisma ./prisma
COPY mcp-server ./mcp-server

# Generate Prisma client and build
WORKDIR /app/mcp-server
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates wget && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs mcp

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/mcp-server/node_modules ./mcp-server/node_modules
# Copy generated Prisma client to mcp-server node_modules
COPY --from=builder /app/node_modules/.prisma ./mcp-server/node_modules/.prisma
COPY --from=builder /app/mcp-server/dist ./mcp-server/dist
COPY --from=builder /app/mcp-server/package.json ./mcp-server/

USER mcp

EXPOSE 3001

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3001

WORKDIR /app/mcp-server
CMD ["node", "dist/index.js"]
