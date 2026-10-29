import { Prisma, type PrismaClient } from '@prisma/client';
import { round2, toNumber } from '../../common/money';
import { TelemetryService } from '../telemetry/telemetry.service';
import type { TrendsQuery, TopProductsQuery } from './analytics.schemas';

const PERIOD_TRUNC: Record<TrendsQuery['period'], string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

export class AnalyticsService {
  private readonly telemetry: TelemetryService;

  constructor(private readonly db: PrismaClient) {
    this.telemetry = new TelemetryService(db);
  }

  async dashboard(facilityId: string) {
    const [live, topProducts, recentAudit, deadStockCount, forecasts] = await Promise.all([
      this.telemetry.computeLive(facilityId),
      this.db.product.findMany({
        where: { facilityId, active: true },
        orderBy: { revenueMonth: 'desc' },
        take: 6,
        select: {
          id: true,
          sku: true,
          name: true,
          department: true,
          revenueMonth: true,
          unitsSoldMonth: true,
          currentStock: true,
          unit: true,
        },
      }),
      this.db.auditLog.findMany({
        where: { facilityId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.db.deadStockAlert.count({ where: { facilityId } }),
      this.db.demandForecast.findMany({
        where: { facilityId },
        orderBy: { createdAt: 'asc' },
        take: 4,
      }),
    ]);

    return {
      kpis: {
        todayGrossSales: live.todayGrossSales,
        todayTargetSales: 0,
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
        deadStockCount,
      },
      topProducts: topProducts.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        department: p.department,
        revenueMonth: round2(toNumber(p.revenueMonth)),
        unitsSoldMonth: p.unitsSoldMonth,
        currentStock: round2(toNumber(p.currentStock)),
        unit: p.unit,
      })),
      recentAudit,
      forecasts,
    };
  }

  async trends(facilityId: string, query: TrendsQuery) {
    const unit = PERIOD_TRUNC[query.period];
    const from = query.from ?? new Date(Date.now() - 30 * 86400000);
    const to = query.to ?? new Date();

    const departmentFilter = query.department
      ? Prisma.sql`AND p."department" = ${query.department}`
      : Prisma.empty;

    const rows = await this.db.$queryRaw<
      Array<{ bucket: Date; revenue: unknown; transactions: bigint; margin: unknown; units: unknown }>
    >(Prisma.sql`
      SELECT date_trunc(${unit}, st."createdAt") AS bucket,
             SUM(st."total") AS revenue,
             COUNT(*) AS transactions,
             SUM(st."totalMargin") AS margin,
             COALESCE(SUM(si."quantity"), 0) AS units
      FROM "SaleTransaction" st
      LEFT JOIN "SaleItem" si ON si."saleId" = st."id"
      LEFT JOIN "Product" p ON p."id" = si."productId"
      WHERE st."facilityId" = ${facilityId}
        AND st."status" = 'Completed'
        AND st."createdAt" >= ${from}
        AND st."createdAt" <= ${to}
        ${departmentFilter}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return {
      period: query.period,
      points: rows.map((row) => ({
        bucket: row.bucket,
        revenue: round2(toNumber(row.revenue)),
        transactions: Number(row.transactions),
        margin: round2(toNumber(row.margin)),
        units: round2(toNumber(row.units)),
      })),
    };
  }

  async departments(facilityId: string) {
    const grouped = await this.db.product.groupBy({
      by: ['department'],
      where: { facilityId, active: true },
      _sum: { revenueMonth: true, unitsSoldMonth: true, tiedCapital: true },
      _count: { _all: true },
    });

    const totalRevenue = grouped.reduce((sum, g) => sum + toNumber(g._sum.revenueMonth), 0);

    return {
      items: grouped
        .map((g) => {
          const revenue = round2(toNumber(g._sum.revenueMonth));
          return {
            department: g.department,
            productCount: g._count._all,
            revenueMonth: revenue,
            unitsSoldMonth: round2(toNumber(g._sum.unitsSoldMonth)),
            tiedCapital: round2(toNumber(g._sum.tiedCapital)),
            contributionPercent:
              totalRevenue > 0 ? round2((revenue / totalRevenue) * 100) : 0,
          };
        })
        .sort((a, b) => b.revenueMonth - a.revenueMonth),
    };
  }

  async topProducts(facilityId: string, query: TopProductsQuery) {
    const orderBy =
      query.metric === 'units' ? { unitsSoldMonth: 'desc' as const } : { revenueMonth: 'desc' as const };

    const items = await this.db.product.findMany({
      where: { facilityId, active: true },
      orderBy,
      take: query.limit,
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        department: true,
        unit: true,
        revenueMonth: true,
        unitsSoldMonth: true,
        grossMargin: true,
        turnoverRate: true,
      },
    });

    return {
      metric: query.metric,
      items: items.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        department: p.department,
        unit: p.unit,
        revenueMonth: round2(toNumber(p.revenueMonth)),
        unitsSoldMonth: p.unitsSoldMonth,
        grossMargin: p.grossMargin,
        turnoverRate: p.turnoverRate,
      })),
    };
  }
}
