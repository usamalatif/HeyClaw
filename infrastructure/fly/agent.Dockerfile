# Per-user OpenClaw agent instance
# Each user gets their own OpenClaw Gateway running on Docker
FROM node:22-slim

WORKDIR /app

# Install system dependencies required by OpenClaw
RUN apt-get update && apt-get install -y git python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Create workspace directory
RUN mkdir -p /root/.openclaw/workspace

# Environment variables are passed at runtime via Docker (not baked into image)
ENV OPENCLAW_PORT="18789"

# Write OpenClaw config at container start
# The config is generated dynamically from env vars
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
