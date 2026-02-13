import {createMiddleware} from 'hono/factory';
import {redis} from '../db/redis.js';
import {db} from '../db/pool.js';
import type {AppEnv, PlanLimits} from '../lib/types.js';

const DEFAULT_LIMITS: PlanLimits = {
  plan: 'free',
  display_name: 'Free',
  max_assistants: 1,
  daily_text_messages: 50,
  daily_voice_input_minutes: 2,
  daily_voice_output_minutes: 2,
  daily_tts_characters: 5000,
  model: 'openai-custom/gpt-5-nano',
  tts_model: 'tts-1',
  tts_voice_options: ['nova', 'alloy'],
  price_monthly_usd: 0,
  price_yearly_usd: 0,
};

export const rateLimitMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get('userId');
  const today = new Date().toISOString().split('T')[0];

  // Get plan limits (cached in Redis for 5 min)
  let planData = await redis.get(`plan:${userId}`);
  if (!planData) {
    const result = await db.query(
      `SELECT pl.* FROM subscriptions s
       JOIN plan_limits pl ON s.plan = pl.plan
       WHERE s.user_id = $1 AND s.status = 'active'`,
      [userId],
    );
    const limits = result.rows[0] || DEFAULT_LIMITS;
    planData = JSON.stringify(limits);
    await redis.set(`plan:${userId}`, planData, 'EX', 300);
  }

  const limits: PlanLimits = JSON.parse(planData);

  const textCount = parseInt(await redis.get(`ratelimit:${userId}:${today}:text_messages`) || '0');
  const voiceSeconds = parseFloat(await redis.get(`ratelimit:${userId}:${today}:voice_seconds`) || '0');
  const ttsChars = parseInt(await redis.get(`ratelimit:${userId}:${today}:tts_chars`) || '0');

  c.set('usage', {
    text_messages: textCount,
    voice_input_seconds: voiceSeconds,
    tts_characters: ttsChars,
  });
  c.set('limits', limits);

  c.header('X-RateLimit-Plan', limits.plan);
  c.header('X-RateLimit-Text-Remaining', String(Math.max(0, limits.daily_text_messages - textCount)));
  c.header('X-RateLimit-Voice-Remaining', String(Math.max(0, limits.daily_voice_input_minutes * 60 - voiceSeconds)));

  await next();
});
