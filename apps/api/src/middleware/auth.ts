import {createMiddleware} from 'hono/factory';
import {createClient} from '@supabase/supabase-js';
import type {AppEnv} from '../lib/types.js';
import {supabase as adminSupabase} from '../lib/supabase.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({message: 'Unauthorized'}, 401);
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {headers: {Authorization: `Bearer ${token}`}},
  });

  const {
    data: {user},
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return c.json({message: 'Invalid token'}, 401);
  }

  // Ensure a row exists in the public users table (auto-create on first login)
  const {data: existing} = await adminSupabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!existing) {
    await adminSupabase.from('users').insert({
      id: user.id,
      email: user.email,
      agent_status: 'pending',
      plan: 'free',
      credits_remaining: 1000,
      credits_monthly_limit: 1000,
    });
  }

  c.set('userId', user.id);
  c.set('userEmail', user.email ?? '');
  await next();
});
