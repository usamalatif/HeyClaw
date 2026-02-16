import {redis} from '../db/redis.js';
import {db} from '../db/pool.js';

export async function checkLimit(userId: string, type: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];

  let planData = await redis.get(`plan:${userId}`);
  if (!planData) {
    const result = await db.query(
      `SELECT pl.* FROM subscriptions s
       JOIN plan_limits pl ON s.plan = pl.plan
       WHERE s.user_id = $1 AND s.status = 'active'`,
      [userId],
    );
    if (!result.rows[0]) return false;
    planData = JSON.stringify(result.rows[0]);
    await redis.set(`plan:${userId}`, planData, 'EX', 300);
  }

  const limits = JSON.parse(planData);
  const current = parseFloat(await redis.get(`ratelimit:${userId}:${today}:${type}`) || '0');

  switch (type) {
    case 'text_messages':
      return current < limits.daily_text_messages;
    case 'voice_seconds':
      return current < (limits.daily_voice_input_minutes * 60);
    case 'tts_chars':
      return current < limits.daily_tts_characters;
    default:
      return true;
  }
}

export async function incrementUsage(userId: string, type: string, amount = 1): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = `ratelimit:${userId}:${today}:${type}`;

  const newVal = await redis.incrbyfloat(key, amount);
  const ttl = await redis.ttl(key);
  if (ttl === -1) {
    await redis.expire(key, 86400);
  }

  // Async sync to PostgreSQL
  syncToDB(userId, type, amount).catch(err =>
    console.error('[Usage] DB sync error:', err),
  );

  return parseFloat(String(newVal));
}

async function syncToDB(userId: string, type: string, amount: number): Promise<void> {
  const fieldMap: Record<string, string> = {
    text_messages: 'text_messages',
    voice_seconds: 'voice_input_seconds',
    tts_chars: 'tts_characters',
  };
  const field = fieldMap[type];
  if (field) {
    try {
      await db.query('SELECT increment_daily_usage($1, $2, $3)', [userId, field, amount]);
    } catch (err: any) {
      // FK violation = user doesn't exist in DB (deleted or failed creation)
      // Log but don't crash - usage is already tracked in Redis
      if (err.code === '23503') {
        console.warn(`[Usage] User ${userId} not found in DB, skipping sync`);
      } else {
        throw err;
      }
    }
  }
}

export async function getTodayUsage(userId: string) {
  const today = new Date().toISOString().split('T')[0];
  return {
    text_messages: parseInt(await redis.get(`ratelimit:${userId}:${today}:text_messages`) || '0'),
    voice_seconds: parseFloat(await redis.get(`ratelimit:${userId}:${today}:voice_seconds`) || '0'),
    tts_characters: parseInt(await redis.get(`ratelimit:${userId}:${today}:tts_chars`) || '0'),
  };
}

export async function logUsage(
  userId: string,
  assistantId: string | null,
  usageType: string,
  quantity: number,
  estimatedCost?: number,
  metadata?: Record<string, any>,
): Promise<void> {
  await db.query(
    `INSERT INTO usage_logs (user_id, assistant_id, usage_type, quantity, estimated_cost, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, assistantId, usageType, quantity, estimatedCost || null, metadata ? JSON.stringify(metadata) : null],
  );
}

export async function clearPlanCache(userId: string): Promise<void> {
  await redis.del(`plan:${userId}`);
}
