import { eq, and } from "drizzle-orm";
import { buildings, rooms, staffBuildingAssignments } from "../../backend/src/db/schema";
import { cacheKeys, SHORT_TTL } from "../../backend/src/data/cache/redis.client";

export interface RoomWithBuilding {
  id: number;
  name: string;
  buildingId: number;
  buildingName: string;
}

export class RoomRepository {
  constructor(
    private db: any,
    private cache: any
  ) {}

  /**
   * Find all rooms, optionally filtered by building
   * Includes building details in response
   */
  async findAll(buildingId?: number): Promise<RoomWithBuilding[]> {
    const cacheKey = cacheKeys.rooms(buildingId);
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const query = this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
        buildingName: buildings.name,
      })
      .from(rooms)
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id));

    let result;
    if (buildingId) {
      result = await query.where(eq(rooms.buildingId, buildingId));
    } else {
      result = await query;
    }

    await this.cache.setex(cacheKey, SHORT_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * Find single room with building details
   */
  async findById(id: number): Promise<RoomWithBuilding | null> {
    const cacheKey = `room:${id}:with_building`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
        buildingName: buildings.name,
      })
      .from(rooms)
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .where(eq(rooms.id, id))
      .limit(1);

    const room = result[0] || null;

    if (room) {
      await this.cache.setex(
        cacheKey,
        SHORT_TTL,
        JSON.stringify(room)
      );
    }

    return room;
  }

  /**
   * Find rooms for specific building
   * Includes building details in response
   */
  async findByBuildingId(buildingId: number): Promise<RoomWithBuilding[]> {
    const cacheKey = cacheKeys.rooms(buildingId);
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
        buildingName: buildings.name,
      })
      .from(rooms)
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .where(eq(rooms.buildingId, buildingId));

    await this.cache.setex(cacheKey, SHORT_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * Create new room and invalidate cache
   */
  async create(data: { name: string; buildingId: number }): Promise<{ id: number; name: string; buildingId: number }> {
    const result = await this.db.insert(rooms).values(data).returning();
    const room = result[0];

    // Invalidate all related caches
    await this.cache.del(cacheKeys.rooms());
    await this.cache.del(cacheKeys.rooms(data.buildingId));

    return room;
  }

  /**
   * Update room and invalidate cache
   */
  async update(
    id: number,
    data: { name?: string; buildingId?: number }
  ): Promise<{ id: number; name: string; buildingId: number }> {
    // Get the room first to know what buildingId to invalidate
    const existingRoom = await this.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, id))
      .limit(1);

    const room = existingRoom[0];
    if (!room) {
      throw new Error(`Room with id ${id} not found`);
    }

    const result = await this.db
      .update(rooms)
      .set(data)
      .where(eq(rooms.id, id))
      .returning();

    // Invalidate all related caches
    await this.cache.del(`room:${id}:with_building`);
    await this.cache.del(cacheKeys.rooms());
    await this.cache.del(cacheKeys.rooms(room.buildingId));
    if (data.buildingId && data.buildingId !== room.buildingId) {
      await this.cache.del(cacheKeys.rooms(data.buildingId));
    }

    return result[0];
  }

  /**
   * Delete room and invalidate cache
   */
  async delete(id: number): Promise<{ id: number; name: string; buildingId: number }> {
    // Get the room first to know what buildingId to invalidate
    const existingRoom = await this.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, id))
      .limit(1);

    const room = existingRoom[0];
    if (!room) {
      throw new Error(`Room with id ${id} not found`);
    }

    const result = await this.db
      .delete(rooms)
      .where(eq(rooms.id, id))
      .returning();

    // Invalidate all related caches
    await this.cache.del(`room:${id}:with_building`);
    await this.cache.del(cacheKeys.rooms());
    await this.cache.del(cacheKeys.rooms(room.buildingId));

    return result[0];
  }

  /**
   * Verify if user has access to a specific room
   * For STAFF: Check if room's building is in staff assignments
   * Returns boolean
   */
  async verifyAccess(
    userId: number,
    userRole: string,
    roomId: number
  ): Promise<boolean> {
    // Admins and other roles have access to all rooms
    if (userRole !== "STAFF") {
      return true;
    }

    // For staff, check if the room's building is assigned to them
    const result = await this.db
      .select()
      .from(staffBuildingAssignments)
      .innerJoin(rooms, eq(staffBuildingAssignments.buildingId, rooms.buildingId))
      .where(
        and(
          eq(staffBuildingAssignments.staffId, userId),
          eq(rooms.id, roomId)
        )
      )
      .limit(1);

    return result.length > 0;
  }
}
