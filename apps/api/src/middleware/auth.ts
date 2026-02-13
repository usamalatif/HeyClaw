import {createMiddleware} from 'hono/factory';
import jwt from 'jsonwebtoken';
import {redis} from '../db/redis.js';
import type {AppEnv} from '../lib/types.js';

interface JwtPayload {
  sub: string;
  email: string;
  jti: string;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({message: 'Unauthorized'}, 401);
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

    // Check JWT blacklist (for logout)
    const blacklisted = await redis.get(`blacklist:jwt:${decoded.jti}`);
    if (blacklisted) {
      return c.json({message: 'Token revoked'}, 401);
    }

    c.set('userId', decoded.sub);
    c.set('userEmail', decoded.email);
    await next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return c.json({message: 'Token expired'}, 401);
    }
    return c.json({message: 'Invalid token'}, 401);
  }
});
