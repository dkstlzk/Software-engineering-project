import { and, eq, inArray, count } from "drizzle-orm";
import { db } from "../../backend/src/db";
import {
  buildings,
  staffBuildingAssignments,
  rooms,
} from "../../backend/src/db/schema";
import {
  redis,
  cacheKeys,
  MEDIUM_TTL,
} from "../../backend/src/data/cache/redis.client";

type DbExecutor = typeof db | any;

export interface BuildingWithRoomCount {
  id: number;
  name: string;
  roomCount?: number;
}

export class BuildingRepository {
  constructor(private executor: DbExecutor = db) {}

  /**
   * Get all buildings with room count
   * - Checks cache first (cacheKeys.buildings())
   * - Cache TTL: MEDIUM_TTL (30 minutes)
   */
  async findAll(): Promise<BuildingWithRoomCount[]> {
    const cacheKey = cacheKeys.buildings();
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const buildingRows = await this.executor
      .select()
      .from(buildings);

    const result = await Promise.all(
      buildingRows.map(async (building: any) => ({
        ...building,
        roomCount: await this.getRoomCount(building.id),
      }))
    );

    await redis.setex(cacheKey, MEDIUM_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * Get single building by ID
   * - Checks cache first
   */
  async findById(id: number): Promise<BuildingWithRoomCount | null> {
    const cacheKey = cacheKeys.building(id);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.executor
      .select()
      .from(buildings)
      .where(eq(buildings.id, id))
      .limit(1);

    if (result.length === 0) return null;

    const building = result[0];
    const roomCount = await this.getRoomCount(building.id);
    const buildingWithCount = {
      ...building,
      roomCount,
    };

    await redis.setex(
      cacheKey,
      MEDIUM_TTL,
      JSON.stringify(buildingWithCount)
    );
    return buildingWithCount;
  }

  /**
   * Get buildings assigned to a staff member
   * - Query staff_building_assignments
   * - Join with buildings table
   * - Cache with cacheKeys.staffAssignments(staffId)
   * - Cache TTL: MEDIUM_TTL (30 minutes)
   */
  async findForStaff(staffId: number): Promise<BuildingWithRoomCount[]> {
    const cacheKey = cacheKeys.staffAssignments(staffId);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.executor
      .select({
        id: buildings.id,
        name: buildings.name,
      })
      .from(buildings)
      .innerJoin(
        staffBuildingAssignments,
        eq(staffBuildingAssignments.buildingId, buildings.id)
      )
      .where(eq(staffBuildingAssignments.staffId, staffId));

    const buildingsWithCount = await Promise.all(
      result.map(async (building: any) => ({
        ...building,
        roomCount: await this.getRoomCount(building.id),
      }))
    );

    await redis.setex(
      cacheKey,
      MEDIUM_TTL,
      JSON.stringify(buildingsWithCount)
    );
    return buildingsWithCount;
  }

  /**
   * Create a new building
   * - Invalidate cache: buildings:all
   */
  async create(data: { name: string }): Promise<any> {
    const result = await this.executor
      .insert(buildings)
      .values({ name: data.name })
      .returning();

    // Invalidate all buildings cache
    await redis.del(cacheKeys.buildings());

    return result[0];
  }

  /**
   * Update an existing building
   * - Invalidate cache: buildings:all and building:X
   */
  async update(id: number, data: { name: string }): Promise<any> {
    const result = await this.executor
      .update(buildings)
      .set({ name: data.name })
      .where(eq(buildings.id, id))
      .returning();

    // Invalidate caches
    await Promise.all([
      redis.del(cacheKeys.buildings()),
      redis.del(cacheKeys.building(id)),
    ]);

    return result[0] || null;
  }

  /**
   * Delete a building
   * - Invalidate cache
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.executor
      .delete(buildings)
      .where(eq(buildings.id, id))
      .returning();

    if (result.length === 0) return false;

    // Invalidate caches
    await Promise.all([
      redis.del(cacheKeys.buildings()),
      redis.del(cacheKeys.building(id)),
    ]);

    return true;
  }

  /**
   * Helper: Get room count for a building
   */
  private async getRoomCount(buildingId: number): Promise<number> {
    const result = await this.executor
      .select({ count: count() })
      .from(rooms)
      .where(eq(rooms.buildingId, buildingId));

    return result[0]?.count || 0;
  }
}
