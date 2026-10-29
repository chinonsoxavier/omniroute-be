import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env';
import type { RoleValue } from '../common/constants';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'omniroute-api';
const AUDIENCE = 'omnistock';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: RoleValue;
  facilityId: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return {
    sub: String(payload.sub),
    email: String(payload.email),
    name: String(payload.name),
    role: payload.role as RoleValue,
    facilityId: String(payload.facilityId),
  };
}
