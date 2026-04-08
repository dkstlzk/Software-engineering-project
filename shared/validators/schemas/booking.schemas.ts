import { z } from 'zod';

export const createBookingSchema = z.object({
  title: z.string().min(1, 'Title must be at least 1 character'),
  eventType: z.enum(['class', 'meeting', 'event']),
  roomId: z.number().int().positive('Room ID must be a positive integer'),
  startAt: z.string().datetime('Invalid start date format'),
  endAt: z.string().datetime('Invalid end date format'),
  participantCount: z.number().int().positive().optional(),
}).refine(
  (data) => new Date(data.endAt) > new Date(data.startAt),
  {
    message: 'End time must be after start time',
    path: ['endAt'],
  }
);

export const updateBookingSchema = createBookingSchema.partial();

export const bulkCreateBookingSchema = z.array(createBookingSchema)
  .min(1, 'At least 1 booking is required')
  .max(100, 'Maximum 100 bookings per bulk request');

export const bookingFiltersSchema = z.object({
  roomId: z.number().int().positive().optional(),
  buildingId: z.number().int().positive().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (data.startAt && data.endAt) {
      return new Date(data.startAt) < new Date(data.endAt);
    }
    return true;
  },
  {
    message: 'Start date must be before end date',
    path: ['endAt'],
  }
);

export type CreateBooking = z.infer<typeof createBookingSchema>;
export type UpdateBooking = z.infer<typeof updateBookingSchema>;
export type BulkCreateBooking = z.infer<typeof bulkCreateBookingSchema>;
export type BookingFilters = z.infer<typeof bookingFiltersSchema>;
