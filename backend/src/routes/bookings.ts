import { Router } from "express";
import { db } from "../db";
import { bookings, rooms } from "../db/schema";
import { eq, and, lt, gt } from "drizzle-orm";

const router = Router();

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const result = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));

    if (result.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    return res.json(result[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Fetch failed" });
  }
});

// -------------------------------------
// GET /bookings
// Optional query: ?roomId=1
// -------------------------------------
router.get("/", async (req, res) => {
  try {
    const roomId = req.query.roomId;

    if (roomId !== undefined) {
      const parsedRoomId = Number(roomId);

      if (isNaN(parsedRoomId)) {
        return res.status(400).json({ error: "Invalid roomId" });
      }

      const result = await db
        .select()
        .from(bookings)
        .where(eq(bookings.roomId, parsedRoomId));

      return res.json(result);
    }

    const result = await db.select().from(bookings);
    return res.json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// -------------------------------------
// POST /bookings
// Body: { roomId, startAt, endAt }
// -------------------------------------
router.post("/", async (req, res) => {
  try {
    const { roomId, startAt, endAt } = req.body;

    // ------------------------
    // Validation
    // ------------------------
    if (!roomId || !startAt || !endAt) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parsedRoomId = Number(roomId);
    const start = new Date(startAt);
    const end = new Date(endAt);

    if (isNaN(parsedRoomId)) {
      return res.status(400).json({ error: "Invalid roomId" });
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid datetime format" });
    }

    if (start >= end) {
      return res.status(400).json({ error: "startAt must be before endAt" });
    }

    // ------------------------
    // Check room exists
    // ------------------------
    const roomExists = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, parsedRoomId))
      .limit(1);

    if (roomExists.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    // ------------------------
    // Overlap check
    // existing.start < new.end AND existing.end > new.start
    // ------------------------
    const overlapping = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.roomId, parsedRoomId),
          lt(bookings.startAt, end),
          gt(bookings.endAt, start)
        )
      )
      .limit(1);

    if (overlapping.length > 0) {
      return res.status(409).json({ error: "Room already booked for this time range" });
    }

    // ------------------------
    // Insert booking
    // ------------------------
    const inserted = await db
      .insert(bookings)
      .values({
        roomId: parsedRoomId,
        startAt: start,
        endAt: end,
      })
      .returning();

    return res.status(201).json(inserted[0]);

  } catch (error: any) {
  if (error?.cause?.code === "23503") {
    return res.status(404).json({ error: "Room not found" });
  }

  if (error?.cause?.code === "23P01") {
    return res.status(409).json({
      error: "Room already booked for this time range",
    });
  }

  res.status(500).json({ error: "Insert failed" });
}
});

// -------------------------------------
// DELETE /bookings/:id
// -------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const deleted = await db
      .delete(bookings)
      .where(eq(bookings.id, id))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    return res.status(204).send();

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;