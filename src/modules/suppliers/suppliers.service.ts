import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../common/errors';
import type {
  ListSuppliersQuery,
  CreateSupplierInput,
  UpdateSupplierInput,
} from './suppliers.schemas';

export class SupplierService {
  constructor(private readonly db: PrismaClient) {}

  async list(facilityId: string, query: ListSuppliersQuery) {
    const where: Prisma.SupplierWhereInput = { facilityId, active: true };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = { has: query.category };

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.db.$transaction([
      this.db.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: query.limit,
        include: {
          _count: {
            select: {
              purchaseOrders: {
                where: {
                  status: { in: ['Draft', 'Submitted', 'In Transit'] },
                },
              },
            },
          },
        },
      }),
      this.db.supplier.count({ where }),
    ]);

    return { items, total };
  }

  async getById(facilityId: string, id: string) {
    const supplier = await this.db.supplier.findFirst({
      where: { id, facilityId },
      include: {
        _count: {
          select: {
            purchaseOrders: { where: { status: { in: ['Draft', 'Submitted', 'In Transit'] } } },
            products: true,
          },
        },
      },
    });
    if (!supplier) throw new NotFoundError('Supplier');
    return supplier;
  }

  async create(facilityId: string, input: CreateSupplierInput) {
    return this.db.supplier.create({ data: { facilityId, ...input } });
  }

  async update(facilityId: string, id: string, input: UpdateSupplierInput) {
    await this.getById(facilityId, id);
    return this.db.supplier.update({ where: { id }, data: input });
  }

  async softDelete(facilityId: string, id: string) {
    await this.getById(facilityId, id);
    await this.db.supplier.update({ where: { id }, data: { active: false } });
  }
}
