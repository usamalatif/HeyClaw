import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {transcribeAudio} from '../services/whisper.js';
import type {AppEnv} from '../lib/types.js';

export const voiceRoutes = new Hono<AppEnv>();

voiceRoutes.use('*', authMiddleware);

voiceRoutes.post('/transcribe', async c => {
  const formData = await c.req.formData();
  const audioFile = formData.get('audio');

  if (!audioFile || !(audioFile instanceof File)) {
    return c.json({message: 'No audio file provided'}, 400);
  }

  const transcription = await transcribeAudio(audioFile);
  return c.json({text: transcription});
});

voiceRoutes.post('/speak', async c => {
  // TTS is handled client-side with iOS AVSpeechSynthesizer for free tier
  // This endpoint is for future premium TTS via OpenAI
  const {text} = await c.req.json();
  return c.json({message: 'TTS handled client-side for v1', text});
});
