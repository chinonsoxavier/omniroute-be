import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, isDbAvailable, uniqueEmail } from './helpers';

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)('products & sales', () => {
  let app: FastifyInstance;
  let token = '';
  let supplierId = '';
  let productId = '';

  beforeAll(async () => {
    app = await createTestApp();
    const email = uniqueEmail('prods');
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { fullName: 'Merch Lead', email, password: 'Password1!', role: 'STORE_DIRECTOR' },
    });
    token = reg.json().accessToken;

    const suppliers = await app.inject({
      method: 'GET',
      url: '/api/v1/suppliers',
      headers: { authorization: `Bearer ${token}` },
    });
    const items = suppliers.json().items;
    if (items.length > 0) {
      supplierId = items[0].id;
    } else {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/suppliers',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Test Vendor',
          contactPerson: 'Pat',
          email: 'pat@vendor.dev',
          phone: '+1 555 000 0000',
          category: ['Produce'],
          leadTimeHours: 24,
          reliabilityRating: 95,
          paymentTerms: 'Net 30',
          address: '1 Test Way',
        },
      });
      supplierId = created.json().supplier.id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('creates a product', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: auth(),
      payload: {
        sku: `#TEST-${Date.now()}`,
        barcode: String(Date.now()).slice(0, 12).padEnd(12, '0'),
        name: 'Test Kiwi Crate',
        brand: 'Test Brand',
        packageType: 'Crate',
        department: 'Produce',
        aisle: 'Aisle 99',
        bay: 'Bay 1',
        shelfPlacement: 'Test Rack',
        unit: 'units',
        retailPrice: 9.99,
        wholesaleCost: 6,
        currentStock: 50,
        reorderPoint: 10,
        criticalThreshold: 5,
        maxCapacity: 100,
        supplierId,
      },
    });
    expect(res.statusCode).toBe(201);
    const product = res.json().product;
    expect(product.grossMargin).toBeGreaterThan(0);
    productId = product.id;
  });

  it('lists products with pagination meta', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/products?limit=5',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.limit).toBe(5);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it('filters by stock status using column comparisons', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/products?stockStatus=Low%20Buffer',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
  });

  it('performs a stock override and writes an audit log', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/stock-override`,
      headers: auth(),
      payload: { type: 'stock', value: 75, reason: 'Cycle count adjustment', pushToEsl: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().product.currentStock).toBe(75);

    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/audit-logs?search=${encodeURIComponent('Kiwi')}`,
      headers: auth(),
    });
    expect(audit.statusCode).toBe(200);
  });

  it('records a sale atomically and decrements stock', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: auth(),
      payload: {
        registerId: 'REG-01',
        cashierName: 'Test Cashier',
        customerType: 'Regular',
        paymentMethod: 'Cash',
        items: [{ productId, quantity: 5, discount: 0 }],
      },
    });
    expect(res.statusCode).toBe(201);
    const sale = res.json().sale;
    expect(sale.total).toBeGreaterThan(0);

    const product = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}`,
      headers: auth(),
    });
    expect(product.json().product.currentStock).toBe(70);
  });

  it('is idempotent for repeated sales with the same key', async () => {
    const key = `idem-${Date.now()}`;
    const payload = {
      registerId: 'REG-02',
      cashierName: 'Test Cashier',
      customerType: 'Regular',
      paymentMethod: 'Cash',
      idempotencyKey: key,
      items: [{ productId, quantity: 1, discount: 0 }],
    };
    const first = await app.inject({ method: 'POST', url: '/api/v1/sales', headers: auth(), payload });
    const second = await app.inject({ method: 'POST', url: '/api/v1/sales', headers: auth(), payload });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().sale.id).toBe(first.json().sale.id);
  });

  it('rejects overselling', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: auth(),
      payload: {
        registerId: 'REG-01',
        cashierName: 'Test Cashier',
        customerType: 'Regular',
        paymentMethod: 'Cash',
        items: [{ productId, quantity: 99999, discount: 0 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns dashboard KPIs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/dashboard',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().kpis).toBeTruthy();
  });

  it('returns notification summary', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().counts).toBeTruthy();
  });

  it('runs the AI copilot rule engine', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/copilot',
      headers: auth(),
      payload: { message: 'What is low on stock?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.sender).toBe('ai');
    expect(res.json().message.structuredData).toBeTruthy();
  });
});
