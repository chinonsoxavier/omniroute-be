import type { FastifyInstance } from 'fastify';
import { UserService } from './users.service';
import { validate, idParamSchema, paginatedMeta } from '../../common/validate';
import { serializeUser } from '../../common/serializers';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { listUsersSchema, createUserSchema, updateUserSchema } from './users.schemas';

const MANAGERS = [ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];
const DIRECTORS = [ROLE.STORE_DIRECTOR];

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const service = new UserService(app.prisma);
  app.addHook('preHandler', authenticate);

  app.get('/users', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const query = validate(listUsersSchema, request.query);
    const result = await service.list(request.user!.facilityId, query);
    return {
      items: result.items.map(serializeUser),
      meta: paginatedMeta(query.page, query.limit, result.total),
    };
  });

  app.get('/users/:id', { preHandler: [requireRoles(...MANAGERS)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const user = await service.getById(request.user!.facilityId, id);
    return { user: serializeUser(user) };
  });

  app.post('/users', { preHandler: [requireRoles(...DIRECTORS)] }, async (request, reply) => {
    const input = validate(createUserSchema, request.body);
    const user = await service.create(request.user!.facilityId, input);
    return reply.status(201).send({ user: serializeUser(user) });
  });

  app.patch('/users/:id', { preHandler: [requireRoles(...DIRECTORS)] }, async (request) => {
    const { id } = validate(idParamSchema, request.params);
    const input = validate(updateUserSchema, request.body);
    const user = await service.update(request.user!.facilityId, id, input, request.user!.id);
    return { user: serializeUser(user) };
  });
}
