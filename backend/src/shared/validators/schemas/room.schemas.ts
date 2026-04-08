import { z } from 'zod';

export const roomTypeValues = [
  'LECTURE_HALL',
  'CLASSROOM',
  'SEMINAR_ROOM',
  'COMPUTER_LAB',
  'CONFERENCE_ROOM',
  'AUDITORIUM',
  'WORKSHOP',
  'OTHER',
] as const;

export const roomTypeSchema = z.enum(roomTypeValues);

export const createRoomSchema = z.object({
  name: z.string().min(1, 'name is required').trim(),
  buildingId: z.number().int().positive('buildingId must be a positive integer'),
  capacity: z
    .number()
    .int()
    .positive('capacity must be a positive integer')
    .nullable()
    .optional(),
  roomType: roomTypeSchema.optional().default('OTHER'),
  hasProjector: z.boolean().optional().default(false),
  hasMic: z.boolean().optional().default(false),
  accessible: z.boolean().optional().default(true),
  equipmentList: z.string().trim().optional().nullable(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1, 'name is required').trim().optional(),
  capacity: z
    .number()
    .int()
    .positive('capacity must be a positive integer')
    .nullable()
    .optional(),
  roomType: roomTypeSchema.optional(),
  hasProjector: z.boolean().optional(),
  hasMic: z.boolean().optional(),
  accessible: z.boolean().optional(),
  equipmentList: z.string().trim().optional().nullable(),
});

export const listRoomsSchema = z.object({
  buildingId: z.string()
    .optional()
    .transform((val) => val ? Number(val) : undefined)
    .refine((val) => val === undefined || (Number.isInteger(val) && val > 0), {
      message: 'buildingId must be a positive integer',
    }),
});

export const roomAvailabilitySchema = z.object({
  startAt: z.string().datetime('startAt must be a valid datetime string'),
  endAt: z.string().datetime('endAt must be a valid datetime string'),
}).refine((data) => {
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  return start < end;
}, {
  message: 'startAt must be before endAt',
  path: ['startAt'],
});

export const roomDayAvailabilitySchema = z.object({
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
});

export type CreateRoom = z.infer<typeof createRoomSchema>;
export type UpdateRoom = z.infer<typeof updateRoomSchema>;
export type ListRoomsQuery = z.infer<typeof listRoomsSchema>;
export type RoomAvailabilityQuery = z.infer<typeof roomAvailabilitySchema>;
export type RoomDayAvailabilityQuery = z.infer<typeof roomDayAvailabilitySchema>;
