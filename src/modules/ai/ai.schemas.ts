import { z } from 'zod';

export const copilotSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        sender: z.enum(['user', 'ai']),
        text: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
});

export const reportSchema = z.object({
  type: z.enum(['shift_brief', 'floor_audit', 'margin_audit']),
});

export type CopilotInput = z.infer<typeof copilotSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
