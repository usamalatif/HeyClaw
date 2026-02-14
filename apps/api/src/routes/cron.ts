/**
 * Cron endpoints - Protected by CRON_SECRET
 * Called by external scheduler (GitHub Actions, Fly.io scheduler, etc.)
 */

import {Hono} from 'hono';
import {reapInactiveAgents} from '../services/agentReaper.js';
import {checkGatewayHealth} from '../services/openclawClient.js';

const CRON_SECRET = () => process.env.CRON_SECRET || '';

export const cronRoutes = new Hono();

// Middleware: verify cron secret
cronRoutes.use('*', async (c, next) => {
  const secret = CRON_SECRET();
  if (!secret) {
    return c.json({error: 'CRON_SECRET not configured'}, 500);
  }

  const authHeader = c.req.header('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (providedSecret !== secret) {
    return c.json({error: 'Unauthorized'}, 401);
  }

  await next();
});

// POST /cron/reap — Pause inactive agents
cronRoutes.post('/reap', async c => {
  try {
    const result = await reapInactiveAgents();
    return c.json({
      status: 'ok',
      paused: result.paused.length,
      errors: result.errors.length,
      details: result,
    });
  } catch (err: any) {
    console.error('[Cron] Reap failed:', err);
    return c.json({status: 'error', message: err.message}, 500);
  }
});

// GET /cron/health — Full system health check
cronRoutes.get('/health', async c => {
  const checks: Record<string, boolean> = {};

  // Check gateway
  checks.gateway = await checkGatewayHealth();

  // Could add more checks here (DB, Redis, etc.)

  const healthy = Object.values(checks).every(Boolean);

  return c.json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});
