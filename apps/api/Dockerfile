FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN npm install --workspace=apps/api --workspace=packages/shared

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build
WORKDIR /app/apps/api
RUN npx tsc

# Production image
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Agent templates (SOUL.md, AGENTS.md) for new user onboarding
COPY infrastructure/server/templates/ ./templates/

# Docker CLI for gateway restart (need v25+ for API v1.44+)
RUN apt-get update && apt-get install -y ca-certificates curl gnupg && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources-docker.list && \
    cp /etc/apt/sources-docker.list /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3000

CMD ["node", "dist/index.js"]
