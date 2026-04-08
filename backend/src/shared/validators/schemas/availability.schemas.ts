import { z } from 'zod';

export const availabilitySchema = z.object({
  startAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'startAt must be a valid datetime string',
  }),
  endAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'endAt must be a valid datetime string',
  }),
  buildingId: z.string()
    .optional()
    .transform((val) => val ? Number(val) : undefined)
    .refine((val) => val === undefined || (Number.isInteger(val) && val > 0), {
      message: 'buildingId must be a positive integer',
    }),
  format: z.enum(['list', 'matrix'])
    .optional()
    .default('list'),
  slotDuration: z.string()
    .optional()
    .transform((val) => val ? Number(val) : 60)
    .refine((val) => Number.isInteger(val) && val > 0 && val <= 480, {
      message: 'slotDuration must be a positive integer between 1 and 480 minutes',
    }),
}).refine((data) => {
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  return start < end;
}, {
  message: 'startAt must be before endAt',
  path: ['startAt'],
});

export type AvailabilityQuery = z.infer<typeof availabilitySchema>;
