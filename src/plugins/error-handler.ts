import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/errors';
import { logger } from '../lib/logger';
import { isProduction } from '../config/env';

function isPrismaError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
      requestId: request.id,
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error({ err: error, requestId }, error.message);
      } else {
        logger.warn({ code: error.code, requestId, msg: error.message }, 'client error');
      }
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        requestId,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        },
        requestId,
      });
    }

    if (isPrismaError(error)) {
      switch (error.code) {
        case 'P2002': {
          const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
          return reply.status(409).send({
            error: { code: 'CONFLICT', message: `A record with this ${target} already exists` },
            requestId,
          });
        }
        case 'P2025':
          return reply
            .status(404)
            .send({ error: { code: 'NOT_FOUND', message: 'Record not found' }, requestId });
        case 'P2003':
          return reply.status(409).send({
            error: { code: 'CONFLICT', message: 'Related record constraint failed' },
            requestId,
          });
        default:
          break;
      }
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    if (statusCode >= 500) {
      logger.error({ err: error, requestId }, 'unhandled server error');
    }

    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : error.code ?? 'ERROR',
        message:
          statusCode >= 500 && isProduction
            ? 'An unexpected error occurred'
            : error.message || 'Request failed',
      },
      requestId,
    });
  });
}
