import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {supabase} from '../lib/supabase.js';
import type {AppEnv} from '../lib/types.js';

export const billingRoutes = new Hono<AppEnv>();

const PLAN_CREDITS: Record<string, number> = {
  free: 50,
  starter: 1400,
  pro: 4200,
  ultra: 12000,
};

// Verify IAP receipt — requires auth
billingRoutes.post('/verify', authMiddleware, async c => {
  const userId = c.get('userId');
  const {receiptData, productId} = await c.req.json();

  // TODO: Verify receipt with Apple's App Store Server API
  // https://developer.apple.com/documentation/appstoreserverapi

  // For now, placeholder verification
  // In production: call Apple's verifyReceipt endpoint or use App Store Server API v2

  // Determine plan from productId
  let plan = 'free';
  if (productId?.includes('starter')) plan = 'starter';
  else if (productId?.includes('ultra')) plan = 'ultra';
  else if (productId?.includes('pro')) plan = 'pro';

  const credits = PLAN_CREDITS[plan] ?? 50;

  const {error} = await supabase
    .from('users')
    .update({
      plan,
      subscription_status: 'active',
      credits_remaining: credits,
      credits_monthly_limit: credits,
      credits_reset_at: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .eq('id', userId);

  if (error) {
    return c.json({message: error.message}, 500);
  }

  return c.json({plan, credits, status: 'active'});
});

// Get billing status — requires auth
billingRoutes.get('/status', authMiddleware, async c => {
  const userId = c.get('userId');

  const {data, error} = await supabase
    .from('users')
    .select('plan, subscription_status, subscription_ends_at, credits_remaining, credits_monthly_limit')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return c.json({message: 'User not found'}, 404);
  }

  return c.json(data);
});

// App Store Server Notification webhook — no auth (Apple calls this)
billingRoutes.post('/webhook', async c => {
  const body = await c.req.json();

  // TODO: Verify signed notification from Apple
  // Handle subscription events: SUBSCRIBED, DID_RENEW, EXPIRED, etc.
  console.log('App Store webhook received:', JSON.stringify(body));

  return c.json({status: 'received'});
});
