import { and, eq, inArray, lt, gt } from "drizzle-orm";
import {
  bookings,
  rooms,
  buildings,
  staffBuildingAssignments,
} from "../../backend/src/db/schema";

type DbExecutor = typeof import("../../backend/src/db").db;

export interface BookingFilters {
  buildingId?: number;
  roomId?: number;
  startAt?: Date;
  endAt?: Date;
  limit?: number;
  offset?: number;
}

export interface RoomAccessResult {
  allowed: number[];
  denied: number[];
}

export class BookingRepository {
  constructor(
    private db: DbExecutor,
    private cache?: any
  ) {}

  /**
   * Find all bookings for a user with permission filtering.
   * Single query using joins to avoid N+1 patterns.
   */
  async findAllForUser(
    userId: number,
    userRole: string,
    filters: BookingFilters
  ): Promise<
    Array<{
      id: number;
      roomId: number;
      startAt: Date;
      endAt: Date;
      requestId: number | null;
      approvedBy: number | null;
      approvedAt: Date | null;
      source: string;
      sourceRef: string | null;
      room?: {
        id: number;
        name: string;
        buildingId: number;
      };
      building?: {
        id: number;
        name: string;
      };
    }>
  > {
    const conditions = [];

    // Apply filters
    if (filters.roomId !== undefined) {
      conditions.push(eq(bookings.roomId, filters.roomId));
    }

    if (filters.startAt !== undefined && filters.endAt !== undefined) {
      conditions.push(
        and(lt(bookings.startAt, filters.endAt), gt(bookings.endAt, filters.startAt))
      );
    }

    if (filters.buildingId !== undefined) {
      conditions.push(eq(rooms.buildingId, filters.buildingId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // For STAFF role: use INNER JOIN with staff_building_assignments for permission filtering
    if (userRole === "STAFF") {
      const staffConditions = [...conditions];
      staffConditions.push(eq(staffBuildingAssignments.staffId, userId));

      const staffWhereClause =
        staffConditions.length > 0 ? and(...staffConditions) : undefined;

      const results = await this.db
        .select({
          id: bookings.id,
          roomId: bookings.roomId,
          startAt: bookings.startAt,
          endAt: bookings.endAt,
          requestId: bookings.requestId,
          approvedBy: bookings.approvedBy,
          approvedAt: bookings.approvedAt,
          source: bookings.source,
          sourceRef: bookings.sourceRef,
          room: {
            id: rooms.id,
            name: rooms.name,
            buildingId: rooms.buildingId,
          },
          building: {
            id: buildings.id,
            name: buildings.name,
          },
        })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id))
        .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
        .innerJoin(
          staffBuildingAssignments,
          eq(staffBuildingAssignments.buildingId, buildings.id)
        )
        .where(staffWhereClause)
        .limit(filters.limit || 100)
        .offset(filters.offset || 0);

      return results.map((row) => ({
        id: row.id,
        roomId: row.roomId,
        startAt: row.startAt,
        endAt: row.endAt,
        requestId: row.requestId,
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        source: row.source,
        sourceRef: row.sourceRef,
        room: row.room,
        building: row.building,
      }));
    }

    // For other roles: no permission filtering
    const results = await this.db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        requestId: bookings.requestId,
        approvedBy: bookings.approvedBy,
        approvedAt: bookings.approvedAt,
        source: bookings.source,
        sourceRef: bookings.sourceRef,
        room: {
          id: rooms.id,
          name: rooms.name,
          buildingId: rooms.buildingId,
        },
        building: {
          id: buildings.id,
          name: buildings.name,
        },
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .where(whereClause)
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);

    return results.map((row) => ({
      id: row.id,
      roomId: row.roomId,
      startAt: row.startAt,
      endAt: row.endAt,
      requestId: row.requestId,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      source: row.source,
      sourceRef: row.sourceRef,
      room: row.room,
      building: row.building,
    }));
  }

  /**
   * Find a single booking by ID with permission filtering.
   * Uses LIMIT 1 for efficiency.
   */
  async findByIdForUser(
    bookingId: number,
    userId: number,
    userRole: string
  ): Promise<{
    id: number;
    roomId: number;
    startAt: Date;
    endAt: Date;
    requestId: number | null;
    approvedBy: number | null;
    approvedAt: Date | null;
    source: string;
    sourceRef: string | null;
    room?: {
      id: number;
      name: string;
      buildingId: number;
    };
    building?: {
      id: number;
      name: string;
    };
  } | null> {
    // For STAFF role: use INNER JOIN with staff_building_assignments
    if (userRole === "STAFF") {
      const results = await this.db
        .select({
          id: bookings.id,
          roomId: bookings.roomId,
          startAt: bookings.startAt,
          endAt: bookings.endAt,
          requestId: bookings.requestId,
          approvedBy: bookings.approvedBy,
          approvedAt: bookings.approvedAt,
          source: bookings.source,
          sourceRef: bookings.sourceRef,
          room: {
            id: rooms.id,
            name: rooms.name,
            buildingId: rooms.buildingId,
          },
          building: {
            id: buildings.id,
            name: buildings.name,
          },
        })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id))
        .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
        .innerJoin(
          staffBuildingAssignments,
          eq(staffBuildingAssignments.buildingId, buildings.id)
        )
        .where(
          and(
            eq(bookings.id, bookingId),
            eq(staffBuildingAssignments.staffId, userId)
          )
        )
        .limit(1);

      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      return {
        id: row.id,
        roomId: row.roomId,
        startAt: row.startAt,
        endAt: row.endAt,
        requestId: row.requestId,
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        source: row.source,
        sourceRef: row.sourceRef,
        room: row.room,
        building: row.building,
      };
    }

    // For other roles: no permission filtering
    const results = await this.db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        requestId: bookings.requestId,
        approvedBy: bookings.approvedBy,
        approvedAt: bookings.approvedAt,
        source: bookings.source,
        sourceRef: bookings.sourceRef,
        room: {
          id: rooms.id,
          name: rooms.name,
          buildingId: rooms.buildingId,
        },
        building: {
          id: buildings.id,
          name: buildings.name,
        },
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      roomId: row.roomId,
      startAt: row.startAt,
      endAt: row.endAt,
      requestId: row.requestId,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      source: row.source,
      sourceRef: row.sourceRef,
      room: row.room,
      building: row.building,
    };
  }

  /**
   * Verify which rooms a user has access to based on their role.
   * For STAFF: checks staff_building_assignments, all other roles have full access.
   * Returns { allowed: number[], denied: number[] }
   */
  async verifyRoomAccess(
    userId: number,
    userRole: string,
    roomIds: number[]
  ): Promise<RoomAccessResult> {
    if (roomIds.length === 0) {
      return { allowed: [], denied: [] };
    }

    // For non-STAFF roles: all rooms are allowed
    if (userRole !== "STAFF") {
      return { allowed: roomIds, denied: [] };
    }

    // For STAFF: query rooms with INNER JOIN to staff_building_assignments
    const allowedRooms = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .innerJoin(
        staffBuildingAssignments,
        and(
          eq(staffBuildingAssignments.buildingId, rooms.buildingId),
          eq(staffBuildingAssignments.staffId, userId)
        )
      )
      .where(inArray(rooms.id, roomIds));

    const allowedRoomIds = new Set(allowedRooms.map((row) => row.id));
    const denied = roomIds.filter((roomId) => !allowedRoomIds.has(roomId));
    const allowed = Array.from(allowedRoomIds);

    return { allowed, denied };
  }

  /**
   * Count total bookings matching filters.
   * Used for pagination total count.
   */
  async countBookings(filters: BookingFilters): Promise<number> {
    const conditions = [];

    if (filters.roomId !== undefined) {
      conditions.push(eq(bookings.roomId, filters.roomId));
    }

    if (filters.startAt !== undefined && filters.endAt !== undefined) {
      conditions.push(
        and(lt(bookings.startAt, filters.endAt), gt(bookings.endAt, filters.startAt))
      );
    }

    if (filters.buildingId !== undefined) {
      conditions.push(eq(rooms.buildingId, filters.buildingId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select({ count: rooms.id })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(whereClause);

    return results.length;
  }
}
