import fs from 'fs';
import path from 'path';
import {exec} from 'child_process';

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG_PATH || '/home/appuser/.openclaw/openclaw.json';
// Local path (API container mount) for writing workspace files
const WORKSPACES_DIR = process.env.WORKSPACES_DIR || path.join(path.dirname(OPENCLAW_CONFIG), 'workspaces');
// Gateway path — what gets stored in openclaw.json (as seen by gateway container)
const GATEWAY_WORKSPACES_DIR = process.env.GATEWAY_WORKSPACES_DIR || '/root/.openclaw/workspaces';
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');

let reloadTimer: NodeJS.Timeout | null = null;
const RELOAD_DEBOUNCE_MS = parseInt(process.env.GATEWAY_RELOAD_DEBOUNCE_MS || '5000');

interface AgentEntry {
  id: string;
  name: string;
  workspace: string;
  [key: string]: any;
}

interface OpenClawConfig {
  gateway: any;
  models: any;
  agents: {
    defaults: any;
    list: AgentEntry[];
  };
  bindings: Array<{agentId: string; match: any}>;
  channels: any;
  [key: string]: any;
}

function getConfig(): OpenClawConfig {
  return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf-8'));
}

function saveConfig(config: OpenClawConfig): void {
  const tmpPath = OPENCLAW_CONFIG + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs.renameSync(tmpPath, OPENCLAW_CONFIG);
}

const GATEWAY_CONTAINER = process.env.GATEWAY_CONTAINER_NAME || 'heyclaw-gateway';

function reloadGateway(): Promise<void> {
  return new Promise((resolve) => {
    // Debounce: if multiple agent changes happen quickly, only reload once
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      // Use SIGUSR1 for hot-reload instead of full container restart
      // This reloads config without dropping existing connections
      exec(`docker exec ${GATEWAY_CONTAINER} pkill -SIGUSR1 -f "node.*openclaw"`, (err, _stdout, stderr) => {
        if (err) {
          // Fallback to full restart if hot-reload fails
          console.warn('[AgentManager] Hot-reload failed, falling back to restart:', stderr);
          exec(`docker restart ${GATEWAY_CONTAINER}`, (err2, _stdout2, stderr2) => {
            if (err2) {
              console.error('[AgentManager] Gateway restart failed:', stderr2);
            } else {
              console.log('[AgentManager] Gateway restarted (fallback)');
            }
          });
        } else {
          console.log('[AgentManager] Gateway hot-reloaded (SIGUSR1)');
        }
      });
    }, RELOAD_DEBOUNCE_MS);
    // Resolve immediately — reload happens in background
    resolve();
  });
}

export async function createAgent(
  agentId: string,
): Promise<{agentId: string; workspacePath: string}> {
  const config = getConfig();

  if (config.agents.list.some(a => a.id === agentId)) {
    throw new Error(`Agent ${agentId} already exists`);
  }

  // Create workspace from templates (local API path)
  const localWorkspace = path.join(WORKSPACES_DIR, agentId);
  fs.mkdirSync(localWorkspace, {recursive: true});

  // Create memory folder for daily logs
  fs.mkdirSync(path.join(localWorkspace, 'memory'), {recursive: true});

  // Template files to copy (if they exist)
  const templateFiles = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md', 'MEMORY.md', 'HEARTBEAT.md'];

  for (const fileName of templateFiles) {
    const templatePath = path.join(TEMPLATES_DIR, fileName);
    const destPath = path.join(localWorkspace, fileName);

    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, destPath);
    } else {
      // Fallback content if template doesn't exist
      const fallbacks: Record<string, string> = {
        'SOUL.md': '# Your AI Assistant\n\nBe helpful, friendly, and genuine.\n',
        'AGENTS.md': '# Personal AI Assistant\n\nYou are a helpful AI assistant.\n',
        'USER.md': '# User\n\n_(Learn about your human as you chat)_\n',
        'IDENTITY.md': '# Identity\n\n- **Name:** Assistant\n- **Emoji:** 🤖\n',
        'TOOLS.md': '# Preferences\n\n_(User preferences go here)_\n',
        'MEMORY.md': '# Memory\n\n_(Important things to remember)_\n',
      };
      fs.writeFileSync(destPath, fallbacks[fileName] || `# ${fileName}\n`);
    }
  }

  // Store gateway's path in config (as seen by gateway container)
  const gatewayWorkspace = path.join(GATEWAY_WORKSPACES_DIR, agentId);

  config.agents.list.push({
    id: agentId,
    name: agentId,
    model: {primary: 'openai-custom/gpt-5-nano', fallbacks: []},
    workspace: gatewayWorkspace,
  });

  config.bindings.push({
    agentId,
    match: {
      channel: 'webchat',
      peer: {kind: 'dm', id: agentId},
    },
  });

  saveConfig(config);
  await reloadGateway();

  console.log(`[AgentManager] Agent created: ${agentId} with full workspace`);
  return {agentId, workspacePath: localWorkspace};
}

export async function removeAgent(agentId: string): Promise<void> {
  const config = getConfig();

  config.agents.list = config.agents.list.filter(a => a.id !== agentId);
  config.bindings = config.bindings.filter(b => b.agentId !== agentId);

  saveConfig(config);

  // Clean up workspace
  const workspacePath = path.join(WORKSPACES_DIR, agentId);
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, {recursive: true, force: true});
  }

  // Clean up agent state
  const agentDir = path.join(path.dirname(OPENCLAW_CONFIG), 'agents', agentId);
  if (fs.existsSync(agentDir)) {
    fs.rmSync(agentDir, {recursive: true, force: true});
  }

  await reloadGateway();
  console.log(`[AgentManager] Agent removed: ${agentId}`);
}

export async function pauseAgent(agentId: string): Promise<void> {
  const config = getConfig();
  config.agents.list = config.agents.list.filter(a => a.id !== agentId);
  config.bindings = config.bindings.filter(b => b.agentId !== agentId);
  saveConfig(config);
  await reloadGateway();
  console.log(`[AgentManager] Agent paused: ${agentId}`);
}

export async function resumeAgent(agentId: string): Promise<void> {
  const localWorkspace = path.join(WORKSPACES_DIR, agentId);
  if (!fs.existsSync(localWorkspace)) {
    throw new Error(`Agent workspace not found: ${agentId}`);
  }

  const config = getConfig();
  if (config.agents.list.some(a => a.id === agentId)) return;

  const gatewayWorkspace = path.join(GATEWAY_WORKSPACES_DIR, agentId);

  config.agents.list.push({
    id: agentId,
    name: agentId,
    model: {primary: 'openai-custom/gpt-5-nano', fallbacks: []},
    workspace: gatewayWorkspace,
  });

  config.bindings.push({
    agentId,
    match: {channel: 'webchat', peer: {kind: 'dm', id: agentId}},
  });

  saveConfig(config);
  await reloadGateway();
  console.log(`[AgentManager] Agent resumed: ${agentId}`);
}

export function agentExists(agentId: string): boolean {
  return getConfig().agents.list.some(a => a.id === agentId);
}

export function getAgentCount(): number {
  return getConfig().agents.list.length;
}

export function listAgents(): Array<{id: string; name: string}> {
  return getConfig().agents.list.map(a => ({
    id: a.id,
    name: a.name,
  }));
}
