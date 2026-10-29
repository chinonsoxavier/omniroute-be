import type { RoleValue } from '../common/constants';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: RoleValue;
  facilityId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    startTime: number;
  }

  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest) => Promise<void>;
  }
}

export {};
