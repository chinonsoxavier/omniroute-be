import { z } from 'zod';
import { DEAD_STOCK_ACTION } from '../../common/constants';

export const listDeadStockSchema = z.object({
  department: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const resolveDeadStockSchema = z.object({
  actionType: z.enum(DEAD_STOCK_ACTION),
  reason: z.string().trim().max(300).optional(),
});

export type ListDeadStockQuery = z.infer<typeof listDeadStockSchema>;
export type ResolveDeadStockInput = z.infer<typeof resolveDeadStockSchema>;
