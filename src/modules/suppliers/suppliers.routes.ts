import type { FastifyInstance } from 'fastify';
import { SupplierService } from './suppliers.service';
import { validate, idParamSchema, paginatedMeta } from '../../common/validate';
import { serializeSupplier } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import {
  listSuppliersSchema,
  createSupplierSchema,
  updateSupplierSchema,
} from './suppliers.schemas';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const MANAGERS = [ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];
const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

async function invalidate(facilityId: string) {
  await cache.deleteByPrefix(`${CACHE_PREFIX.suppliers}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.supplier}:${facilityId}`);
}

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  const service = new SupplierService(app.prisma);

  app.addHook('preHandler', authenticate);

  app.get('/suppliers', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(listSuppliersSchema, request.query);
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.suppliers}:${facilityId}`, query);
    const result = await cache.wrap(key, { ttlSeconds: TTL.medium }, () =>
      service.list(facilityId, query),
    );
    return {
      items: result.items.map(serializeSupplier),
      meta: paginatedMeta(query.page, query.limit, result.total),
    };
  });

  app.get('/suppliers/:id', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const supplier = await service.getById(request.user!.facilityId, id);
    return { supplier: { ...serializeSupplier(supplier), productsCount: supplier._count?.products ?? 0 } };
  });

  app.post('/suppliers', { preHandler: [requireRoles(...MANAGERS)] }, async (request, reply) => {
    const input = validate(createSupplierSchema, request.body);
    const supplier = await service.create(request.user!.facilityId, input);
    await invalidate(request.user!.facilityId);
    return reply.status(201).send({ supplier: serializeSupplier(supplier) });
  });

  app.patch('/suppliers/:id', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const input = validate(updateSupplierSchema, request.body);
    const supplier = await service.update(request.user!.facilityId, id, input);
    await invalidate(request.user!.facilityId);
    return { supplier: serializeSupplier(supplier) };
  });

  app.delete('/suppliers/:id', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    await service.softDelete(request.user!.facilityId, id);
    await invalidate(request.user!.facilityId);
    return { message: 'Supplier archived' };
  });
}
