import bcrypt from "bcrypt";
import { Router } from "express";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { db } from "../db";
import { buildings, staffBuildingAssignments, users } from "../db/schema";

type UserRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "PENDING_ROLE";

type AssignableRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT";

type CreateAuthProvider = "email" | "google";

const FILTERABLE_ROLES: UserRole[] = [
  "ADMIN",
  "STAFF",
  "FACULTY",
  "STUDENT",
  "PENDING_ROLE",
];

const ASSIGNABLE_ROLES: AssignableRole[] = [
  "ADMIN",
  "STAFF",
  "FACULTY",
  "STUDENT",
];

const GOOGLE_PROVISIONABLE_ROLES: Array<"ADMIN" | "STAFF" | "FACULTY"> = [
  "ADMIN",
  "STAFF",
  "FACULTY",
];

const EMAIL_PROVISIONABLE_ROLES: Array<"ADMIN" | "STAFF"> = [
  "ADMIN",
  "STAFF",
];

const router = Router();

function parsePositiveInt(input: unknown, fallback: number): number {
  const parsed = Number(input);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(input: unknown): boolean | "invalid" | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input === "boolean") {
    return input;
  }

  if (typeof input !== "string") {
    return "invalid";
  }

  const normalized = input.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return "invalid";
}

function parseBuildingIds(input: unknown): number[] | "invalid" {
  if (!Array.isArray(input)) {
    return "invalid";
  }

  const parsed = input.map((value) => Number(value));

  if (parsed.some((value) => !Number.isInteger(value) || value <= 0)) {
    return "invalid";
  }

  return Array.from(new Set(parsed));
}

function isMissingAssignmentsTableError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  const message =
    (cause?.message ?? (error as { message?: string })?.message ?? "").toLowerCase();

  return cause?.code === "42P01" && message.includes("staff_building_assignments");
}

async function getActiveAdminCount(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

  return Number(rows[0]?.count ?? 0);
}

router.get("/faculty", authMiddleware, async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search.trim()
        : null;

    const department =
      typeof req.query.department === "string" &&
      req.query.department.trim().length > 0
        ? req.query.department.trim()
        : null;

    const conditions: SQL[] = [eq(users.role, "FACULTY"), eq(users.isActive, true)];

    if (department) {
      conditions.push(ilike(users.department, `%${department}%`));
    }

    if (search) {
      const searchCondition = or(
        ilike(users.name, `%${search}%`),
        ilike(users.displayName, `%${search}%`),
        ilike(users.email, `%${search}%`),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const rows = await db
      .select({
        id: users.id,
        name: sql<string>`coalesce(${users.displayName}, ${users.name})`,
        email: users.email,
        department: users.department,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(asc(users.name));

    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch faculty users" });
  }
});

router.use(authMiddleware, requireRole("ADMIN"));

router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
    const offset = (page - 1) * limit;

    const roleFilterRaw =
      typeof req.query.role === "string" ? req.query.role.trim() : "";
    const department =
      typeof req.query.department === "string" &&
      req.query.department.trim().length > 0
        ? req.query.department.trim()
        : null;
    const search =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search.trim()
        : null;

    const parsedIsActive = parseBoolean(req.query.is_active);

    if (parsedIsActive === "invalid") {
      return res.status(400).json({
        error: "is_active must be true or false when provided",
      });
    }

    const conditions: SQL[] = [];

    if (roleFilterRaw) {
      if (!FILTERABLE_ROLES.includes(roleFilterRaw as UserRole)) {
        return res.status(400).json({
          error: "Invalid role filter",
        });
      }

      conditions.push(eq(users.role, roleFilterRaw as UserRole));
    }

    if (department) {
      conditions.push(ilike(users.department, `%${department}%`));
    }

    if (search) {
      const searchCondition = or(
        ilike(users.name, `%${search}%`),
        ilike(users.displayName, `%${search}%`),
        ilike(users.email, `%${search}%`),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (parsedIsActive !== undefined) {
      conditions.push(eq(users.isActive, parsedIsActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = db.select({ count: sql<number>`count(*)` }).from(users);
    const countRows = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const total = Number(countRows[0]?.count ?? 0);

    const dataQuery = db
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
      .offset(offset);

    const data = whereClause
      ? await dataQuery.where(whereClause)
      : await dataQuery;

    const userIds = data.map((row) => row.id);

    let assignmentRows: Array<{
      staffId: number;
      buildingId: number;
      buildingName: string;
    }> = [];

    if (userIds.length > 0) {
      try {
        assignmentRows = await db
          .select({
            staffId: staffBuildingAssignments.staffId,
            buildingId: buildings.id,
            buildingName: buildings.name,
          })
          .from(staffBuildingAssignments)
          .innerJoin(
            buildings,
            eq(staffBuildingAssignments.buildingId, buildings.id),
          )
          .where(inArray(staffBuildingAssignments.staffId, userIds))
          .orderBy(asc(buildings.name));
      } catch (error) {
        if (!isMissingAssignmentsTableError(error)) {
          throw error;
        }
      }
    }

    const assignedBuildingByStaffId = new Map<number, Array<{ id: number; name: string }>>();

    for (const assignment of assignmentRows) {
      const existing = assignedBuildingByStaffId.get(assignment.staffId) ?? [];
      existing.push({ id: assignment.buildingId, name: assignment.buildingName });
      assignedBuildingByStaffId.set(assignment.staffId, existing);
    }

    const dataWithAssignments = data.map((row) => ({
      ...row,
      assignedBuildings:
        row.role === "STAFF"
          ? assignedBuildingByStaffId.get(row.id) ?? []
          : [],
    }));

    return res.json({
      data: dataWithAssignments,
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/", async (req, res) => {
  try {
    const rawName = req.body?.name;
    const rawEmail = req.body?.email;
    const rawPassword = req.body?.password;
    const rawRole = req.body?.role;
    const rawDepartment = req.body?.department;
    const rawAuthProvider = req.body?.authProvider;

    if (
      typeof rawEmail !== "string" ||
      typeof rawRole !== "string"
    ) {
      return res.status(400).json({
        error: "email and role are required",
      });
    }

    if (
      rawAuthProvider !== undefined &&
      rawAuthProvider !== "email" &&
      rawAuthProvider !== "google"
    ) {
      return res.status(400).json({
        error: "authProvider must be email or google when provided",
      });
    }

    const authProvider: CreateAuthProvider =
      rawAuthProvider === "google" ? "google" : "email";

    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        error: "email cannot be empty",
      });
    }

    let name: string;

    if (typeof rawName === "string" && rawName.trim().length > 0) {
      name = rawName.trim();
    } else if (authProvider === "google") {
      const [localPart] = email.split("@");
      name = localPart || "Google User";
    } else {
      return res.status(400).json({
        error: "name is required for email/password accounts",
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "name cannot be empty",
      });
    }

    const requestedRole = rawRole as AssignableRole;

    if (rawDepartment !== undefined && typeof rawDepartment !== "string") {
      return res.status(400).json({
        error: "department must be a string when provided",
      });
    }

    const department =
      typeof rawDepartment === "string" && rawDepartment.trim().length > 0
        ? rawDepartment.trim()
        : null;

    let passwordHash: string;

    if (authProvider === "email") {
      if (!EMAIL_PROVISIONABLE_ROLES.includes(requestedRole as "ADMIN" | "STAFF")) {
        return res.status(400).json({
          error: "Only ADMIN or STAFF can be created with email/password",
        });
      }

      if (typeof rawPassword !== "string" || rawPassword.length < 8) {
        return res.status(400).json({
          error: "password must be at least 8 characters",
        });
      }

      passwordHash = await bcrypt.hash(rawPassword, 10);
    } else {
      if (!GOOGLE_PROVISIONABLE_ROLES.includes(requestedRole as "ADMIN" | "STAFF" | "FACULTY")) {
        return res.status(400).json({
          error: "Google-provisioned accounts can only be ADMIN, STAFF or FACULTY",
        });
      }

      if (!email.endsWith("@iitj.ac.in")) {
        return res.status(400).json({
          error: "Google-provisioned users must use @iitj.ac.in email",
        });
      }

      passwordHash = await bcrypt.hash(`google_provisioned_${email}_${Date.now()}`, 10);
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing[0]) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const inserted = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: requestedRole,
        googleId: null,
        avatarUrl: null,
        displayName: null,
        department,
        isActive: true,
        registeredVia: authProvider,
        firstLogin: authProvider === "google",
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
        registeredVia: users.registeredVia,
      });

    return res.status(201).json(inserted[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/:id/role", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    if (req.user?.id === targetId) {
      return res.status(400).json({
        error: "You cannot change your own role",
      });
    }

    const requestedRole = req.body?.role;

    if (typeof requestedRole !== "string") {
      return res.status(400).json({ error: "role is required" });
    }

    if (!ASSIGNABLE_ROLES.includes(requestedRole as AssignableRole)) {
      return res.status(400).json({
        error: "Invalid target role",
      });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (target.role === "ADMIN" && requestedRole !== "ADMIN" && target.isActive) {
      const activeAdminCount = await getActiveAdminCount();

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          error: "Cannot demote the last active ADMIN",
        });
      }
    }

    const updated = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(users)
        .set({ role: requestedRole as AssignableRole })
        .where(eq(users.id, targetId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
        });

      if (requestedRole !== "STAFF") {
        try {
          await tx
            .delete(staffBuildingAssignments)
            .where(eq(staffBuildingAssignments.staffId, targetId));
        } catch (error) {
          if (!isMissingAssignmentsTableError(error)) {
            throw error;
          }
        }
      }

      return updatedRows[0];
    });

    return res.json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update role" });
  }
});
router.get("/:id/building-assignments", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (target.role !== "STAFF") {
      return res.json({ userId: targetId, buildingIds: [], buildings: [] });
    }

    const assignedRows = await db
      .select({
        buildingId: buildings.id,
        buildingName: buildings.name,
      })
      .from(staffBuildingAssignments)
      .innerJoin(
        buildings,
        eq(staffBuildingAssignments.buildingId, buildings.id),
      )
      .where(eq(staffBuildingAssignments.staffId, targetId))
      .orderBy(asc(buildings.name));

    return res.json({
      userId: targetId,
      buildingIds: assignedRows.map((row) => row.buildingId),
      buildings: assignedRows.map((row) => ({
        id: row.buildingId,
        name: row.buildingName,
      })),
    });
  } catch (error) {
    if (isMissingAssignmentsTableError(error)) {
      return res.status(503).json({
        error: "Staff building assignments are unavailable until database migrations are applied",
      });
    }

    console.error(error);
    return res.status(500).json({ error: "Failed to fetch building assignments" });
  }
});

router.put("/:id/building-assignments", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const parsedBuildingIds = parseBuildingIds(req.body?.buildingIds);

    if (parsedBuildingIds === "invalid") {
      return res.status(400).json({ error: "buildingIds must be an array of positive integers" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (target.role !== "STAFF") {
      return res.status(400).json({ error: "Assignments are allowed only for STAFF users" });
    }

    if (parsedBuildingIds.length > 0) {
      const existingBuildingRows = await db
        .select({ id: buildings.id })
        .from(buildings)
        .where(inArray(buildings.id, parsedBuildingIds));

      if (existingBuildingRows.length !== parsedBuildingIds.length) {
        return res.status(400).json({ error: "One or more buildingIds are invalid" });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(staffBuildingAssignments)
        .where(eq(staffBuildingAssignments.staffId, targetId));

      if (parsedBuildingIds.length > 0) {
        await tx
          .insert(staffBuildingAssignments)
          .values(
            parsedBuildingIds.map((buildingId) => ({
              staffId: targetId,
              buildingId,
              assignedBy: req.user?.id ?? null,
            })),
          );
      }
    });

    const assignedRows = parsedBuildingIds.length
      ? await db
          .select({
            buildingId: buildings.id,
            buildingName: buildings.name,
          })
          .from(staffBuildingAssignments)
          .innerJoin(
            buildings,
            eq(staffBuildingAssignments.buildingId, buildings.id),
          )
          .where(eq(staffBuildingAssignments.staffId, targetId))
          .orderBy(asc(buildings.name))
      : [];

    return res.json({
      userId: targetId,
      buildingIds: assignedRows.map((row) => row.buildingId),
      buildings: assignedRows.map((row) => ({
        id: row.buildingId,
        name: row.buildingName,
      })),
    });
  } catch (error) {
    if (isMissingAssignmentsTableError(error)) {
      return res.status(503).json({
        error: "Staff building assignments are unavailable until database migrations are applied",
      });
    }

    console.error(error);
    return res.status(500).json({ error: "Failed to update building assignments" });
  }
});

router.patch("/:id/active", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const isActive = req.body?.isActive;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be a boolean" });
    }

    if (req.user?.id === targetId && isActive === false) {
      return res.status(400).json({ error: "You cannot deactivate yourself" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (target.role === "ADMIN" && target.isActive && !isActive) {
      const activeAdminCount = await getActiveAdminCount();

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          error: "Cannot deactivate the last active ADMIN",
        });
      }
    }

    const updated = await db
      .update(users)
      .set({ isActive })
      .where(eq(users.id, targetId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      });

    return res.json(updated[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update active status" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    if (req.user?.id === targetId) {
      return res.status(400).json({ error: "You cannot delete yourself" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (target.role === "ADMIN" && target.isActive) {
      const activeAdminCount = await getActiveAdminCount();

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          error: "Cannot delete the last active ADMIN",
        });
      }
    }

    const anonymizedName = `Deleted User ${targetId}`;
    const anonymizedEmail = `deleted_user_${targetId}_${Date.now()}@deleted.local`;
    const passwordHash = await bcrypt.hash(`deleted_${targetId}_${Date.now()}`, 10);

    await db
      .update(users)
      .set({
        name: anonymizedName,
        email: anonymizedEmail,
        passwordHash,
        role: "STUDENT",
        googleId: null,
        avatarUrl: null,
        displayName: null,
        department: null,
        isActive: false,
        registeredVia: "email",
        firstLogin: false,
      })
      .where(eq(users.id, targetId));

    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
