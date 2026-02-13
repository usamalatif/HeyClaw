// Client for communicating with the single shared OpenClaw gateway
// Routes to specific agents via the webchat channel peer matching

import fs from 'fs';

const GATEWAY_URL = () => process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const CONFIG_PATH = () => process.env.OPENCLAW_CONFIG_PATH || '/openclaw-config/openclaw.json';

// Cache the token so we don't read the file on every request
let cachedToken = '';
let tokenReadAt = 0;
const TOKEN_CACHE_TTL = 60_000; // re-read config every 60s

function getGatewayToken(): string {
  const now = Date.now();
  if (cachedToken && now - tokenReadAt < TOKEN_CACHE_TTL) {
    return cachedToken;
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf-8'));
    cachedToken = config.gateway?.auth?.token || '';
    tokenReadAt = now;
    return cachedToken;
  } catch {
    console.warn('[OpenClawClient] Could not read gateway token from config');
    return cachedToken || '';
  }
}

interface OpenClawMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenClawResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getGatewayToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Send a message to a specific agent on the shared gateway
export async function sendToOpenClaw(
  agentId: string,
  messages: OpenClawMessage[],
): Promise<string> {
  const res = await fetch(`${GATEWAY_URL()}/v1/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      messages,
      model: 'openclaw',
      agent: agentId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenClaw error: ${res.status} ${body}`);
  }

  const data: OpenClawResponse = await res.json();
  return data.choices[0]?.message?.content || 'No response from agent.';
}

// Stream a response from a specific agent on the shared gateway
export async function* streamFromOpenClaw(
  agentId: string,
  messages: OpenClawMessage[],
): AsyncGenerator<string> {
  const res = await fetch(`${GATEWAY_URL()}/v1/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      messages,
      model: 'openclaw',
      stream: true,
      agent: agentId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenClaw error: ${res.status} ${body}`);
  }

  if (!res.body) {
    throw new Error('No response body from OpenClaw');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, {stream: true});

    // Parse SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }
}
