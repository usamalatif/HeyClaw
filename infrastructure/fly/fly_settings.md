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
fly secrets set SUPABASE_URL='https://pkkeaxvmakzdhqdbuosq.supabase.co' -a heyclaw-api
fly secrets set SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBra2VheHZtYWt6ZGhxZGJ1b3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQzNzksImV4cCI6MjA4MzkxMDM3OX0.JeOw8ZiKTceNiidXEIrGbkLzVTXlrKEKPwzp8JBeBSo' -a heyclaw-api
fly secrets set SUPABASE_SERVICE_ROLE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBra2VheHZtYWt6ZGhxZGJ1b3NxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMzNDM3OSwiZXhwIjoyMDgzOTEwMzc5fQ.kJDaft_EHlvgF_WZHL7F1V3UcHhRuIDJf7NMT6Zo-eM' -a heyclaw-api
fly secrets set OPENAI_API_KEY='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' -a heyclaw-api
fly secrets set ELEVENLABS_API_KEY='sk_18f8430ce22fad476a17f419fb950e6221e140fcec44fc8d' -a heyclaw-api
fly secrets set FLY_AGENTS_APP_NAME='heyclaw-agents' -a heyclaw-api
fly secrets set OPENCLAW_MODEL='openai-custom/gpt-5-nano' -a heyclaw-api
fly secrets set FLY_API_TOKEN='FlyV1 fm2_lJPECAAAAAAAEZPmxBBp876yweDugYZNZkHDPynZwrVodHRwczovL2FwaS5mbHkuaW8vdjGWAJLOABaNvR8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxSGzKoUIcy9U2Cm9B/an+qv5tqcQCM6YyiXg9POlENO+ihsfTFiRycYQUtJhAZr+PqKp/232OUehoBK+7ETrP3hXo5iuhIUNWtlba5qqoMREgP4gYC5IRn+U4ZjaXgLJSy2YCuiSy/VA0BR5kyq/CUkIuVvX+PMCTbMyCL2QL9996xaHq9uCh/OgoA2g2SlAORgc4A0wPFHwWRgqdidWlsZGVyH6J3Zx8BxCAhRAAOnYQk3iO/NKfLS65zxNj/7cl3pwKM9XKCSh7/mw==,fm2_lJPETrP3hXo5iuhIUNWtlba5qqoMREgP4gYC5IRn+U4ZjaXgLJSy2YCuiSy/VA0BR5kyq/CUkIuVvX+PMCTbMyCL2QL9996xaHq9uCh/OgoA2sQQ0RE5R/gYkncB7fsuqtvgJsO5aHR0cHM6Ly9hcGkuZmx5LmlvL2FhYS92MZgEks5pjf5+zo8mBJwXzgAVpBEKkc4AFaQRDMQQ5gZor1GEy+icO3PeauOM5MQgQraLyuX8I6snvsu1IYjEELfKhFGWWomTH9uOKB2yJL8=' -a heyclaw-api


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
