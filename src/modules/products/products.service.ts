import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../../common/errors';
import { calcMarginPercent, round2, round3, toNumber } from '../../common/money';
import type {
  ListProductsQuery,
  CreateProductInput,
  UpdateProductInput,
  BulkPriceInput,
  StockOverrideInput,
} from './products.schemas';
import type { AuthUser } from '../../types/fastify';

const EXPIRY_WINDOW_DAYS = 2;

interface AuditContext {
  user: AuthUser;
}

export class ProductService {
  constructor(private readonly db: PrismaClient) {}

  private buildStockStatusWhere(status: string): Prisma.ProductWhereInput {
    const fields = this.db.product.fields;
    const soon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000);

    switch (status) {
      case 'Out of Stock':
        return { currentStock: { lte: 0 } };
      case 'Critical Low':
        return { currentStock: { gt: 0, lte: fields.criticalThreshold } };
      case 'Low Buffer':
        return {
          currentStock: { gt: fields.criticalThreshold, lte: fields.reorderPoint },
        };
      case 'Expiring':
        return {
          currentStock: { gt: fields.reorderPoint },
          expiryDate: { not: null, lte: soon },
        };
      case 'Optimal':
        return {
          currentStock: { gt: fields.reorderPoint },
          OR: [{ expiryDate: null }, { expiryDate: { gt: soon } }],
        };
      default:
        return {};
    }
  }

  async list(facilityId: string, query: ListProductsQuery) {
    const where: Prisma.ProductWhereInput = { facilityId, active: true };

    if (query.search) {
      const search = query.search;
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (query.department) where.department = query.department;
    if (query.aisle) where.aisle = { contains: query.aisle, mode: 'insensitive' };
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.stockStatus) Object.assign(where, this.buildStockStatusWhere(query.stockStatus));

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { [query.sort]: query.dir },
        skip,
        take: query.limit,
      }),
      this.db.product.count({ where }),
    ]);

    return { items, total };
  }

  async getById(facilityId: string, id: string) {
    const product = await this.db.product.findFirst({
      where: { id, facilityId },
      include: { supplier: true },
    });
    if (!product) throw new NotFoundError('Product');
    return product;
  }

  async getByBarcode(facilityId: string, code: string) {
    const product = await this.db.product.findFirst({
      where: {
        facilityId,
        active: true,
        OR: [{ barcode: code }, { sku: code }],
      },
      include: { supplier: true },
    });
    if (!product) throw new NotFoundError('Product');
    return product;
  }

  async create(facilityId: string, input: CreateProductInput, ctx: AuditContext) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: input.supplierId, facilityId },
    });
    if (!supplier) throw new BadRequestError('Supplier not found for this facility');

    const grossMargin = calcMarginPercent(input.retailPrice, input.wholesaleCost);
    const tiedCapital = round2(input.currentStock * input.wholesaleCost);

    const product = await this.db.product.create({
      data: {
        facilityId,
        supplierId: input.supplierId,
        sku: input.sku,
        barcode: input.barcode,
        name: input.name,
        brand: input.brand,
        packageType: input.packageType,
        department: input.department,
        aisle: input.aisle,
        bay: input.bay,
        shelfPlacement: input.shelfPlacement,
        storageTemp: input.storageTemp,
        unit: input.unit,
        retailPrice: new Prisma.Decimal(input.retailPrice),
        wholesaleCost: new Prisma.Decimal(input.wholesaleCost),
        grossMargin,
        currentStock: new Prisma.Decimal(input.currentStock),
        reorderPoint: new Prisma.Decimal(input.reorderPoint),
        criticalThreshold: new Prisma.Decimal(input.criticalThreshold),
        maxCapacity: new Prisma.Decimal(input.maxCapacity),
        transitStock: input.transitStock !== undefined ? new Prisma.Decimal(input.transitStock) : null,
        transitPO: input.transitPO,
        transitETA: input.transitETA,
        expiryDate: input.expiryDate,
        batchLot: input.batchLot,
        tiedCapital: new Prisma.Decimal(tiedCapital),
        eslSyncStatus: input.eslSyncStatus,
        eslChannel: input.eslChannel,
        imageUrl: input.imageUrl,
        categoryIcon: input.categoryIcon,
      },
      include: { supplier: true },
    });

    await this.db.auditLog.create({
      data: {
        facilityId,
        sku: product.sku,
        productName: product.name,
        actionType: 'Cycle Audit',
        previousValue: 'None',
        newValue: `${input.currentStock} ${input.unit}`,
        delta: input.currentStock,
        reason: `New product created: ${product.name}`,
        user: ctx.user.name,
        userId: ctx.user.id,
        financialImpact: new Prisma.Decimal(tiedCapital),
      },
    });

    return product;
  }

  async update(facilityId: string, id: string, input: UpdateProductInput) {
    const existing = await this.getById(facilityId, id);
    if (input.supplierId) {
      const supplier = await this.db.supplier.findFirst({
        where: { id: input.supplierId, facilityId },
      });
      if (!supplier) throw new BadRequestError('Supplier not found for this facility');
    }

    const retailPrice = input.retailPrice ?? toNumber(existing.retailPrice);
    const wholesaleCost = input.wholesaleCost ?? toNumber(existing.wholesaleCost);
    const currentStock = input.currentStock ?? toNumber(existing.currentStock);
    const grossMargin = calcMarginPercent(retailPrice, wholesaleCost);
    const tiedCapital = round2(currentStock * wholesaleCost);

    return this.db.product.update({
      where: { id },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
        ...(input.packageType !== undefined ? { packageType: input.packageType } : {}),
        ...(input.department !== undefined ? { department: input.department } : {}),
        ...(input.aisle !== undefined ? { aisle: input.aisle } : {}),
        ...(input.bay !== undefined ? { bay: input.bay } : {}),
        ...(input.shelfPlacement !== undefined ? { shelfPlacement: input.shelfPlacement } : {}),
        ...(input.storageTemp !== undefined ? { storageTemp: input.storageTemp } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.retailPrice !== undefined
          ? { retailPrice: new Prisma.Decimal(input.retailPrice) }
          : {}),
        ...(input.wholesaleCost !== undefined
          ? { wholesaleCost: new Prisma.Decimal(input.wholesaleCost) }
          : {}),
        grossMargin,
        tiedCapital: new Prisma.Decimal(tiedCapital),
        ...(input.currentStock !== undefined
          ? { currentStock: new Prisma.Decimal(input.currentStock) }
          : {}),
        ...(input.reorderPoint !== undefined
          ? { reorderPoint: new Prisma.Decimal(input.reorderPoint) }
          : {}),
        ...(input.criticalThreshold !== undefined
          ? { criticalThreshold: new Prisma.Decimal(input.criticalThreshold) }
          : {}),
        ...(input.maxCapacity !== undefined
          ? { maxCapacity: new Prisma.Decimal(input.maxCapacity) }
          : {}),
        ...(input.transitStock !== undefined
          ? { transitStock: new Prisma.Decimal(input.transitStock) }
          : {}),
        ...(input.transitPO !== undefined ? { transitPO: input.transitPO } : {}),
        ...(input.transitETA !== undefined ? { transitETA: input.transitETA } : {}),
        ...(input.expiryDate !== undefined ? { expiryDate: input.expiryDate } : {}),
        ...(input.batchLot !== undefined ? { batchLot: input.batchLot } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.eslSyncStatus !== undefined ? { eslSyncStatus: input.eslSyncStatus } : {}),
        ...(input.eslChannel !== undefined ? { eslChannel: input.eslChannel } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.categoryIcon !== undefined ? { categoryIcon: input.categoryIcon } : {}),
      },
      include: { supplier: true },
    });
  }

  async softDelete(facilityId: string, id: string) {
    await this.getById(facilityId, id);
    await this.db.product.update({ where: { id }, data: { active: false } });
  }

  async bulkPriceUpdate(facilityId: string, input: BulkPriceInput, ctx: AuditContext) {
    const where: Prisma.ProductWhereInput = { facilityId, active: true };
    if (input.productIds?.length) where.id = { in: input.productIds };
    if (input.department) where.department = input.department;

    const products = await this.db.product.findMany({ where });
    if (products.length === 0) throw new BadRequestError('No products matched the bulk price criteria');

    const factor = input.direction === 'increase' ? 1 + input.percent / 100 : 1 - input.percent / 100;
    const reason = input.reason ?? `Bulk price ${input.direction} of ${input.percent}%`;

    const operations = products.map((product) => {
      const oldPrice = toNumber(product.retailPrice);
      const newPrice = round2(Math.max(0.01, oldPrice * factor));
      const grossMargin = calcMarginPercent(newPrice, toNumber(product.wholesaleCost));
      return this.db.product.update({
        where: { id: product.id },
        data: {
          previousRetailPrice: product.retailPrice,
          retailPrice: new Prisma.Decimal(newPrice),
          discountPercentage:
            input.direction === 'decrease' ? input.percent : product.discountPercentage,
          grossMargin,
          eslSyncStatus: 'pending',
        },
      });
    });

    const auditOperations = products.map((product) => {
      const oldPrice = toNumber(product.retailPrice);
      const newPrice = round2(Math.max(0.01, oldPrice * factor));
      return this.db.auditLog.create({
        data: {
          facilityId,
          sku: product.sku,
          productName: product.name,
          actionType: 'Markdown Applied',
          previousValue: `$${oldPrice.toFixed(2)}`,
          newValue: `$${newPrice.toFixed(2)}`,
          reason,
          user: ctx.user.name,
          userId: ctx.user.id,
          financialImpact: new Prisma.Decimal(0),
        },
      });
    });

    await this.db.$transaction([...operations, ...auditOperations]);
    return { updated: products.length };
  }

  async stockOverride(facilityId: string, id: string, input: StockOverrideInput, ctx: AuditContext) {
    const product = await this.getById(facilityId, id);
    let actionType: string;
    let previousValue: string;
    let newValue: string;
    let delta: number | undefined;
    let financialImpact = 0;

    const data: Prisma.ProductUpdateInput = {};

    if (input.type === 'stock') {
      const previous = toNumber(product.currentStock);
      delta = round3(input.value - previous);
      data.currentStock = new Prisma.Decimal(input.value);
      data.tiedCapital = new Prisma.Decimal(round2(input.value * toNumber(product.wholesaleCost)));
      data.daysIdle = 0;
      actionType = delta >= 0 ? 'Stock Intake' : 'Spoilage Write-Off';
      previousValue = `${round3(previous)} ${product.unit}`;
      newValue = `${round3(input.value)} ${product.unit}`;
      financialImpact = round2(Math.abs(delta) * toNumber(product.wholesaleCost));

      await this.db.stockMovement.create({
        data: {
          facilityId,
          productId: id,
          quantity: new Prisma.Decimal(delta),
          reason: input.reason,
          reference: input.notes,
          userId: ctx.user.id,
        },
      });
    } else if (input.type === 'price') {
      const previous = toNumber(product.retailPrice);
      const margin = calcMarginPercent(input.value, toNumber(product.wholesaleCost));
      data.previousRetailPrice = product.retailPrice;
      data.retailPrice = new Prisma.Decimal(input.value);
      data.grossMargin = margin;
      actionType = 'Price Override';
      previousValue = `$${previous.toFixed(2)}`;
      newValue = `$${input.value.toFixed(2)}`;
    } else {
      const previous = toNumber(product.wholesaleCost);
      const margin = calcMarginPercent(toNumber(product.retailPrice), input.value);
      data.wholesaleCost = new Prisma.Decimal(input.value);
      data.grossMargin = margin;
      data.tiedCapital = new Prisma.Decimal(
        round2(toNumber(product.currentStock) * input.value),
      );
      actionType = 'Price Override';
      previousValue = `$${previous.toFixed(2)}`;
      newValue = `$${input.value.toFixed(2)}`;
    }

    if (input.pushToEsl) {
      data.eslSyncStatus = 'pending';
    }

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.product.update({
        where: { id },
        data,
        include: { supplier: true },
      });
      await tx.auditLog.create({
        data: {
          facilityId,
          sku: product.sku,
          productName: product.name,
          actionType,
          previousValue,
          newValue,
          delta: delta ?? null,
          reason: input.notes ? `${input.reason} — ${input.notes}` : input.reason,
          user: ctx.user.name,
          userId: ctx.user.id,
          financialImpact: new Prisma.Decimal(financialImpact),
        },
      });
      return result;
    });

    return updated;
  }

  async exportRows(facilityId: string, query: ListProductsQuery) {
    const { items } = await this.list(facilityId, { ...query, page: 1, limit: 200 });
    return items;
  }
}
