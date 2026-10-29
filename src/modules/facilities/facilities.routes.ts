import type { FastifyInstance } from 'fastify';
import { FacilityService } from './facilities.service';
import { validate, idParamSchema } from '../../common/validate';
import { serializeFacility, serializeSettings } from '../../common/serializers';
import { authenticate, requireFacilityAccess, requireRoles } from '../../middleware/auth';
import { updateSettingsSchema, updateTelemetrySchema } from './facilities.schemas';
import { ROLE } from '../../common/constants';
import { cache, cacheKey, CACHE_PREFIX, TTL } from '../../common/cache';

const MANAGERS = [ROLE.STORE_MANAGER, ROLE.STORE_DIRECTOR];

export async function facilityRoutes(app: FastifyInstance): Promise<void> {
  const service = new FacilityService(app.prisma);

  app.addHook('preHandler', authenticate);

  app.get('/facilities', async () => {
    const facilities = await cache.wrap(
      cacheKey(CACHE_PREFIX.facility, 'list'),
      { ttlSeconds: TTL.long },
      () => service.list(),
    );
    return { items: facilities.map(serializeFacility) };
  });

  app.get('/facilities/current', async (request) => {
    const facility = await cache.wrap(
      cacheKey(CACHE_PREFIX.facility, `current:${request.user!.facilityId}`),
      { ttlSeconds: TTL.long },
      () => service.getCurrent(request.user!.facilityId),
    );
    return {
      facility: serializeFacility(facility),
      settings: facility.settings ? serializeSettings(facility.settings) : null,
    };
  });

  app.get('/facilities/:id', async (request) => {
    const { id } = validate(idParamSchema, request.params);
    requireFacilityAccess(id, request);
    const facility = await service.getById(id);
    return {
      facility: serializeFacility(facility),
      settings: facility.settings ? serializeSettings(facility.settings) : null,
    };
  });

  app.patch(
    '/facilities/:id/settings',
    { preHandler: [requireRoles(...MANAGERS)] },
    async (request) => {
      const { id } = validate(idParamSchema, request.params);
      requireFacilityAccess(id, request);
      const input = validate(updateSettingsSchema, request.body);
      const settings = await service.updateSettings(id, input);
      await cache.del(
        cacheKey(CACHE_PREFIX.facility, `current:${id}`),
        cacheKey(CACHE_PREFIX.facility, id),
      );
      return { settings: serializeSettings(settings) };
    },
  );

  app.patch(
    '/facilities/:id/telemetry',
    { preHandler: [requireRoles(...MANAGERS)] },
    async (request) => {
      const { id } = validate(idParamSchema, request.params);
      requireFacilityAccess(id, request);
      const input = validate(updateTelemetrySchema, request.body);
      const telemetry = await service.updateTelemetry(id, input);
      await cache.deleteByPrefix(`${CACHE_PREFIX.telemetry}:${id}`);
      return { telemetry };
    },
  );
}
