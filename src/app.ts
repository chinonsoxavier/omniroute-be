import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env, isProduction } from './config/env';
import { logger } from './lib/logger';
import { prismaPlugin } from './plugins/prisma';
import { registerSecurity } from './plugins/security';
import { registerRateLimit } from './plugins/rate-limit';
import { registerErrorHandler } from './plugins/error-handler';
import { registerSwagger } from './plugins/swagger';
import { registerMetrics } from './plugins/metrics';
import { healthRoutes } from './modules/health/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/users.routes';
import { facilityRoutes } from './modules/facilities/facilities.routes';
import { productRoutes } from './modules/products/products.routes';
import { supplierRoutes } from './modules/suppliers/suppliers.routes';
import { purchaseOrderRoutes } from './modules/purchase-orders/purchase-orders.routes';
import { saleRoutes } from './modules/sales/sales.routes';
import { auditRoutes } from './modules/audit/audit.routes';
import { deadStockRoutes } from './modules/dead-stock/dead-stock.routes';
import { forecastRoutes } from './modules/forecasts/forecasts.routes';
import { telemetryRoutes } from './modules/telemetry/telemetry.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { aiRoutes } from './modules/ai/ai.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return typeof header === 'string' && header.length > 0 ? header : randomUUID();
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    loggerInstance: logger as unknown as FastifyBaseLogger,
  });

  app.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
    reply.header('X-Request-Id', request.id);
  });

  await app.register(prismaPlugin);
  await registerSecurity(app);
  await registerRateLimit(app);
  await registerSwagger(app);
  registerMetrics(app, '');

  registerErrorHandler(app);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(facilityRoutes);
      await api.register(productRoutes);
      await api.register(supplierRoutes);
      await api.register(purchaseOrderRoutes);
      await api.register(saleRoutes);
      await api.register(auditRoutes);
      await api.register(deadStockRoutes);
      await api.register(forecastRoutes);
      await api.register(telemetryRoutes);
      await api.register(notificationRoutes);
      await api.register(analyticsRoutes);
      await api.register(aiRoutes);
    },
    { prefix: env.API_PREFIX },
  );

  app.get('/', async () => ({
    name: 'OmniStock API',
    version: '1.0.0',
    environment: env.NODE_ENV,
    docs: '/docs',
    apiPrefix: env.API_PREFIX,
  }));

  app.log.info(
    { environment: env.NODE_ENV, prefix: env.API_PREFIX, production: isProduction },
    'application built',
  );

  return app;
}
