import bcrypt from "bcrypt";
import { Router } from "express";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { db } from "../db";
import { users } from "../db/schema";

type UserRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "PENDING_ROLE";

type AssignableRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT";

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

    return res.json({
      data,
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

    if (
      typeof rawName !== "string" ||
      typeof rawEmail !== "string" ||
      typeof rawPassword !== "string" ||
      typeof rawRole !== "string"
    ) {
      return res.status(400).json({
        error: "name, email, password and role are required",
      });
    }

    const name = rawName.trim();
    const email = rawEmail.trim().toLowerCase();
    const password = rawPassword;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "name, email and password cannot be empty",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "password must be at least 8 characters",
      });
    }

    if (rawRole !== "ADMIN" && rawRole !== "STAFF") {
      return res.status(400).json({
        error: "Only ADMIN or STAFF can be created via this endpoint",
      });
    }

    if (rawDepartment !== undefined && typeof rawDepartment !== "string") {
      return res.status(400).json({
        error: "department must be a string when provided",
      });
    }

    const department =
      typeof rawDepartment === "string" && rawDepartment.trim().length > 0
        ? rawDepartment.trim()
        : null;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing[0]) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const inserted = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: rawRole,
        googleId: null,
        avatarUrl: null,
        displayName: null,
        department,
        isActive: true,
        registeredVia: "email",
        firstLogin: false,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        department: users.department,
        isActive: users.isActive,
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

    const updated = await db
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

    return res.json(updated[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update role" });
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
