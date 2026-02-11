# Per-user OpenClaw agent instance
# Each user gets their own OpenClaw Gateway running on Fly.io
FROM node:22-slim

WORKDIR /app

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Create workspace directory
RUN mkdir -p /root/.openclaw/workspace

# Environment variables set per-user at machine creation time
ENV USER_ID=""
ENV ANTHROPIC_API_KEY=""
ENV OPENCLAW_MODEL="anthropic/claude-sonnet-4-5-20250929"
ENV OPENCLAW_PORT="18789"

# Write OpenClaw config at container start
# The config is generated dynamically from env vars
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
