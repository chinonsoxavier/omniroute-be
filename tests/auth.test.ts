import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, isDbAvailable, uniqueEmail } from './helpers';

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)('auth flow', () => {
  let app: FastifyInstance;
  const email = uniqueEmail('auth');

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  let accessToken = '';
  let refreshToken = '';

  it('registers a new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { fullName: 'Test User', email, password: 'Password1!' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(body.accessToken).toBeTruthy();
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('rejects duplicate registration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { fullName: 'Test User', email, password: 'Password1!' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects invalid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'WrongPass1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('logs in with valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Password1!' },
    });
    expect(res.statusCode).toBe(200);
    accessToken = res.json().accessToken;
    refreshToken = res.json().refreshToken;
  });

  it('fetches the current profile with a bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(email);
  });

  it('rejects tampered tokens', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer not.a.real.token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rotates refresh tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const newRefresh = res.json().refreshToken;
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(refreshToken);

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
    refreshToken = newRefresh;
  });

  it('logs out and revokes the refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(204);

    const after = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(after.statusCode).toBe(401);
  });

  it('validates registration payloads', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { fullName: 'X', email: 'bad', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
