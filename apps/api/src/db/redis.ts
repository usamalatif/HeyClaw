import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err);
});

const RECENT_MESSAGES_LIMIT = 10;
const RECENT_MESSAGES_TTL = 86400; // 24h

export async function cacheRecentMessages(userId: string, messages: any[]): Promise<void> {
  const recent = messages.slice(-RECENT_MESSAGES_LIMIT);
  await redis.set(
    `chat:recent:${userId}`,
    JSON.stringify(recent),
    'EX',
    RECENT_MESSAGES_TTL,
  );
}

export async function getCachedRecentMessages(userId: string): Promise<any[] | null> {
  const data = await redis.get(`chat:recent:${userId}`);
  return data ? JSON.parse(data) : null;
}

export async function clearRecentMessages(userId: string): Promise<void> {
  await redis.del(`chat:recent:${userId}`);
}
