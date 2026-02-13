import {Hono} from 'hono';
import {streamSSE} from 'hono/streaming';
import {authMiddleware} from '../middleware/auth.js';
import {rateLimitMiddleware} from '../middleware/rateLimiter.js';
import {db} from '../db/pool.js';
import type {AppEnv} from '../lib/types.js';
import {chunkToSpeech, splitIntoSentences} from '../services/tts.js';
import {sendToOpenClaw, streamFromOpenClaw} from '../services/openclawClient.js';
import {checkLimit, incrementUsage} from '../services/usage.js';
import {agentExists} from '../services/agentManager.js';

// Look up the user's active assistant's agent_id
async function getAgentId(userId: string): Promise<string> {
  const result = await db.query(
    `SELECT agent_id FROM assistants WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [userId],
  );
  if (!result.rows[0]) {
    throw new Error('No active assistant. Create one first.');
  }
  return result.rows[0].agent_id;
}

export const agentRoutes = new Hono<AppEnv>();

agentRoutes.use('*', authMiddleware);

agentRoutes.post('/message', rateLimitMiddleware, async c => {
  const userId = c.get('userId');
  const {text} = await c.req.json();

  if (!text?.trim()) {
    return c.json({message: 'Message text is required'}, 400);
  }

  // Check daily message limit
  const canSend = await checkLimit(userId, 'text_messages');
  if (!canSend) {
    return c.json({message: 'Daily message limit reached. Upgrade your plan.'}, 429);
  }

  const agentId = await getAgentId(userId);

  const response = await sendToOpenClaw(agentId, [{role: 'user', content: text}]);

  // Increment usage
  await incrementUsage(userId, 'text_messages', 1);

  // Update last_active_at
  await db.query(
    `UPDATE assistants SET last_active_at = NOW(), message_count = message_count + 1
     WHERE agent_id = $1`,
    [agentId],
  );

  const limits = c.get('limits');
  const usage = c.get('usage');

  return c.json({
    response,
    usage: {
      messagesUsed: usage.text_messages + 1,
      messagesLimit: limits.daily_text_messages,
    },
  });
});

// Streaming voice endpoint — SSE with text + audio chunks
agentRoutes.post('/voice', rateLimitMiddleware, async (c) => {
  const userId = c.get('userId');
  const {text, voice, nativeTts = false} = await c.req.json();

  if (!text?.trim()) {
    return c.json({message: 'Message text is required'}, 400);
  }

  // Check daily message limit
  const canSend = await checkLimit(userId, 'text_messages');
  if (!canSend) {
    return c.json({message: 'Daily message limit reached. Upgrade your plan.'}, 429);
  }

  const agentId = await getAgentId(userId);

  // Get user's TTS voice preference
  const userResult = await db.query(
    'SELECT voice FROM assistants WHERE agent_id = $1',
    [agentId],
  );
  const VALID_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
  const rawVoice = voice || userResult.rows[0]?.voice;
  const ttsVoice = VALID_VOICES.includes(rawVoice) ? rawVoice : 'alloy';

  return streamSSE(c, async (stream) => {
    try {
      let buffer = '';
      let sentenceIndex = 0;
      let fullText = '';

      // TTS runs as a background pipeline
      const ttsQueue: {sentence: string; index: number}[] = [];
      let ttsRunning = false;
      let ttsFinishResolve: (() => void) | null = null;

      const processTTSQueue = async () => {
        ttsRunning = true;
        while (ttsQueue.length > 0) {
          const batch = ttsQueue.splice(0, Math.min(3, ttsQueue.length));
          const results = await Promise.all(
            batch.map(item =>
              chunkToSpeech(item.sentence, ttsVoice)
                .then(audio => ({audio, index: item.index})),
            ),
          );
          for (const result of results) {
            await stream.writeSSE({
              data: JSON.stringify({type: 'audio', data: result.audio, index: result.index}),
              event: 'chunk',
            });
          }
        }
        ttsRunning = false;
        ttsFinishResolve?.();
      };

      const queueTTS = (sentence: string, index: number) => {
        ttsQueue.push({sentence, index});
        if (!ttsRunning) {
          processTTSQueue();
        }
      };

      const waitForTTS = () =>
        ttsRunning || ttsQueue.length > 0
          ? new Promise<void>(r => { ttsFinishResolve = r; })
          : Promise.resolve();

      const flushSentences = async (force: boolean) => {
        const sentences = force
          ? (buffer.trim() ? [buffer.trim()] : [])
          : splitIntoSentences(buffer);

        if (!force && sentences.length > 0) {
          const endsWithPunctuation = /[.!?]\s*$/.test(buffer);
          if (!endsWithPunctuation) {
            buffer = sentences.pop() || '';
          } else {
            buffer = '';
          }
        } else if (force) {
          buffer = '';
        }

        for (const sentence of sentences) {
          await stream.writeSSE({
            data: JSON.stringify({type: 'text', data: sentence, index: sentenceIndex}),
            event: 'chunk',
          });
          if (!nativeTts) {
            queueTTS(sentence, sentenceIndex);
          }
          sentenceIndex++;
        }
      };

      const sendToken = async (token: string) => {
        await stream.writeSSE({
          data: JSON.stringify({type: 'token', data: token}),
          event: 'chunk',
        });
      };

      const openclawStream = streamFromOpenClaw(agentId, [{role: 'user', content: text}]);
      for await (const chunk of openclawStream) {
        buffer += chunk;
        fullText += chunk;
        await sendToken(chunk);

        if (sentenceIndex === 0 && buffer.length > 25) {
          await flushSentences(true);
        } else if (/[.!?]\s/.test(buffer) || (buffer.length > 30 && /[,;:]\s/.test(buffer))) {
          await flushSentences(false);
        }
      }

      await flushSentences(true);

      if (!nativeTts) {
        await waitForTTS();
      }

      // Increment usage
      await incrementUsage(userId, 'text_messages', 1);

      // Update assistant activity
      await db.query(
        `UPDATE assistants SET last_active_at = NOW(), message_count = message_count + 1
         WHERE agent_id = $1`,
        [agentId],
      );

      const limits = c.get('limits');
      const usage = c.get('usage');

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          usage: {
            messagesUsed: usage.text_messages + 1,
            messagesLimit: limits.daily_text_messages,
          },
          fullText,
        }),
        event: 'chunk',
      });
    } catch (err: any) {
      await stream.writeSSE({
        data: JSON.stringify({type: 'error', message: err.message}),
        event: 'chunk',
      });
    }
  });
});

// Get agent status
agentRoutes.get('/status', async c => {
  const userId = c.get('userId');

  const result = await db.query(
    `SELECT a.agent_id, a.display_name, a.status, a.voice, a.message_count, a.last_active_at
     FROM assistants a WHERE a.user_id = $1 AND a.status != 'deleted'
     ORDER BY a.created_at LIMIT 1`,
    [userId],
  );

  if (!result.rows[0]) {
    return c.json({agentStatus: 'none', message: 'No assistant created'});
  }

  const assistant = result.rows[0];
  const isActive = agentExists(assistant.agent_id);

  return c.json({
    agentStatus: isActive ? 'running' : assistant.status,
    agentId: assistant.agent_id,
    displayName: assistant.display_name,
    voice: assistant.voice,
    messageCount: assistant.message_count,
  });
});

// Health check — verify gateway is responding
agentRoutes.get('/health', async c => {
  try {
    const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
    const res = await fetch(`${gatewayUrl}/`, {
      signal: AbortSignal.timeout(5000),
    });
    return c.json({healthy: res.ok});
  } catch {
    return c.json({healthy: false, reason: 'unreachable'});
  }
});

// Update assistant personality/display name
agentRoutes.patch('/personality', async c => {
  const userId = c.get('userId');
  const {displayName, voice: newVoice} = await c.req.json();

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (displayName !== undefined) {
    updates.push(`display_name = $${paramIndex++}`);
    values.push(displayName);
  }
  if (newVoice !== undefined) {
    updates.push(`voice = $${paramIndex++}`);
    values.push(newVoice);
  }

  if (updates.length === 0) {
    return c.json({message: 'No updates provided'}, 400);
  }

  values.push(userId);
  await db.query(
    `UPDATE assistants SET ${updates.join(', ')}, updated_at = NOW()
     WHERE user_id = $${paramIndex} AND status = 'active'`,
    values,
  );

  return c.json({message: 'Updated'});
});
