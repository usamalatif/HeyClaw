import {Hono} from 'hono';
import {streamSSE} from 'hono/streaming';
import {authMiddleware} from '../middleware/auth.js';
import {rateLimitMiddleware} from '../middleware/rateLimiter.js';
import {db} from '../db/pool.js';
import type {AppEnv} from '../lib/types.js';
import {chunkToSpeech, splitIntoSentences} from '../services/tts.js';
import {sendToOpenClaw, streamFromOpenClaw} from '../services/openclawClient.js';
import {checkLimit, incrementUsage} from '../services/usage.js';
import {agentExists, createAgent, resumeAgent} from '../services/agentManager.js';
import {cacheRecentMessages, getCachedRecentMessages} from '../db/redis.js';

// Parse action markers from agent response text
// Format: <!--action:TYPE|PARAM1|PARAM2|...-->
interface ParsedAction {
  type: string;
  params: string[];
}

function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  console.log('[parseActions] Raw text (last 200 chars):', text.slice(-200));
  const cleanText = text.replace(/<!--action:([^>]+)-->/g, (_match, content: string) => {
    console.log('[parseActions] Found marker:', content);
    const parts = content.split('|');
    const type = parts[0];
    const params = parts.slice(1);
    if (type) {
      actions.push({ type, params });
    }
    return '';
  }).trim();

  console.log('[parseActions] Actions found:', actions.length, actions.length > 0 ? JSON.stringify(actions) : '(none)');
  return { cleanText, actions };
}

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

  // Parse and strip action markers
  const { cleanText, actions } = parseActions(response);

  // Increment usage
  await incrementUsage(userId, 'text_messages', 1);

  // Update last_active_at
  await db.query(
    `UPDATE assistants SET last_active_at = NOW(), message_count = message_count + 1
     WHERE agent_id = $1`,
    [agentId],
  );

  // Write-through: append to Redis recent messages cache (clean text)
  const cached = await getCachedRecentMessages(userId) || [];
  cached.push(
    {id: Date.now().toString(), role: 'user', content: text},
    {id: (Date.now() + 1).toString(), role: 'assistant', content: cleanText},
  );
  cacheRecentMessages(userId, cached).catch(() => {});

  const limits = c.get('limits');
  const usage = c.get('usage');

  return c.json({
    response: cleanText,
    actions,
    usage: {
      messagesUsed: usage.text_messages + 1,
      messagesLimit: limits.daily_text_messages,
    },
  });
});

// Streaming voice endpoint — SSE with text + audio chunks
agentRoutes.post('/voice', rateLimitMiddleware, async (c) => {
  const userId = c.get('userId');
  const {text, voice, nativeTts = false, recordingDuration = 0} = await c.req.json();

  if (!text?.trim()) {
    return c.json({message: 'Message text is required'}, 400);
  }

  // Check daily message limit
  const canSend = await checkLimit(userId, 'text_messages');
  if (!canSend) {
    return c.json({message: 'Daily message limit reached. Upgrade your plan.'}, 429);
  }

  // Check daily voice limit
  const canVoice = await checkLimit(userId, 'voice_seconds');
  if (!canVoice) {
    return c.json({message: 'Daily voice limit reached. Upgrade your plan.'}, 429);
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
          const results = await Promise.allSettled(
            batch.map(item =>
              chunkToSpeech(item.sentence, ttsVoice)
                .then(audio => ({audio, index: item.index})),
            ),
          );
          for (const result of results) {
            if (result.status === 'fulfilled') {
              await stream.writeSSE({
                data: JSON.stringify({type: 'audio', data: result.value.audio, index: result.value.index}),
                event: 'chunk',
              });
            } else {
              console.error('[TTS] chunk failed:', result.reason?.message || result.reason);
            }
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

      // Parse action markers from the full agent response
      console.log('[Voice] Full agent response length:', fullText.length);
      const { cleanText, actions } = parseActions(fullText);

      // Send action events to the client before 'done'
      console.log('[Voice] Sending', actions.length, 'action events to client');
      for (const action of actions) {
        console.log('[Voice] Sending action SSE:', JSON.stringify(action));
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'action',
            action: action.type,
            params: action.params,
          }),
          event: 'chunk',
        });
      }

      // Increment usage
      await incrementUsage(userId, 'text_messages', 1);

      // Track voice seconds using cleanText (without markers)
      const inputSec = Math.max(0, Math.ceil(Number(recordingDuration) || 0));
      const wordCount = cleanText.trim().split(/\s+/).length;
      const replySec = Math.ceil(wordCount / 2.5);
      const totalVoiceSec = inputSec + replySec;
      if (totalVoiceSec > 0) {
        await incrementUsage(userId, 'voice_seconds', totalVoiceSec);
        console.log(`[Voice] userId=${userId} input=${inputSec}s reply=${replySec}s (${wordCount} words) total=${totalVoiceSec}s`);
      }

      // Update assistant activity
      await db.query(
        `UPDATE assistants SET last_active_at = NOW(), message_count = message_count + 1
         WHERE agent_id = $1`,
        [agentId],
      );

      // Write-through: append clean text to Redis cache
      const cached = await getCachedRecentMessages(userId) || [];
      cached.push(
        {id: Date.now().toString(), role: 'user', content: text, isVoice: true},
        {id: (Date.now() + 1).toString(), role: 'assistant', content: cleanText, isVoice: true},
      );
      cacheRecentMessages(userId, cached).catch(() => {});

      const limits = c.get('limits');
      const usage = c.get('usage');

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          usage: {
            messagesUsed: usage.text_messages + 1,
            messagesLimit: limits.daily_text_messages,
            voiceSecondsUsed: usage.voice_input_seconds + totalVoiceSec,
          },
          fullText: cleanText,
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

// POST /agent/provision — Create or repair agent if missing
// Called automatically by mobile app if agent status shows issues
agentRoutes.post('/provision', async c => {
  const userId = c.get('userId');

  // Check if user has an assistant record
  const assistantResult = await db.query(
    `SELECT agent_id, status FROM assistants WHERE user_id = $1 LIMIT 1`,
    [userId],
  );

  let agentId: string;

  if (!assistantResult.rows[0]) {
    // No assistant record — create from scratch
    agentId = `agent-${userId}`;
    try {
      await createAgent(agentId);
      await db.query(
        `INSERT INTO assistants (user_id, agent_id, display_name, voice)
         VALUES ($1, $2, $3, $4)`,
        [userId, agentId, 'My Assistant', 'nova'],
      );
      console.log(`[Provision] Created new agent for user ${userId}`);
      return c.json({status: 'created', agentId});
    } catch (err: any) {
      console.error(`[Provision] Failed to create agent:`, err.message);
      return c.json({status: 'error', message: err.message}, 500);
    }
  }

  agentId = assistantResult.rows[0].agent_id;
  const status = assistantResult.rows[0].status;

  // Check if agent exists in gateway config
  const exists = agentExists(agentId);

  if (exists && status === 'active') {
    return c.json({status: 'ok', agentId, message: 'Agent already running'});
  }

  if (!exists || status === 'paused') {
    // Agent missing from config or paused — resume it
    try {
      await resumeAgent(agentId);
      await db.query(
        `UPDATE assistants SET status = 'active' WHERE agent_id = $1`,
        [agentId],
      );
      console.log(`[Provision] Resumed agent ${agentId}`);
      return c.json({status: 'resumed', agentId});
    } catch (err: any) {
      // Workspace might be missing — recreate
      try {
        await createAgent(agentId);
        await db.query(
          `UPDATE assistants SET status = 'active' WHERE agent_id = $1`,
          [agentId],
        );
        console.log(`[Provision] Recreated agent ${agentId}`);
        return c.json({status: 'recreated', agentId});
      } catch (createErr: any) {
        console.error(`[Provision] Failed to recreate agent:`, createErr.message);
        return c.json({status: 'error', message: createErr.message}, 500);
      }
    }
  }

  return c.json({status: 'ok', agentId});
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
