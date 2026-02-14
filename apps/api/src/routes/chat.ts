import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {db} from '../db/pool.js';
import {getCachedRecentMessages, cacheRecentMessages, clearRecentMessages} from '../db/redis.js';
import type {AppEnv} from '../lib/types.js';

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.use('*', authMiddleware);

// Fast endpoint — last 10 messages from Redis, DB fallback
chatRoutes.get('/recent', async c => {
  const userId = c.get('userId');

  // Try Redis first
  const cached = await getCachedRecentMessages(userId);
  if (cached) {
    return c.json({messages: cached, source: 'cache'});
  }

  // Fallback: load latest session from DB
  const result = await db.query(
    `SELECT id, messages FROM chat_sessions
     WHERE user_id = $1
     ORDER BY updated_at DESC LIMIT 1`,
    [userId],
  );

  if (!result.rows[0] || !result.rows[0].messages?.length) {
    return c.json({messages: [], source: 'db'});
  }

  const messages = result.rows[0].messages.slice(-10);

  // Warm the cache for next time
  cacheRecentMessages(userId, messages).catch(() => {});

  return c.json({messages, sessionId: result.rows[0].id, source: 'db'});
});

chatRoutes.get('/sessions', async c => {
  const userId = c.get('userId');

  const result = await db.query(
    `SELECT id, title, created_at, updated_at
     FROM chat_sessions
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );

  return c.json(result.rows);
});

chatRoutes.get('/sessions/:id', async c => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const result = await db.query(
    `SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );

  if (!result.rows[0]) {
    return c.json({message: 'Session not found'}, 404);
  }

  return c.json(result.rows[0]);
});

chatRoutes.post('/sessions', async c => {
  const userId = c.get('userId');

  const result = await db.query(
    `INSERT INTO chat_sessions (user_id, title, messages)
     VALUES ($1, 'New Chat', '[]'::jsonb)
     RETURNING *`,
    [userId],
  );

  return c.json(result.rows[0]);
});

chatRoutes.put('/sessions/:id', async c => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const {messages, title} = await c.req.json();

  const setClauses: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let paramIndex = 1;

  if (messages !== undefined) {
    setClauses.push(`messages = $${paramIndex++}`);
    values.push(JSON.stringify(messages));
  }
  if (title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(title);
  }

  values.push(sessionId, userId);
  const result = await db.query(
    `UPDATE chat_sessions SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
     RETURNING *`,
    values,
  );

  if (!result.rows[0]) {
    return c.json({message: 'Session not found'}, 404);
  }

  // Write-through: update Redis cache with latest messages
  if (messages !== undefined) {
    cacheRecentMessages(userId, messages).catch(() => {});
  }

  return c.json(result.rows[0]);
});

chatRoutes.delete('/sessions/:id', async c => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const result = await db.query(
    `DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );

  if (result.rowCount === 0) {
    return c.json({message: 'Session not found'}, 404);
  }

  clearRecentMessages(userId).catch(() => {});

  return c.json({message: 'Session deleted'});
});
