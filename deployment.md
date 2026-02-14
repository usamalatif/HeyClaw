Deploy to Your Server
Step 1: Push code to your server (git clone or scp)


git clone <your-repo> /opt/heyclaw
cd /opt/heyclaw
Step 2: Create .env.production


cp .env.production.example .env.production
nano .env.production
Fill in:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string  
- `JWT_SECRET` — Secret for JWT tokens
- `OPENAI_API_KEY` — Your OpenAI key (for STT/TTS)
- `ANTHROPIC_API_KEY` — Your Anthropic key (for OpenClaw agent)
- `RESEND_API_KEY` — Resend API key for emails
- `RESEND_FROM_EMAIL` — Verified sender email (e.g. `HeyClaw <noreply@yourdomain.com>`)
- `DOCKER_PROVISIONING=true`
Step 3: Deploy


./deploy.sh
This will:

Build the OpenClaw agent Docker image (heyclaw-agent:latest)
Build the HeyClaw API Docker image
Create the heyclaw Docker network
Start the API container (mounts Docker socket so it can create per-user OpenClaw containers)
Step 4: Update mobile app
Change config.ts to point to your server IP:


? 'http://YOUR_SERVER_IP:3000'
How it works in production:

User signs up → provisioning screen triggers POST /agent/provision
API creates a Docker container running OpenClaw for that user
Container joins the heyclaw network, accessible as http://agent-{userId}:18789
Messages route to user's OpenClaw container via its OpenAI-compatible API
OpenClaw processes with Claude, response gets TTS'd and streamed back
What's your server IP? I can update the mobile config right now.