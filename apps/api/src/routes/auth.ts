import {Hono} from 'hono';
import {supabase} from '../lib/supabase.js';

export const authRoutes = new Hono();

authRoutes.post('/magic-link', async c => {
  const {email} = await c.req.json();
  const {error} = await supabase.auth.signInWithOtp({email});

  if (error) {
    return c.json({message: error.message}, 400);
  }

  return c.json({message: 'Magic link sent'});
});

authRoutes.post('/verify', async c => {
  const {token, email} = await c.req.json();
  const {data, error} = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    return c.json({message: error.message}, 400);
  }

  return c.json({session: data.session, user: data.user});
});
