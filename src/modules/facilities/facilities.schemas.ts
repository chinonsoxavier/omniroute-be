import { z } from 'zod';

export const updateSettingsSchema = z.object({
  safetyBufferDays: z.number().int().min(0).max(90).optional(),
  posSyncRateSeconds: z.number().int().min(5).max(600).optional(),
  coldChainMinTempF: z.number().min(-40).max(140).optional(),
  coldChainMaxTempF: z.number().min(-40).max(140).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  eslProtocol: z.string().min(1).max(60).optional(),
  eslChannel: z.string().min(1).max(60).optional(),
});

export const updateTelemetrySchema = z.object({
  activeRegisters: z.string().max(40).optional(),
  handheldUnitsOnline: z.string().max(40).optional(),
  telemetryStatus: z.enum(['Sync OK', 'Syncing', 'Degraded']).optional(),
  weather: z.string().max(120).optional(),
  peakFootTraffic: z.string().max(200).optional(),
  todayTargetSales: z.number().min(0).optional(),
  salesGrowthVsYest: z.number().optional(),
  shiftNumber: z.number().int().min(1).optional(),
  coldChainTempAvg: z.string().max(60).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateTelemetryInput = z.infer<typeof updateTelemetrySchema>;
