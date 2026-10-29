import type { FastifyInstance } from 'fastify';
import { NotificationService } from './notifications.service';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const service = new NotificationService(app.prisma);
  app.addHook('preHandler', authenticate);

  app.get('/notifications', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.notifications}:${facilityId}`, 'summary');
    return cache.wrap(key, { ttlSeconds: TTL.short }, () => service.summary(facilityId));
  });
}
