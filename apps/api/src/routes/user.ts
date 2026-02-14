import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {db} from '../db/pool.js';
import {getTodayUsage} from '../services/usage.js';
import {removeAgent} from '../services/agentManager.js';
import type {AppEnv} from '../lib/types.js';

export const userRoutes = new Hono<AppEnv>();

userRoutes.use('*', authMiddleware);

userRoutes.get('/me', async c => {
  const userId = c.get('userId');

  const result = await db.query(
    `SELECT
       u.id, u.email, u.name, u.avatar_url, u.created_at,
       s.plan, s.status AS subscription_status, s.subscription_ends_at,
       pl.daily_text_messages, pl.daily_voice_input_minutes, pl.daily_tts_characters,
       a.agent_id, a.display_name AS agent_name, a.voice, a.message_count
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
     LEFT JOIN plan_limits pl ON pl.plan = s.plan
     LEFT JOIN assistants a ON a.user_id = u.id AND a.status = 'active'
     WHERE u.id = $1`,
    [userId],
  );

  if (!result.rows[0]) {
    return c.json({message: 'User not found'}, 404);
  }

  const row = result.rows[0];
  const usage = await getTodayUsage(userId);

  return c.json({
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    plan: row.plan || 'free',
    subscriptionStatus: row.subscription_status || 'active',
    subscriptionEndsAt: row.subscription_ends_at,
    agent: row.agent_id
      ? {
          agentId: row.agent_id,
          displayName: row.agent_name,
          voice: row.voice,
          messageCount: row.message_count,
        }
      : null,
    usage: {
      textMessages: usage.text_messages,
      voiceSeconds: usage.voice_seconds,
      ttsCharacters: usage.tts_characters,
    },
    limits: {
      dailyTextMessages: row.daily_text_messages || 50,
      dailyVoiceInputMinutes: row.daily_voice_input_minutes || 5,
      dailyTtsCharacters: row.daily_tts_characters || 5000,
    },
  });
});

userRoutes.patch('/me', async c => {
  const userId = c.get('userId');
  const updates = await c.req.json();

  const allowed = ['name', 'avatar_url'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k)),
  );

  if (Object.keys(filtered).length === 0) {
    return c.json({message: 'No valid fields to update'}, 400);
  }

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(filtered)) {
    setClauses.push(`${key} = $${paramIndex++}`);
    values.push(value);
  }

  values.push(userId);
  const result = await db.query(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING id, email, name, avatar_url, updated_at`,
    values,
  );

  if (!result.rows[0]) {
    return c.json({message: 'User not found'}, 404);
  }

  return c.json(result.rows[0]);
});

userRoutes.get('/usage', async c => {
  const userId = c.get('userId');

  const planResult = await db.query(
    `SELECT pl.*
     FROM subscriptions s
     JOIN plan_limits pl ON pl.plan = s.plan
     WHERE s.user_id = $1 AND s.status = 'active'`,
    [userId],
  );

  const limits = planResult.rows[0] || {
    plan: 'free',
    daily_text_messages: 50,
    daily_voice_input_minutes: 5,
    daily_tts_characters: 5000,
  };

  const usage = await getTodayUsage(userId);

  return c.json({
    plan: limits.plan,
    usage: {
      textMessages: usage.text_messages,
      voiceSeconds: usage.voice_seconds,
      ttsCharacters: usage.tts_characters,
    },
    limits: {
      dailyTextMessages: limits.daily_text_messages,
      dailyVoiceInputMinutes: limits.daily_voice_input_minutes,
      dailyTtsCharacters: limits.daily_tts_characters,
    },
  });
});

// DELETE /user/me — permanently delete account + agent
userRoutes.delete('/me', async c => {
  const userId = c.get('userId');

  // Find the user's agent
  const agentResult = await db.query(
    'SELECT agent_id FROM assistants WHERE user_id = $1',
    [userId],
  );

  // Remove OpenClaw agent from gateway config + workspace
  for (const row of agentResult.rows) {
    try {
      await removeAgent(row.agent_id);
    } catch (err: any) {
      console.error(`Failed to remove agent ${row.agent_id}:`, err.message);
    }
  }

  // Delete user (CASCADE removes subscriptions, assistants, tokens, usage, sessions)
  await db.query('DELETE FROM users WHERE id = $1', [userId]);

  console.log(`User deleted: ${userId}`);
  return c.json({message: 'Account deleted'});
});
