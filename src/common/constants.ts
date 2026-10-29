export const DEPARTMENT = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Bakery & Artisan',
  'Pantry & Dry Goods',
  'Beverages',
  'Frozen',
  'Snacks & Confectionery',
  'Deli & Prepared Foods',
  'Health & Wellness',
  'Household & Cleaning',
  'Floral & Seasonal',
] as const;

export type Department = (typeof DEPARTMENT)[number];

export const STOCK_HEALTH_STATUS = [
  'Optimal',
  'Low Buffer',
  'Critical Low',
  'Out of Stock',
  'Expiring',
] as const;

export type StockHealthStatus = (typeof STOCK_HEALTH_STATUS)[number];

export const STOCK_REASON = [
  'Inbound shipment arrival (PO Intake)',
  'Cycle count audit adjustment',
  'Breakage / Spoilage write-off',
  'POS adjustment',
  'Backroom floor pull',
  'Return to vendor (RTV)',
] as const;

export const PO_STATUS = ['Draft', 'Submitted', 'In Transit', 'Received', 'Discrepancy'] as const;
export type PoStatus = (typeof PO_STATUS)[number];

export const PAYMENT_METHOD = [
  'Cash',
  'Credit / Debit Card',
  'Apple Pay / Contactless',
  'Supermarket Gift Card',
] as const;

export const CUSTOMER_TYPE = ['Regular', 'Loyalty Member', 'VIP SuperClub'] as const;

export const SALE_STATUS = ['Completed', 'Refunded', 'Voided'] as const;

export const AUDIT_ACTION = [
  'Price Override',
  'Stock Intake',
  'Spoilage Write-Off',
  'Cycle Audit',
  'ESL Sync',
  'Markdown Applied',
] as const;

export const ESL_SYNC_STATUS = ['synced', 'pending', 'error'] as const;

export const DEAD_STOCK_ACTION = [
  'markdown_30',
  'reallocate',
  'flash_50',
  'move_endcap',
  'rtv',
] as const;

export type DeadStockAction = (typeof DEAD_STOCK_ACTION)[number];

export const RECOMMENDED_ACTION: Record<DeadStockAction, string> = {
  markdown_30: 'Mark down 30% or Bundle',
  reallocate: 'Reallocate to Health Aisle',
  flash_50: 'Flash 50% discount',
  move_endcap: 'Move to checkout shelf #2',
  rtv: 'Return to Vendor (RTV)',
};

export const ROLE = {
  STORE_STAFF: 'STORE_STAFF',
  STORE_MANAGER: 'STORE_MANAGER',
  STORE_DIRECTOR: 'STORE_DIRECTOR',
} as const;

export type RoleValue = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_LABEL: Record<RoleValue, string> = {
  STORE_STAFF: 'Store Staff',
  STORE_MANAGER: 'Store Manager',
  STORE_DIRECTOR: 'Store Director',
};

export function computeStockStatus(
  currentStock: number,
  reorderPoint: number,
  criticalThreshold: number,
  daysUntilExpiry: number | null,
): StockHealthStatus {
  if (currentStock <= 0) return 'Out of Stock';
  if (currentStock <= criticalThreshold) return 'Critical Low';
  if (currentStock <= reorderPoint) return 'Low Buffer';
  if (daysUntilExpiry !== null && daysUntilExpiry <= 2) return 'Expiring';
  return 'Optimal';
}
