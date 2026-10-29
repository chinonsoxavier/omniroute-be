import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../common/errors';
import type { UpdateSettingsInput, UpdateTelemetryInput } from './facilities.schemas';

export class FacilityService {
  constructor(private readonly db: PrismaClient) {}

  async list() {
    return this.db.facility.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      include: { settings: true },
    });
  }

  async getById(id: string) {
    const facility = await this.db.facility.findUnique({
      where: { id },
      include: { settings: true, telemetry: true },
    });
    if (!facility) throw new NotFoundError('Facility');
    return facility;
  }

  async getCurrent(facilityId: string) {
    return this.getById(facilityId);
  }

  async updateSettings(facilityId: string, input: UpdateSettingsInput) {
    await this.getById(facilityId);
    const existing = await this.db.facilitySettings.findUnique({ where: { facilityId } });
    if (!existing) {
      return this.db.facilitySettings.create({ data: { facilityId, ...input } });
    }
    return this.db.facilitySettings.update({ where: { facilityId }, data: input });
  }

  async updateTelemetry(facilityId: string, input: UpdateTelemetryInput) {
    await this.getById(facilityId);
    const existing = await this.db.shiftTelemetry.findUnique({ where: { facilityId } });
    if (!existing) {
      return this.db.shiftTelemetry.create({ data: { facilityId, ...input } });
    }
    return this.db.shiftTelemetry.update({ where: { facilityId }, data: input });
  }
}
