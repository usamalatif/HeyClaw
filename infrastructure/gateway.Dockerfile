FROM node:22-slim

WORKDIR /app

# System deps required by OpenClaw
RUN apt-get update && apt-get install -y git python3 make g++ wget && rm -rf /var/lib/apt/lists/*

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Create directories for config + workspaces
RUN mkdir -p /root/.openclaw/workspaces

ENV NODE_OPTIONS="--max-old-space-size=12288"

COPY infrastructure/gateway-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
