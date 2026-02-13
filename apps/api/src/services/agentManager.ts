import fs from 'fs';
import path from 'path';
import {exec} from 'child_process';

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG_PATH || '/home/appuser/.openclaw/openclaw.json';
const WORKSPACES_DIR = path.join(path.dirname(OPENCLAW_CONFIG), 'workspaces');
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');

let reloadTimer: NodeJS.Timeout | null = null;
const RELOAD_DEBOUNCE_MS = parseInt(process.env.GATEWAY_RELOAD_DEBOUNCE_MS || '5000');

interface OpenClawConfig {
  gateway: any;
  models: any;
  agents: {
    defaults: any;
    list: Array<{id: string; name: string; workspace: string; model: string}>;
  };
  bindings: Array<{agentId: string; match: any}>;
  channels: any;
  heartbeat: any;
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
    // Debounce: if multiple agent changes happen quickly, only restart once
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      exec(`docker restart ${GATEWAY_CONTAINER}`, (err, _stdout, stderr) => {
        if (err) {
          console.error('[AgentManager] Gateway restart failed:', stderr);
        } else {
          console.log('[AgentManager] Gateway restarted successfully');
        }
      });
    }, RELOAD_DEBOUNCE_MS);
    // Resolve immediately — restart happens in background
    resolve();
  });
}

export async function createAgent(
  agentId: string,
  model?: string,
): Promise<{agentId: string; workspacePath: string}> {
  const config = getConfig();

  if (config.agents.list.some(a => a.id === agentId)) {
    throw new Error(`Agent ${agentId} already exists`);
  }

  // Create workspace from templates
  const workspacePath = path.join(WORKSPACES_DIR, agentId);
  fs.mkdirSync(workspacePath, {recursive: true});

  const soulTemplate = path.join(TEMPLATES_DIR, 'SOUL.md');
  const agentsTemplate = path.join(TEMPLATES_DIR, 'AGENTS.md');

  if (fs.existsSync(soulTemplate)) {
    fs.copyFileSync(soulTemplate, path.join(workspacePath, 'SOUL.md'));
  } else {
    fs.writeFileSync(path.join(workspacePath, 'SOUL.md'), '# Your AI Assistant\n');
  }

  if (fs.existsSync(agentsTemplate)) {
    fs.copyFileSync(agentsTemplate, path.join(workspacePath, 'AGENTS.md'));
  } else {
    fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), '# Personal AI Assistant\n');
  }

  fs.writeFileSync(path.join(workspacePath, 'MEMORY.md'), '# Memory\n');
  fs.writeFileSync(path.join(workspacePath, 'USER.md'), '# User Preferences\n');

  // Add to config
  config.agents.list.push({
    id: agentId,
    name: agentId,
    workspace: workspacePath,
    model: model || 'openai-custom/gpt-5-nano',
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

  console.log(`[AgentManager] Agent created: ${agentId}`);
  return {agentId, workspacePath};
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

export async function resumeAgent(agentId: string, model?: string): Promise<void> {
  const workspacePath = path.join(WORKSPACES_DIR, agentId);
  if (!fs.existsSync(workspacePath)) {
    throw new Error(`Agent workspace not found: ${agentId}`);
  }

  const config = getConfig();
  if (config.agents.list.some(a => a.id === agentId)) return;

  config.agents.list.push({
    id: agentId,
    name: agentId,
    workspace: workspacePath,
    model: model || 'openai-custom/gpt-5-nano',
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

export function listAgents(): Array<{id: string; name: string; model: string}> {
  return getConfig().agents.list.map(a => ({
    id: a.id,
    name: a.name,
    model: a.model,
  }));
}
