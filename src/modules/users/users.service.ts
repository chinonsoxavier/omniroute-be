import { Prisma, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError, BadRequestError } from '../../common/errors';
import { hashPassword } from '../../lib/password';
import type { ListUsersQuery, CreateUserInput, UpdateUserInput } from './users.schemas';

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async list(facilityId: string, query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = { facilityId };
    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        include: { facility: true },
        orderBy: { fullName: 'asc' },
        skip,
        take: query.limit,
      }),
      this.db.user.count({ where }),
    ]);

    return { items, total };
  }

  async getById(facilityId: string, id: string) {
    const user = await this.db.user.findFirst({
      where: { id, facilityId },
      include: { facility: true },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async create(facilityId: string, input: CreateUserInput) {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError('A user with this email already exists');

    const passwordHash = await hashPassword(input.password);
    return this.db.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
        facilityId,
      },
      include: { facility: true },
    });
  }

  async update(facilityId: string, id: string, input: UpdateUserInput, actorId: string) {
    await this.getById(facilityId, id);
    if (id === actorId && input.active === false) {
      throw new BadRequestError('You cannot deactivate your own account');
    }
    return this.db.user.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { facility: true },
    });
  }
}
