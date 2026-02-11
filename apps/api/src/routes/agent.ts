import {Hono} from 'hono';
import {streamSSE} from 'hono/streaming';
import {authMiddleware} from '../middleware/auth.js';
import {supabase} from '../lib/supabase.js';
import type {AppEnv} from '../lib/types.js';
import type {ModelTier} from '@heyclaw/shared';
import {chunkToSpeech, splitIntoSentences} from '../services/tts.js';
import {createAgentContainer, startAgentContainer} from '../services/dockerProvisioner.js';
import {chatCompletion, streamChatCompletion} from '../services/chat.js';
import {sendToOpenClaw, streamFromOpenClaw} from '../services/openclawClient.js';

const CREDIT_COSTS: Record<ModelTier, number> = {
  standard: 10,
  power: 30,
  best: 100,
};

export const agentRoutes = new Hono<AppEnv>();

agentRoutes.use('*', authMiddleware);

agentRoutes.post('/message', async c => {
  const userId = c.get('userId');
  const {text, modelTier = 'standard'} = await c.req.json();

  if (!text?.trim()) {
    return c.json({message: 'Message text is required'}, 400);
  }

  const creditCost = CREDIT_COSTS[modelTier as ModelTier];
  if (!creditCost) {
    return c.json({message: 'Invalid model tier'}, 400);
  }

  const {data: user, error: userError} = await supabase
    .from('users')
    .select('credits_remaining, agent_personality, agent_machine_id, agent_gateway_token')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    return c.json({message: 'User not found'}, 404);
  }

  if (user.credits_remaining < creditCost) {
    return c.json(
      {message: 'Insufficient credits', creditsNeeded: creditCost, creditsRemaining: user.credits_remaining},
      402,
    );
  }

  // Route to OpenClaw instance, fallback to direct API
  let response: string;
  try {
    response = await sendToOpenClaw(
      userId,
      [{role: 'user', content: text}],
      user.agent_gateway_token,
    );
  } catch {
    // OpenClaw unavailable — fallback to direct API
    response = await chatCompletion(
      [{role: 'user', content: text}],
      modelTier as ModelTier,
      user.agent_personality,
    );
  }

  // Deduct credits
  const newCredits = user.credits_remaining - creditCost;
  await supabase
    .from('users')
    .update({credits_remaining: newCredits})
    .eq('id', userId);

  await supabase.from('usage_logs').insert({
    user_id: userId,
    type: 'agent_message',
    model_tier: modelTier,
    credits_used: creditCost,
  });

  return c.json({response, creditsUsed: creditCost, creditsRemaining: newCredits});
});

// Streaming voice endpoint — SSE with text + audio chunks
agentRoutes.post('/voice', async (c) => {
  const userId = c.get('userId');
  const {text, modelTier = 'standard', voice, nativeTts = false} = await c.req.json();

  if (!text?.trim()) {
    return c.json({message: 'Message text is required'}, 400);
  }

  const creditCost = CREDIT_COSTS[modelTier as ModelTier];
  if (!creditCost) {
    return c.json({message: 'Invalid model tier'}, 400);
  }

  const {data: user, error: userError} = await supabase
    .from('users')
    .select('credits_remaining, agent_personality, tts_voice, agent_gateway_token')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    return c.json({message: 'User not found'}, 404);
  }

  if (user.credits_remaining < creditCost) {
    return c.json(
      {message: 'Insufficient credits', creditsNeeded: creditCost, creditsRemaining: user.credits_remaining},
      402,
    );
  }

  const VALID_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
  const rawVoice = voice || user.tts_voice;
  const ttsVoice = VALID_VOICES.includes(rawVoice) ? rawVoice : 'alloy';

  return streamSSE(c, async (stream) => {
    try {
      let buffer = '';
      let sentenceIndex = 0;
      let fullText = '';

      // TTS runs as a background pipeline — doesn't block text streaming
      const ttsQueue: {sentence: string; index: number}[] = [];
      let ttsRunning = false;
      let ttsFinishResolve: (() => void) | null = null;

      const processTTSQueue = async () => {
        ttsRunning = true;
        while (ttsQueue.length > 0) {
          // Process up to 3 TTS requests in parallel for speed
          const batch = ttsQueue.splice(0, Math.min(3, ttsQueue.length));
          const results = await Promise.all(
            batch.map(item =>
              chunkToSpeech(item.sentence, ttsVoice)
                .then(audio => ({audio, index: item.index}))
            ),
          );
          // Send in original order
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

      // Stream text tokens to client immediately for instant display
      const sendToken = async (token: string) => {
        await stream.writeSSE({
          data: JSON.stringify({type: 'token', data: token}),
          event: 'chunk',
        });
      };

      // Try OpenClaw streaming, fallback to direct API
      // Note: async generators are lazy — errors only surface during iteration
      let usedOpenClaw = false;
      try {
        const openclawStream = streamFromOpenClaw(userId, [{role: 'user', content: text}], user.agent_gateway_token);
        for await (const chunk of openclawStream) {
          usedOpenClaw = true;
          buffer += chunk;
          fullText += chunk;
          await sendToken(chunk);

          // Eager first flush: send first ~25 chars to TTS immediately
          // so audio starts generating while LLM is still streaming
          if (sentenceIndex === 0 && buffer.length > 25) {
            await flushSentences(true);
          } else if (/[.!?]\s/.test(buffer) || (buffer.length > 30 && /[,;:]\s/.test(buffer))) {
            await flushSentences(false);
          }
        }
      } catch {
        // OpenClaw failed — fallback to direct API (only if we haven't received any data)
        if (!usedOpenClaw) {
          const fallbackStream = streamChatCompletion([{role: 'user', content: text}], modelTier as ModelTier, user.agent_personality);
          for await (const chunk of fallbackStream) {
            buffer += chunk;
            fullText += chunk;
            await sendToken(chunk);

            if (sentenceIndex === 0 && buffer.length > 25) {
              await flushSentences(true);
            } else if (/[.!?]\s/.test(buffer) || (buffer.length > 30 && /[,;:]\s/.test(buffer))) {
              await flushSentences(false);
            }
          }
        }
      }

      await flushSentences(true);

      // Wait for all TTS audio chunks to finish (skip if native TTS)
      if (!nativeTts) {
        await waitForTTS();
      }

      const newCredits = user.credits_remaining - creditCost;
      await supabase
        .from('users')
        .update({credits_remaining: newCredits})
        .eq('id', userId);

      await supabase.from('usage_logs').insert({
        user_id: userId,
        type: 'agent_message',
        model_tier: modelTier,
        credits_used: creditCost,
      });

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          creditsUsed: creditCost,
          creditsRemaining: newCredits,
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

// Provision a new OpenClaw agent instance for the user
agentRoutes.post('/provision', async c => {
  const userId = c.get('userId');

  const {data: user, error} = await supabase
    .from('users')
    .select('agent_machine_id, agent_status')
    .eq('id', userId)
    .single();

  if (error || !user) {
    return c.json({message: 'User not found'}, 404);
  }

  // Already provisioned
  if (user.agent_machine_id && user.agent_status === 'running') {
    return c.json({agentStatus: 'running', machineId: user.agent_machine_id});
  }

  // If sleeping, wake it
  if (user.agent_machine_id && user.agent_status === 'sleeping') {
    try {
      await startAgentContainer(user.agent_machine_id);
      await supabase
        .from('users')
        .update({agent_status: 'running'})
        .eq('id', userId);
      return c.json({agentStatus: 'running', machineId: user.agent_machine_id});
    } catch {
      // Container gone — re-provision below
    }
  }

  // Set status to provisioning
  await supabase
    .from('users')
    .update({agent_status: 'provisioning'})
    .eq('id', userId);

  try {
    const {containerId, gatewayToken} = await createAgentContainer(userId);

    await supabase
      .from('users')
      .update({
        agent_machine_id: containerId,
        agent_gateway_token: gatewayToken,
        agent_status: 'running',
      })
      .eq('id', userId);

    return c.json({agentStatus: 'running', machineId: containerId});
  } catch (err: any) {
    console.error('Failed to provision agent:', err.message);
    await supabase
      .from('users')
      .update({agent_status: 'error'})
      .eq('id', userId);

    return c.json({message: 'Failed to provision agent', error: err.message}, 500);
  }
});

agentRoutes.get('/status', async c => {
  const userId = c.get('userId');

  const {data, error} = await supabase
    .from('users')
    .select('agent_machine_id, agent_status')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return c.json({message: 'User not found'}, 404);
  }

  return c.json({agentStatus: data.agent_status, machineId: data.agent_machine_id});
});

agentRoutes.post('/wake', async c => {
  const userId = c.get('userId');

  const {data: user} = await supabase
    .from('users')
    .select('agent_machine_id, agent_status')
    .eq('id', userId)
    .single();

  if (!user?.agent_machine_id) {
    return c.json({message: 'No agent provisioned. Call /agent/provision first.'}, 400);
  }

  if (user.agent_status === 'running') {
    return c.json({message: 'Agent already running'});
  }

  try {
    await startAgentContainer(user.agent_machine_id);
  } catch {
    // Container might not exist anymore
  }

  await supabase
    .from('users')
    .update({agent_status: 'running'})
    .eq('id', userId);

  return c.json({message: 'Agent waking up'});
});

agentRoutes.patch('/personality', async c => {
  const userId = c.get('userId');
  const {personality} = await c.req.json();

  await supabase
    .from('users')
    .update({agent_personality: personality})
    .eq('id', userId);

  return c.json({message: 'Personality updated'});
});
