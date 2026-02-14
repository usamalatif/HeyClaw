import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {rateLimitMiddleware} from '../middleware/rateLimiter.js';
import {transcribeAudio} from '../services/whisper.js';
import {checkLimit, incrementUsage} from '../services/usage.js';
import type {AppEnv} from '../lib/types.js';

export const voiceRoutes = new Hono<AppEnv>();

voiceRoutes.use('*', authMiddleware);

voiceRoutes.post('/transcribe', rateLimitMiddleware, async c => {
  const userId = c.get('userId');

  const canSend = await checkLimit(userId, 'voice_seconds');
  if (!canSend) {
    return c.json({message: 'Daily voice limit reached. Upgrade your plan.'}, 429);
  }

  const formData = await c.req.formData();
  const audioFile = formData.get('audio');

  if (!audioFile || !(audioFile instanceof File)) {
    return c.json({message: 'No audio file provided'}, 400);
  }

  const {text, duration} = await transcribeAudio(audioFile);

  await incrementUsage(userId, 'voice_seconds', Math.ceil(duration));

  return c.json({text});
});

voiceRoutes.post('/speak', async c => {
  // TTS is handled client-side with iOS AVSpeechSynthesizer for free tier
  // This endpoint is for future premium TTS via OpenAI
  const {text} = await c.req.json();
  return c.json({message: 'TTS handled client-side for v1', text});
});
