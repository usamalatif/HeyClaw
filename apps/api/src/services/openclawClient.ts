// Client for communicating with the single shared OpenClaw gateway
// Routes to specific agents via x-openclaw-agent-id header

const GATEWAY_URL = () => process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function getGatewayToken(): string {
  return process.env.OPENCLAW_GATEWAY_TOKEN || '';
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY_MS,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.warn(`[OpenClaw] Attempt ${attempt + 1}/${retries} failed: ${err.message}`);
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, delay * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// Health check — verify gateway is responding
export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_URL()}/`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
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

function getHeaders(agentId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-openclaw-agent-id': agentId,
  };
  const token = getGatewayToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Send a message to a specific agent on the shared gateway (with retry)
export async function sendToOpenClaw(
  agentId: string,
  messages: OpenClawMessage[],
): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(`${GATEWAY_URL()}/v1/chat/completions`, {
      method: 'POST',
      headers: getHeaders(agentId),
      body: JSON.stringify({
        messages,
        model: 'openclaw',
      }),
      signal: AbortSignal.timeout(120000), // 2 min timeout
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenClaw error: ${res.status} ${body}`);
    }

    const data: OpenClawResponse = await res.json();
    return data.choices[0]?.message?.content || 'No response from agent.';
  });
}

// Stream a response from a specific agent on the shared gateway
export async function* streamFromOpenClaw(
  agentId: string,
  messages: OpenClawMessage[],
): AsyncGenerator<string> {
  const res = await fetch(`${GATEWAY_URL()}/v1/chat/completions`, {
    method: 'POST',
    headers: getHeaders(agentId),
    body: JSON.stringify({
      messages,
      model: 'openclaw',
      stream: true,
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
