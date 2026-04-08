import { z } from 'zod';

// Custom datetime coercion that accepts multiple formats
const dateTimeString = z
  .union([z.string(), z.instanceof(Date)])
  .pipe(
    z.coerce.date().refine((d) => !isNaN(d.getTime()), {
      message: 'Invalid datetime value'
    })
  )
  .transform((d) => {
    if (d instanceof Date) {
      return d.toISOString();
    }
    return new Date(d as any).toISOString();
  });

export const createBookingSchema = z.object({
  roomId: z.number().int().positive('roomId must be a positive integer'),
  startAt: dateTimeString,
  endAt: dateTimeString,
  courseId: z.number().int().positive('courseId must be a positive integer').optional(),
  metadata: z.record(z.any()).optional(),
}).refine((data) => {
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  return start < end;
}, {
  message: 'startAt must be before endAt',
  path: ['startAt'],
});

export const updateBookingSchema = z.object({
  roomId: z.number().int().positive('roomId must be a positive integer').optional(),
  startAt: dateTimeString.optional(),
  endAt: dateTimeString.optional(),
}).refine((data) => {
  if (data.startAt && data.endAt) {
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    return start < end;
  }
  return true;
}, {
  message: 'startAt must be before endAt',
  path: ['startAt'],
});

export const editBookingSchema = z.object({
  newRoomId: z.number().int().positive('newRoomId must be a positive integer').optional(),
  newStartAt: dateTimeString.optional(),
  newEndAt: dateTimeString.optional(),
}).refine((data) => {
  if (!data.newRoomId && !data.newStartAt && !data.newEndAt) {
    return false;
  }
  return true;
}, {
  message: 'At least one edit field must be provided',
  path: ['newRoomId'],
}).refine((data) => {
  if (data.newStartAt && data.newEndAt) {
    const start = new Date(data.newStartAt);
    const end = new Date(data.newEndAt);
    return start < end;
  }
  return true;
}, {
  message: 'newStartAt must be before newEndAt',
  path: ['newStartAt'],
});

export const listBookingsSchema = z.object({
  startAt: dateTimeString.optional(),
  endAt: dateTimeString.optional(),
  roomId: z.string()
    .optional()
    .transform((val) => val ? Number(val) : undefined)
    .refine((val) => val === undefined || (Number.isInteger(val) && val > 0), {
      message: 'roomId must be a positive integer',
    }),
  buildingId: z.string()
    .optional()
    .transform((val) => val ? Number(val) : undefined)
    .refine((val) => val === undefined || (Number.isInteger(val) && val > 0), {
      message: 'buildingId must be a positive integer',
    }),
}).refine((data) => {
  if (data.startAt && data.endAt) {
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    return start < end;
  }
  if ((data.startAt && !data.endAt) || (!data.startAt && data.endAt)) {
    return false;
  }
  return true;
}, {
  message: 'Both startAt and endAt must be provided together, and startAt must be before endAt',
  path: ['startAt'],
});

export const bulkCreateBookingSchema = z.object({
  items: z.array(
    z.object({
      roomId: z.number().int().positive('roomId must be a positive integer'),
      startAt: dateTimeString,
      endAt: dateTimeString,
      courseId: z.number().int().positive('courseId must be a positive integer').optional(),
      metadata: z.record(z.any()).optional(),
      clientRowId: z.string().optional(),
    }).refine((data) => {
      const start = new Date(data.startAt);
      const end = new Date(data.endAt);
      return start < end;
    }, {
      message: 'startAt must be before endAt',
      path: ['startAt'],
    })
  ).min(1, 'items array must not be empty'),
});

export const pruneBookingsSchema = z.object({
  scope: z.string().default('all').refine(
    (val) => val === 'all' || val === 'slot-system',
    { message: "scope must be either 'all' or 'slot-system'" }
  ),
  slotSystemId: z.string()
    .optional()
    .transform((val) => val ? Number(val) : undefined)
    .refine((val) => val === undefined || (Number.isInteger(val) && val > 0), {
      message: 'slotSystemId must be a positive integer',
    }),
}).refine((data) => {
  if (data.scope === 'slot-system' && !data.slotSystemId) {
    return false;
  }
  return true;
}, {
  message: 'slotSystemId is required for scope=slot-system',
  path: ['slotSystemId'],
});
