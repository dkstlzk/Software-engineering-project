import { Router } from "express";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import { bookingRequests, bookings, rooms, users } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import { getAssignedBuildingIdsForStaff } from "../../users/services/staffBuildingScope";
import logger from "../../../shared/utils/logger";

const router = Router();

type DashboardRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "PENDING_ROLE";

type DashboardScope = {
  userId: number;
  role: DashboardRole;
  assignedBuildingIds: number[];
};

function toCount(rows: Array<{ count: unknown }>): number {
  const value = Number(rows[0]?.count ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function resolveDashboardScope(req: any): Promise<DashboardScope | null> {
  const user = req.user as { id?: number; role?: DashboardRole } | undefined;

  if (typeof user?.id !== "number" || typeof user?.role !== "string") {
    return null;
  }

  const assignedBuildingIds =
    user.role === "STAFF" ? await getAssignedBuildingIdsForStaff(user.id) : [];

  return {
    userId: user.id,
    role: user.role,
    assignedBuildingIds,
  };
}

async function getTotalBookingsThisMonth(scope: DashboardScope, monthStart: Date): Promise<number> {
  if (scope.role === "STAFF") {
    if (scope.assignedBuildingIds.length === 0) {
      return 0;
    }

    const rows = await db
      .select({ count: sql`count(*)` })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(
        and(
          gte(bookings.startAt, monthStart),
          inArray(rooms.buildingId, scope.assignedBuildingIds),
        ),
      );

    return toCount(rows);
  }

  if (scope.role === "STUDENT" || scope.role === "FACULTY") {
    const rows = await db
      .select({ count: sql`count(*)` })
      .from(bookings)
      .innerJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
      .where(
        and(
          gte(bookings.startAt, monthStart),
          eq(bookingRequests.userId, scope.userId),
        ),
      );

    return toCount(rows);
  }

  if (scope.role === "ADMIN") {
    const rows = await db
      .select({ count: sql`count(*)` })
      .from(bookings)
      .where(gte(bookings.startAt, monthStart));

    return toCount(rows);
  }

  return 0;
}

async function getPendingRequestStats(scope: DashboardScope): Promise<{
  pendingRequests: number;
  pendingRequestsByFaculty: number;
  pendingRequestsByStaff: number;
  pendingRequestsToClear: number;
}> {
  if (scope.role === "STAFF") {
    if (scope.assignedBuildingIds.length === 0) {
      return {
        pendingRequests: 0,
        pendingRequestsByFaculty: 0,
        pendingRequestsByStaff: 0,
        pendingRequestsToClear: 0,
      };
    }

    const pendingStaffRows = await db
      .select({ count: sql`count(*)` })
      .from(bookingRequests)
      .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .where(
        and(
          eq(bookingRequests.status, "PENDING_STAFF"),
          inArray(rooms.buildingId, scope.assignedBuildingIds),
        ),
      );

    const pendingStaffCount = toCount(pendingStaffRows);

    return {
      pendingRequests: pendingStaffCount,
      pendingRequestsByFaculty: 0,
      pendingRequestsByStaff: pendingStaffCount,
      pendingRequestsToClear: pendingStaffCount,
    };
  }

  if (scope.role === "STUDENT") {
    const [pendingFacultyRows, pendingStaffRows] = await Promise.all([
      db
        .select({ count: sql`count(*)` })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.userId, scope.userId),
            eq(bookingRequests.status, "PENDING_FACULTY"),
          ),
        ),
      db
        .select({ count: sql`count(*)` })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.userId, scope.userId),
            eq(bookingRequests.status, "PENDING_STAFF"),
          ),
        ),
    ]);

    const pendingByFaculty = toCount(pendingFacultyRows);
    const pendingByStaff = toCount(pendingStaffRows);

    return {
      pendingRequests: pendingByFaculty + pendingByStaff,
      pendingRequestsByFaculty: pendingByFaculty,
      pendingRequestsByStaff: pendingByStaff,
      pendingRequestsToClear: 0,
    };
  }

  if (scope.role === "FACULTY") {
    const [pendingFacultyRows, pendingStaffRows, pendingToClearRows] = await Promise.all([
      db
        .select({ count: sql`count(*)` })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.userId, scope.userId),
            eq(bookingRequests.status, "PENDING_FACULTY"),
          ),
        ),
      db
        .select({ count: sql`count(*)` })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.userId, scope.userId),
            eq(bookingRequests.status, "PENDING_STAFF"),
          ),
        ),
      db
        .select({ count: sql`count(*)` })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.status, "PENDING_FACULTY"),
            or(
              eq(bookingRequests.facultyId, scope.userId),
              isNull(bookingRequests.facultyId),
            ),
          ),
        ),
    ]);

    const pendingByFaculty = toCount(pendingFacultyRows);
    const pendingByStaff = toCount(pendingStaffRows);

    return {
      pendingRequests: pendingByFaculty + pendingByStaff,
      pendingRequestsByFaculty: pendingByFaculty,
      pendingRequestsByStaff: pendingByStaff,
      pendingRequestsToClear: toCount(pendingToClearRows),
    };
  }

  if (scope.role === "ADMIN") {
    const [pendingFacultyRows, pendingStaffRows] = await Promise.all([
      db
        .select({ count: sql`count(*)` })
        .from(bookingRequests)
        .where(eq(bookingRequests.status, "PENDING_FACULTY")),
      db
        .select({ count: sql`count(*)` })
        .from(bookingRequests)
        .where(eq(bookingRequests.status, "PENDING_STAFF")),
    ]);

    const pendingByFaculty = toCount(pendingFacultyRows);
    const pendingByStaff = toCount(pendingStaffRows);

    return {
      pendingRequests: pendingByFaculty + pendingByStaff,
      pendingRequestsByFaculty: pendingByFaculty,
      pendingRequestsByStaff: pendingByStaff,
      pendingRequestsToClear: 0,
    };
  }

  return {
    pendingRequests: 0,
    pendingRequestsByFaculty: 0,
    pendingRequestsByStaff: 0,
    pendingRequestsToClear: 0,
  };
}

async function getUtilizationAndActivityStats(
  scope: DashboardScope,
  today: Date,
): Promise<{ roomUtilization: number; activeUsers: number }> {
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const tomorrowStart = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  if (scope.role === "STAFF") {
    if (scope.assignedBuildingIds.length === 0) {
      return { roomUtilization: 0, activeUsers: 0 };
    }

    const [totalRoomsRows, bookedRoomsRows, activeUsersRows] = await Promise.all([
      db
        .select({ count: sql`count(*)` })
        .from(rooms)
        .where(inArray(rooms.buildingId, scope.assignedBuildingIds)),
      db
        .select({ count: sql`count(distinct ${bookings.roomId})` })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id))
        .where(
          and(
            gte(bookings.startAt, today),
            lt(bookings.startAt, tomorrowStart),
            inArray(rooms.buildingId, scope.assignedBuildingIds),
          ),
        ),
      db
        .select({ count: sql`count(distinct ${bookingRequests.userId})` })
        .from(bookingRequests)
        .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
        .where(
          and(
            gte(bookingRequests.createdAt, thirtyDaysAgo),
            inArray(rooms.buildingId, scope.assignedBuildingIds),
          ),
        ),
    ]);

    const totalRoomsCount = toCount(totalRoomsRows);
    const bookedRoomsCount = toCount(bookedRoomsRows);
    const roomUtilization =
      totalRoomsCount > 0
        ? Math.round((bookedRoomsCount / totalRoomsCount) * 100)
        : 0;

    return {
      roomUtilization,
      activeUsers: toCount(activeUsersRows),
    };
  }

  if (scope.role === "ADMIN") {
    const [totalRoomsRows, bookedRoomsRows, activeUsersRows] = await Promise.all([
      db.select({ count: sql`count(*)` }).from(rooms),
      db
        .select({ count: sql`count(distinct ${bookings.roomId})` })
        .from(bookings)
        .where(
          and(
            gte(bookings.startAt, today),
            lt(bookings.startAt, tomorrowStart),
          ),
        ),
      db
        .select({ count: sql`count(distinct ${bookingRequests.userId})` })
        .from(bookingRequests)
        .where(gte(bookingRequests.createdAt, thirtyDaysAgo)),
    ]);

    const totalRoomsCount = toCount(totalRoomsRows);
    const bookedRoomsCount = toCount(bookedRoomsRows);
    const roomUtilization =
      totalRoomsCount > 0
        ? Math.round((bookedRoomsCount / totalRoomsCount) * 100)
        : 0;

    return {
      roomUtilization,
      activeUsers: toCount(activeUsersRows),
    };
  }

  return { roomUtilization: 0, activeUsers: 0 };
}

async function getDashboardStats(scope: DashboardScope, today: Date) {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalBookingsThisMonth, pendingStats, utilizationStats] = await Promise.all([
    getTotalBookingsThisMonth(scope, monthStart),
    getPendingRequestStats(scope),
    getUtilizationAndActivityStats(scope, today),
  ]);

  return {
    totalBookingsThisMonth,
    pendingRequests: pendingStats.pendingRequests,
    pendingRequestsByFaculty: pendingStats.pendingRequestsByFaculty,
    pendingRequestsByStaff: pendingStats.pendingRequestsByStaff,
    pendingRequestsToClear: pendingStats.pendingRequestsToClear,
    roomUtilization: utilizationStats.roomUtilization,
    activeUsers: utilizationStats.activeUsers,
  };
}

async function getUpcomingBookings(scope: DashboardScope, now: Date) {
  if (scope.role === "STAFF") {
    if (scope.assignedBuildingIds.length === 0) {
      return [];
    }

    return db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        roomName: rooms.name,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        source: bookings.source,
        requestId: bookings.requestId,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(
        and(
          gte(bookings.startAt, now),
          inArray(rooms.buildingId, scope.assignedBuildingIds),
        ),
      )
      .orderBy(bookings.startAt)
      .limit(5);
  }

  if (scope.role === "STUDENT" || scope.role === "FACULTY") {
    return db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        roomName: rooms.name,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        source: bookings.source,
        requestId: bookings.requestId,
      })
      .from(bookings)
      .innerJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(
        and(
          gte(bookings.startAt, now),
          eq(bookingRequests.userId, scope.userId),
        ),
      )
      .orderBy(bookings.startAt)
      .limit(5);
  }

  if (scope.role === "ADMIN") {
    return db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        roomName: rooms.name,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        source: bookings.source,
        requestId: bookings.requestId,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(gte(bookings.startAt, now))
      .orderBy(bookings.startAt)
      .limit(5);
  }

  return [];
}

async function getActivityFeed(scope: DashboardScope) {
  if (scope.role === "STAFF") {
    if (scope.assignedBuildingIds.length === 0) {
      return [];
    }

    return db
      .select({
        id: bookingRequests.id,
        type: sql`'request'`,
        status: bookingRequests.status,
        userId: bookingRequests.userId,
        userName: users.name,
        roomId: bookingRequests.roomId,
        roomName: rooms.name,
        startAt: bookingRequests.startAt,
        createdAt: bookingRequests.createdAt,
        eventType: bookingRequests.eventType,
      })
      .from(bookingRequests)
      .leftJoin(users, eq(bookingRequests.userId, users.id))
      .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .where(inArray(rooms.buildingId, scope.assignedBuildingIds))
      .orderBy(desc(bookingRequests.createdAt))
      .limit(10);
  }

  if (scope.role === "STUDENT") {
    return db
      .select({
        id: bookingRequests.id,
        type: sql`'request'`,
        status: bookingRequests.status,
        userId: bookingRequests.userId,
        userName: users.name,
        roomId: bookingRequests.roomId,
        roomName: rooms.name,
        startAt: bookingRequests.startAt,
        createdAt: bookingRequests.createdAt,
        eventType: bookingRequests.eventType,
      })
      .from(bookingRequests)
      .leftJoin(users, eq(bookingRequests.userId, users.id))
      .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .where(eq(bookingRequests.userId, scope.userId))
      .orderBy(desc(bookingRequests.createdAt))
      .limit(10);
  }

  if (scope.role === "FACULTY") {
    return db
      .select({
        id: bookingRequests.id,
        type: sql`'request'`,
        status: bookingRequests.status,
        userId: bookingRequests.userId,
        userName: users.name,
        roomId: bookingRequests.roomId,
        roomName: rooms.name,
        startAt: bookingRequests.startAt,
        createdAt: bookingRequests.createdAt,
        eventType: bookingRequests.eventType,
      })
      .from(bookingRequests)
      .leftJoin(users, eq(bookingRequests.userId, users.id))
      .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .where(
        or(
          eq(bookingRequests.userId, scope.userId),
          eq(bookingRequests.facultyId, scope.userId),
        ),
      )
      .orderBy(desc(bookingRequests.createdAt))
      .limit(10);
  }

  if (scope.role === "ADMIN") {
    return db
      .select({
        id: bookingRequests.id,
        type: sql`'request'`,
        status: bookingRequests.status,
        userId: bookingRequests.userId,
        userName: users.name,
        roomId: bookingRequests.roomId,
        roomName: rooms.name,
        startAt: bookingRequests.startAt,
        createdAt: bookingRequests.createdAt,
        eventType: bookingRequests.eventType,
      })
      .from(bookingRequests)
      .leftJoin(users, eq(bookingRequests.userId, users.id))
      .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .orderBy(desc(bookingRequests.createdAt))
      .limit(10);
  }

  return [];
}

/**
 * GET /dashboard/data
 * Aggregated endpoint returning stats, upcoming bookings, and activities in one request
 */
router.get("/data", authMiddleware, async (req, res, next) => {
  try {
    const scope = await resolveDashboardScope(req as any);

    if (!scope) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const [stats, upcomingBookings, activities] = await Promise.all([
      getDashboardStats(scope, today),
      getUpcomingBookings(scope, now),
      getActivityFeed(scope),
    ]);

    return res.json({
      stats,
      upcomingBookings,
      activities,
    });
  } catch (error) {
    logger.error("Error fetching dashboard data:", error);
    next(error);
  }
});

/**
 * GET /dashboard/stats
 * Returns aggregated stats for the dashboard
 */
router.get("/stats", authMiddleware, async (req, res, next) => {
  try {
    const scope = await resolveDashboardScope(req as any);

    if (!scope) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await getDashboardStats(scope, today);
    return res.json(stats);
  } catch (error) {
    logger.error("Error fetching dashboard stats:", error);
    next(error);
  }
});

/**
 * GET /dashboard/upcoming-bookings
 * Returns next 5 upcoming bookings
 */
router.get("/upcoming-bookings", authMiddleware, async (req, res, next) => {
  try {
    const scope = await resolveDashboardScope(req as any);

    if (!scope) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const now = new Date();
    const upcomingBookings = await getUpcomingBookings(scope, now);

    return res.json(upcomingBookings);
  } catch (error) {
    logger.error("Error fetching upcoming bookings:", error);
    next(error);
  }
});

/**
 * GET /dashboard/activity-feed
 * Returns recent activities (last 10)
 */
router.get("/activity-feed", authMiddleware, async (req, res, next) => {
  try {
    const scope = await resolveDashboardScope(req as any);

    if (!scope) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const activities = await getActivityFeed(scope);

    return res.json(activities);
  } catch (error) {
    logger.error("Error fetching activity feed:", error);
    next(error);
  }
});

export default router;

