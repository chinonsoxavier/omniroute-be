import type { FastifyInstance } from 'fastify';
import { AuditService } from './audit.service';
import { validate, paginatedMeta } from '../../common/validate';
import { serializeAuditLog } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { listAuditSchema } from './audit.schemas';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuditService(app.prisma);
  app.addHook('preHandler', authenticate);

  app.get('/audit-logs', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(listAuditSchema, request.query);
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.auditLogs}:${facilityId}`, query);
    const result = await cache.wrap(key, { ttlSeconds: TTL.short }, () =>
      service.list(facilityId, query),
    );
    return {
      items: result.items.map(serializeAuditLog),
      meta: paginatedMeta(query.page, query.limit, result.total),
    };
  });
}
