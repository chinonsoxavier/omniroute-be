import { type PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../common/errors';
import { round2, toNumber } from '../../common/money';

const EXPIRY_WINDOW_DAYS = 3;

export interface LiveTelemetry {
  todayGrossSales: number;
  todayTargetSales: number;
  totalTransactions: number;
  avgBasketSize: number;
  totalSKUs: number;
  storeLedgerValue: number;
  inStockFillRate: number;
  stockoutsCount: number;
  lowBufferCount: number;
  shrinkageRiskAmount: number;
  perishablesAtRiskCount: number;
  salesGrowthVsYest: number;
}

export class TelemetryService {
  constructor(private readonly db: PrismaClient) {}

  private startOfToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private startOfYesterday(): Date {
    return new Date(this.startOfToday().getTime() - 86400000);
  }

  async computeLive(facilityId: string): Promise<LiveTelemetry> {
    const startToday = this.startOfToday();
    const startYesterday = this.startOfYesterday();
    const soon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000);

    const [todayAgg, yesterdayAgg, products, expiryAgg] = await Promise.all([
      this.db.saleTransaction.aggregate({
        where: { facilityId, status: 'Completed', createdAt: { gte: startToday } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.db.saleTransaction.aggregate({
        where: {
          facilityId,
          status: 'Completed',
          createdAt: { gte: startYesterday, lt: startToday },
        },
        _sum: { total: true },
      }),
      this.db.product.findMany({
        where: { facilityId, active: true },
        select: {
          currentStock: true,
          reorderPoint: true,
          tiedCapital: true,
          expiryDate: true,
        },
      }),
      this.db.product.aggregate({
        where: {
          facilityId,
          active: true,
          expiryDate: { lte: soon },
        },
        _sum: { tiedCapital: true },
        _count: { _all: true },
      }),
    ]);

    const todayGrossSales = round2(toNumber(todayAgg._sum.total));
    const yesterdayGrossSales = round2(toNumber(yesterdayAgg._sum.total));
    const totalTransactions = todayAgg._count._all;

    const totalSKUs = products.length;
    const storeLedgerValue = round2(
      products.reduce((sum, p) => sum + toNumber(p.tiedCapital), 0),
    );
    const stockoutsCount = products.filter((p) => toNumber(p.currentStock) <= 0).length;
    const lowBufferCount = products.filter((p) => {
      const stock = toNumber(p.currentStock);
      return stock > 0 && stock <= toNumber(p.reorderPoint);
    }).length;
    const inStockFillRate =
      totalSKUs > 0 ? round2(((totalSKUs - stockoutsCount) / totalSKUs) * 100) : 100;

    const salesGrowthVsYest =
      yesterdayGrossSales > 0
        ? round2(((todayGrossSales - yesterdayGrossSales) / yesterdayGrossSales) * 100)
        : todayGrossSales > 0
          ? 100
          : 0;

    return {
      todayGrossSales,
      todayTargetSales: 0,
      totalTransactions,
      avgBasketSize: totalTransactions > 0 ? round2(todayGrossSales / totalTransactions) : 0,
      totalSKUs,
      storeLedgerValue,
      inStockFillRate,
      stockoutsCount,
      lowBufferCount,
      shrinkageRiskAmount: round2(toNumber(expiryAgg._sum.tiedCapital)),
      perishablesAtRiskCount: expiryAgg._count._all,
      salesGrowthVsYest,
    };
  }

  async getTelemetry(facilityId: string) {
    const facility = await this.db.facility.findUnique({
      where: { id: facilityId },
      include: { telemetry: true },
    });
    if (!facility) throw new NotFoundError('Facility');

    const live = await this.computeLive(facilityId);
    const stored = facility.telemetry;

    return {
      facilityId,
      facilityName: facility.name,
      shiftNumber: stored?.shiftNumber ?? 1,
      activeRegisters: stored?.activeRegisters ?? '0/0',
      handheldUnitsOnline: stored?.handheldUnitsOnline ?? '0/0',
      telemetryStatus: stored?.telemetryStatus ?? 'Sync OK',
      weather: stored?.weather ?? 'N/A',
      peakFootTraffic: stored?.peakFootTraffic ?? 'N/A',
      todayGrossSales: live.todayGrossSales,
      todayTargetSales: stored ? round2(toNumber(stored.todayTargetSales)) : 0,
      salesGrowthVsYest: live.salesGrowthVsYest,
      totalTransactions: live.totalTransactions,
      avgBasketSize: live.avgBasketSize,
      totalSKUs: live.totalSKUs,
      storeLedgerValue: live.storeLedgerValue,
      inStockFillRate: live.inStockFillRate,
      stockoutsCount: live.stockoutsCount,
      lowBufferCount: live.lowBufferCount,
      shrinkageRiskAmount: live.shrinkageRiskAmount,
      perishablesAtRiskCount: live.perishablesAtRiskCount,
      coldChainTempAvg: stored?.coldChainTempAvg ?? 'N/A',
    };
  }
}
