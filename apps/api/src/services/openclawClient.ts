// Client for communicating with the single shared OpenClaw gateway
// Routes to specific agents via the webchat channel peer matching

const GATEWAY_URL = () => process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = () => process.env.OPENCLAW_GATEWAY_TOKEN || '';

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
  const token = GATEWAY_TOKEN();
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
