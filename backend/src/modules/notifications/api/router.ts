import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { notifications } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import logger from "../../../shared/utils/logger";

const router = Router();

function parsePositiveInt(input: unknown, fallback: number, max: number): number {
  const parsed = Number(input);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseBoolean(input: unknown): boolean {
  if (typeof input !== "string") {
    return false;
  }

  return input.trim().toLowerCase() === "true";
}

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, 200);
    const unreadOnly = parseBoolean(req.query.unreadOnly);

    const ownerCondition = eq(notifications.recipientId, req.user!.id);

    const whereClause = unreadOnly
      ? and(ownerCondition, eq(notifications.isRead, false))
      : ownerCondition;

    const rows = await db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.sentAt))
      .limit(limit);

    const unreadRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, req.user!.id),
          eq(notifications.isRead, false),
        ),
      );

    const unreadCount = Number(unreadRows[0]?.count ?? 0);

    return res.json({
      data: rows,
      unreadCount,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

router.post("/:id/read", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.notificationId, id),
          eq(notifications.recipientId, req.user!.id),
        ),
      )
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.json(updated[0]);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to mark notification as read" });
  }
});

router.post("/read-all", async (req, res) => {
  try {
    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.recipientId, req.user!.id),
          eq(notifications.isRead, false),
        ),
      )
      .returning({ notificationId: notifications.notificationId });

    return res.json({
      updatedCount: updated.length,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to mark all notifications as read" });
  }
});

export default router;
