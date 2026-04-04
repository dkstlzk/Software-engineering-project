import bcrypt from "bcrypt";
import { Router, type Request } from "express";
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
import { authMiddleware } from "../../../middleware/auth";
import { requireRole } from "../../../middleware/rbac";
import { db } from "../../../db";
import { buildings, rooms, staffBuildingAssignments, users, bookings, bookingRequests, userSessions } from "../../../db/schema";
import logger from "../../../shared/utils/logger";

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

type SessionPayload = {
  passport?: { user?: number | string };
  cookie?: {
    expires?: string;
    originalMaxAge?: number;
  };
  ipAddress?: string;
  ip?: string;
  userAgent?: string;
  device?: string;
  deviceName?: string;
  createdAt?: string;
};

function getSessionOwnerId(sessionPayload: unknown): number | null {
  if (!sessionPayload || typeof sessionPayload !== "object") {
    return null;
  }

  const candidate = (sessionPayload as SessionPayload).passport?.user;
  const parsed = Number(candidate);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function pickFirstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function resolveSessionCreatedAt(payload: SessionPayload, expiresAt: Date): string {
  const explicitCreatedAt = pickFirstString(payload.createdAt);

  if (explicitCreatedAt) {
    const parsed = new Date(explicitCreatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const cookieExpiresRaw = pickFirstString(payload.cookie?.expires);
  const originalMaxAge = payload.cookie?.originalMaxAge;

  if (cookieExpiresRaw && typeof originalMaxAge === "number" && originalMaxAge > 0) {
    const cookieExpires = new Date(cookieExpiresRaw);

    if (!Number.isNaN(cookieExpires.getTime())) {
      return new Date(cookieExpires.getTime() - originalMaxAge).toISOString();
    }
  }

  return expiresAt.toISOString();
}

function getCurrentSessionId(req: Request): string | null {
  const sessionId = (req as Request & { sessionID?: string }).sessionID;

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return null;
  }

  return sessionId;
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch faculty users" });
  }
});

// Allow staff to view their own building assignments, or admin to view any
router.get("/:id/building-assignments", authMiddleware, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }

    // Staff can only view their own assignments, admins can view any
    if (requesterRole === "STAFF" && requesterId !== targetId) {
      return res.status(403).json({ message: "You can only view your own building assignments" });
    }

    if (requesterRole !== "ADMIN" && requesterRole !== "STAFF") {
      return res.status(403).json({ message: "Access denied" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ message: "User not found" });
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
        message: "Staff building assignments are unavailable until database migrations are applied",
      });
    }

    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch building assignments" });
  }
});

// GET /users/profile
// Returns current user's profile details
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rows = await db
      .select({
        id: users.id,
        name: sql<string>`coalesce(${users.displayName}, ${users.name})`,
        email: users.email,
        role: users.role,
        department: users.department,
        avatarUrl: users.avatarUrl,
        registeredVia: users.registeredVia,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    const profile = rows[0];

    if (!profile) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(profile);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// PATCH /users/profile
// Allows a user to update their own profile fields
router.patch("/profile", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rawDepartment = req.body?.department;

    if (
      rawDepartment !== undefined &&
      rawDepartment !== null &&
      typeof rawDepartment !== "string"
    ) {
      return res.status(400).json({ message: "department must be a string when provided" });
    }

    const profileRows = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    const profile = profileRows[0];

    if (!profile) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!profile.isActive) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    const updatePayload: { department?: string | null } = {};

    if (rawDepartment !== undefined) {
      updatePayload.department =
        typeof rawDepartment === "string" && rawDepartment.trim().length > 0
          ? rawDepartment.trim()
          : null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ message: "No updatable profile fields provided" });
    }

    const updatedRows = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, req.user.id))
      .returning({
        id: users.id,
        name: sql<string>`coalesce(${users.displayName}, ${users.name})`,
        email: users.email,
        role: users.role,
        department: users.department,
        avatarUrl: users.avatarUrl,
        registeredVia: users.registeredVia,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });

    return res.json(updatedRows[0]);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

// DELETE /users/profile
// Allows a user to delete (anonymize + deactivate) their own account
router.delete("/profile", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const targetId = req.user.id;

    const targetRows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "ADMIN" && target.isActive) {
      const activeAdminCount = await getActiveAdminCount();

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot delete the last active ADMIN",
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to delete profile" });
  }
});

// GET /users/profile/export
// Export user data with bookings and requests (GDPR compliance)
router.get("/profile/export", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user profile
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user's booking requests
    const userBookingRequests = await db
      .select()
      .from(bookingRequests)
      .where(
        or(
          eq(bookingRequests.userId, req.user.id),
          eq(bookingRequests.facultyId, req.user.id)
        )
      );

    // Get user's bookings (if they approved them)
    const userBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.approvedBy, req.user.id));

    return res.json({
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        registeredVia: user.registeredVia,
        createdAt: user.createdAt,
      },
      bookingRequests: userBookingRequests.map((br) => ({
        id: br.id,
        eventType: br.eventType,
        purpose: br.purpose,
        status: br.status,
        startAt: br.startAt,
        endAt: br.endAt,
        createdAt: br.createdAt,
      })),
      approvedBookings: userBookings.map((b) => ({
        id: b.id,
        roomId: b.roomId,
        startAt: b.startAt,
        endAt: b.endAt,
        source: b.source,
        approvedAt: b.approvedAt,
      })),
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to export user data" });
  }
});

// GET /users/profile/sessions
// Returns active sessions from user_sessions table for current authenticated user
router.get("/profile/sessions", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rows = await db
      .select({
        sid: userSessions.sid,
        sess: userSessions.sess,
        expire: userSessions.expire,
      })
      .from(userSessions)
      .orderBy(desc(userSessions.expire))
      .limit(200);

    const currentSessionId = getCurrentSessionId(req);

    const sessions = rows
      .filter((row) => getSessionOwnerId(row.sess) === req.user!.id)
      .map((row) => {
        const payload = (row.sess ?? {}) as SessionPayload;

        return {
          id: row.sid,
          deviceName: pickFirstString(payload.deviceName, payload.device, payload.userAgent) ?? "Unknown Device",
          ipAddress: pickFirstString(payload.ipAddress, payload.ip),
          createdAt: resolveSessionCreatedAt(payload, row.expire),
          expiresAt: row.expire.toISOString(),
          isCurrentSession: currentSessionId === row.sid,
        };
      });

    return res.json(sessions);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch sessions" });
  }
});

// POST /users/profile/sessions/logout-others
// Deletes all other sessions for the current user, preserving the current session when available
router.post("/profile/sessions/logout-others", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rows = await db
      .select({
        sid: userSessions.sid,
        sess: userSessions.sess,
      })
      .from(userSessions)
      .limit(200);

    const currentSessionId = getCurrentSessionId(req);

    if (!currentSessionId) {
      return res.json({ ok: true, terminatedSessions: 0 });
    }

    const otherSessionIds = rows
      .filter((row) => getSessionOwnerId(row.sess) === req.user!.id)
      .map((row) => row.sid)
      .filter((sid) => sid !== currentSessionId);

    if (otherSessionIds.length === 0) {
      return res.json({ ok: true, terminatedSessions: 0 });
    }

    await db
      .delete(userSessions)
      .where(inArray(userSessions.sid, otherSessionIds));

    return res.json({ ok: true, terminatedSessions: otherSessionIds.length });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to sign out other sessions" });
  }
});

// GET /users/profile/activity
// Returns recent booking/profile activity for current authenticated user
router.get("/profile/activity", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const limit = Math.min(parsePositiveInt(req.query.limit, 15), 20);

    const requestRows = await db
      .select({
        id: bookingRequests.id,
        roomId: bookingRequests.roomId,
        roomName: rooms.name,
        buildingName: buildings.name,
        eventType: bookingRequests.eventType,
        purpose: bookingRequests.purpose,
        status: bookingRequests.status,
        createdAt: bookingRequests.createdAt,
        decidedAt: bookingRequests.decidedAt,
      })
      .from(bookingRequests)
      .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .where(
        or(
          eq(bookingRequests.userId, req.user.id),
          eq(bookingRequests.facultyId, req.user.id),
        ),
      )
      .orderBy(desc(bookingRequests.createdAt))
      .limit(limit);

    const bookingRows = await db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        roomName: rooms.name,
        buildingName: buildings.name,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        source: bookings.source,
        approvedAt: bookings.approvedAt,
        requestId: bookings.requestId,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
      .where(
        or(
          eq(bookings.approvedBy, req.user.id),
          eq(bookingRequests.userId, req.user.id),
          eq(bookingRequests.facultyId, req.user.id),
        ),
      )
      .orderBy(desc(bookings.startAt))
      .limit(limit);

    const bookingActivity = bookingRows.map((row) => {
      const roomLabel = `${row.roomName} (${row.buildingName})`;

      return {
        id: `booking-${row.id}`,
        type: "BOOKING",
        title: "Booking",
        description: `${roomLabel} from ${row.startAt.toISOString()} to ${row.endAt.toISOString()}`,
        timestamp: (row.approvedAt ?? row.startAt).toISOString(),
        metadata: {
          bookingId: row.id,
          requestId: row.requestId ?? undefined,
          source: row.source,
        },
      };
    });

    const requestActivity = requestRows.map((row) => {
      const roomLabel = `${row.roomName} (${row.buildingName})`;

      return {
        id: `request-${row.id}`,
        type: "ACTION",
        title: "Booking Request Submitted",
        description: `${row.eventType} request for ${roomLabel}: ${row.purpose}`,
        timestamp: row.createdAt.toISOString(),
        metadata: {
          requestId: row.id,
          status: row.status,
        },
      };
    });

    const decisionActivity = requestRows
      .filter((row) => row.status === "APPROVED" || row.status === "REJECTED")
      .map((row) => {
        const roomLabel = `${row.roomName} (${row.buildingName})`;

        return {
          id: `decision-${row.id}`,
          type: "ACTION",
          title: row.status === "APPROVED" ? "Booking Request Approved" : "Booking Request Rejected",
          description: `${row.eventType} request for ${roomLabel} was ${row.status.toLowerCase()}.`,
          timestamp: (row.decidedAt ?? row.createdAt).toISOString(),
          metadata: {
            requestId: row.id,
            status: row.status,
          },
        };
      });

    const activity = [...bookingActivity, ...requestActivity, ...decisionActivity]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return res.json(activity);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch activity" });
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
        message: "is_active must be true or false when provided",
      });
    }

    const conditions: SQL[] = [];

    if (roleFilterRaw) {
      if (!FILTERABLE_ROLES.includes(roleFilterRaw as UserRole)) {
        return res.status(400).json({
          message: "Invalid role filter",
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch users" });
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
        message: "email and role are required",
      });
    }

    if (
      rawAuthProvider !== undefined &&
      rawAuthProvider !== "email" &&
      rawAuthProvider !== "google"
    ) {
      return res.status(400).json({
        message: "authProvider must be email or google when provided",
      });
    }

    const authProvider: CreateAuthProvider =
      rawAuthProvider === "google" ? "google" : "email";

    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "email cannot be empty",
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
        message: "name is required for email/password accounts",
      });
    }

    if (!name) {
      return res.status(400).json({
        message: "name cannot be empty",
      });
    }

    const requestedRole = rawRole as AssignableRole;

    if (rawDepartment !== undefined && typeof rawDepartment !== "string") {
      return res.status(400).json({
        message: "department must be a string when provided",
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
          message: "Only ADMIN or STAFF can be created with email/password",
        });
      }

      if (typeof rawPassword !== "string" || rawPassword.length < 8) {
        return res.status(400).json({
          message: "password must be at least 8 characters",
        });
      }

      passwordHash = await bcrypt.hash(rawPassword, 10);
    } else {
      if (!GOOGLE_PROVISIONABLE_ROLES.includes(requestedRole as "ADMIN" | "STAFF" | "FACULTY")) {
        return res.status(400).json({
          message: "Google-provisioned accounts can only be ADMIN, STAFF or FACULTY",
        });
      }

      if (!email.endsWith("@iitj.ac.in")) {
        return res.status(400).json({
          message: "Google-provisioned users must use @iitj.ac.in email",
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
      return res.status(409).json({ message: "Email already exists" });
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to create user" });
  }
});

router.patch("/:id/role", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }

    if (req.user?.id === targetId) {
      return res.status(400).json({
        message: "You cannot change your own role",
      });
    }

    const requestedRole = req.body?.role;

    if (typeof requestedRole !== "string") {
      return res.status(400).json({ message: "role is required" });
    }

    if (!ASSIGNABLE_ROLES.includes(requestedRole as AssignableRole)) {
      return res.status(400).json({
        message: "Invalid target role",
      });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "ADMIN" && requestedRole !== "ADMIN" && target.isActive) {
      const activeAdminCount = await getActiveAdminCount();

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot demote the last active ADMIN",
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to update role" });
  }
});

router.put("/:id/building-assignments", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const parsedBuildingIds = parseBuildingIds(req.body?.buildingIds);

    if (parsedBuildingIds === "invalid") {
      return res.status(400).json({ message: "buildingIds must be an array of positive integers" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role !== "STAFF") {
      return res.status(400).json({ message: "Assignments are allowed only for STAFF users" });
    }

    if (parsedBuildingIds.length > 0) {
      const existingBuildingRows = await db
        .select({ id: buildings.id })
        .from(buildings)
        .where(inArray(buildings.id, parsedBuildingIds));

      if (existingBuildingRows.length !== parsedBuildingIds.length) {
        return res.status(400).json({ message: "One or more buildingIds are invalid" });
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
        message: "Staff building assignments are unavailable until database migrations are applied",
      });
    }

    logger.error(error);
    return res.status(500).json({ message: "Failed to update building assignments" });
  }
});

router.patch("/:id/active", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const isActive = req.body?.isActive;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }

    if (req.user?.id === targetId && isActive === false) {
      return res.status(400).json({ message: "You cannot deactivate yourself" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "ADMIN" && target.isActive && !isActive) {
      const activeAdminCount = await getActiveAdminCount();

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot deactivate the last active ADMIN",
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to update active status" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }

    if (req.user?.id === targetId) {
      return res.status(400).json({ message: "You cannot delete yourself" });
    }

    const targetRows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "ADMIN" && target.isActive) {
      const activeAdminCount = await getActiveAdminCount();

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot delete the last active ADMIN",
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

export default router;
