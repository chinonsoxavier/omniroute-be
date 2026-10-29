import { z } from 'zod';
import { CUSTOMER_TYPE, PAYMENT_METHOD, SALE_STATUS } from '../../common/constants';

export const listSalesSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(SALE_STATUS).optional(),
  registerId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const saleItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  discount: z.number().min(0).max(100).default(0),
});

export const createSaleSchema = z.object({
  registerId: z.string().trim().min(1).max(40),
  cashierName: z.string().trim().min(1).max(120),
  customerType: z.enum(CUSTOMER_TYPE).default('Regular'),
  paymentMethod: z.enum(PAYMENT_METHOD),
  items: z.array(saleItemInputSchema).min(1),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().max(120).optional(),
});

export const refundSaleSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export type ListSalesQuery = z.infer<typeof listSalesSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type RefundSaleInput = z.infer<typeof refundSaleSchema>;
