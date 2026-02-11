import {Hono} from 'hono';
import {streamSSE} from 'hono/streaming';
import {authMiddleware} from '../middleware/auth.js';
import {supabase} from '../lib/supabase.js';
import type {AppEnv} from '../lib/types.js';
import type {ModelTier} from '@heyclaw/shared';
import {chunkToSpeech, splitIntoSentences} from '../services/tts.js';
import {createAgentContainer, startAgentContainer, getAgentStatus as getDockerAgentStatus} from '../services/dockerProvisioner.js';
import {chatCompletion, streamChatCompletion} from '../services/chat.js';
import {sendToOpenClaw, streamFromOpenClaw} from '../services/openclawClient.js';

const IS_DEV = !process.env.DOCKER_PROVISIONING || process.env.DOCKER_PROVISIONING !== 'true';

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

  // Check user credits and agent info
  const {data: user, error: userError} = await supabase
    .from('users')
    .select('credits_remaining, agent_personality, agent_machine_id')
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

  // Route to OpenClaw instance if available, otherwise fallback to direct OpenAI
  let response: string;
  const hasRealMachine = user.agent_machine_id && !user.agent_machine_id.startsWith('dev-');

  if (hasRealMachine) {
    response = await sendToOpenClaw(
      userId,
      [{role: 'user', content: text}],
    );
  } else {
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

  // Log usage
  await supabase.from('usage_logs').insert({
    user_id: userId,
    type: 'agent_message',
    model_tier: modelTier,
    credits_used: creditCost,
  });

  return c.json({response, creditsUsed: creditCost, creditsRemaining: newCredits});
});

// Streaming voice endpoint — SSE with text + audio chunks
// Flow: agent streams text -> sentences split -> each sentence TTS'd -> audio base64 sent
//
// SSE events:
//   { type: "text",  data: "sentence", index: 0 }       — display text
//   { type: "audio", data: "base64mp3...", index: 0 }    — play audio chunk
//   { type: "done",  creditsUsed, creditsRemaining, fullText }
//   { type: "error", message: "..." }
agentRoutes.post('/voice', async (c) => {
  const userId = c.get('userId');
  const {text, modelTier = 'standard', voice} = await c.req.json();

  if (!text?.trim()) {
    return c.json({message: 'Message text is required'}, 400);
  }

  const creditCost = CREDIT_COSTS[modelTier as ModelTier];
  if (!creditCost) {
    return c.json({message: 'Invalid model tier'}, 400);
  }

  const {data: user, error: userError} = await supabase
    .from('users')
    .select('credits_remaining, agent_personality, tts_voice, agent_machine_id')
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
      // Stream OpenAI response, accumulate into sentences, TTS each sentence
      let buffer = '';
      let sentenceIndex = 0;
      let fullText = '';

      const flushSentences = async (force: boolean) => {
        const sentences = force
          ? (buffer.trim() ? [buffer.trim()] : [])
          : splitIntoSentences(buffer);

        // Keep the last partial sentence in the buffer (unless forcing)
        if (!force && sentences.length > 0) {
          // Check if buffer ends with sentence-ending punctuation
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
          // Send text chunk immediately
          await stream.writeSSE({
            data: JSON.stringify({type: 'text', data: sentence, index: sentenceIndex}),
            event: 'chunk',
          });

          // Convert to speech and send audio
          const audioBase64 = await chunkToSpeech(sentence, ttsVoice);
          await stream.writeSSE({
            data: JSON.stringify({type: 'audio', data: audioBase64, index: sentenceIndex}),
            event: 'chunk',
          });

          sentenceIndex++;
        }
      };

      // Stream from OpenClaw instance or fallback to direct OpenAI
      const hasRealMachine = user.agent_machine_id && !user.agent_machine_id.startsWith('dev-');
      const textStream = hasRealMachine
        ? streamFromOpenClaw(userId, [{role: 'user', content: text}])
        : streamChatCompletion([{role: 'user', content: text}], modelTier as ModelTier, user.agent_personality);

      for await (const chunk of textStream) {
        buffer += chunk;
        fullText += chunk;

        // Try to flush complete sentences as they accumulate
        if (/[.!?]\s/.test(buffer)) {
          await flushSentences(false);
        }
      }

      // Flush any remaining text
      await flushSentences(true);

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
// Called automatically when user first signs up / enters provisioning screen
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
  if (user.agent_machine_id && user.agent_status !== 'error') {
    // If sleeping/stopped, wake it up
    if (user.agent_status === 'sleeping' && !IS_DEV) {
      await startAgentContainer(user.agent_machine_id);
      await supabase
        .from('users')
        .update({agent_status: 'running'})
        .eq('id', userId);
    }
    return c.json({
      agentStatus: user.agent_status === 'sleeping' ? 'running' : user.agent_status,
      machineId: user.agent_machine_id,
    });
  }

  // Set status to provisioning
  await supabase
    .from('users')
    .update({agent_status: 'provisioning'})
    .eq('id', userId);

  if (IS_DEV) {
    // Dev mode: simulate provisioning with a short delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    await supabase
      .from('users')
      .update({
        agent_status: 'running',
        agent_machine_id: `dev-machine-${userId.slice(0, 8)}`,
      })
      .eq('id', userId);

    return c.json({
      agentStatus: 'running',
      machineId: `dev-machine-${userId.slice(0, 8)}`,
    });
  }

  // Production: Create Docker container with OpenClaw
  try {
    const containerId = await createAgentContainer(userId);

    await supabase
      .from('users')
      .update({
        agent_machine_id: containerId,
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

  if (!IS_DEV) {
    await startAgentContainer(user.agent_machine_id);
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
