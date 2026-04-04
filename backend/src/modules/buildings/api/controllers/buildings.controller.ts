import { Request, Response } from 'express';
import { db } from '../../../../db';
import { buildings, rooms } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { isBuildingAssignedToStaff } from '../../../users/services/staffBuildingScope';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../../../../domain/errors/AppError';

export class BuildingsController {
  async list(req: Request, res: Response): Promise<void> {
    // Staff can view all buildings (but only manage their assigned ones)
    const result = await db.select().from(buildings);
    res.json(result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const buildingId = Number(id);

    // Staff can view any building (but only manage their assigned ones)

    const result = await db
      .select()
      .from(buildings)
      .where(eq(buildings.id, buildingId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Building not found');
    }

    res.json(result[0]);
  }

  async getRooms(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const buildingId = Number(id);

    // Staff can view rooms in any building (but only manage their assigned buildings)

    const building = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(eq(buildings.id, buildingId))
      .limit(1);

    if (building.length === 0) {
      throw new NotFoundError('Building not found');
    }

    const result = await db
      .select()
      .from(rooms)
      .where(eq(rooms.buildingId, buildingId));

    res.json(result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const { name, location, managedByStaffId } = req.body;

    try {
      const result = await db
        .insert(buildings)
        .values({
          name,
          location: location ?? null,
          managedByStaffId: managedByStaffId ?? null,
        })
        .returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      if (error?.cause?.code === '23505') {
        throw new ConflictError('Building already exists');
      }

      if (error?.cause?.code === '23503') {
        throw new ValidationError('Invalid managedByStaffId');
      }

      throw error;
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, location, managedByStaffId } = req.body;

    const buildingId = Number(id);

    if (
      req.user?.role === 'STAFF' &&
      !(await isBuildingAssignedToStaff(req.user.id, buildingId))
    ) {
      throw new ForbiddenError('You do not have access to this building');
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      name: string;
      location: string | null;
      managedByStaffId: number | null;
    }> = {};

    if (name !== undefined) updateData.name = name;
    if (location !== undefined) updateData.location = location;
    if (managedByStaffId !== undefined) updateData.managedByStaffId = managedByStaffId;

    try {
      const result = await db
        .update(buildings)
        .set(updateData)
        .where(eq(buildings.id, buildingId))
        .returning();

      if (result.length === 0) {
        throw new NotFoundError('Building not found');
      }

      res.json(result[0]);
    } catch (error: any) {
      if (error?.cause?.code === '23505') {
        throw new ConflictError('Building already exists');
      }

      if (error?.cause?.code === '23503') {
        throw new ValidationError('Invalid managedByStaffId');
      }

      throw error;
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const buildingId = Number(id);

    // Only admins can delete buildings
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenError('Only administrators can delete buildings');
    }

    try {
      const result = await db
        .delete(buildings)
        .where(eq(buildings.id, buildingId))
        .returning();

      if (result.length === 0) {
        throw new NotFoundError('Building not found');
      }

      res.status(204).send();
    } catch (error: any) {
      if (error?.cause?.code === '23503') {
        throw new ConflictError(
          'Cannot delete building with existing rooms'
        );
      }

      throw error;
    }
  }
}
