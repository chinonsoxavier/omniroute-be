import { z } from 'zod';
import { AUDIT_ACTION } from '../../common/constants';

export const listAuditSchema = z.object({
  actionType: z.enum(AUDIT_ACTION).optional(),
  sku: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListAuditQuery = z.infer<typeof listAuditSchema>;
