import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {supabase} from '../lib/supabase.js';
import type {AppEnv} from '../lib/types.js';

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.use('*', authMiddleware);

chatRoutes.get('/sessions', async c => {
  const userId = c.get('userId');

  const {data, error} = await supabase
    .from('chat_sessions')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', {ascending: false});

  if (error) {
    return c.json({message: error.message}, 500);
  }

  return c.json(data);
});

chatRoutes.get('/sessions/:id', async c => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const {data, error} = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return c.json({message: 'Session not found'}, 404);
  }

  return c.json(data);
});

chatRoutes.post('/sessions', async c => {
  const userId = c.get('userId');

  const {data, error} = await supabase
    .from('chat_sessions')
    .insert({user_id: userId, title: 'New Chat', messages: []})
    .select()
    .single();

  if (error) {
    return c.json({message: error.message}, 500);
  }

  return c.json(data);
});

chatRoutes.put('/sessions/:id', async c => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const {messages, title} = await c.req.json();

  const update: Record<string, any> = {updated_at: new Date().toISOString()};
  if (messages !== undefined) update.messages = messages;
  if (title !== undefined) update.title = title;

  const {data, error} = await supabase
    .from('chat_sessions')
    .update(update)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !data) {
    return c.json({message: 'Session not found'}, 404);
  }

  return c.json(data);
});

chatRoutes.delete('/sessions/:id', async c => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const {error} = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) {
    return c.json({message: error.message}, 500);
  }

  return c.json({message: 'Session deleted'});
});
