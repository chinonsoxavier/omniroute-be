import type { FastifyInstance } from 'fastify';
import { SaleService } from './sales.service';
import { validate, idParamSchema, paginatedMeta } from '../../common/validate';
import { serializeSale } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { listSalesSchema, createSaleSchema, refundSaleSchema } from './sales.schemas';
import { cache, CACHE_PREFIX } from '../../common/cache';
import { toCsv } from '../../common/csv';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

async function invalidate(facilityId: string) {
  await cache.deleteByPrefix(`${CACHE_PREFIX.sales}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.products}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.product}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.dashboard}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.analytics}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.notifications}:${facilityId}`);
}

export async function saleRoutes(app: FastifyInstance): Promise<void> {
  const service = new SaleService(app.prisma);

  app.addHook('preHandler', authenticate);

  app.get('/sales', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(listSalesSchema, request.query);
    const result = await service.list(request.user!.facilityId, query);
    return {
      items: result.items.map(serializeSale),
      meta: paginatedMeta(query.page, query.limit, result.total),
    };
  });

  app.get('/sales/export/csv', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request, reply) => {
    const base = validate(listSalesSchema, request.query);
    const query = { ...base, limit: 200 };
    const result = await service.list(request.user!.facilityId, query);
    const csv = toCsv(
      result.items.map((sale) => ({
        receiptNumber: sale.receiptNumber,
        timestamp: sale.createdAt.toISOString(),
        registerId: sale.registerId,
        cashierName: sale.cashierName,
        customerType: sale.customerType,
        paymentMethod: sale.paymentMethod,
        itemCount: sale.items.length,
        subtotal: sale.subtotal.toString(),
        tax: sale.tax.toString(),
        total: sale.total.toString(),
        status: sale.status,
      })),
      [
        'receiptNumber',
        'timestamp',
        'registerId',
        'cashierName',
        'customerType',
        'paymentMethod',
        'itemCount',
        'subtotal',
        'tax',
        'total',
        'status',
      ],
    );
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="sales-export.csv"');
    return reply.send(csv);
  });

  app.get('/sales/:id', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const sale = await service.getById(request.user!.facilityId, id);
    return { sale: serializeSale(sale) };
  });

  app.post(
    '/sales',
    {
      preHandler: [requireRoles(...ALL_ROLES)],
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const headerKey = request.headers['x-idempotency-key'];
      const body = validate(createSaleSchema, request.body);
      const input = {
        ...body,
        idempotencyKey: body.idempotencyKey ?? (typeof headerKey === 'string' ? headerKey : undefined),
      };
      const sale = await service.create(request.user!.facilityId, input, { user: request.user! });
      await invalidate(request.user!.facilityId);
      return reply.status(201).send({ sale: serializeSale(sale) });
    },
  );

  app.post('/sales/:id/refund', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const input = validate(refundSaleSchema, request.body ?? {});
    const sale = await service.refund(request.user!.facilityId, id, input, { user: request.user! });
    await invalidate(request.user!.facilityId);
    return { sale: serializeSale(sale) };
  });
}
