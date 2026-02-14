/**
 * Agent Reaper - Pause inactive free-tier agents to save resources
 * Run via cron job: every 6 hours
 * 
 * Logic:
 * - Free tier agents inactive for 7+ days → pause
 * - Paid tier agents inactive for 30+ days → pause
 * - Paused agents keep workspace (can be resumed)
 * - Deleted accounts → full cleanup (handled by user deletion)
 */

import {db} from '../db/pool.js';
import {pauseAgent, agentExists} from './agentManager.js';

const FREE_INACTIVE_DAYS = 7;
const PAID_INACTIVE_DAYS = 30;

export async function reapInactiveAgents(): Promise<{paused: string[]; errors: string[]}> {
  const paused: string[] = [];
  const errors: string[] = [];

  console.log('[Reaper] Starting inactive agent reap...');

  // Find inactive free-tier agents
  const freeResult = await db.query(
    `SELECT a.agent_id, a.user_id, a.last_active_at
     FROM assistants a
     JOIN subscriptions s ON s.user_id = a.user_id AND s.status = 'active'
     WHERE a.status = 'active'
       AND s.plan = 'free'
       AND (a.last_active_at IS NULL OR a.last_active_at < NOW() - INTERVAL '${FREE_INACTIVE_DAYS} days')`,
  );

  // Find inactive paid-tier agents
  const paidResult = await db.query(
    `SELECT a.agent_id, a.user_id, a.last_active_at
     FROM assistants a
     JOIN subscriptions s ON s.user_id = a.user_id AND s.status = 'active'
     WHERE a.status = 'active'
       AND s.plan != 'free'
       AND (a.last_active_at IS NULL OR a.last_active_at < NOW() - INTERVAL '${PAID_INACTIVE_DAYS} days')`,
  );

  const allInactive = [...freeResult.rows, ...paidResult.rows];

  for (const row of allInactive) {
    const {agent_id, user_id} = row;

    // Skip if agent not in gateway config (already paused externally)
    if (!agentExists(agent_id)) {
      continue;
    }

    try {
      await pauseAgent(agent_id);
      await db.query(
        `UPDATE assistants SET status = 'paused' WHERE agent_id = $1`,
        [agent_id],
      );
      paused.push(agent_id);
      console.log(`[Reaper] Paused inactive agent: ${agent_id} (user: ${user_id})`);
    } catch (err: any) {
      errors.push(`${agent_id}: ${err.message}`);
      console.error(`[Reaper] Failed to pause ${agent_id}:`, err.message);
    }
  }

  console.log(`[Reaper] Complete. Paused: ${paused.length}, Errors: ${errors.length}`);
  return {paused, errors};
}

// Export for manual/cron invocation
export default reapInactiveAgents;
