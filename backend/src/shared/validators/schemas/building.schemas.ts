import { z } from 'zod';

export const createBuildingSchema = z.object({
  name: z.string().min(1, 'name is required').trim(),
  location: z.string().trim().optional().nullable(),
  managedByStaffId: z.number().int().positive('managedByStaffId must be a positive integer').optional().nullable(),
});

export const updateBuildingSchema = z.object({
  name: z.string().min(1, 'name is required').trim().optional(),
  location: z.string().trim().optional().nullable(),
  managedByStaffId: z.number().int().positive('managedByStaffId must be a positive integer').optional().nullable(),
});

export type CreateBuilding = z.infer<typeof createBuildingSchema>;
export type UpdateBuilding = z.infer<typeof updateBuildingSchema>;
