// Client for communicating with per-user OpenClaw instances
// Uses OpenClaw's OpenAI-compatible API endpoint: POST /v1/chat/completions
import {getAgentUrl} from './dockerProvisioner.js';

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

// Send a message to a user's OpenClaw instance and get a response
export async function sendToOpenClaw(
  userId: string,
  messages: OpenClawMessage[],
  gatewayToken?: string,
): Promise<string> {
  const baseUrl = getAgentUrl(userId);

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (gatewayToken) {
    headers['Authorization'] = `Bearer ${gatewayToken}`;
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      model: 'openclaw',
      user: userId, // Stable session — OpenClaw remembers conversation history
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenClaw error: ${res.status} ${body}`);
  }

  const data: OpenClawResponse = await res.json();
  return data.choices[0]?.message?.content || 'No response from agent.';
}

// Stream a response from the user's OpenClaw instance
export async function* streamFromOpenClaw(
  userId: string,
  messages: OpenClawMessage[],
  gatewayToken?: string,
): AsyncGenerator<string> {
  const baseUrl = getAgentUrl(userId);

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (gatewayToken) {
    headers['Authorization'] = `Bearer ${gatewayToken}`;
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      model: 'openclaw',
      stream: true,
      user: userId, // Stable session — OpenClaw remembers conversation history
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
