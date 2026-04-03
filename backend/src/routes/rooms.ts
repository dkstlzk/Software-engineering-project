import { Router, Request, Response } from "express";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import { buildings, bookings, rooms } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  getAssignedBuildingIdsForStaff,
  isBuildingAssignedToStaff,
  isRoomAssignedToStaff,
} from "../services/staffBuildingScope";

const router = Router();

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const roomId = Number(req.params.id);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const result = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    const room = result[0];

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json(room);
  } catch {
    return res.status(500).json({ error: "Failed to fetch room" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const buildingId = req.query.buildingId;

    if (buildingId !== undefined) {
      const parsedId = Number(buildingId);

      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return res.status(400).json({ error: "Invalid buildingId" });
      }

      if (
        req.user?.role === "STAFF" &&
        !(await isBuildingAssignedToStaff(req.user.id, parsedId))
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const building = await db
        .select({ id: buildings.id })
        .from(buildings)
        .where(eq(buildings.id, parsedId))
        .limit(1);

      if (building.length === 0) {
        return res.status(404).json({ error: "Building not found" });
      }

      const result = await db
        .select()
        .from(rooms)
        .where(eq(rooms.buildingId, parsedId));

      return res.json(result);
    }

    if (req.user?.role === "STAFF") {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

      if (assignedBuildingIds.length === 0) {
        return res.json([]);
      }

      const result = await db
        .select()
        .from(rooms)
        .where(inArray(rooms.buildingId, assignedBuildingIds));

      return res.json(result);
    }

    const result = await db.select().from(rooms);
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

router.get("/:id/availability", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const roomId = Number(req.params.id);
  const startAtRaw = req.query.startAt;
  const endAtRaw = req.query.endAt;

  if (!Number.isInteger(roomId) || roomId <= 0) {
    res.status(400).json({ message: "Invalid roomId" });
    return;
  }

  if (typeof startAtRaw !== "string" || typeof endAtRaw !== "string") {
    res.status(400).json({ message: "startAt and endAt are required" });
    return;
  }

  const startAt = new Date(startAtRaw);
  const endAt = new Date(endAtRaw);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || startAt >= endAt) {
    res.status(400).json({ message: "Invalid startAt or endAt" });
    return;
  }

  try {
    const roomRows = await db
      .select({
        id: rooms.id,
      })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (roomRows.length === 0) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isRoomAssignedToStaff(req.user.id, roomId))
    ) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const overlappingBookings = await db
      .select({
        id: bookings.id,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.roomId, roomId),
          lt(bookings.startAt, endAt),
          gt(bookings.endAt, startAt),
        ),
      )
      .orderBy(asc(bookings.startAt));

    res.json(overlappingBookings);
  } catch (error) {
    console.error("GET /rooms/:id/availability error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const buildingIdRaw = req.body?.buildingId;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (buildingIdRaw === undefined) {
      return res.status(400).json({ error: "buildingId is required" });
    }

    const buildingId = Number(buildingIdRaw);

    if (!Number.isInteger(buildingId) || buildingId <= 0) {
      return res.status(400).json({ error: "Invalid buildingId" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await db
      .insert(rooms)
      .values({ name, buildingId })
      .returning();

    return res.json(result[0]);
  } catch (error: any) {
    if (error?.cause?.code === "23505") {
      return res.status(409).json({ error: "Room already exists in this building" });
    }

    if (error?.cause?.code === "23503") {
      return res.status(400).json({ error: "Invalid buildingId" });
    }

    return res.status(500).json({ error: "Insert failed" });
  }
});

router.delete("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const roomId = Number(req.params.id);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const existing = await db
      .select({ id: rooms.id, buildingId: rooms.buildingId })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    const room = existing[0];

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db.delete(rooms).where(eq(rooms.id, roomId));

    return res.json({ message: "Room deleted" });
  } catch {
    return res.status(500).json({ error: "Delete failed" });
  }
});

router.patch("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const name = req.body?.name?.trim();

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const existing = await db
      .select({ id: rooms.id, buildingId: rooms.buildingId })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    const room = existing[0];

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, room.buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await db
      .update(rooms)
      .set({ name })
      .where(eq(rooms.id, roomId))
      .returning();

    return res.json({
      message: "Room updated",
      data: result[0],
    });
  } catch (error: any) {
    console.error(error);

    if (error?.cause?.code === "23505") {
      return res.status(409).json({
        error: "Room with this name already exists in the building",
      });
    }

    return res.status(500).json({ error: "Update failed" });
  }
});

export default router;