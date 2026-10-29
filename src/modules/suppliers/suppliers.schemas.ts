import { z } from 'zod';
import { DEPARTMENT } from '../../common/constants';

export const listSuppliersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.enum(DEPARTMENT).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactPerson: z.string().trim().min(1).max(120),
  email: z.string().email(),
  phone: z.string().trim().min(3).max(40),
  category: z.array(z.enum(DEPARTMENT)).min(1),
  leadTimeHours: z.number().int().min(0).max(8760),
  reliabilityRating: z.number().min(0).max(100),
  paymentTerms: z.string().trim().min(1).max(60),
  address: z.string().trim().min(1).max(300),
  imageUrl: z.string().max(500).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type ListSuppliersQuery = z.infer<typeof listSuppliersSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
