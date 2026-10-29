import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env';
import { getRedis, isRedisConnected } from '../lib/redis';

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  const redis = getRedis();

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    allowList: [],
    keyGenerator: (request) => request.user?.id ?? request.ip,
    ...(redis && isRedisConnected() ? { redis } : {}),
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s`,
      },
    }),
  });

  app.log.info(
    { max: env.RATE_LIMIT_MAX, windowMs: env.RATE_LIMIT_WINDOW_MS, store: isRedisConnected() ? 'redis' : 'memory' },
    'rate limiting configured',
  );
}
