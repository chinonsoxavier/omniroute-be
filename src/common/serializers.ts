import { toNumber, round2, round3 } from './money';
import { computeStockStatus, ROLE_LABEL, type RoleValue } from './constants';

type AnyRecord = Record<string, any>;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / MS_PER_DAY);
}

export function serializeFacility(facility: AnyRecord) {
  return {
    id: facility.id,
    code: facility.code,
    name: facility.name,
    address: facility.address ?? null,
    timezone: facility.timezone,
    active: facility.active,
  };
}

export function serializeSettings(settings: AnyRecord) {
  return {
    safetyBufferDays: settings.safetyBufferDays,
    posSyncRateSeconds: settings.posSyncRateSeconds,
    coldChainMinTempF: settings.coldChainMinTempF,
    coldChainMaxTempF: settings.coldChainMaxTempF,
    taxRate: settings.taxRate,
    eslProtocol: settings.eslProtocol,
    eslChannel: settings.eslChannel,
  };
}

export function serializeSupplier(supplier: AnyRecord) {
  return {
    id: supplier.id,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    email: supplier.email,
    phone: supplier.phone,
    category: supplier.category ?? [],
    leadTimeHours: supplier.leadTimeHours,
    reliabilityRating: supplier.reliabilityRating,
    paymentTerms: supplier.paymentTerms,
    activePOsCount: supplier._count?.purchaseOrders ?? supplier.activePOsCount ?? 0,
    address: supplier.address,
    imageUrl: supplier.imageUrl ?? null,
  };
}

export function serializeProduct(product: AnyRecord) {
  const dte = daysUntil(product.expiryDate);
  const currentStock = toNumber(product.currentStock);
  const reorderPoint = toNumber(product.reorderPoint);
  const criticalThreshold = toNumber(product.criticalThreshold);
  const maxCapacity = toNumber(product.maxCapacity);

  return {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    packageType: product.packageType,
    department: product.department,
    aisle: product.aisle,
    bay: product.bay,
    shelfPlacement: product.shelfPlacement,
    storageTemp: product.storageTemp ?? null,
    unit: product.unit,
    retailPrice: round2(toNumber(product.retailPrice)),
    wholesaleCost: round2(toNumber(product.wholesaleCost)),
    grossMargin: product.grossMargin,
    previousRetailPrice: product.previousRetailPrice ? round2(toNumber(product.previousRetailPrice)) : null,
    discountPercentage: product.discountPercentage ?? null,
    currentStock: round3(currentStock),
    reorderPoint: round3(reorderPoint),
    criticalThreshold: round3(criticalThreshold),
    maxCapacity: round3(maxCapacity),
    transitStock: product.transitStock !== null && product.transitStock !== undefined ? round3(toNumber(product.transitStock)) : null,
    transitPO: product.transitPO ?? null,
    transitETA: product.transitETA ?? null,
    expiryDate: product.expiryDate ?? null,
    daysUntilExpiry: dte,
    batchLot: product.batchLot ?? null,
    supplierId: product.supplierId,
    supplierName: product.supplier?.name ?? product.supplierName ?? null,
    unitsSoldToday: product.unitsSoldToday,
    unitsSoldWeek: product.unitsSoldWeek,
    unitsSoldMonth: product.unitsSoldMonth,
    unitsSoldYear: product.unitsSoldYear,
    revenueMonth: round2(toNumber(product.revenueMonth)),
    turnoverRate: product.turnoverRate,
    daysIdle: product.daysIdle,
    tiedCapital: round2(toNumber(product.tiedCapital)),
    eslSyncStatus: product.eslSyncStatus,
    eslChannel: product.eslChannel ?? null,
    imageUrl: product.imageUrl ?? null,
    categoryIcon: product.categoryIcon ?? null,
    stockStatus: computeStockStatus(currentStock, reorderPoint, criticalThreshold, dte),
    capacityPercent: maxCapacity > 0 ? round2((currentStock / maxCapacity) * 100) : 0,
  };
}

export function serializeSale(sale: AnyRecord) {
  return {
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    timestamp: sale.createdAt,
    registerId: sale.registerId,
    cashierName: sale.cashierName,
    customerType: sale.customerType,
    items: (sale.items ?? []).map((item: AnyRecord) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      quantity: round3(toNumber(item.quantity)),
      unitPrice: round2(toNumber(item.unitPrice)),
      discount: item.discount,
      totalPrice: round2(toNumber(item.totalPrice)),
      unitCost: round2(toNumber(item.unitCost)),
      marginAmount: round2(toNumber(item.marginAmount)),
    })),
    subtotal: round2(toNumber(sale.subtotal)),
    tax: round2(toNumber(sale.tax)),
    total: round2(toNumber(sale.total)),
    paymentMethod: sale.paymentMethod,
    totalMargin: round2(toNumber(sale.totalMargin)),
    status: sale.status,
  };
}

export function serializePurchaseOrder(po: AnyRecord) {
  return {
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplier?.name ?? po.supplierName ?? null,
    status: po.status,
    orderDate: po.orderDate,
    expectedDelivery: po.expectedDelivery,
    receivedDate: po.receivedDate ?? null,
    items: (po.items ?? []).map((item: AnyRecord) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      orderedQty: round3(toNumber(item.orderedQty)),
      receivedQty: item.receivedQty !== null && item.receivedQty !== undefined ? round3(toNumber(item.receivedQty)) : null,
      unitCost: round2(toNumber(item.unitCost)),
      totalCost: round2(toNumber(item.totalCost)),
      unit: item.unit,
    })),
    totalAmount: round2(toNumber(po.totalAmount)),
    coldChainVerified: po.coldChainVerified ?? null,
    temperatureReading: po.temperatureReading ?? null,
    dockNumber: po.dockNumber ?? null,
    verifiedBy: po.verifiedBy ?? null,
    notes: po.notes ?? null,
  };
}

export function serializeAuditLog(log: AnyRecord) {
  return {
    id: log.id,
    timestamp: log.createdAt,
    sku: log.sku,
    productName: log.productName,
    actionType: log.actionType,
    previousValue: log.previousValue,
    newValue: log.newValue,
    delta: log.delta ?? null,
    reason: log.reason,
    user: log.user,
    financialImpact: log.financialImpact !== null && log.financialImpact !== undefined ? round2(toNumber(log.financialImpact)) : null,
  };
}

export function serializeDeadStock(alert: AnyRecord) {
  return {
    id: alert.id,
    productId: alert.productId,
    sku: alert.sku,
    productName: alert.productName,
    department: alert.department,
    shelfLocation: alert.shelfLocation,
    daysIdle: alert.daysIdle,
    stock: round3(toNumber(alert.stock)),
    unit: alert.unit,
    tiedCapital: round2(toNumber(alert.tiedCapital)),
    recommendedAction: alert.recommendedAction,
    actionType: alert.actionType,
  };
}

export function serializeForecast(forecast: AnyRecord) {
  return {
    id: forecast.id,
    title: forecast.title,
    tag: forecast.tag,
    changePercentage: forecast.changePercentage,
    isPositive: forecast.isPositive,
    description: forecast.description,
    supplierLead: forecast.supplierLead,
    actionText: forecast.actionText,
    actionType: forecast.actionType,
    telemetryNote: forecast.telemetryNote ?? null,
  };
}

export function serializeUser(user: AnyRecord) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    name: user.fullName,
    role: user.role,
    roleLabel: ROLE_LABEL[user.role as RoleValue] ?? user.role,
    facilityId: user.facilityId,
    facilityName: user.facility?.name ?? null,
    active: user.active,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}
