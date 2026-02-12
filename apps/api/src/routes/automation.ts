import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {supabase} from '../lib/supabase.js';
import type {AppEnv} from '../lib/types.js';
import {execInContainer, getAgentStatus} from '../services/dockerProvisioner.js';

export const automationRoutes = new Hono<AppEnv>();

automationRoutes.use('*', authMiddleware);

// Read cron jobs.json from the user's OpenClaw container
async function readCronJobs(containerId: string): Promise<any[]> {
  try {
    const raw = await execInContainer(containerId, [
      'cat', '/root/.openclaw/cron/jobs.json',
    ]);
    if (!raw.trim()) return [];
    const data = JSON.parse(raw);
    // jobs.json could be an array or an object with jobs array
    return Array.isArray(data) ? data : (data.jobs || []);
  } catch {
    return [];
  }
}

// Read cron run history for a specific job from the container
async function readCronRuns(containerId: string, jobId: string, limit = 20): Promise<any[]> {
  try {
    const raw = await execInContainer(containerId, [
      'sh', '-c', `tail -n ${limit} /root/.openclaw/cron/runs/${jobId}.jsonl 2>/dev/null || echo ""`,
    ]);
    if (!raw.trim()) return [];
    return raw.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// List all cron run files (job IDs that have run history)
async function listCronRunFiles(containerId: string): Promise<string[]> {
  try {
    const raw = await execInContainer(containerId, [
      'sh', '-c', 'ls /root/.openclaw/cron/runs/*.jsonl 2>/dev/null || echo ""',
    ]);
    if (!raw.trim()) return [];
    return raw.trim().split('\n')
      .filter(line => line.trim() && line.endsWith('.jsonl'))
      .map(path => {
        const filename = path.split('/').pop() || '';
        return filename.replace('.jsonl', '');
      });
  } catch {
    return [];
  }
}

// GET /automation/jobs — List all cron jobs configured in the user's agent
automationRoutes.get('/jobs', async c => {
  const userId = c.get('userId');

  const {data: user} = await supabase
    .from('users')
    .select('agent_machine_id, agent_status')
    .eq('id', userId)
    .single();

  if (!user?.agent_machine_id) {
    return c.json({jobs: [], message: 'No agent provisioned'});
  }

  const status = await getAgentStatus(user.agent_machine_id);
  if (status !== 'running') {
    return c.json({jobs: [], message: 'Agent not running'});
  }

  const jobs = await readCronJobs(user.agent_machine_id);
  return c.json({jobs});
});

// GET /automation/runs — Get recent cron runs across all jobs
automationRoutes.get('/runs', async c => {
  const userId = c.get('userId');
  const limit = Number(c.req.query('limit')) || 20;

  const {data: user} = await supabase
    .from('users')
    .select('agent_machine_id, agent_status')
    .eq('id', userId)
    .single();

  if (!user?.agent_machine_id) {
    return c.json({runs: []});
  }

  const status = await getAgentStatus(user.agent_machine_id);
  if (status !== 'running') {
    return c.json({runs: []});
  }

  // Get all job IDs with run history
  const jobIds = await listCronRunFiles(user.agent_machine_id);
  const jobs = await readCronJobs(user.agent_machine_id);
  const jobNameMap = new Map(jobs.map((j: any) => [j.id, j.name || j.id]));

  // Read runs from each job
  const allRuns: any[] = [];
  for (const jobId of jobIds) {
    const runs = await readCronRuns(user.agent_machine_id, jobId, limit);
    for (const run of runs) {
      allRuns.push({
        ...run,
        jobId,
        jobName: jobNameMap.get(jobId) || jobId,
      });
    }
  }

  // Sort by timestamp descending (most recent first)
  // OpenClaw uses `ts` (ms epoch) for completion time
  allRuns.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return c.json({runs: allRuns.slice(0, limit)});
});

// POST /automation/check — Check for new unseen cron runs, store in DB, return unseen
automationRoutes.post('/check', async c => {
  const userId = c.get('userId');

  const {data: user} = await supabase
    .from('users')
    .select('agent_machine_id, agent_status, agent_name')
    .eq('id', userId)
    .single();

  if (!user?.agent_machine_id) {
    return c.json({newResults: []});
  }

  const status = await getAgentStatus(user.agent_machine_id);
  if (status !== 'running') {
    return c.json({newResults: []});
  }

  // Get the latest check timestamp from DB
  const {data: lastResult} = await supabase
    .from('automation_results')
    .select('run_at')
    .eq('user_id', userId)
    .order('run_at', {ascending: false})
    .limit(1)
    .single();

  const lastCheckTime = lastResult?.run_at
    ? new Date(lastResult.run_at).getTime()
    : 0;

  // Read all runs from the container
  const jobIds = await listCronRunFiles(user.agent_machine_id);
  const jobs = await readCronJobs(user.agent_machine_id);
  const jobNameMap = new Map(jobs.map((j: any) => [j.id, j.name || j.id]));

  const newResults: any[] = [];

  for (const jobId of jobIds) {
    const runs = await readCronRuns(user.agent_machine_id, jobId, 50);
    for (const run of runs) {
      // OpenClaw run format: { ts (ms), summary, status, runAtMs, durationMs, jobId }
      const runTime = run.ts || 0;

      if (runTime > lastCheckTime && run.summary) {
        const result = {
          user_id: userId,
          job_id: run.jobId || jobId,
          job_name: jobNameMap.get(run.jobId || jobId) || run.jobId || jobId,
          result: run.summary,
          run_at: new Date(runTime).toISOString(),
          seen: false,
        };
        newResults.push(result);
      }
    }
  }

  // Store new results in Supabase
  if (newResults.length > 0) {
    await supabase.from('automation_results').insert(newResults);
  }

  return c.json({
    newResults,
    agentName: user.agent_name || 'HeyClaw',
  });
});

// GET /automation/unseen — Get unseen results from DB (no container access needed)
automationRoutes.get('/unseen', async c => {
  const userId = c.get('userId');

  const {data: results} = await supabase
    .from('automation_results')
    .select('*')
    .eq('user_id', userId)
    .eq('seen', false)
    .order('run_at', {ascending: false})
    .limit(50);

  return c.json({results: results || []});
});

// POST /automation/mark-seen — Mark results as seen
automationRoutes.post('/mark-seen', async c => {
  const userId = c.get('userId');
  const {ids} = await c.req.json();

  if (ids && Array.isArray(ids) && ids.length > 0) {
    await supabase
      .from('automation_results')
      .update({seen: true})
      .eq('user_id', userId)
      .in('id', ids);
  } else {
    // Mark all as seen
    await supabase
      .from('automation_results')
      .update({seen: true})
      .eq('user_id', userId)
      .eq('seen', false);
  }

  return c.json({message: 'Marked as seen'});
});
