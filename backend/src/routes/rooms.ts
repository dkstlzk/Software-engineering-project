import { Router, Request, Response } from "express";
import { db } from "../db";
import { rooms , buildings ,bookings} from "../db/schema";
import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();

// GET /rooms/:id
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const idParam = req.params.id;
    const roomId = Number(idParam);

    // Validate
    if (Number.isNaN(roomId)) {
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

    res.json(result[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

//GET rooms with optional buildingId filter
router.get("/", authMiddleware, async (req, res) => {
  try {
    const buildingId = req.query.buildingId;

    // If buildingId is provided
    if (buildingId !== undefined) {
      const parsedId = Number(buildingId);

      // Validate number
      if (Number.isNaN(parsedId)) {
        return res.status(400).json({ error: "Invalid buildingId" });
      }

      // Step 1: Check if building exists
      const building = await db
        .select()
        .from(buildings)
        .where(eq(buildings.id, parsedId))
        .limit(1);

      if (building.length === 0) {
        return res.status(404).json({ error: "Building not found" });
      }

      // Step 2: Fetch rooms
      const result = await db
        .select()
        .from(rooms)
        .where(eq(rooms.buildingId, parsedId));

      return res.json(result);
    }

    // No filter → return all rooms
    const result = await db.select().from(rooms);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

router.get('/:id/availability', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const roomId = Number(req.params.id);
  const startAtRaw = req.query.startAt;
  const endAtRaw = req.query.endAt;

  if (!Number.isInteger(roomId) || roomId <= 0) {
    res.status(400).json({ message: 'Invalid roomId' });
    return;
  }

  if (typeof startAtRaw !== 'string' || typeof endAtRaw !== 'string') {
    res.status(400).json({ message: 'startAt and endAt are required' });
    return;
  }

  const startAt = new Date(startAtRaw);
  const endAt = new Date(endAtRaw);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || startAt >= endAt) {
    res.status(400).json({ message: 'Invalid startAt or endAt' });
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
      res.status(404).json({ message: 'Room not found' });
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
          gt(bookings.endAt, startAt)
        )
      )
      .orderBy(asc(bookings.startAt));

    res.json(overlappingBookings);
  } catch (error) {
    console.error('GET /rooms/:id/availability error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//POST room 
router.post("/", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const buildingIdRaw = req.body?.buildingId;

    // Validate name
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Validate buildingId presence
    if (buildingIdRaw === undefined) {
      return res.status(400).json({ error: "buildingId is required" });
    }

    // Convert + validate number
    const buildingId = Number(buildingIdRaw);

    if (Number.isNaN(buildingId)) {
      return res.status(400).json({ error: "Invalid buildingId" });
    }

    const result = await db
      .insert(rooms)
      .values({ name, buildingId })
      .returning();

    res.json(result[0]);
  } catch (error: any) {
    if (error?.cause?.code === "23505") {
      return res.status(409).json({ error: "Room already exists in this building" });
    }

    if (error?.cause?.code === "23503") {
      return res.status(400).json({ error: "Invalid buildingId" });
    }

    res.status(500).json({ error: "Insert failed" });
  }
});

// DELETE /rooms/:id
router.delete("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const idParam = req.params.id;
    const roomId = Number(idParam);

    // Validate
    if (Number.isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const result = await db
      .delete(rooms)
      .where(eq(rooms.id, roomId))
      .returning();

    // Not found
    if (result.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({ message: "Room deleted" });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// PATCH /rooms/:id
router.patch("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const idParam = req.params.id;
    const roomId = Number(idParam);
    const name = req.body?.name?.trim();

    // Validate ID
    if (Number.isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    // Validate name
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await db
      .update(rooms)
      .set({ name })
      .where(eq(rooms.id, roomId))
      .returning();

    // Not found
    if (result.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({
      message: "Room updated",
      data: result[0],
    });
  } catch (error: any) {
    console.error(error);

    const pgError = error?.cause;

    // 🔥 This now matches your composite unique constraint
    if (pgError?.code === "23505") {
      return res.status(409).json({
        error: "Room with this name already exists in the building",
      });
    }

    res.status(500).json({ error: "Update failed" });
  }
});

export default router;