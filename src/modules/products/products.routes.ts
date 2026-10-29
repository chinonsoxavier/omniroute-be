import type { FastifyInstance } from 'fastify';
import { ProductService } from './products.service';
import { validate, idParamSchema, paginatedMeta } from '../../common/validate';
import { serializeProduct } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import {
  listProductsSchema,
  createProductSchema,
  updateProductSchema,
  bulkPriceSchema,
  stockOverrideSchema,
  barcodeParamSchema,
} from './products.schemas';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';
import { toCsv } from '../../common/csv';
import type { AuthUser } from '../../types/fastify';

const MANAGERS = [ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];
const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

async function invalidateProductCaches(facilityId: string) {
  await cache.deleteByPrefix(`${CACHE_PREFIX.products}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.product}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.dashboard}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.analytics}:${facilityId}`);
  await cache.deleteByPrefix(`${CACHE_PREFIX.notifications}:${facilityId}`);
}

export async function productRoutes(app: FastifyInstance): Promise<void> {
  const service = new ProductService(app.prisma);
  const user = (request: { user?: AuthUser }) => request.user!;

  app.addHook('preHandler', authenticate);

  app.get('/products', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(listProductsSchema, request.query);
    const facilityId = user(request).facilityId;
    const key = cacheKey(`${CACHE_PREFIX.products}:${facilityId}`, query);

    const result = await cache.wrap(key, { ttlSeconds: TTL.short }, () =>
      service.list(facilityId, query),
    );

    return {
      items: result.items.map(serializeProduct),
      meta: paginatedMeta(query.page, query.limit, result.total),
    };
  });

  app.get('/products/export/csv', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request, reply) => {
    const query = validate(listProductsSchema, request.query);
    const rows = await service.exportRows(user(request).facilityId, query);
    const csv = toCsv(
      rows.map((p) => {
        const s = serializeProduct(p);
        return {
          sku: s.sku,
          barcode: s.barcode,
          name: s.name,
          brand: s.brand,
          department: s.department,
          aisle: s.aisle,
          currentStock: s.currentStock,
          unit: s.unit,
          reorderPoint: s.reorderPoint,
          retailPrice: s.retailPrice,
          wholesaleCost: s.wholesaleCost,
          grossMargin: s.grossMargin,
          stockStatus: s.stockStatus,
        };
      }),
      [
        'sku',
        'barcode',
        'name',
        'brand',
        'department',
        'aisle',
        'currentStock',
        'unit',
        'reorderPoint',
        'retailPrice',
        'wholesaleCost',
        'grossMargin',
        'stockStatus',
      ],
    );
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="inventory-export.csv"`);
    return reply.send(csv);
  });

  app.get('/products/barcode/:code', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const { code } = validate(barcodeParamSchema, request.params);
    const facilityId = user(request).facilityId;
    const key = cacheKey(`${CACHE_PREFIX.product}:${facilityId}:barcode`, { code });
    const product = await cache.wrap(key, { ttlSeconds: TTL.medium }, () =>
      service.getByBarcode(facilityId, code),
    );
    return { product: serializeProduct(product) };
  });

  app.get('/products/:id', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const product = await service.getById(user(request).facilityId, id);
    return { product: serializeProduct(product) };
  });

  app.post('/products', { preHandler: [requireRoles(...MANAGERS)] }, async (request, reply) => {
    const input = validate(createProductSchema, request.body);
    const product = await service.create(user(request).facilityId, input, { user: user(request) });
    await invalidateProductCaches(user(request).facilityId);
    return reply.status(201).send({ product: serializeProduct(product) });
  });

  app.patch('/products/:id', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const input = validate(updateProductSchema, request.body);
    const product = await service.update(user(request).facilityId, id, input);
    await invalidateProductCaches(user(request).facilityId);
    return { product: serializeProduct(product) };
  });

  app.delete('/products/:id', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    await service.softDelete(user(request).facilityId, id);
    await invalidateProductCaches(user(request).facilityId);
    return { message: 'Product archived' };
  });

  app.post('/products/bulk-price', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const input = validate(bulkPriceSchema, request.body);
    const result = await service.bulkPriceUpdate(user(request).facilityId, input, {
      user: user(request),
    });
    await invalidateProductCaches(user(request).facilityId);
    return result;
  });

  app.post(
    '/products/:id/stock-override',
    { preHandler: [requireRoles(...ALL_ROLES)] },
    async (request) => {
      const { id } = validate(idParamSchema, request.params);
      const input = validate(stockOverrideSchema, request.body);
      const product = await service.stockOverride(user(request).facilityId, id, input, {
        user: user(request),
      });
      await invalidateProductCaches(user(request).facilityId);
      return { product: serializeProduct(product) };
    },
  );
}
