import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { pingRedis } from '../../lib/redis';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    { config: { rateLimit: false }, schema: { tags: ['Health'] } },
    async () => ({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    '/ready',
    { config: { rateLimit: false }, schema: { tags: ['Health'] } },
    async (_request, reply) => {
      const checks: Record<string, string> = {};
      let ready = true;

      try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'up';
      } catch {
        checks.database = 'down';
        ready = false;
      }

      const redisUp = await pingRedis();
      checks.redis = redisUp ? 'up' : 'down';

      return reply.status(ready ? 200 : 503).send({
        status: ready ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    },
  );
}
