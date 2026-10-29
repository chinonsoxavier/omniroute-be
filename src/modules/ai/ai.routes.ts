import type { FastifyInstance } from 'fastify';
import { AiService } from './ai.service';
import { validate } from '../../common/validate';
import { authenticate, requireRoles } from '../../middleware/auth';
import { ROLE } from '../../common/constants';
import { copilotSchema, reportSchema } from './ai.schemas';
import { env } from '../../config/env';

const ALL_ROLES = [ROLE.STORE_STAFF, ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const service = new AiService(app.prisma);
  app.addHook('preHandler', authenticate);

  app.post(
    '/ai/copilot',
    {
      preHandler: [requireRoles(...ALL_ROLES)],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => {
      const input = validate(copilotSchema, request.body);
      const response = await service.copilot(request.user!.facilityId, input);
      return { message: response, engine: env.OPENAI_API_KEY ? 'openai' : 'rules' };
    },
  );

  app.post('/ai/reports', { preHandler: [requireRoles(...ALL_ROLES)] }, async (request) => {
    const input = validate(reportSchema, request.body);
    const report = await service.report(request.user!.facilityId, input);
    return { report };
  });
}
