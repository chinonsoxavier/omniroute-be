import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../../common/errors';
import { calcMarginPercent, round2, round3, toNumber } from '../../common/money';
import type { ListDeadStockQuery, ResolveDeadStockInput } from './dead-stock.schemas';
import type { DeadStockAction } from '../../common/constants';
import type { AuthUser } from '../../types/fastify';

interface AuditContext {
  user: AuthUser;
}

const ACTION_LABEL: Record<DeadStockAction, string> = {
  markdown_30: 'Markdown Applied',
  flash_50: 'Markdown Applied',
  reallocate: 'Cycle Audit',
  move_endcap: 'Cycle Audit',
  rtv: 'Spoilage Write-Off',
};

export class DeadStockService {
  constructor(private readonly db: PrismaClient) {}

  async list(facilityId: string, query: ListDeadStockQuery) {
    const where: Prisma.DeadStockAlertWhereInput = { facilityId };
    if (query.department) where.department = query.department;

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.db.$transaction([
      this.db.deadStockAlert.findMany({
        where,
        orderBy: { daysIdle: 'desc' },
        skip,
        take: query.limit,
      }),
      this.db.deadStockAlert.count({ where }),
    ]);

    return { items, total };
  }

  async resolve(facilityId: string, id: string, input: ResolveDeadStockInput, ctx: AuditContext) {
    const alert = await this.db.deadStockAlert.findFirst({ where: { id, facilityId } });
    if (!alert) throw new NotFoundError('Dead stock alert');

    const product = await this.db.product.findFirst({
      where: { id: alert.productId, facilityId },
    });
    if (!product) throw new NotFoundError('Product');

    const previousPrice = toNumber(product.retailPrice);
    let newPrice = previousPrice;
    let newShelf = product.shelfPlacement;
    let stockDelta = 0;
    const actionType = ACTION_LABEL[input.actionType];

    switch (input.actionType) {
      case 'markdown_30':
        newPrice = round2(previousPrice * 0.7);
        break;
      case 'flash_50':
        newPrice = round2(previousPrice * 0.5);
        break;
      case 'reallocate':
        newShelf = 'Health & Wellness allocation';
        break;
      case 'move_endcap':
        newShelf = 'Checkout Endcap #2';
        break;
      case 'rtv':
        stockDelta = -toNumber(product.currentStock);
        break;
      default:
        throw new BadRequestError('Unsupported action');
    }

    const reason = input.reason ?? alert.recommendedAction;

    return this.db.$transaction(async (tx) => {
      const previousStock = toNumber(product.currentStock);
      const newStock = round3(previousStock + stockDelta);

      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          ...(newPrice !== previousPrice
            ? {
                previousRetailPrice: product.retailPrice,
                retailPrice: new Prisma.Decimal(newPrice),
                discountPercentage:
                  input.actionType === 'markdown_30'
                    ? 30
                    : input.actionType === 'flash_50'
                      ? 50
                      : product.discountPercentage,
                grossMargin: calcMarginPercent(newPrice, toNumber(product.wholesaleCost)),
                eslSyncStatus: 'pending',
              }
            : {}),
          ...(newShelf !== product.shelfPlacement ? { shelfPlacement: newShelf } : {}),
          ...(stockDelta !== 0
            ? {
                currentStock: new Prisma.Decimal(newStock),
                tiedCapital: new Prisma.Decimal(round2(newStock * toNumber(product.wholesaleCost))),
              }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          facilityId,
          sku: alert.sku,
          productName: alert.productName,
          actionType,
          previousValue:
            stockDelta !== 0
              ? `${round3(previousStock)} ${alert.unit}`
              : `$${previousPrice.toFixed(2)}`,
          newValue:
            stockDelta !== 0 ? `${round3(newStock)} ${alert.unit}` : `$${newPrice.toFixed(2)}`,
          delta: stockDelta !== 0 ? stockDelta : null,
          reason,
          user: ctx.user.name,
          userId: ctx.user.id,
          financialImpact: new Prisma.Decimal(round2(toNumber(alert.tiedCapital))),
        },
      });

      if (stockDelta !== 0) {
        await tx.stockMovement.create({
          data: {
            facilityId,
            productId: product.id,
            quantity: new Prisma.Decimal(stockDelta),
            reason: 'Return to vendor (RTV)',
            reference: 'Dead stock resolution',
            userId: ctx.user.id,
          },
        });
      }

      await tx.deadStockAlert.delete({ where: { id: alert.id } });

      return { product: updated, actionType };
    });
  }
}
