import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { getRedis, disconnectRedis } from './lib/redis';
import { disconnectPrisma } from './lib/prisma';

async function main(): Promise<void> {
  const app = await buildApp();

  getRedis();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down gracefully');
    try {
      await app.close();
      await disconnectPrisma();
      await disconnectRedis();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    void shutdown('uncaughtException');
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`OmniStock API listening on http://${env.HOST}:${env.PORT}${env.API_PREFIX}`);
    logger.info(`API docs available at http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    logger.fatal({ err }, 'failed to start server');
    process.exit(1);
  }
}

void main();
