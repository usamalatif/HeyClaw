o deploy, you need to:


# 1. Install Fly CLI + login
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Create the agents app on Fly
fly apps create heyclaw-agents --org personal

# 3. Build + push agent image to Fly registry
fly auth docker
docker build -t registry.fly.io/heyclaw-agents:latest -f infrastructure/fly/agent.Dockerfile .
docker push registry.fly.io/heyclaw-agents:latest

# 4. Set secrets on the API app


# 5. Deploy the API to Fly
cd infrastructure/fly
fly deploy -c api.fly.toml

# 6. Rebuild iOS app (new API URL)
Get your FLY_API_TOKEN with: fly tokens create deploy -a heyclaw-agents



# 1. Install Fly CLI + login
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Create BOTH apps first
fly apps create heyclaw-api --org personal
fly apps create heyclaw-agents --org personal

# 3. Generate deploy token for the agents app
fly tokens create deploy -a heyclaw-agents
# Copy the output (FlyV1 fm2_...)

# 4. Set secrets on the API app (using the token from step 3)
fly secrets set \
  SUPABASE_URL=... \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  OPENAI_API_KEY=... \
  ELEVENLABS_API_KEY=... \
  FLY_API_TOKEN=<paste-token-from-step-3> \
  FLY_AGENTS_APP_NAME=heyclaw-agents \
  OPENCLAW_MODEL=openai-custom/gpt-5-nano \
  -a heyclaw-api

# 5. Build + push agent image
fly auth docker
docker build -t registry.fly.io/heyclaw-agents:latest -f infrastructure/fly/agent.Dockerfile .
docker push registry.fly.io/heyclaw-agents:latest

# 6. Deploy API
cd infrastructure/fly
fly deploy -c api.fly.toml
