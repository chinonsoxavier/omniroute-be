import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../config/env';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OmniStock API',
        description:
          'Backend API for OmniStock — Supermarket Inventory & AI Retail Operations Suite.',
        version: '1.0.0',
      },
      servers: [{ url: env.API_PREFIX }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Auth' },
        { name: 'Users' },
        { name: 'Facilities' },
        { name: 'Products' },
        { name: 'Suppliers' },
        { name: 'Purchase Orders' },
        { name: 'Sales' },
        { name: 'Audit' },
        { name: 'Analytics' },
        { name: 'Alerts' },
        { name: 'Forecasts' },
        { name: 'Telemetry' },
        { name: 'Notifications' },
        { name: 'AI Copilot' },
        { name: 'Health' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    staticCSP: true,
  });
}
