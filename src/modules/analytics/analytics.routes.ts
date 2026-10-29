import type { FastifyInstance } from 'fastify';
import { AnalyticsService } from './analytics.service';
import { validate } from '../../common/validate';
import { serializeAuditLog, serializeForecast } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { trendsSchema, topProductsSchema } from './analytics.schemas';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  const service = new AnalyticsService(app.prisma);
  app.addHook('preHandler', authenticate);

  app.get('/analytics/dashboard', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.dashboard}:${facilityId}`, 'overview');
    return cache.wrap(key, { ttlSeconds: TTL.short }, async () => {
      const data = await service.dashboard(facilityId);
      return {
        ...data,
        recentAudit: data.recentAudit.map(serializeAuditLog),
        forecasts: data.forecasts.map(serializeForecast),
      };
    });
  });

  app.get('/analytics/trends', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(trendsSchema, request.query);
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.analytics}:${facilityId}:trends`, query);
    return cache.wrap(key, { ttlSeconds: TTL.medium }, () => service.trends(facilityId, query));
  });

  app.get('/analytics/departments', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.analytics}:${facilityId}:departments`, 'list');
    return cache.wrap(key, { ttlSeconds: TTL.medium }, () => service.departments(facilityId));
  });

  app.get('/analytics/top-products', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const query = validate(topProductsSchema, request.query);
    const facilityId = request.user!.facilityId;
    const key = cacheKey(`${CACHE_PREFIX.analytics}:${facilityId}:top`, query);
    return cache.wrap(key, { ttlSeconds: TTL.medium }, () => service.topProducts(facilityId, query));
  });
}
