import type { FastifyInstance } from 'fastify';
import client from 'prom-client';

let initialized = false;

export function registerMetrics(app: FastifyInstance, prefix: string): void {
  if (!initialized) {
    client.collectDefaultMetrics({ prefix: 'omnistock_' });
    initialized = true;
  }

  const httpDuration = new client.Histogram({
    name: 'omnistock_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url;
    httpDuration
      .labels(request.method, route, String(reply.statusCode))
      .observe(reply.elapsedTime / 1000);
  });

  app.get(`${prefix}/metrics`, async (_request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return client.register.metrics();
  });
}
