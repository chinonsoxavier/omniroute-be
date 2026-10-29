import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { validate } from '../../common/validate';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.schemas';
import { serializeUser } from '../../common/serializers';
import { env, isProduction } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { BadRequestError, UnauthorizedError } from '../../common/errors';

const REFRESH_COOKIE = 'omnistock_refresh';

function sessionContext(request: FastifyRequest) {
  return {
    userAgent: request.headers['user-agent'],
    ipAddress: request.ip,
  };
}

function setRefreshCookie(reply: FastifyReply, token: string, maxAgeSeconds: number) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuthService(app.prisma);

  app.post(
    '/auth/register',
    { config: { rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = validate(registerSchema, request.body);
      const { user, tokens } = await service.register(input, sessionContext(request));
      setRefreshCookie(reply, tokens.refreshToken, tokens.refreshTokenExpiresIn);
      return reply.status(201).send({
        user: serializeUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.accessTokenExpiresIn,
      });
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = validate(loginSchema, request.body);
      const { user, tokens } = await service.login(input, sessionContext(request));
      setRefreshCookie(reply, tokens.refreshToken, tokens.refreshTokenExpiresIn);
      return reply.send({
        user: serializeUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.accessTokenExpiresIn,
      });
    },
  );

  app.post('/auth/refresh', async (request, reply) => {
    const body = validate(refreshSchema, request.body ?? {});
    const cookieToken = request.cookies?.[REFRESH_COOKIE];
    const rawToken = body.refreshToken ?? cookieToken;
    if (!rawToken) throw new UnauthorizedError('Missing refresh token');
    const { user, tokens } = await service.refresh(rawToken, sessionContext(request));
    setRefreshCookie(reply, tokens.refreshToken, tokens.refreshTokenExpiresIn);
    return reply.send({
      user: serializeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessTokenExpiresIn,
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    const body = validate(logoutSchema, request.body ?? {});
    const cookieToken = request.cookies?.[REFRESH_COOKIE];
    await service.logout(body.refreshToken ?? cookieToken);
    clearRefreshCookie(reply);
    return reply.status(204).send();
  });

  app.post(
    '/auth/forgot-password',
    { config: { rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request) => {
      const input = validate(forgotPasswordSchema, request.body);
      const result = await service.forgotPassword(input.email);
      return {
        message: 'If an account exists for that email, a reset link has been sent.',
        ...(result.token ? { resetToken: result.token } : {}),
      };
    },
  );

  app.post('/auth/reset-password', async (request, reply) => {
    const input = validate(resetPasswordSchema, request.body);
    if (input.confirmPassword && input.confirmPassword !== input.password) {
      throw new BadRequestError('Passwords do not match');
    }
    await service.resetPassword(input);
    clearRefreshCookie(reply);
    return { message: 'Password has been reset. Please sign in.' };
  });

  app.get('/auth/me', { preHandler: [authenticate] }, async (request) => {
    const user = await service.getProfile(request.user!.id);
    return { user: serializeUser(user) };
  });

  app.patch('/auth/me', { preHandler: [authenticate] }, async (request) => {
    const input = validate(updateProfileSchema, request.body);
    const { user, tokens } = await service.updateProfile(
      request.user!.id,
      input,
      sessionContext(request),
    );
    return {
      user: serializeUser(user),
      ...(tokens ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } : {}),
    };
  });
}
