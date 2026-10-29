import type { FastifyInstance } from 'fastify';
import { serializeForecast } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

export async function forecastRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/demand-forecasts', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.forecasts}:${facilityId}`, 'list');
    const items = await cache.wrap(key, { ttlSeconds: TTL.long }, () =>
      app.prisma.demandForecast.findMany({
        where: { facilityId },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return { items: items.map(serializeForecast) };
  });
}
