FROM node:22-slim

WORKDIR /app

# System deps required by OpenClaw + Chromium for browser automation
RUN apt-get update && apt-get install -y \
    git python3 make g++ wget \
    # Chromium dependencies
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for OpenClaw browser control
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Create directories for config + workspaces
RUN mkdir -p /root/.openclaw/workspaces

ENV NODE_OPTIONS="--max-old-space-size=12288"

COPY infrastructure/gateway-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
