import { createHash } from 'node:crypto';
import { getRedis, isRedisConnected } from '../lib/redis';
import { logger } from '../lib/logger';

interface CacheOptions {
  ttlSeconds: number;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableHash(input: unknown): string {
  return createHash('sha1').update(JSON.stringify(sortValue(input ?? {}))).digest('hex').slice(0, 16);
}

export function cacheKey(namespace: string, params?: unknown): string {
  return params === undefined ? namespace : `${namespace}:${stableHash(params)}`;
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!isRedisConnected()) return null;
    try {
      const raw = await getRedis()!.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      logger.debug({ err, key }, 'cache get failed');
      return null;
    }
  },

  async set(key: string, value: unknown, opts: CacheOptions): Promise<void> {
    if (!isRedisConnected()) return;
    try {
      await getRedis()!.set(key, JSON.stringify(value), 'EX', opts.ttlSeconds);
    } catch (err) {
      logger.debug({ err, key }, 'cache set failed');
    }
  },

  async del(...keys: string[]): Promise<void> {
    if (!isRedisConnected() || keys.length === 0) return;
    try {
      await getRedis()!.del(...keys);
    } catch (err) {
      logger.debug({ err, keys }, 'cache del failed');
    }
  },

  async deleteByPrefix(prefix: string): Promise<void> {
    if (!isRedisConnected()) return;
    const redis = getRedis()!;
    const fullPrefix = `${redis.options.keyPrefix ?? ''}${prefix}*`;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', fullPrefix, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          const bare = keys.map((k) => k.slice((redis.options.keyPrefix ?? '').length));
          await redis.del(...bare);
        }
      } while (cursor !== '0');
    } catch (err) {
      logger.debug({ err, prefix }, 'cache deleteByPrefix failed');
    }
  },

  async wrap<T>(key: string, opts: CacheOptions, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fetcher();
    await this.set(key, fresh, opts);
    return fresh;
  },
};

export const CACHE_PREFIX = {
  products: 'products',
  product: 'product',
  suppliers: 'suppliers',
  supplier: 'supplier',
  purchaseOrders: 'purchase-orders',
  sales: 'sales',
  auditLogs: 'audit-logs',
  deadStock: 'dead-stock',
  forecasts: 'forecasts',
  facility: 'facility',
  settings: 'settings',
  telemetry: 'telemetry',
  dashboard: 'dashboard',
  analytics: 'analytics',
  notifications: 'notifications',
} as const;

export const TTL = {
  short: 30,
  medium: 120,
  long: 300,
} as const;
