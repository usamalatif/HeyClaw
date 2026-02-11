import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {supabase} from '../lib/supabase.js';
import type {AppEnv} from '../lib/types.js';

export const userRoutes = new Hono<AppEnv>();

userRoutes.use('*', authMiddleware);

userRoutes.get('/me', async c => {
  const userId = c.get('userId');

  const {data: user, error} = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) {
    return c.json({message: 'User not found'}, 404);
  }

  return c.json(user);
});

userRoutes.patch('/me', async c => {
  const userId = c.get('userId');
  const updates = await c.req.json();

  // Only allow specific fields to be updated
  const allowed = ['name', 'agent_name', 'tts_voice', 'tts_speed'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k)),
  );

  const {data, error} = await supabase
    .from('users')
    .update({...filtered, updated_at: new Date().toISOString()})
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    return c.json({message: error.message}, 400);
  }

  return c.json(data);
});

userRoutes.get('/credits', async c => {
  const userId = c.get('userId');

  const {data, error} = await supabase
    .from('users')
    .select('plan, credits_remaining, credits_monthly_limit, credits_reset_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return c.json({message: 'User not found'}, 404);
  }

  return c.json(data);
});
