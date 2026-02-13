import {Hono} from 'hono';
import {authMiddleware} from '../middleware/auth.js';
import {db} from '../db/pool.js';
import {clearPlanCache} from '../services/usage.js';
import type {AppEnv} from '../lib/types.js';
import {decodeTransaction, decodeNotification, getProductPlan} from '../services/iap.js';

export const billingRoutes = new Hono<AppEnv>();

// Verify IAP receipt — requires auth
billingRoutes.post('/verify', authMiddleware, async c => {
  const userId = c.get('userId');
  const {receiptData, productId} = await c.req.json();

  if (!receiptData || !productId) {
    return c.json({message: 'receiptData and productId are required'}, 400);
  }

  const txn = decodeTransaction(receiptData);
  const effectiveProductId = txn.valid ? txn.productId! : productId;
  const plan = getProductPlan(effectiveProductId);

  if (plan === 'free') {
    return c.json({message: 'Invalid product ID'}, 400);
  }

  const originalTransactionId = txn.valid ? txn.originalTransactionId : null;
  const expiresDate = txn.expiresDate || null;

  // Upsert subscription
  await db.query(
    `INSERT INTO subscriptions (user_id, plan, status, apple_original_transaction_id, subscription_ends_at)
     VALUES ($1, $2, 'active', $3, $4)
     ON CONFLICT (user_id) WHERE status = 'active'
     DO UPDATE SET
       plan = EXCLUDED.plan,
       status = 'active',
       apple_original_transaction_id = COALESCE(EXCLUDED.apple_original_transaction_id, subscriptions.apple_original_transaction_id),
       subscription_ends_at = EXCLUDED.subscription_ends_at,
       updated_at = NOW()`,
    [userId, plan, originalTransactionId, expiresDate],
  );

  // Clear cached plan so rate limiter picks up new limits
  await clearPlanCache(userId);

  // Get the new limits for response
  const limitsResult = await db.query(
    `SELECT * FROM plan_limits WHERE plan = $1`,
    [plan],
  );
  const limits = limitsResult.rows[0];

  console.log(`Subscription activated: user=${userId} plan=${plan} txn=${originalTransactionId}`);
  return c.json({
    plan,
    status: 'active',
    limits: limits
      ? {
          dailyTextMessages: limits.daily_text_messages,
          dailyVoiceInputMinutes: limits.daily_voice_input_minutes,
          dailyTtsCharacters: limits.daily_tts_characters,
        }
      : null,
  });
});

// Get billing status — requires auth
billingRoutes.get('/status', authMiddleware, async c => {
  const userId = c.get('userId');

  const result = await db.query(
    `SELECT s.plan, s.status, s.subscription_ends_at,
            pl.daily_text_messages, pl.daily_voice_input_minutes, pl.daily_tts_characters
     FROM subscriptions s
     JOIN plan_limits pl ON pl.plan = s.plan
     WHERE s.user_id = $1 AND s.status = 'active'`,
    [userId],
  );

  if (!result.rows[0]) {
    return c.json({
      plan: 'free',
      status: 'active',
      subscriptionEndsAt: null,
      limits: {dailyTextMessages: 50, dailyVoiceInputMinutes: 5, dailyTtsCharacters: 5000},
    });
  }

  const row = result.rows[0];
  return c.json({
    plan: row.plan,
    status: row.status,
    subscriptionEndsAt: row.subscription_ends_at,
    limits: {
      dailyTextMessages: row.daily_text_messages,
      dailyVoiceInputMinutes: row.daily_voice_input_minutes,
      dailyTtsCharacters: row.daily_tts_characters,
    },
  });
});

// App Store Server Notification V2 webhook — no auth (Apple calls this)
billingRoutes.post('/webhook', async c => {
  const body = await c.req.json();
  const signedPayload = body.signedPayload;

  if (!signedPayload) {
    console.warn('Webhook: no signedPayload');
    return c.json({status: 'ignored'});
  }

  const notification = decodeNotification(signedPayload);
  if (!notification) {
    console.warn('Webhook: failed to decode notification');
    return c.json({status: 'decode_error'}, 400);
  }

  const notificationType = notification.notificationType;
  const subtype = notification.subtype;

  console.log(`Webhook: type=${notificationType} subtype=${subtype}`);

  const signedTransactionInfo =
    notification.data?.signedTransactionInfo ??
    notification.data?.signedRenewalInfo;

  if (!signedTransactionInfo) {
    console.warn('Webhook: no transaction info in notification');
    return c.json({status: 'no_transaction'});
  }

  const txn = decodeTransaction(signedTransactionInfo);
  if (!txn.valid || !txn.originalTransactionId) {
    console.warn('Webhook: invalid transaction in notification');
    return c.json({status: 'invalid_transaction'});
  }

  // Find user by original transaction ID via subscriptions table
  const subResult = await db.query(
    `SELECT s.user_id, s.plan
     FROM subscriptions s
     WHERE s.apple_original_transaction_id = $1 AND s.status = 'active'`,
    [txn.originalTransactionId],
  );

  if (!subResult.rows[0]) {
    console.warn(`Webhook: no user found for txn ${txn.originalTransactionId}`);
    return c.json({status: 'user_not_found'});
  }

  const {user_id: userId, plan: currentPlan} = subResult.rows[0];

  switch (notificationType) {
    case 'DID_RENEW': {
      const plan = txn.productId ? getProductPlan(txn.productId) : currentPlan;
      await db.query(
        `UPDATE subscriptions SET
           plan = $1, status = 'active',
           subscription_ends_at = $2,
           updated_at = NOW()
         WHERE user_id = $3 AND status = 'active'`,
        [plan, txn.expiresDate || null, userId],
      );
      await clearPlanCache(userId);
      console.log(`Webhook: renewed user=${userId} plan=${plan}`);
      break;
    }

    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
    case 'REVOKE':
    case 'REFUND': {
      const newStatus = notificationType === 'REFUND' ? 'refunded' : 'expired';
      await db.query(
        `UPDATE subscriptions SET plan = 'free', status = $1, updated_at = NOW()
         WHERE user_id = $2 AND status = 'active'`,
        [newStatus, userId],
      );
      await clearPlanCache(userId);
      console.log(`Webhook: downgraded user=${userId} reason=${notificationType}`);
      break;
    }

    case 'DID_CHANGE_RENEWAL_INFO': {
      console.log(`Webhook: renewal info changed for user=${userId}`);
      break;
    }

    default:
      console.log(`Webhook: unhandled type=${notificationType} for user=${userId}`);
  }

  return c.json({status: 'processed'});
});
