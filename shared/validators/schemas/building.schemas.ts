import { z } from 'zod';

export const createBuildingSchema = z.object({
  name: z.string().min(1, 'name is required').trim(),
  code: z.string().min(1, 'code must not be empty').trim().optional(),
});

export const updateBuildingSchema = z.object({
  name: z.string().min(1, 'name is required').trim().optional(),
  code: z.string().min(1, 'code must not be empty').trim().optional(),
});

export type CreateBuilding = z.infer<typeof createBuildingSchema>;
export type UpdateBuilding = z.infer<typeof updateBuildingSchema>;
