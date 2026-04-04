import { Request, Response } from 'express';
import { db } from '../../../../db';
import { bookings, buildings, rooms } from '../../../../db/schema';
import { and, eq, gt, lt } from 'drizzle-orm';
import {
  getAssignedBuildingIdsForStaff,
  isBuildingAssignedToStaff,
} from '../../../users/services/staffBuildingScope';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../../../../domain/errors/AppError';
import { getRoomDayAvailabilityQuery, getRoomDayAvailabilityTimeline } from '../../../../data/queries/availability.queries';

export class RoomsController {
  async list(req: Request, res: Response): Promise<void> {
    const { buildingId } = req.query;
    const parsedBuildingId = buildingId ? Number(buildingId) : null;

    // Staff can view all rooms (but only manage rooms in their assigned buildings)

    // If buildingId is specified
    if (parsedBuildingId !== null) {
      // Verify building exists
      const buildingExists = await db
        .select({ id: buildings.id })
        .from(buildings)
        .where(eq(buildings.id, parsedBuildingId))
        .limit(1);

      if (buildingExists.length === 0) {
        throw new NotFoundError('Building not found');
      }

      const result = await db
        .select()
        .from(rooms)
        .where(eq(rooms.buildingId, parsedBuildingId));

      res.json(result);
      return;
    }

    // Return all rooms for all users
    const result = await db.select().from(rooms);
    res.json(result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const roomId = Number(id);

    const result = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Room not found');
    }

    const room = result[0]!;

    // Staff can view any room (but only manage rooms in their assigned buildings)

    res.json(room);
  }

  async getAvailability(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { startAt, endAt } = req.query;

    const roomId = Number(id);

    const startAtDate = new Date(startAt as string);
    const endAtDate = new Date(endAt as string);

    // Verify room exists
    const roomRows = await db
      .select({
        id: rooms.id,
        buildingId: rooms.buildingId,
      })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (roomRows.length === 0) {
      throw new NotFoundError('Room not found');
    }

    const room = roomRows[0]!;

    if (
      req.user?.role === 'STAFF' &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      throw new ForbiddenError('You do not have access to this building');
    }

    const overlappingBookings = await db
      .select({
        id: bookings.id,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.roomId, roomId),
          lt(bookings.startAt, endAtDate),
          gt(bookings.endAt, startAtDate),
        ),
      );

    res.json(overlappingBookings);
  }

  async getRoomDayAvailability(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { date } = req.query;

    const roomId = Number(id);

    // Verify room exists and check RBAC
    const roomRows = await db
      .select({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
      })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (roomRows.length === 0) {
      throw new NotFoundError('Room not found');
    }

    const room = roomRows[0]!;

    if (
      req.user?.role === 'STAFF' &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      throw new ForbiddenError('You do not have access to this building');
    }

    // Get staff building IDs if needed for RBAC
    const staffBuildingIds =
      req.user?.role === 'STAFF'
        ? await getAssignedBuildingIdsForStaff(req.user.id)
        : [];

    // Query availability with RBAC filtering
    const availability = await getRoomDayAvailabilityQuery(
      roomId,
      date as string,
      {
        id: req.user!.id,
        role: req.user!.role as
          | 'ADMIN'
          | 'STAFF'
          | 'FACULTY'
          | 'STUDENT'
          | 'PENDING_ROLE',
        staffBuildingIds,
      }
    );

    res.json(availability);
  }

  async getRoomDayAvailabilityTimeline(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { date } = req.query;

    const roomId = Number(id);

    // Verify date format (YYYY-MM-DD)
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('Invalid date format. Expected YYYY-MM-DD');
    }

    // Verify room exists and check RBAC
    const roomRows = await db
      .select({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
      })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (roomRows.length === 0) {
      throw new NotFoundError('Room not found');
    }

    const room = roomRows[0]!;

    if (
      req.user?.role === 'STAFF' &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      throw new ForbiddenError('You do not have access to this building');
    }

    // Get staff building IDs if needed for RBAC
    const staffBuildingIds =
      req.user?.role === 'STAFF'
        ? await getAssignedBuildingIdsForStaff(req.user.id)
        : [];

    // Query availability timeline with RBAC filtering
    const timeline = await getRoomDayAvailabilityTimeline(
      roomId,
      date,
      {
        id: req.user!.id,
        role: req.user!.role as
          | 'ADMIN'
          | 'STAFF'
          | 'FACULTY'
          | 'STUDENT'
          | 'PENDING_ROLE',
        staffBuildingIds,
      }
    );

    res.json(timeline);
  }

  async create(req: Request, res: Response): Promise<void> {
    const { name, buildingId, capacity, roomType, hasProjector, hasMic, accessible, equipmentList } = req.body;

    if (
      req.user?.role === 'STAFF' &&
      !(await isBuildingAssignedToStaff(req.user.id, buildingId))
    ) {
      throw new ForbiddenError('You do not have access to this building');
    }

    try {
      const result = await db
        .insert(rooms)
        .values({
          name,
          buildingId,
          capacity: capacity ?? null,
          roomType: roomType ?? 'OTHER',
          hasProjector: hasProjector ?? false,
          hasMic: hasMic ?? false,
          accessible: accessible ?? true,
          equipmentList: equipmentList ?? null,
        })
        .returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      if (error?.cause?.code === '23505') {
        throw new ConflictError(
          'Room already exists in this building'
        );
      }

      if (error?.cause?.code === '23503') {
        throw new ValidationError('Invalid buildingId');
      }

      throw error;
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, capacity, roomType, hasProjector, hasMic, accessible, equipmentList } = req.body;

    const roomId = Number(id);

    const existing = await db
      .select({ id: rooms.id, buildingId: rooms.buildingId })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundError('Room not found');
    }

    const room = existing[0]!;

    if (
      req.user?.role === 'STAFF' &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      throw new ForbiddenError('You do not have access to this building');
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      name: string;
      capacity: number | null;
      roomType: 'LECTURE_HALL' | 'CLASSROOM' | 'SEMINAR_ROOM' | 'COMPUTER_LAB' | 'CONFERENCE_ROOM' | 'AUDITORIUM' | 'WORKSHOP' | 'OTHER';
      hasProjector: boolean;
      hasMic: boolean;
      accessible: boolean;
      equipmentList: string | null;
    }> = {};

    if (name !== undefined) updateData.name = name;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (roomType !== undefined) updateData.roomType = roomType;
    if (hasProjector !== undefined) updateData.hasProjector = hasProjector;
    if (hasMic !== undefined) updateData.hasMic = hasMic;
    if (accessible !== undefined) updateData.accessible = accessible;
    if (equipmentList !== undefined) updateData.equipmentList = equipmentList;

    try {
      const result = await db
        .update(rooms)
        .set(updateData)
        .where(eq(rooms.id, roomId))
        .returning();

      res.json(result[0]);
    } catch (error: any) {
      // Handle unique constraint violation (duplicate room name)
      if (error?.cause?.code === '23505') {
        throw new ConflictError(
          'Room with this name already exists in the building'
        );
      }

      // Handle foreign key constraint violation
      if (error?.cause?.code === '23503') {
        throw new ValidationError('Invalid reference in update data');
      }

      // Handle check constraint violations
      if (error?.cause?.code === '23514') {
        throw new ValidationError('Invalid data: ' + (error?.cause?.detail || 'constraint violation'));
      }

      // Log and wrap any unexpected database errors
      console.error('Unexpected database error in room update:', {
        error: error,
        message: error?.message,
        code: error?.cause?.code,
        detail: error?.cause?.detail,
        updateData: updateData,
      });
      
      // Re-throw as generic error (will be caught by error handler)
      throw error;
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const roomId = Number(id);

    const existing = await db
      .select({ id: rooms.id, buildingId: rooms.buildingId })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundError('Room not found');
    }

    const room = existing[0]!;

    if (
      req.user?.role === 'STAFF' &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      throw new ForbiddenError('You do not have access to this building');
    }

    await db.delete(rooms).where(eq(rooms.id, roomId));

    res.status(204).send();
  }
}
