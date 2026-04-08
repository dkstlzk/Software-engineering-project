import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { users, staffBuildingAssignments, buildings } from "../../backend/src/db/schema";
import {
  redis,
  cacheKeys,
  MEDIUM_TTL,
} from "../../backend/src/data/cache/redis.client";

type DbExecutor = typeof import("../../backend/src/db").db;

export type UserRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "PENDING_ROLE";

export interface UserFilters {
  role?: UserRole;
  isActive?: boolean;
  department?: string;
  search?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface UserWithDepartment {
  id: number;
  name: string;
  displayName: string | null;
  email: string;
  role: UserRole;
  department: string | null;
  isActive: boolean;
  registeredVia: string;
  firstLogin: boolean;
  createdAt: Date;
  assignedBuildings?: Array<{ id: number; name: string }>;
}

export class UserRepository {
  constructor(private db: DbExecutor) {}

  /**
   * Find all users with filtering and pagination.
   * Returns users with department details and optional building assignments.
   */
  async findAll(
    filters: UserFilters,
    pagination: PaginationParams
  ): Promise<UserWithDepartment[]> {
    const conditions: SQL[] = [];

    if (filters.role) {
      conditions.push(eq(users.role, filters.role));
    }

    if (filters.department) {
      conditions.push(ilike(users.department, `%${filters.department}%`));
    }

    if (filters.search) {
      const searchCondition = or(
        ilike(users.name, `%${filters.search}%`),
        ilike(users.displayName, `%${filters.search}%`),
        ilike(users.email, `%${filters.search}%`)
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(users.isActive, filters.isActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const limit = Math.min(pagination.limit || 20, 100);
    const offset = pagination.offset || 0;

    const data = await this.db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
        registeredVia: users.registeredVia,
        firstLogin: users.firstLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
      .where(whereClause);

    const userIds = data.map((row) => row.id);
    let assignmentRows: Array<{
      staffId: number;
      buildingId: number;
      buildingName: string;
    }> = [];

    if (userIds.length > 0) {
      try {
        assignmentRows = await this.db
          .select({
            staffId: staffBuildingAssignments.staffId,
            buildingId: buildings.id,
            buildingName: buildings.name,
          })
          .from(staffBuildingAssignments)
          .innerJoin(
            buildings,
            eq(staffBuildingAssignments.buildingId, buildings.id)
          )
          .where(sql`${staffBuildingAssignments.staffId} = ANY(${userIds}::integer[])`);
      } catch {
        // Silently handle if assignments table doesn't exist
      }
    }

    const assignedBuildingByStaffId = new Map<
      number,
      Array<{ id: number; name: string }>
    >();

    for (const assignment of assignmentRows) {
      const existing = assignedBuildingByStaffId.get(assignment.staffId) ?? [];
      existing.push({
        id: assignment.buildingId,
        name: assignment.buildingName,
      });
      assignedBuildingByStaffId.set(assignment.staffId, existing);
    }

    return data.map((row) => ({
      ...row,
      assignedBuildings:
        row.role === "STAFF"
          ? assignedBuildingByStaffId.get(row.id) ?? []
          : [],
    }));
  }

  /**
   * Find a single user by ID with department details.
   * Checks cache first (key: user:{id}, TTL: MEDIUM_TTL).
   */
  async findById(id: number): Promise<UserWithDepartment | null> {
    const cacheKey = cacheKeys.user(id);
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
        registeredVia: users.registeredVia,
        firstLogin: users.firstLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (data.length === 0) {
      return null;
    }

    const row = data[0];

    let assignedBuildings: Array<{ id: number; name: string }> = [];

    if (row.role === "STAFF") {
      try {
        const assignmentRows = await this.db
          .select({
            buildingId: buildings.id,
            buildingName: buildings.name,
          })
          .from(staffBuildingAssignments)
          .innerJoin(
            buildings,
            eq(staffBuildingAssignments.buildingId, buildings.id)
          )
          .where(eq(staffBuildingAssignments.staffId, id))
          .orderBy(asc(buildings.name));

        assignedBuildings = assignmentRows.map((a) => ({
          id: a.buildingId,
          name: a.buildingName,
        }));
      } catch {
        // Silently handle if assignments table doesn't exist
      }
    }

    const result: UserWithDepartment = {
      ...row,
      assignedBuildings,
    };

    await redis.setex(cacheKey, MEDIUM_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Find a user by email address.
   * Used for login/authentication - NOT cached for security reasons.
   */
  async findByEmail(email: string): Promise<UserWithDepartment | null> {
    const data = await this.db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
        registeredVia: users.registeredVia,
        firstLogin: users.firstLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (data.length === 0) {
      return null;
    }

    const row = data[0];

    let assignedBuildings: Array<{ id: number; name: string }> = [];

    if (row.role === "STAFF") {
      try {
        const assignmentRows = await this.db
          .select({
            buildingId: buildings.id,
            buildingName: buildings.name,
          })
          .from(staffBuildingAssignments)
          .innerJoin(
            buildings,
            eq(staffBuildingAssignments.buildingId, buildings.id)
          )
          .where(eq(staffBuildingAssignments.staffId, row.id))
          .orderBy(asc(buildings.name));

        assignedBuildings = assignmentRows.map((a) => ({
          id: a.buildingId,
          name: a.buildingName,
        }));
      } catch {
        // Silently handle if assignments table doesn't exist
      }
    }

    return {
      ...row,
      assignedBuildings,
    };
  }

  /**
   * Create a new user.
   * Invalidates user list cache.
   */
  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    department?: string;
    googleId?: string;
    displayName?: string;
    avatarUrl?: string;
    registeredVia?: string;
  }): Promise<UserWithDepartment> {
    const result = await this.db
      .insert(users)
      .values({
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        department: data.department || null,
        googleId: data.googleId || null,
        displayName: data.displayName || null,
        avatarUrl: data.avatarUrl || null,
        registeredVia: data.registeredVia || "email",
      })
      .returning({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
        registeredVia: users.registeredVia,
        firstLogin: users.firstLogin,
        createdAt: users.createdAt,
      });

    await redis.del("users:list");

    return {
      ...result[0],
      assignedBuildings: [],
    };
  }

  /**
   * Update a user record.
   * Invalidates the user's cache (key: user:{id}).
   */
  async update(
    id: number,
    data: Partial<{
      name: string;
      displayName: string;
      department: string;
      isActive: boolean;
      avatarUrl: string;
      firstLogin: boolean;
    }>
  ): Promise<UserWithDepartment | null> {
    const result = await this.db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
        registeredVia: users.registeredVia,
        firstLogin: users.firstLogin,
        createdAt: users.createdAt,
      });

    await redis.del(cacheKeys.user(id));

    if (result.length === 0) {
      return null;
    }

    const row = result[0];

    let assignedBuildings: Array<{ id: number; name: string }> = [];

    if (row.role === "STAFF") {
      try {
        const assignmentRows = await this.db
          .select({
            buildingId: buildings.id,
            buildingName: buildings.name,
          })
          .from(staffBuildingAssignments)
          .innerJoin(
            buildings,
            eq(staffBuildingAssignments.buildingId, buildings.id)
          )
          .where(eq(staffBuildingAssignments.staffId, id))
          .orderBy(asc(buildings.name));

        assignedBuildings = assignmentRows.map((a) => ({
          id: a.buildingId,
          name: a.buildingName,
        }));
      } catch {
        // Silently handle if assignments table doesn't exist
      }
    }

    return {
      ...row,
      assignedBuildings,
    };
  }

  /**
   * Update a user's role and optionally their department.
   * Special method for role assignments.
   * Invalidates the user's cache (key: user:{id}).
   */
  async updateRole(
    id: number,
    role: UserRole,
    department?: string
  ): Promise<UserWithDepartment | null> {
    const updateData: Record<string, any> = { role };

    if (department !== undefined) {
      updateData.department = department;
    }

    const result = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
        registeredVia: users.registeredVia,
        firstLogin: users.firstLogin,
        createdAt: users.createdAt,
      });

    await redis.del(cacheKeys.user(id));

    if (result.length === 0) {
      return null;
    }

    const row = result[0];

    let assignedBuildings: Array<{ id: number; name: string }> = [];

    if (row.role === "STAFF") {
      try {
        const assignmentRows = await this.db
          .select({
            buildingId: buildings.id,
            buildingName: buildings.name,
          })
          .from(staffBuildingAssignments)
          .innerJoin(
            buildings,
            eq(staffBuildingAssignments.buildingId, buildings.id)
          )
          .where(eq(staffBuildingAssignments.staffId, id))
          .orderBy(asc(buildings.name));

        assignedBuildings = assignmentRows.map((a) => ({
          id: a.buildingId,
          name: a.buildingName,
        }));
      } catch {
        // Silently handle if assignments table doesn't exist
      }
    }

    return {
      ...row,
      assignedBuildings,
    };
  }

  /**
   * Count total users matching filters.
   * Used for pagination total count.
   */
  async countUsers(filters: UserFilters): Promise<number> {
    const conditions: SQL[] = [];

    if (filters.role) {
      conditions.push(eq(users.role, filters.role));
    }

    if (filters.department) {
      conditions.push(ilike(users.department, `%${filters.department}%`));
    }

    if (filters.search) {
      const searchCondition = or(
        ilike(users.name, `%${filters.search}%`),
        ilike(users.displayName, `%${filters.search}%`),
        ilike(users.email, `%${filters.search}%`)
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(users.isActive, filters.isActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    const countRows = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    return Number(countRows[0]?.count ?? 0);
  }
}
