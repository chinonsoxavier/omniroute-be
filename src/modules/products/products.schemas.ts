import { z } from 'zod';
import { DEPARTMENT, ESL_SYNC_STATUS } from '../../common/constants';

const departmentEnum = z.enum(DEPARTMENT);

export const listProductsSchema = z.object({
  search: z.string().trim().max(120).optional(),
  department: departmentEnum.optional(),
  stockStatus: z
    .enum(['Optimal', 'Low Buffer', 'Critical Low', 'Out of Stock', 'Expiring'])
    .optional(),
  aisle: z.string().trim().max(60).optional(),
  supplierId: z.string().min(1).optional(),
  sort: z
    .enum([
      'name',
      'sku',
      'retailPrice',
      'currentStock',
      'revenueMonth',
      'turnoverRate',
      'daysIdle',
      'grossMargin',
      'unitsSoldMonth',
      'tiedCapital',
    ])
    .default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(60),
  barcode: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(120),
  packageType: z.string().trim().min(1).max(120),
  department: departmentEnum,
  aisle: z.string().trim().min(1).max(60),
  bay: z.string().trim().min(1).max(60),
  shelfPlacement: z.string().trim().min(1).max(120),
  storageTemp: z.string().trim().max(120).optional(),
  unit: z.string().trim().min(1).max(30),
  retailPrice: z.number().min(0),
  wholesaleCost: z.number().min(0),
  currentStock: z.number().min(0).default(0),
  reorderPoint: z.number().min(0).default(0),
  criticalThreshold: z.number().min(0).default(0),
  maxCapacity: z.number().min(0).default(0),
  transitStock: z.number().min(0).optional(),
  transitPO: z.string().max(60).optional(),
  transitETA: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  batchLot: z.string().max(60).optional(),
  supplierId: z.string().min(1),
  eslSyncStatus: z.enum(ESL_SYNC_STATUS).default('pending'),
  eslChannel: z.string().max(80).optional(),
  imageUrl: z.string().max(500).optional(),
  categoryIcon: z.string().max(80).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const bulkPriceSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).optional(),
  department: departmentEnum.optional(),
  percent: z.number().min(-90).max(200),
  direction: z.enum(['increase', 'decrease']).default('decrease'),
  reason: z.string().trim().max(300).optional(),
});

export const stockOverrideSchema = z.object({
  type: z.enum(['stock', 'price', 'cost']),
  value: z.number().min(0),
  reason: z.string().trim().min(3).max(300),
  notes: z.string().trim().max(500).optional(),
  pushToEsl: z.boolean().default(false),
});

export const barcodeParamSchema = z.object({ code: z.string().trim().min(1).max(60) });

export type ListProductsQuery = z.infer<typeof listProductsSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;
export type StockOverrideInput = z.infer<typeof stockOverrideSchema>;
