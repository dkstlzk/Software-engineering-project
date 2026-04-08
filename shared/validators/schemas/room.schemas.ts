import { z } from 'zod';

export const createRoomSchema = z.object({
  name: z.string().min(1, 'name is required').trim(),
  buildingId: z.number().int().positive('buildingId must be a positive integer'),
  capacity: z
    .union([
      z.literal(null),
      z.number().int().positive('Capacity must be a positive number'),
    ])
    .nullable()
    .optional(),
  roomType: z.enum([
    "LECTURE_HALL",
    "CLASSROOM",
    "SEMINAR_ROOM",
    "COMPUTER_LAB",
    "CONFERENCE_ROOM",
    "AUDITORIUM",
    "WORKSHOP",
    "OTHER",
  ]).optional(),
  hasProjector: z.boolean().optional(),
  hasMic: z.boolean().optional(),
  accessible: z.boolean().optional(),
  equipmentList: z.string().nullable().optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1, 'name is required').trim().optional(),
  capacity: z
    .union([
      z.literal(null),
      z.number().int().positive('Capacity must be a positive number'),
    ])
    .nullable()
    .optional(),
  roomType: z.enum([
    "LECTURE_HALL",
    "CLASSROOM",
    "SEMINAR_ROOM",
    "COMPUTER_LAB",
    "CONFERENCE_ROOM",
    "AUDITORIUM",
    "WORKSHOP",
    "OTHER",
  ]).optional(),
  hasProjector: z.boolean().optional(),
  hasMic: z.boolean().optional(),
  accessible: z.boolean().optional(),
  equipmentList: z.string().nullable().optional(),
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

export type CreateRoom = z.infer<typeof createRoomSchema>;
export type UpdateRoom = z.infer<typeof updateRoomSchema>;
export type ListRoomsQuery = z.infer<typeof listRoomsSchema>;
export type RoomAvailabilityQuery = z.infer<typeof roomAvailabilitySchema>;
