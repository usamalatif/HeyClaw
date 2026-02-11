// Fly.io Machines API client for managing per-user OpenClaw agents
// Docs: https://fly.io/docs/machines/api/

const FLY_API_URL = 'https://api.machines.dev/v1';
const FLY_API_TOKEN = process.env.FLY_API_TOKEN!;
const FLY_APP_NAME = process.env.FLY_AGENTS_APP_NAME || 'heyclaw-agents';

interface MachineConfig {
  image: string;
  env: Record<string, string>;
  guest: {cpu_kind: string; cpus: number; memory_mb: number};
  auto_destroy: boolean;
  restart: {policy: string};
}

async function flyRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${FLY_API_URL}/apps/${FLY_APP_NAME}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fly API error: ${res.status} ${body}`);
  }

  return res.json();
}

export async function createMachine(userId: string): Promise<string> {
  const config: MachineConfig = {
    image: 'registry.fly.io/heyclaw-agent:latest',
    env: {
      USER_ID: userId,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
      OPENCLAW_MODEL: 'anthropic/claude-sonnet-4-5-20250929',
      OPENCLAW_PORT: '18789',
    },
    guest: {cpu_kind: 'shared', cpus: 1, memory_mb: 512},
    auto_destroy: false,
    restart: {policy: 'on-failure'},
  };

  const machine = await flyRequest('/machines', {
    method: 'POST',
    body: JSON.stringify({
      name: `agent-${userId.slice(0, 8)}`,
      config,
      services: [{
        ports: [{port: 18789, handlers: ['http']}],
        protocol: 'tcp',
        internal_port: 18789,
      }],
    }),
  });

  return machine.id;
}

// Get the internal Fly URL for a user's OpenClaw instance
export function getMachineUrl(machineId: string): string {
  return `http://${machineId}.vm.${FLY_APP_NAME}.internal:18789`;
}

export async function startMachine(machineId: string): Promise<void> {
  await flyRequest(`/machines/${machineId}/start`, {method: 'POST'});
}

export async function stopMachine(machineId: string): Promise<void> {
  await flyRequest(`/machines/${machineId}/stop`, {method: 'POST'});
}

export async function getMachineStatus(
  machineId: string,
): Promise<string> {
  const machine = await flyRequest(`/machines/${machineId}`);
  return machine.state;
}

export async function deleteMachine(machineId: string): Promise<void> {
  await flyRequest(`/machines/${machineId}`, {method: 'DELETE'});
}
