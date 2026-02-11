-- Add gateway token column for OpenClaw per-user containers
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_gateway_token TEXT;
