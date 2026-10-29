import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../../common/errors';
import { round2, round3, toNumber } from '../../common/money';
import { receiptNumber } from '../../common/ids';
import type { ListSalesQuery, CreateSaleInput, RefundSaleInput } from './sales.schemas';
import type { AuthUser } from '../../types/fastify';

interface AuditContext {
  user: AuthUser;
}

const POS_REASON = 'POS adjustment';

export class SaleService {
  constructor(private readonly db: PrismaClient) {}

  async list(facilityId: string, query: ListSalesQuery) {
    const where: Prisma.SaleTransactionWhereInput = { facilityId };
    if (query.status) where.status = query.status;
    if (query.registerId) where.registerId = query.registerId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.db.$transaction([
      this.db.saleTransaction.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.db.saleTransaction.count({ where }),
    ]);

    return { items, total };
  }

  async getById(facilityId: string, id: string) {
    const sale = await this.db.saleTransaction.findFirst({
      where: { id, facilityId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundError('Sale');
    return sale;
  }

  private async getTaxRate(facilityId: string): Promise<number> {
    const settings = await this.db.facilitySettings.findUnique({ where: { facilityId } });
    return settings?.taxRate ?? 0.08;
  }

  async create(facilityId: string, input: CreateSaleInput, ctx: AuditContext) {
    if (input.idempotencyKey) {
      const existing = await this.db.saleTransaction.findUnique({
        where: { facilityId_idempotencyKey: { facilityId, idempotencyKey: input.idempotencyKey } },
        include: { items: true },
      });
      if (existing) return existing;
    }

    const productIds = input.items.map((i) => i.productId);
    const products = await this.db.product.findMany({
      where: { id: { in: productIds }, facilityId },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const taxRate = await this.getTaxRate(facilityId);

    let subtotal = 0;
    let totalMargin = 0;

    const lineItems = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestError(`Product ${item.productId} not found`);
      const available = toNumber(product.currentStock);
      if (item.quantity > available) {
        throw new BadRequestError(
          `Insufficient stock for ${product.name}: requested ${item.quantity}, available ${available}`,
        );
      }
      const unitPrice = toNumber(product.retailPrice);
      const unitCost = toNumber(product.wholesaleCost);
      const gross = unitPrice * item.quantity;
      const discountAmount = (gross * item.discount) / 100;
      const totalPrice = round2(gross - discountAmount);
      const costBasis = unitCost * item.quantity;
      const marginAmount = round2(totalPrice - costBasis);
      subtotal += totalPrice;
      totalMargin += marginAmount;

      return {
        product,
        quantity: item.quantity,
        unitPrice,
        unitCost,
        discount: item.discount,
        totalPrice,
        marginAmount,
        costBasis,
      };
    });

    subtotal = round2(subtotal);
    const tax = round2(subtotal * taxRate);
    const total = round2(subtotal + tax);
    totalMargin = round2(totalMargin);

    const result = await this.db.$transaction(async (tx) => {
      const sale = await tx.saleTransaction.create({
        data: {
          facilityId,
          receiptNumber: receiptNumber(),
          registerId: input.registerId,
          cashierName: input.cashierName,
          customerType: input.customerType,
          paymentMethod: input.paymentMethod,
          subtotal: new Prisma.Decimal(subtotal),
          tax: new Prisma.Decimal(tax),
          total: new Prisma.Decimal(total),
          totalMargin: new Prisma.Decimal(totalMargin),
          status: 'Completed',
          idempotencyKey: input.idempotencyKey,
          notes: input.notes,
          items: {
            create: lineItems.map((line) => ({
              productId: line.product.id,
              sku: line.product.sku,
              name: line.product.name,
              unit: line.product.unit,
              quantity: new Prisma.Decimal(line.quantity),
              unitPrice: new Prisma.Decimal(line.unitPrice),
              discount: line.discount,
              totalPrice: new Prisma.Decimal(line.totalPrice),
              unitCost: new Prisma.Decimal(line.unitCost),
              marginAmount: new Prisma.Decimal(line.marginAmount),
            })),
          },
        },
        include: { items: true },
      });

      for (const line of lineItems) {
        const previous = toNumber(line.product.currentStock);
        const newStock = round3(previous - line.quantity);
        await tx.product.update({
          where: { id: line.product.id },
          data: {
            currentStock: new Prisma.Decimal(newStock),
            unitsSoldToday: { increment: line.quantity },
            unitsSoldWeek: { increment: line.quantity },
            unitsSoldMonth: { increment: line.quantity },
            unitsSoldYear: { increment: line.quantity },
            revenueMonth: { increment: new Prisma.Decimal(line.totalPrice) },
            lastSoldAt: new Date(),
            daysIdle: 0,
          },
        });

        await tx.stockMovement.create({
          data: {
            facilityId,
            productId: line.product.id,
            quantity: new Prisma.Decimal(-line.quantity),
            reason: POS_REASON,
            reference: sale.receiptNumber,
            userId: ctx.user.id,
          },
        });
      }

      return sale;
    });

    return result;
  }

  async refund(facilityId: string, id: string, input: RefundSaleInput, ctx: AuditContext) {
    const sale = await this.getById(facilityId, id);
    if (sale.status === 'Refunded') throw new BadRequestError('Sale is already refunded');
    if (sale.status === 'Voided') throw new BadRequestError('Cannot refund a voided sale');

    return this.db.$transaction(async (tx) => {
      for (const item of sale.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;
        const quantity = toNumber(item.quantity);
        const previous = toNumber(product.currentStock);
        const newStock = round3(previous + quantity);

        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: new Prisma.Decimal(newStock),
            unitsSoldToday: { decrement: quantity },
            unitsSoldWeek: { decrement: quantity },
            unitsSoldMonth: { decrement: quantity },
            unitsSoldYear: { decrement: quantity },
            revenueMonth: { decrement: item.totalPrice },
          },
        });

        await tx.stockMovement.create({
          data: {
            facilityId,
            productId: item.productId,
            quantity: new Prisma.Decimal(quantity),
            reason: 'Return to vendor (RTV)',
            reference: `${sale.receiptNumber} refund`,
            userId: ctx.user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            facilityId,
            sku: item.sku,
            productName: item.name,
            actionType: 'Cycle Audit',
            previousValue: `${round3(previous)} ${item.unit}`,
            newValue: `${round3(newStock)} ${item.unit}`,
            delta: quantity,
            reason: input.reason ?? `Refund of ${sale.receiptNumber}`,
            user: ctx.user.name,
            userId: ctx.user.id,
            financialImpact: item.totalPrice,
          },
        });
      }

      return tx.saleTransaction.update({
        where: { id },
        data: { status: 'Refunded' },
        include: { items: true },
      });
    });
  }
}
