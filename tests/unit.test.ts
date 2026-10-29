import { describe, it, expect } from 'vitest';
import { round2, round3, calcMarginPercent, toNumber } from '../src/common/money';
import { computeStockStatus } from '../src/common/constants';
import { toCsv } from '../src/common/csv';
import { cacheKey } from '../src/common/cache';
import { serializeProduct, serializeSale } from '../src/common/serializers';

describe('money', () => {
  it('rounds to 2 and 3 decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round3(1.0005)).toBe(1.001);
  });

  it('coerces values safely', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber(null, 7)).toBe(7);
    expect(toNumber('abc', 3)).toBe(3);
  });

  it('calculates margin', () => {
    expect(calcMarginPercent(10, 6)).toBe(40);
    expect(calcMarginPercent(0, 6)).toBe(0);
  });
});

describe('computeStockStatus', () => {
  it('detects out of stock', () => {
    expect(computeStockStatus(0, 10, 5, null)).toBe('Out of Stock');
  });
  it('detects critical low', () => {
    expect(computeStockStatus(3, 10, 5, null)).toBe('Critical Low');
  });
  it('detects low buffer', () => {
    expect(computeStockStatus(8, 10, 5, null)).toBe('Low Buffer');
  });
  it('detects expiring', () => {
    expect(computeStockStatus(50, 10, 5, 1)).toBe('Expiring');
  });
  it('detects optimal', () => {
    expect(computeStockStatus(50, 10, 5, 30)).toBe('Optimal');
  });
});

describe('toCsv', () => {
  it('escapes special characters', () => {
    const csv = toCsv([{ name: 'Apples, "Fuji"', qty: 2 }], ['name', 'qty']);
    expect(csv).toBe('name,qty\r\n"Apples, ""Fuji""",2');
  });
});

describe('cacheKey', () => {
  it('is stable for identical params', () => {
    expect(cacheKey('x', { a: 1, b: 2 })).toBe(cacheKey('x', { b: 2, a: 1 }));
  });
  it('differs for different params', () => {
    expect(cacheKey('x', { a: 1 })).not.toBe(cacheKey('x', { a: 2 }));
  });
});

describe('serializers', () => {
  it('serializes a product with computed fields', () => {
    const product = serializeProduct({
      id: 'p1',
      sku: '#X',
      barcode: '123',
      name: 'Test',
      brand: 'B',
      packageType: 'unit',
      department: 'Produce',
      aisle: 'A1',
      bay: 'B1',
      shelfPlacement: 'Shelf',
      unit: 'units',
      retailPrice: { toString: () => '10' },
      wholesaleCost: { toString: () => '6' },
      grossMargin: 40,
      currentStock: { toString: () => '20' },
      reorderPoint: { toString: () => '10' },
      criticalThreshold: { toString: () => '5' },
      maxCapacity: { toString: () => '100' },
      unitsSoldToday: 1,
      unitsSoldWeek: 2,
      unitsSoldMonth: 3,
      unitsSoldYear: 4,
      revenueMonth: { toString: () => '100' },
      turnoverRate: 1,
      daysIdle: 0,
      tiedCapital: { toString: () => '120' },
      eslSyncStatus: 'synced',
      supplierId: 's1',
      supplier: { name: 'Supplier' },
    });
    expect(product.retailPrice).toBe(10);
    expect(product.capacityPercent).toBe(20);
    expect(product.supplierName).toBe('Supplier');
    expect(product.stockStatus).toBe('Optimal');
  });

  it('serializes a sale', () => {
    const sale = serializeSale({
      id: 's1',
      receiptNumber: 'REC-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      registerId: 'REG-1',
      cashierName: 'A',
      customerType: 'Regular',
      status: 'Completed',
      subtotal: 10,
      tax: 1,
      total: 11,
      totalMargin: 4,
      paymentMethod: 'Cash',
      items: [
        {
          productId: 'p1',
          sku: '#X',
          name: 'Item',
          unit: 'units',
          quantity: 1,
          unitPrice: 10,
          discount: 0,
          totalPrice: 10,
          unitCost: 6,
          marginAmount: 4,
        },
      ],
    });
    expect(sale.total).toBe(11);
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0]!.marginAmount).toBe(4);
  });
});
