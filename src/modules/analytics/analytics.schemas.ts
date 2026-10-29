import { z } from 'zod';
import { DEPARTMENT } from '../../common/constants';

export const dashboardSchema = z.object({});

export const trendsSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('daily'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  department: z.enum(DEPARTMENT).optional(),
});

export const topProductsSchema = z.object({
  metric: z.enum(['revenue', 'units']).default('revenue'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type TrendsQuery = z.infer<typeof trendsSchema>;
export type TopProductsQuery = z.infer<typeof topProductsSchema>;
