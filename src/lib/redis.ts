import Redis, { type Redis as RedisClient } from 'ioredis';
import { env } from '../config/env';

let client: RedisClient | null = null;
let connected = false;

export function getRedis(): RedisClient | null {
  if (!env.REDIS_ENABLED) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      keyPrefix: `${env.REDIS_KEY_PREFIX}:`,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    client.on('ready', () => {
      connected = true;
    });
    client.on('end', () => {
      connected = false;
    });
    client.on('error', () => {
      connected = false;
    });
  }
  return client;
}

export function isRedisConnected(): boolean {
  return connected && client !== null;
}

export async function pingRedis(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
    connected = false;
  }
}
