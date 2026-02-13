import {Hono} from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {db} from '../db/pool.js';
import {redis} from '../db/redis.js';
import {authMiddleware} from '../middleware/auth.js';
import {createAgent} from '../services/agentManager.js';
import type {AppEnv} from '../lib/types.js';

export const authRoutes = new Hono<AppEnv>();

const JWT_SECRET = () => process.env.JWT_SECRET!;
const ACCESS_EXPIRES = () => process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES_DAYS = 30;

function generateTokens(userId: string, email: string) {
  const jti = crypto.randomUUID();
  const accessToken = jwt.sign(
    {sub: userId, email, jti},
    JWT_SECRET(),
    {expiresIn: ACCESS_EXPIRES() as any},
  );
  const refreshToken = crypto.randomBytes(64).toString('hex');
  return {accessToken, refreshToken, jti};
}

// POST /auth/signup
authRoutes.post('/signup', async c => {
  const {email, password, name} = await c.req.json();

  if (!email || !password) {
    return c.json({message: 'Email and password are required'}, 400);
  }

  if (password.length < 8) {
    return c.json({message: 'Password must be at least 8 characters'}, 400);
  }

  // Check if user already exists
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length > 0) {
    return c.json({message: 'Email already registered'}, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Create user (trigger auto-creates subscription with plan='free')
  const result = await db.query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3) RETURNING id, email, name`,
    [email.toLowerCase().trim(), passwordHash, name || null],
  );

  const user = result.rows[0];

  // Generate tokens
  const {accessToken, refreshToken} = generateTokens(user.id, user.email);

  // Store refresh token hash
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, refreshHash, expiresAt],
  );

  // Create OpenClaw agent + assistant DB row
  const agentId = `agent-${user.id}`;
  try {
    await createAgent(agentId);
    await db.query(
      `INSERT INTO assistants (user_id, agent_id, display_name, voice)
       VALUES ($1, $2, $3, $4)`,
      [user.id, agentId, name || 'My Assistant', 'nova'],
    );
  } catch (err: any) {
    console.error(`Failed to create agent for ${user.id}:`, err.message);
    // User is created — agent creation can be retried later
  }

  console.log(`User signed up: ${user.email} (${user.id}), agent: ${agentId}`);

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {id: user.id, email: user.email, name: user.name},
  }, 201);
});

// POST /auth/login
authRoutes.post('/login', async c => {
  const {email, password} = await c.req.json();

  if (!email || !password) {
    return c.json({message: 'Email and password are required'}, 400);
  }

  const result = await db.query(
    'SELECT id, email, name, password_hash, status FROM users WHERE email = $1',
    [email.toLowerCase().trim()],
  );

  const user = result.rows[0];
  if (!user) {
    return c.json({message: 'Invalid email or password'}, 401);
  }

  if (user.status !== 'active') {
    return c.json({message: 'Account is suspended'}, 403);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return c.json({message: 'Invalid email or password'}, 401);
  }

  // Generate tokens
  const {accessToken, refreshToken} = generateTokens(user.id, user.email);

  // Store refresh token hash
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, refreshHash, expiresAt],
  );

  // Update last login
  await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {id: user.id, email: user.email, name: user.name},
  });
});

// POST /auth/refresh
authRoutes.post('/refresh', async c => {
  const {refresh_token} = await c.req.json();

  if (!refresh_token) {
    return c.json({message: 'Refresh token is required'}, 400);
  }

  const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

  const result = await db.query(
    `SELECT rt.id, rt.user_id, u.email, u.name, u.status
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()`,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) {
    return c.json({message: 'Invalid or expired refresh token'}, 401);
  }

  if (row.status !== 'active') {
    return c.json({message: 'Account is suspended'}, 403);
  }

  // Revoke old refresh token (rotation)
  await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);

  // Generate new tokens
  const {accessToken, refreshToken: newRefreshToken} = generateTokens(row.user_id, row.email);

  // Store new refresh token
  const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [row.user_id, newHash, expiresAt],
  );

  return c.json({
    access_token: accessToken,
    refresh_token: newRefreshToken,
  });
});

// POST /auth/logout (requires auth)
authRoutes.post('/logout', authMiddleware, async c => {
  const userId = c.get('userId');

  // Blacklist the current JWT
  const authHeader = c.req.header('Authorization')!;
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.decode(token) as {jti: string; exp: number};
    if (decoded?.jti && decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.set(`blacklist:jwt:${decoded.jti}`, '1', 'EX', ttl);
      }
    }
  } catch {
    // Ignore decode errors
  }

  // Revoke all refresh tokens
  await db.query(
    'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE',
    [userId],
  );

  return c.json({message: 'Logged out'});
});

// POST /auth/forgot-password
authRoutes.post('/forgot-password', async c => {
  const {email} = await c.req.json();

  if (!email) {
    return c.json({message: 'Email is required'}, 400);
  }

  const result = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  const user = result.rows[0];

  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({message: 'If an account exists, a reset link has been sent'});
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt],
  );

  // TODO: Send email with reset link containing resetToken
  console.log(`Password reset requested for ${email}`);

  return c.json({message: 'If an account exists, a reset link has been sent'});
});

// POST /auth/reset-password
authRoutes.post('/reset-password', async c => {
  const {token, new_password} = await c.req.json();

  if (!token || !new_password) {
    return c.json({message: 'Token and new password are required'}, 400);
  }

  if (new_password.length < 8) {
    return c.json({message: 'Password must be at least 8 characters'}, 400);
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await db.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()`,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) {
    return c.json({message: 'Invalid or expired reset token'}, 400);
  }

  const passwordHash = await bcrypt.hash(new_password, 12);

  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, row.user_id]);
  await db.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [row.id]);

  // Revoke all refresh tokens (force re-login)
  await db.query(
    'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
    [row.user_id],
  );

  return c.json({message: 'Password reset successfully'});
});
