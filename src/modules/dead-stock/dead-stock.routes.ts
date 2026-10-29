import type { FastifyInstance } from 'fastify';
import { DeadStockService } from './dead-stock.service';
import { validate, idParamSchema, paginatedMeta } from '../../common/validate';
import { serializeDeadStock, serializeProduct } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { listDeadStockSchema, resolveDeadStockSchema } from './dead-stock.schemas';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

async function invalidate(facilityId: string) {
  await cache.deleteByPrefix(`${CACHE_PREFIX.deadStock}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.products}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.product}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.dashboard}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.analytics}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.notifications}:${facilityId}`);
}

export async function deadStockRoutes(app: FastifyInstance): Promise<void> {
  const service = new DeadStockService(app.prisma);
  app.addHook('preHandler', authenticate);

  app.get('/dead-stock-alerts', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(listDeadStockSchema, request.query);
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.deadStock}:${facilityId}`, query);
    const result = await cache.wrap(key, { ttlSeconds: TTL.medium }, () =>
      service.list(facilityId, query),
    );
    return {
      items: result.items.map(serializeDeadStock),
      meta: paginatedMeta(query.page, query.limit, result.total),
    };
  });

  app.post(
    '/dead-stock-alerts/:id/resolve',
    { preHandler: [requireRoles(...ALL_ROLES)] },
    async (request) => {
      const { id } = validate(idParamSchema, request.params);
      const input = validate(resolveDeadStockSchema, request.body);
      const result = await service.resolve(request.user!.facilityId, id, input, {
        user: request.user!,
      });
      await invalidate(request.user!.facilityId);
      return { product: serializeProduct(result.product), actionType: result.actionType };
    },
  );
}
