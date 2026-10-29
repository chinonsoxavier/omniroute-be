import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
