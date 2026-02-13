import {Hono} from 'hono';
import fs from 'fs';
import path from 'path';
import {authMiddleware} from '../middleware/auth.js';
import {db} from '../db/pool.js';
import type {AppEnv} from '../lib/types.js';

export const automationRoutes = new Hono<AppEnv>();

automationRoutes.use('*', authMiddleware);

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG_PATH || '/home/appuser/.openclaw/openclaw.json';
const WORKSPACES_DIR = path.join(path.dirname(OPENCLAW_CONFIG), 'workspaces');

// Look up the user's agent_id from the assistants table
async function getAgentId(userId: string): Promise<string | null> {
  const result = await db.query(
    `SELECT agent_id FROM assistants WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.agent_id || null;
}

// Read cron jobs.json from the agent's workspace on the local filesystem
function readCronJobs(agentId: string): any[] {
  try {
    const jobsPath = path.join(WORKSPACES_DIR, agentId, 'cron', 'jobs.json');
    if (!fs.existsSync(jobsPath)) return [];
    const raw = fs.readFileSync(jobsPath, 'utf-8');
    if (!raw.trim()) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.jobs || []);
  } catch {
    return [];
  }
}

// Read cron run history for a specific job from the workspace filesystem
function readCronRuns(agentId: string, jobId: string, limit = 20): any[] {
  try {
    const runsPath = path.join(WORKSPACES_DIR, agentId, 'cron', 'runs', `${jobId}.jsonl`);
    if (!fs.existsSync(runsPath)) return [];
    const raw = fs.readFileSync(runsPath, 'utf-8');
    if (!raw.trim()) return [];
    const lines = raw.trim().split('\n').filter(line => line.trim());
    // Take the last `limit` lines
    return lines.slice(-limit)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// List cron run files (job IDs that have run history)
function listCronRunFiles(agentId: string): string[] {
  try {
    const runsDir = path.join(WORKSPACES_DIR, agentId, 'cron', 'runs');
    if (!fs.existsSync(runsDir)) return [];
    return fs.readdirSync(runsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => f.replace('.jsonl', ''));
  } catch {
    return [];
  }
}

// GET /automation/jobs — List all cron jobs configured in the user's agent
automationRoutes.get('/jobs', async c => {
  const userId = c.get('userId');
  const agentId = await getAgentId(userId);

  if (!agentId) {
    return c.json({jobs: [], message: 'No agent provisioned'});
  }

  const jobs = readCronJobs(agentId);
  return c.json({jobs});
});

// GET /automation/runs — Get recent cron runs across all jobs
automationRoutes.get('/runs', async c => {
  const userId = c.get('userId');
  const limit = Number(c.req.query('limit')) || 20;
  const agentId = await getAgentId(userId);

  if (!agentId) {
    return c.json({runs: []});
  }

  const jobIds = listCronRunFiles(agentId);
  const jobs = readCronJobs(agentId);
  const jobNameMap = new Map(jobs.map((j: any) => [j.id, j.name || j.id]));

  const allRuns: any[] = [];
  for (const jobId of jobIds) {
    const runs = readCronRuns(agentId, jobId, limit);
    for (const run of runs) {
      allRuns.push({
        ...run,
        jobId,
        jobName: jobNameMap.get(jobId) || jobId,
      });
    }
  }

  allRuns.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return c.json({runs: allRuns.slice(0, limit)});
});

// POST /automation/check — Check for new unseen cron runs, store in DB, return unseen
automationRoutes.post('/check', async c => {
  const userId = c.get('userId');
  const agentId = await getAgentId(userId);

  if (!agentId) {
    return c.json({newResults: []});
  }

  // Get assistant display name
  const assistantResult = await db.query(
    `SELECT display_name FROM assistants WHERE agent_id = $1`,
    [agentId],
  );
  const agentName = assistantResult.rows[0]?.display_name || 'HeyClaw';

  // Get the latest check timestamp from DB
  const lastResult = await db.query(
    `SELECT run_at FROM automation_results
     WHERE user_id = $1
     ORDER BY run_at DESC LIMIT 1`,
    [userId],
  );

  const lastCheckTime = lastResult.rows[0]?.run_at
    ? new Date(lastResult.rows[0].run_at).getTime()
    : 0;

  const jobIds = listCronRunFiles(agentId);
  const jobs = readCronJobs(agentId);
  const jobNameMap = new Map(jobs.map((j: any) => [j.id, j.name || j.id]));

  const newResults: any[] = [];

  for (const jobId of jobIds) {
    const runs = readCronRuns(agentId, jobId, 50);
    for (const run of runs) {
      const runTime = run.ts || 0;
      if (runTime > lastCheckTime && run.summary) {
        newResults.push({
          userId,
          jobId: run.jobId || jobId,
          jobName: jobNameMap.get(run.jobId || jobId) || run.jobId || jobId,
          result: run.summary,
          runAt: new Date(runTime).toISOString(),
        });
      }
    }
  }

  // Store new results in PostgreSQL
  if (newResults.length > 0) {
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const r of newResults) {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, false)`);
      values.push(r.userId, r.jobId, r.jobName, r.result, r.runAt);
    }

    await db.query(
      `INSERT INTO automation_results (user_id, job_id, job_name, result, run_at, seen)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  return c.json({newResults, agentName});
});

// GET /automation/unseen — Get unseen results from DB (no filesystem access needed)
automationRoutes.get('/unseen', async c => {
  const userId = c.get('userId');

  const result = await db.query(
    `SELECT * FROM automation_results
     WHERE user_id = $1 AND seen = false
     ORDER BY run_at DESC LIMIT 50`,
    [userId],
  );

  return c.json({results: result.rows});
});

// POST /automation/mark-seen — Mark results as seen
automationRoutes.post('/mark-seen', async c => {
  const userId = c.get('userId');
  const {ids} = await c.req.json();

  if (ids && Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map((_: any, i: number) => `$${i + 2}`).join(', ');
    await db.query(
      `UPDATE automation_results SET seen = true
       WHERE user_id = $1 AND id IN (${placeholders})`,
      [userId, ...ids],
    );
  } else {
    await db.query(
      `UPDATE automation_results SET seen = true
       WHERE user_id = $1 AND seen = false`,
      [userId],
    );
  }

  return c.json({message: 'Marked as seen'});
});
