import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../lib/jwt';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import type { RoleValue } from '../common/constants';

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = await verifyAccessToken(token);
    request.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      facilityId: payload.facilityId,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function requireRoles(...roles: RoleValue[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) throw new UnauthorizedError();
    if (roles.length > 0 && !roles.includes(request.user.role)) {
      throw new ForbiddenError(`Requires one of roles: ${roles.join(', ')}`);
    }
  };
}

export function requireFacilityAccess(facilityId: string, request: FastifyRequest): void {
  if (!request.user) throw new UnauthorizedError();
  if (request.user.facilityId !== facilityId && request.user.role !== 'STORE_DIRECTOR') {
    throw new ForbiddenError('You do not have access to this facility');
  }
}
