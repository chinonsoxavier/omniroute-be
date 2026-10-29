import type { FastifyInstance } from 'fastify';
import { TelemetryService } from './telemetry.service';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

export async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  const service = new TelemetryService(app.prisma);
  app.addHook('preHandler', authenticate);

  app.get('/telemetry', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.telemetry}:${facilityId}`, 'current');
    const telemetry = await cache.wrap(key, { ttlSeconds: TTL.short }, () =>
      service.getTelemetry(facilityId),
    );
    return { telemetry };
  });
}
