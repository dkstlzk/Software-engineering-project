import { Router } from "express";
import { db } from "../../../db";
import { bookingRequests, bookings, users, rooms } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import { eq, and, gte, lt, desc, sql, inArray } from "drizzle-orm";
import logger from "../../../shared/utils/logger";

const router = Router();

/**
 * GET /dashboard/data
 * Aggregated endpoint returning stats, upcoming bookings, and activities in one request
 */
router.get("/data", authMiddleware, async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const now = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const tomorrowStart = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    // Fetch stats
    const bookingsThisMonth = await db
      .select({ count: sql`count(*)` })
      .from(bookings)
      .where(gte(bookings.startAt, monthStart));

    const pendingRequests = await db
      .select({ count: sql`count(*)` })
      .from(bookingRequests)
      .where(inArray(bookingRequests.status, ["PENDING_FACULTY", "PENDING_STAFF"]));

    const activeUsers = await db
      .select({ count: sql`count(distinct ${bookingRequests.userId})` })
      .from(bookingRequests)
      .where(gte(bookingRequests.createdAt, thirtyDaysAgo));

    const totalRooms = await db.select({ count: sql`count(*)` }).from(rooms);
    const bookedRooms = await db
      .select({ count: sql`count(distinct ${bookings.roomId})` })
      .from(bookings)
      .where(
        and(
          gte(bookings.startAt, today),
          lt(bookings.startAt, tomorrowStart),
        ),
      );

    const totalCount = Number((totalRooms[0]?.count || 0) as unknown);
    const utilization =
      totalCount > 0
        ? Math.round((Number(bookedRooms[0]?.count || 0) as unknown as number / totalCount) * 100)
        : 0;

    // Fetch upcoming bookings
    const upcomingBookings = await db
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
      .leftJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(gte(bookings.startAt, now))
      .orderBy(bookings.startAt)
      .limit(5);

    // Fetch activities
    const activities = await db
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
      .leftJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .orderBy(desc(bookingRequests.createdAt))
      .limit(10);

    return res.json({
      stats: {
        totalBookingsThisMonth: Number(bookingsThisMonth[0]?.count || 0),
        pendingRequests: Number(pendingRequests[0]?.count || 0),
        roomUtilization: utilization,
        activeUsers: Number(activeUsers[0]?.count || 0),
      },
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
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Count total bookings this month
    const bookingsThisMonth = await db
      .select({ count: sql`count(*)` })
      .from(bookings)
      .where(gte(bookings.startAt, monthStart));

    // Count pending booking requests
    const pendingRequests = await db
      .select({ count: sql`count(*)` })
      .from(bookingRequests)
      .where(inArray(bookingRequests.status, ["PENDING_FACULTY", "PENDING_STAFF"]));

    // Count active users (users with recent activity in last 30 days)
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await db
      .select({ count: sql`count(distinct ${bookingRequests.userId})` })
      .from(bookingRequests)
      .where(gte(bookingRequests.createdAt, thirtyDaysAgo));

    // Calculate room utilization
    const totalRooms = await db.select({ count: sql`count(*)` }).from(rooms);
    const tomorrowStart = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const bookedRooms = await db
      .select({ count: sql`count(distinct ${bookings.roomId})` })
      .from(bookings)
      .where(
        and(
          gte(bookings.startAt, today),
          lt(bookings.startAt, tomorrowStart),
        ),
      );

    const totalCount = Number((totalRooms[0]?.count || 0) as unknown);
    const utilization =
      totalCount > 0
        ? Math.round((Number(bookedRooms[0]?.count || 0) as unknown as number / totalCount) * 100)
        : 0;

    return res.json({
      totalBookingsThisMonth: Number(bookingsThisMonth[0]?.count || 0),
      pendingRequests: Number(pendingRequests[0]?.count || 0),
      roomUtilization: utilization,
      activeUsers: Number(activeUsers[0]?.count || 0),
    });
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
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const now = new Date();

    const upcomingBookings = await db
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
      .leftJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(gte(bookings.startAt, now))
      .orderBy(bookings.startAt)
      .limit(5);

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
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get recent booking requests (created/approved/rejected)
    const activities = await db
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
      .leftJoin(rooms, eq(bookingRequests.roomId, rooms.id))
      .orderBy(desc(bookingRequests.createdAt))
      .limit(10);

    return res.json(activities);
  } catch (error) {
    logger.error("Error fetching activity feed:", error);
    next(error);
  }
});

export default router;

