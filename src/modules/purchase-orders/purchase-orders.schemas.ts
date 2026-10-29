import { z } from 'zod';
import { PO_STATUS } from '../../common/constants';

export const listPoSchema = z.object({
  status: z.enum(PO_STATUS).optional(),
  supplierId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const poItemInputSchema = z.object({
  productId: z.string().min(1),
  orderedQty: z.number().min(0.001),
  unitCost: z.number().min(0).optional(),
});

export const createPoSchema = z.object({
  supplierId: z.string().min(1),
  expectedDelivery: z.coerce.date().optional(),
  items: z.array(poItemInputSchema).min(1),
  notes: z.string().trim().max(500).optional(),
  submit: z.boolean().default(false),
});

export const receiveItemSchema = z.object({
  itemId: z.string().min(1),
  receivedQty: z.number().min(0),
});

export const receivePoSchema = z.object({
  dockNumber: z.string().trim().max(60).optional(),
  temperatureReading: z.string().trim().max(120).optional(),
  coldChainVerified: z.boolean().optional(),
  verifiedBy: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(receiveItemSchema).optional(),
});

export const autoDraftSchema = z.object({
  supplierId: z.string().min(1).optional(),
});

export type ListPoQuery = z.infer<typeof listPoSchema>;
export type CreatePoInput = z.infer<typeof createPoSchema>;
export type ReceivePoInput = z.infer<typeof receivePoSchema>;
