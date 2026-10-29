import { Prisma, type PrismaClient } from '@prisma/client';
import type { ListAuditQuery } from './audit.schemas';

export class AuditService {
  constructor(private readonly db: PrismaClient) {}

  async list(facilityId: string, query: ListAuditQuery) {
    const where: Prisma.AuditLogWhereInput = { facilityId };
    if (query.actionType) where.actionType = query.actionType;
    if (query.sku) where.sku = query.sku;
    if (query.search) {
      where.OR = [
        { productName: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { reason: { contains: query.search, mode: 'insensitive' } },
        { user: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.db.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
