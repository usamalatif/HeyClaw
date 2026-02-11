// Docker Engine provisioner for per-user OpenClaw instances
// Replaces Fly.io Machines — runs containers on the same host via Docker socket
import Docker from 'dockerode';

const docker = new Docker({socketPath: '/var/run/docker.sock'});

const NETWORK_NAME = 'heyclaw';
const AGENT_IMAGE = 'heyclaw-agent:latest';

// Ensure the Docker network exists
async function ensureNetwork(): Promise<void> {
  try {
    const network = docker.getNetwork(NETWORK_NAME);
    await network.inspect();
  } catch {
    await docker.createNetwork({Name: NETWORK_NAME, Driver: 'bridge'});
  }
}

// Get container name for a user
function containerName(userId: string): string {
  return `agent-${userId.slice(0, 8)}`;
}

// Create and start a new OpenClaw container for a user
export async function createAgentContainer(userId: string): Promise<string> {
  await ensureNetwork();

  const name = containerName(userId);

  // Check if container already exists
  try {
    const existing = docker.getContainer(name);
    const info = await existing.inspect();
    if (info.State.Running) {
      return info.Id;
    }
    // Exists but stopped — start it
    await existing.start();
    return info.Id;
  } catch {
    // Container doesn't exist, create it
  }

  const container = await docker.createContainer({
    name,
    Image: AGENT_IMAGE,
    Env: [
      `USER_ID=${userId}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
      `OPENAI_API_KEY=${process.env.OPENAI_API_KEY || ''}`,
      `OPENCLAW_MODEL=${process.env.OPENCLAW_MODEL || 'anthropic/claude-sonnet-4-5-20250929'}`,
      `OPENCLAW_PORT=18789`,
    ],
    ExposedPorts: {'18789/tcp': {}},
    HostConfig: {
      NetworkMode: NETWORK_NAME,
      RestartPolicy: {Name: 'unless-stopped'},
      Memory: 512 * 1024 * 1024, // 512MB
      NanoCpus: 500000000, // 0.5 CPU
    },
  });

  await container.start();

  // Connect to the heyclaw network with an alias
  const network = docker.getNetwork(NETWORK_NAME);
  await network.connect({Container: container.id, EndpointConfig: {Aliases: [name]}});

  return container.id;
}

// Start a stopped container
export async function startAgentContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  const info = await container.inspect();
  if (!info.State.Running) {
    await container.start();
  }
}

// Stop a running container
export async function stopAgentContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  try {
    await container.stop({t: 10});
  } catch {
    // Already stopped
  }
}

// Get container status
export async function getAgentStatus(containerId: string): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State.Running ? 'running' : 'stopped';
  } catch {
    return 'not_found';
  }
}

// Delete a container
export async function deleteAgentContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  try {
    await container.stop({t: 5});
  } catch {
    // Already stopped
  }
  await container.remove({force: true});
}

// Get the internal Docker network URL for a user's OpenClaw instance
export function getAgentUrl(userId: string): string {
  return `http://${containerName(userId)}:18789`;
}
