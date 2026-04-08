import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().refine((val) => {
    const num = parseInt(val, 10);
    return !isNaN(num) && num > 0;
  }, {
    message: 'ID must be a positive integer',
  }).transform((val) => parseInt(val, 10)),
});

export const paginationSchema = z.object({
  limit: z.string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'Limit must be a positive integer',
    }),
  offset: z.string()
    .optional()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: 'Offset must be a non-negative integer',
    }),
});

export const dateRangeSchema = z.object({
  startAt: z.string().datetime({
    message: 'startAt must be a valid datetime string',
  }),
  endAt: z.string().datetime({
    message: 'endAt must be a valid datetime string',
  }),
}).refine((data) => {
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  return start < end;
}, {
  message: 'startAt must be before endAt',
  path: ['startAt'],
});
