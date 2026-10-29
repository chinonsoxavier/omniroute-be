import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../../common/errors';
import { round2, round3, toNumber } from '../../common/money';
import { poNumber } from '../../common/ids';
import type { ListPoQuery, CreatePoInput, ReceivePoInput } from './purchase-orders.schemas';
import type { AuthUser } from '../../types/fastify';

interface AuditContext {
  user: AuthUser;
}

export class PurchaseOrderService {
  constructor(private readonly db: PrismaClient) {}

  async list(facilityId: string, query: ListPoQuery) {
    const where: Prisma.PurchaseOrderWhereInput = { facilityId };
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.db.$transaction([
      this.db.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          items: true,
        },
        orderBy: { orderDate: 'desc' },
        skip,
        take: query.limit,
      }),
      this.db.purchaseOrder.count({ where }),
    ]);

    return { items, total };
  }

  async getById(facilityId: string, id: string) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, facilityId },
      include: { supplier: true, items: true },
    });
    if (!po) throw new NotFoundError('Purchase order');
    return po;
  }

  async create(facilityId: string, input: CreatePoInput) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: input.supplierId, facilityId },
    });
    if (!supplier) throw new BadRequestError('Supplier not found for this facility');

    const productIds = input.items.map((i) => i.productId);
    const products = await this.db.product.findMany({
      where: { id: { in: productIds }, facilityId },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalAmount = 0;
    const itemsData = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestError(`Product ${item.productId} not found`);
      const unitCost = item.unitCost ?? toNumber(product.wholesaleCost);
      const totalCost = round2(unitCost * item.orderedQty);
      totalAmount += totalCost;
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        orderedQty: new Prisma.Decimal(item.orderedQty),
        unitCost: new Prisma.Decimal(unitCost),
        totalCost: new Prisma.Decimal(totalCost),
        unit: product.unit,
      };
    });

    const expectedDelivery =
      input.expectedDelivery ?? new Date(Date.now() + supplier.leadTimeHours * 3600000);

    return this.db.purchaseOrder.create({
      data: {
        facilityId,
        supplierId: supplier.id,
        poNumber: poNumber(),
        status: input.submit ? 'Submitted' : 'Draft',
        expectedDelivery,
        totalAmount: new Prisma.Decimal(round2(totalAmount)),
        notes: input.notes,
        items: { create: itemsData },
      },
      include: { supplier: true, items: true },
    });
  }

  async submit(facilityId: string, id: string) {
    const po = await this.getById(facilityId, id);
    if (po.status !== 'Draft') throw new BadRequestError('Only draft purchase orders can be submitted');
    return this.db.purchaseOrder.update({
      where: { id },
      data: { status: 'Submitted' },
      include: { supplier: true, items: true },
    });
  }

  async receive(facilityId: string, id: string, input: ReceivePoInput, ctx: AuditContext) {
    const po = await this.getById(facilityId, id);
    if (po.status === 'Received') throw new BadRequestError('Purchase order already received');
    if (po.status === 'Draft') throw new BadRequestError('Submit the purchase order before receiving');

    const receivedMap = new Map((input.items ?? []).map((i) => [i.itemId, i.receivedQty]));

    let discrepancy = false;

    const result = await this.db.$transaction(async (tx) => {
      for (const item of po.items) {
        const receivedQty = receivedMap.get(item.id) ?? toNumber(item.orderedQty);
        if (receivedQty < toNumber(item.orderedQty)) discrepancy = true;

        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const previousStock = toNumber(product.currentStock);
        const newStock = previousStock + receivedQty;
        const tiedCapital = round2(newStock * toNumber(product.wholesaleCost));

        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: new Prisma.Decimal(round3(newStock)),
            tiedCapital: new Prisma.Decimal(tiedCapital),
            transitStock: null,
            transitPO: null,
            transitETA: null,
            daysIdle: 0,
          },
        });

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: new Prisma.Decimal(receivedQty) },
        });

        await tx.stockMovement.create({
          data: {
            facilityId,
            productId: item.productId,
            quantity: new Prisma.Decimal(receivedQty),
            reason: 'Inbound shipment arrival (PO Intake)',
            reference: po.poNumber,
            userId: ctx.user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            facilityId,
            sku: item.sku,
            productName: item.name,
            actionType: 'Stock Intake',
            previousValue: `${round3(previousStock)} ${item.unit}`,
            newValue: `${round3(newStock)} ${item.unit}`,
            delta: receivedQty,
            reason: `${po.poNumber} received${input.dockNumber ? ` at ${input.dockNumber}` : ''}`,
            user: ctx.user.name,
            userId: ctx.user.id,
            financialImpact: new Prisma.Decimal(round2(receivedQty * toNumber(item.unitCost))),
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: discrepancy ? 'Discrepancy' : 'Received',
          receivedDate: new Date(),
          dockNumber: input.dockNumber,
          temperatureReading: input.temperatureReading,
          coldChainVerified: input.coldChainVerified,
          verifiedBy: input.verifiedBy ?? ctx.user.name,
          ...(input.notes ? { notes: input.notes } : {}),
        },
        include: { supplier: true, items: true },
      });
    });

    return result;
  }

  async autoDraft(facilityId: string, supplierId?: string) {
    const products = await this.db.product.findMany({
      where: {
        facilityId,
        active: true,
        ...(supplierId ? { supplierId } : {}),
      },
      include: { supplier: true },
    });

    const lowStock = products.filter(
      (p) => toNumber(p.currentStock) <= toNumber(p.reorderPoint),
    );
    if (lowStock.length === 0) return { created: 0, purchaseOrders: [] };

    const bySupplier = new Map<string, typeof lowStock>();
    for (const product of lowStock) {
      const list = bySupplier.get(product.supplierId) ?? [];
      list.push(product);
      bySupplier.set(product.supplierId, list);
    }

    const created = [];
    for (const [suppId, items] of bySupplier.entries()) {
      const supplier = await this.db.supplier.findFirst({ where: { id: suppId, facilityId } });
      if (!supplier) continue;

      let totalAmount = 0;
      const itemsData = items.map((p) => {
        const transit = toNumber(p.transitStock ?? 0);
        const target = toNumber(p.maxCapacity) > 0 ? toNumber(p.maxCapacity) : toNumber(p.reorderPoint) * 2;
        const qty = round3(Math.max(1, target - toNumber(p.currentStock) - transit));
        const unitCost = toNumber(p.wholesaleCost);
        const totalCost = round2(qty * unitCost);
        totalAmount += totalCost;
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          orderedQty: new Prisma.Decimal(qty),
          unitCost: new Prisma.Decimal(unitCost),
          totalCost: new Prisma.Decimal(totalCost),
          unit: p.unit,
        };
      });

      const expectedDelivery = new Date(Date.now() + supplier.leadTimeHours * 3600000);

      const po = await this.db.purchaseOrder.create({
        data: {
          facilityId,
          supplierId: supplier.id,
          poNumber: poNumber(),
          status: 'Draft',
          expectedDelivery,
          totalAmount: new Prisma.Decimal(round2(totalAmount)),
          notes: 'Auto-drafted to replenish safety threshold buffer.',
          items: { create: itemsData },
        },
        include: { supplier: true, items: true },
      });

      for (const itemData of itemsData) {
        await this.db.product.update({
          where: { id: itemData.productId },
          data: {
            transitStock: itemData.orderedQty,
            transitPO: po.poNumber,
            transitETA: expectedDelivery,
          },
        });
      }

      created.push(po);
    }

    return { created: created.length, purchaseOrders: created };
  }
}
