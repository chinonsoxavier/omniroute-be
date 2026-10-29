import { type PrismaClient } from '@prisma/client';
import { toNumber, round3 } from '../../common/money';

const EXPIRY_WINDOW_DAYS = 3;

export interface NotificationItem {
  id: string;
  type: 'low_stock' | 'expiring' | 'dead_stock';
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  sku: string;
  productId: string;
}

export class NotificationService {
  constructor(private readonly db: PrismaClient) {}

  async summary(facilityId: string) {
    const soon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000);

    const products = await this.db.product.findMany({
      where: { facilityId, active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        currentStock: true,
        reorderPoint: true,
        criticalThreshold: true,
        expiryDate: true,
        unit: true,
      },
    });

    const deadStock = await this.db.deadStockAlert.findMany({
      where: { facilityId },
      select: { id: true, productId: true, sku: true, productName: true, daysIdle: true },
      take: 10,
    });

    const items: NotificationItem[] = [];

    for (const product of products) {
      const stock = toNumber(product.currentStock);
      const reorder = toNumber(product.reorderPoint);
      const critical = toNumber(product.criticalThreshold);

      if (stock <= reorder) {
        items.push({
          id: `low-${product.id}`,
          type: 'low_stock',
          severity: stock <= critical ? 'critical' : 'warning',
          title: stock <= 0 ? 'Out of stock' : stock <= critical ? 'Critical low' : 'Low buffer',
          message: `${product.name} — ${round3(stock)} ${product.unit} on hand (reorder at ${round3(reorder)})`,
          sku: product.sku,
          productId: product.id,
        });
      }

      if (product.expiryDate && product.expiryDate <= soon) {
        const days = Math.max(
          0,
          Math.ceil((product.expiryDate.getTime() - Date.now()) / 86400000),
        );
        items.push({
          id: `exp-${product.id}`,
          type: 'expiring',
          severity: days <= 1 ? 'critical' : 'warning',
          title: 'Expiring soon',
          message: `${product.name} expires in ${days} day${days === 1 ? '' : 's'}`,
          sku: product.sku,
          productId: product.id,
        });
      }
    }

    for (const alert of deadStock) {
      items.push({
        id: `dead-${alert.id}`,
        type: 'dead_stock',
        severity: 'warning',
        title: 'Dead stock',
        message: `${alert.productName} idle for ${alert.daysIdle} days`,
        sku: alert.sku,
        productId: alert.productId,
      });
    }

    return {
      counts: {
        lowStock: items.filter((i) => i.type === 'low_stock').length,
        expiring: items.filter((i) => i.type === 'expiring').length,
        deadStock: items.filter((i) => i.type === 'dead_stock').length,
        critical: items.filter((i) => i.severity === 'critical').length,
        total: items.length,
      },
      items: items.slice(0, 50),
    };
  }
}
