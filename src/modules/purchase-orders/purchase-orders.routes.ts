import type { FastifyInstance } from 'fastify';
import { PurchaseOrderService } from './purchase-orders.service';
import { validate, idParamSchema, paginatedMeta } from '../../common/validate';
import { serializePurchaseOrder } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import {
  listPoSchema,
  createPoSchema,
  receivePoSchema,
  autoDraftSchema,
} from './purchase-orders.schemas';
import { cache, CACHE_PREFIX } from '../../common/cache';

const MANAGERS = [ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];
const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

async function invalidate(facilityId: string) {
  await cache.deleteByPrefix(`${CACHE_PREFIX.purchaseOrders}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.suppliers}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.products}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.product}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.dashboard}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.notifications}:${facilityId}`);
}

export async function purchaseOrderRoutes(app: FastifyInstance): Promise<void> {
  const service = new PurchaseOrderService(app.prisma);

  app.addHook('preHandler', authenticate);

  app.get('/purchase-orders', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(listPoSchema, request.query);
    const result = await service.list(request.user!.facilityId, query);
    return {
      items: result.items.map(serializePurchaseOrder),
      meta: paginatedMeta(query.page, query.limit, result.total),
    };
  });

  app.get('/purchase-orders/:id', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const po = await service.getById(request.user!.facilityId, id);
    return { purchaseOrder: serializePurchaseOrder(po) };
  });

  app.post('/purchase-orders', { preHandler: [requireRoles(...MANAGERS)] }, async (request, reply) => {
    const input = validate(createPoSchema, request.body);
    const po = await service.create(request.user!.facilityId, input);
    await invalidate(request.user!.facilityId);
    return reply.status(201).send({ purchaseOrder: serializePurchaseOrder(po) });
  });

  app.post(
    '/purchase-orders/:id/submit',
    { preHandler: [requireRoles(...MANAGERS)] },
    async (request) => {
      const { id } = validate(idParamSchema, request.params);
      const po = await service.submit(request.user!.facilityId, id);
      await invalidate(request.user!.facilityId);
      return { purchaseOrder: serializePurchaseOrder(po) };
    },
  );

  app.post(
    '/purchase-orders/:id/receive',
    { preHandler: [requireRoles(...ALL_ROLES)] },
    async (request) => {
      const { id } = validate(idParamSchema, request.params);
      const input = validate(receivePoSchema, request.body ?? {});
      const po = await service.receive(request.user!.facilityId, id, input, {
        user: request.user!,
      });
      await invalidate(request.user!.facilityId);
      return { purchaseOrder: serializePurchaseOrder(po) };
    },
  );

  app.post('/purchase-orders/auto-draft', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const input = validate(autoDraftSchema, request.body ?? {});
    const result = await service.autoDraft(request.user!.facilityId, input.supplierId);
    await invalidate(request.user!.facilityId);
    return {
      created: result.created,
      purchaseOrders: result.purchaseOrders.map(serializePurchaseOrder),
    };
  });
}
