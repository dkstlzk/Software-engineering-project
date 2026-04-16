import { Request, Response } from 'express';
import {
  createBooking,
  createBookingsBulk,
  type BulkBookingItemInput,
  type CreateBookingInput,
  updateBooking,
} from '../../services/bookingService';
import { db } from '../../../../db';
import { bookingRequests, bookings, rooms, slotSystems, timetableImportBatches, timetableImportOccurrences, users } from '../../../../db/schema';
import { eq, and, inArray, lt, gt } from 'drizzle-orm';
import {
  getAssignedBuildingIdsForStaff,
  isRoomAssignedToStaff,
} from '../../../users/services/staffBuildingScope';
import {
  buildHolidayWarningPayload,
  getOverlappingHolidaysForInterval,
  isHolidayOverrideAccepted,
} from '../../../holidays/service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../../domain/errors/AppError';
import { applyDirectEdit, createEditRequest, decideEditFlow } from '../../../../services/editBookingService';

type BookingCreateRequestBody = CreateBookingInput & {
  approvedBy?: number;
  approvedAt?: string | Date;
  overrideHolidayWarning?: boolean;
};

type BookingBulkRequestItem = BulkBookingItemInput & {
  approvedBy?: number;
  approvedAt?: string | Date;
};

export class BookingsController {
  async list(req: Request, res: Response): Promise<void> {
    const { startAt, endAt, roomId, buildingId } = req.query;

    const parsedStartAt = startAt ? new Date(startAt as string) : null;
    const parsedEndAt = endAt ? new Date(endAt as string) : null;

    const parsedRoomId = roomId ? Number(roomId) : null;
    const parsedBuildingId = buildingId ? Number(buildingId) : null;

    // Validation
    if ((parsedStartAt && !parsedEndAt) || (!parsedStartAt && parsedEndAt)) {
      throw new ValidationError('Both startAt and endAt must be provided together');
    }

    if (parsedStartAt && parsedEndAt) {
      if (isNaN(parsedStartAt.getTime()) || isNaN(parsedEndAt.getTime())) {
        throw new ValidationError('Invalid date format');
      }

      if (parsedStartAt >= parsedEndAt) {
        throw new ValidationError('startAt must be less than endAt');
      }
    }

    if (parsedRoomId !== null && isNaN(parsedRoomId)) {
      throw new ValidationError('Invalid roomId');
    }

    if (parsedBuildingId !== null && isNaN(parsedBuildingId)) {
      throw new ValidationError('Invalid buildingId');
    }

    const isStaff = req.user?.role === 'STAFF';
    const assignedBuildingIds = isStaff
      ? await getAssignedBuildingIdsForStaff(req.user!.id)
      : [];

    if (isStaff && parsedBuildingId !== null && !assignedBuildingIds.includes(parsedBuildingId)) {
      throw new ForbiddenError('You do not have access to this building');
    }

    if (isStaff && assignedBuildingIds.length === 0) {
      res.json([]);
      return;
    }

    const conditions = [];

    if (parsedRoomId !== null) {
      conditions.push(eq(bookings.roomId, parsedRoomId));
    }

    if (parsedStartAt && parsedEndAt) {
      conditions.push(
        and(
          lt(bookings.startAt, parsedEndAt),
          gt(bookings.endAt, parsedStartAt),
        ),
      );
    }

    if (parsedBuildingId !== null) {
      conditions.push(eq(rooms.buildingId, parsedBuildingId));
    }

    if (isStaff) {
      conditions.push(inArray(rooms.buildingId, assignedBuildingIds));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const shouldJoinRooms = parsedBuildingId !== null || isStaff;

    if (shouldJoinRooms) {
      const query = db
        .select({ booking: bookings })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id));

      const result = whereClause ? await query.where(whereClause) : await query;
      res.json(result.map((row) => row.booking));
      return;
    }

    const query = db.select().from(bookings);
    const result = whereClause ? await query.where(whereClause) : await query;
    res.json(result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Invalid id');
    }

    const result = await db
      .select({
        booking: bookings,
        buildingId: rooms.buildingId,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(eq(bookings.id, id))
      .limit(1);

    const row = result[0];

    if (!row) {
      throw new NotFoundError('Booking not found');
    }

    if (req.user?.role === 'STAFF') {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);
      if (!assignedBuildingIds.includes(row.buildingId)) {
        throw new ForbiddenError('You do not have access to this booking');
      }
    }

    res.json(row.booking);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input: BookingCreateRequestBody =
      req.body && typeof req.body === 'object'
        ? { ...(req.body as BookingCreateRequestBody) }
        : ({} as BookingCreateRequestBody);

    const requestedStartAt = new Date(input.startAt as string | Date);
    const requestedEndAt = new Date(input.endAt as string | Date);

    if (
      !Number.isNaN(requestedStartAt.getTime()) &&
      !Number.isNaN(requestedEndAt.getTime()) &&
      requestedStartAt < requestedEndAt
    ) {
      const overlappingHolidays = await getOverlappingHolidaysForInterval(
        requestedStartAt,
        requestedEndAt,
      );

      if (
        overlappingHolidays.length > 0 &&
        !isHolidayOverrideAccepted(input.overrideHolidayWarning)
      ) {
        res.status(409).json(buildHolidayWarningPayload(overlappingHolidays));
        return;
      }
    }

    if (req.user?.role === 'STAFF') {
      const roomId = Number(input.roomId);

      if (
        Number.isInteger(roomId) &&
        roomId > 0 &&
        !(await isRoomAssignedToStaff(req.user.id, roomId))
      ) {
        throw new ForbiddenError('You do not have access to this room');
      }
    }

    if (input && typeof input === 'object' && req.user?.id !== undefined) {
      if (input.approvedBy === undefined) {
        input.approvedBy = req.user.id;
      }
      if (input.approvedAt === undefined) {
        input.approvedAt = new Date();
      }
    }

    const result = await createBooking(input);

    if (!result.ok) {
      throw new ValidationError(result.message);
    }

    res.status(201).json(result.booking);
  }

  async update(req: Request, res: Response): Promise<void> {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      throw new ValidationError('Invalid id');
    }

    if (req.user?.role === 'STAFF') {
      const existingRows = await db
        .select({
          id: bookings.id,
          roomId: bookings.roomId,
          buildingId: rooms.buildingId,
        })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id))
        .where(eq(bookings.id, bookingId))
        .limit(1);

      const existing = existingRows[0];

      if (!existing) {
        throw new NotFoundError('Booking not found');
      }

      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

      if (!assignedBuildingIds.includes(existing.buildingId)) {
        throw new ForbiddenError('You do not have access to this booking');
      }

      if (req.body?.roomId !== undefined) {
        const nextRoomId = Number(req.body.roomId);

        if (
          Number.isInteger(nextRoomId) &&
          nextRoomId > 0 &&
          !(await isRoomAssignedToStaff(req.user.id, nextRoomId))
        ) {
          throw new ForbiddenError('You do not have access to the target room');
        }
      }
    }

    const result = await updateBooking({
      bookingId,
      ...(req.body?.roomId !== undefined ? { roomId: Number(req.body.roomId) } : {}),
      ...(req.body?.startAt !== undefined ? { startAt: req.body.startAt } : {}),
      ...(req.body?.endAt !== undefined ? { endAt: req.body.endAt } : {}),
    });

    if (!result.ok) {
      throw new ValidationError(result.message);
    }

    res.json(result.booking);
  }

  async edit(req: Request, res: Response): Promise<void> {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      throw new ValidationError('Invalid id');
    }

    const row = await db
      .select({
        booking: bookings,
        buildingId: rooms.buildingId,
        requestStatus: bookingRequests.status,
        requestUserId: bookingRequests.userId,
        requestFacultyId: bookingRequests.facultyId,
        requestUserRole: users.role,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
      .leftJoin(users, eq(bookingRequests.userId, users.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    const existing = row[0];

    if (!existing) {
      throw new NotFoundError('Booking not found');
    }

    const user = req.user;

    if (!user) {
      throw new ForbiddenError('Unauthorized');
    }

    if (user.role === 'STAFF') {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(user.id);

      if (!assignedBuildingIds.includes(existing.buildingId)) {
        throw new ForbiddenError('You do not have access to this booking');
      }

      if (req.body?.newRoomId !== undefined) {
        const nextRoomId = Number(req.body.newRoomId);

        if (
          Number.isInteger(nextRoomId) &&
          nextRoomId > 0 &&
          !(await isRoomAssignedToStaff(user.id, nextRoomId))
        ) {
          throw new ForbiddenError('You do not have access to the target room');
        }
      }
    }

    if (user.role === 'STUDENT') {
      if (existing.requestUserId !== user.id) {
        throw new ForbiddenError('You can only edit your own booking requests');
      }
    }

    if (user.role === 'FACULTY') {
      const canAccess =
        existing.requestUserId === user.id ||
        existing.requestFacultyId === user.id;

      if (!canAccess) {
        throw new ForbiddenError('You can only edit linked booking requests');
      }
    }

    let flow;

    try {
      flow = decideEditFlow(
        {
          id: user.id,
          role: user.role,
        },
        {
          id: existing.booking.id,
          roomId: existing.booking.roomId,
          startAt: existing.booking.startAt,
          endAt: existing.booking.endAt,
          requestStatus: existing.requestStatus,
          requestUserRole: existing.requestUserRole,
        },
      );
    } catch {
      throw new ValidationError('Booking cannot be edited in current status');
    }

    const changes = {
      ...(req.body?.newRoomId !== undefined ? { newRoomId: Number(req.body.newRoomId) } : {}),
      ...(req.body?.newStartAt !== undefined ? { newStartAt: req.body.newStartAt } : {}),
      ...(req.body?.newEndAt !== undefined ? { newEndAt: req.body.newEndAt } : {}),
    };

    if (flow === 'DIRECT_EDIT') {
      const directResult = await applyDirectEdit(
        {
          id: existing.booking.id,
          roomId: existing.booking.roomId,
          startAt: existing.booking.startAt,
          endAt: existing.booking.endAt,
        },
        changes,
      );

      if (!directResult.ok) {
        res.status(directResult.error.status).json({
          message: directResult.error.message,
          code: directResult.error.code,
        });
        return;
      }

      res.json({
        flow: 'DIRECT_EDIT',
        booking: directResult.data,
      });
      return;
    }

    const requestResult = await createEditRequest(
      { id: existing.booking.id },
      changes,
      { id: user.id },
    );

    if (!requestResult.ok) {
      res.status(requestResult.error.status).json({
        message: requestResult.error.message,
        code: requestResult.error.code,
      });
      return;
    }

    res.status(201).json({
      flow: 'REQUEST_EDIT',
      request: requestResult.data,
    });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Invalid id');
    }

    if (req.user?.role === 'STAFF') {
      const existingRows = await db
        .select({
          id: bookings.id,
          buildingId: rooms.buildingId,
        })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id))
        .where(eq(bookings.id, id))
        .limit(1);

      const existing = existingRows[0];

      if (!existing) {
        throw new NotFoundError('Booking not found');
      }

      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

      if (!assignedBuildingIds.includes(existing.buildingId)) {
        throw new ForbiddenError('You do not have access to this booking');
      }
    }

    const deleted = await db
      .delete(bookings)
      .where(eq(bookings.id, id))
      .returning();

    if (deleted.length === 0) {
      throw new NotFoundError('Booking not found');
    }

    res.status(204).send();
  }

  async bulkCreate(req: Request, res: Response): Promise<void> {
    const items = req.body?.items as BookingBulkRequestItem[] | undefined;
    const overrideHolidayWarning = isHolidayOverrideAccepted(req.body?.overrideHolidayWarning);

    if (!Array.isArray(items)) {
      throw new ValidationError('items must be an array');
    }

    if (items.length === 0) {
      throw new ValidationError('items array must not be empty');
    }

    if (!overrideHolidayWarning) {
      for (const item of items) {
        const parsedStartAt = new Date(item.startAt as string | Date);
        const parsedEndAt = new Date(item.endAt as string | Date);

        if (
          Number.isNaN(parsedStartAt.getTime()) ||
          Number.isNaN(parsedEndAt.getTime()) ||
          parsedStartAt >= parsedEndAt
        ) {
          continue;
        }

        const overlappingHolidays = await getOverlappingHolidaysForInterval(
          parsedStartAt,
          parsedEndAt,
        );

        if (overlappingHolidays.length > 0) {
          res.status(409).json(buildHolidayWarningPayload(overlappingHolidays));
          return;
        }
      }
    }

    if (req.user?.role === 'STAFF') {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

      if (assignedBuildingIds.length === 0) {
        throw new ForbiddenError('You do not have access to any buildings');
      }

      const allowedBuildingIdSet = new Set(assignedBuildingIds);
      const roomIds = Array.from(
        new Set(
          items
            .map((item) => Number(item.roomId))
            .filter((roomId) => Number.isInteger(roomId) && roomId > 0),
        ),
      );

      if (roomIds.length > 0) {
        const roomRows = await db
          .select({ id: rooms.id, buildingId: rooms.buildingId })
          .from(rooms)
          .where(inArray(rooms.id, roomIds));

        const roomBuildingByRoomId = new Map(
          roomRows.map((roomRow) => [roomRow.id, roomRow.buildingId]),
        );

        for (const roomId of roomIds) {
          const buildingId = roomBuildingByRoomId.get(roomId);

          if (
            typeof buildingId === 'number' &&
            !allowedBuildingIdSet.has(buildingId)
          ) {
            throw new ForbiddenError('You do not have access to one or more rooms');
          }
        }
      }
    }

    const stampedItems =
      req.user?.id !== undefined
        ? items.map((item) => {
            if (!item || typeof item !== 'object') {
              return item;
            }

            return {
              ...item,
              approvedBy: item.approvedBy !== undefined ? item.approvedBy : req.user?.id,
              approvedAt: item.approvedAt !== undefined ? item.approvedAt : new Date(),
            };
          })
        : items;

    const result = await createBookingsBulk(stampedItems);

    res.json(result);
  }

  async prune(req: Request, res: Response): Promise<void> {
    const scope = String(req.query.scope ?? 'all').trim().toLowerCase();

    if (scope !== 'all' && scope !== 'slot-system') {
      throw new ValidationError("scope must be either 'all' or 'slot-system'");
    }

    if (scope === 'all') {
      const deleted = await db.delete(bookings).returning({ id: bookings.id });

      res.json({
        scope: 'all',
        deletedBookings: deleted.length,
      });
      return;
    }

    const slotSystemId = Number(req.query.slotSystemId);

    if (!Number.isInteger(slotSystemId) || slotSystemId <= 0) {
      throw new ValidationError('slotSystemId is required for scope=slot-system');
    }

    const [slotSystem] = await db
      .select({ id: slotSystems.id })
      .from(slotSystems)
      .where(eq(slotSystems.id, slotSystemId))
      .limit(1);

    if (!slotSystem) {
      throw new NotFoundError('Slot system not found');
    }

    const occurrenceRows = await db
      .select({ bookingId: timetableImportOccurrences.bookingId })
      .from(timetableImportOccurrences)
      .innerJoin(
        timetableImportBatches,
        eq(timetableImportOccurrences.batchId, timetableImportBatches.id),
      )
      .where(eq(timetableImportBatches.slotSystemId, slotSystemId));

    const bookingIds = Array.from(
      new Set(
        occurrenceRows
          .map((row) => row.bookingId)
          .filter((bookingId): bookingId is number => typeof bookingId === 'number'),
      ),
    );

    if (bookingIds.length === 0) {
      res.json({
        scope: 'slot-system',
        slotSystemId,
        deletedBookings: 0,
      });
      return;
    }

    const deleted = await db
      .delete(bookings)
      .where(inArray(bookings.id, bookingIds))
      .returning({ id: bookings.id });

    res.json({
      scope: 'slot-system',
      slotSystemId,
      deletedBookings: deleted.length,
    });
  }
}
