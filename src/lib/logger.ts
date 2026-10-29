import { pino, type Logger } from 'pino';
import { env, isProduction } from '../config/env';

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'omniroute-api', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      'body.password',
      'body.confirmPassword',
    ],
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname,service,env',
          },
        },
      }),
});
