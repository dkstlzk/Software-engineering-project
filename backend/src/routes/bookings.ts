import { Router } from "express";
import { db } from "../db";
import {
  bookings,
  rooms,
  slotSystems,
  timetableImportBatches,
  timetableImportOccurrences,
} from "../db/schema";
import { eq, and, inArray, lt, gt } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  createBooking,
  createBookingsBulk,
  updateBooking,
} from "../services/bookingService";

const router = Router();

router.get("/:id", authMiddleware, async (req, res) => {
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
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { startAt, endAt, roomId, buildingId } = req.query;

    const parsedStartAt = startAt ? new Date(startAt as string) : null;
    const parsedEndAt = endAt ? new Date(endAt as string) : null;

    const parsedRoomId = roomId ? Number(roomId) : null;
    const parsedBuildingId = buildingId ? Number(buildingId) : null;

    // ------------------------
    // Validation
    // ------------------------
    if ((parsedStartAt && !parsedEndAt) || (!parsedStartAt && parsedEndAt)) {
      return res.status(400).json({
        error: "Both startAt and endAt must be provided together",
      });
    }

    if (parsedStartAt && parsedEndAt) {
      if (isNaN(parsedStartAt.getTime()) || isNaN(parsedEndAt.getTime())) {
        return res.status(400).json({
          error: "Invalid date format",
        });
      }

      if (parsedStartAt >= parsedEndAt) {
        return res.status(400).json({
          error: "startAt must be less than endAt",
        });
      }
    }

    if (parsedRoomId !== null && isNaN(parsedRoomId)) {
      return res.status(400).json({ error: "Invalid roomId" });
    }

    if (parsedBuildingId !== null && isNaN(parsedBuildingId)) {
      return res.status(400).json({ error: "Invalid buildingId" });
    }

    // ------------------------
    // Build conditions
    // ------------------------
    const conditions = [];

    if (parsedRoomId !== null) {
      conditions.push(eq(bookings.roomId, parsedRoomId));
    }

    if (parsedStartAt && parsedEndAt) {
      conditions.push(
        and(
          lt(bookings.startAt, parsedEndAt),
          gt(bookings.endAt, parsedStartAt)
        )
      );
    }

    if (parsedBuildingId !== null) {
      conditions.push(eq(rooms.buildingId, parsedBuildingId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // ------------------------
    // Execute query (type-safe branches)
    // ------------------------
    let result;

    if (parsedBuildingId !== null) {
      const query = db
        .select()
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id));

      result = whereClause ? await query.where(whereClause) : await query;
    } else {
      const query = db.select().from(bookings);

      result = whereClause ? await query.where(whereClause) : await query;
    }

    if (parsedBuildingId !== null) {
      // result is joined → extract bookings
      const normalized = result.map((row: any) => row.bookings);
      return res.json(normalized);
    }

    return res.json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// -------------------------------------
// POST /bookings/bulk
// Body: { items: [{ roomId, startAt, endAt, clientRowId? }] }
// -------------------------------------
router.post(
  "/bulk",
  authMiddleware,
  requireRole(["ADMIN", "STAFF"]),
  async (req, res) => {
    try {
      const items = req.body?.items;

      if (!Array.isArray(items)) {
        return res.status(400).json({
          error: "items must be an array",
        });
      }

      if (items.length === 0) {
        return res.status(400).json({
          error: "items array must not be empty",
        });
      }

      const result = await createBookingsBulk(items);

      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Bulk create failed" });
    }
  },
);


// -------------------------------------
// POST /bookings
// Body: { roomId, startAt, endAt }
// -------------------------------------
router.post("/", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const result = await createBooking(req.body ?? {});

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.message,
        code: result.code,
      });
    }

    return res.status(201).json(result.booking);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Insert failed" });
  }
});

// -------------------------------------
// PATCH /bookings/:id
// Body: { roomId?, startAt?, endAt? }
// -------------------------------------
router.patch("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const result = await updateBooking({
      bookingId,
      ...(req.body?.roomId !== undefined ? { roomId: Number(req.body.roomId) } : {}),
      ...(req.body?.startAt !== undefined ? { startAt: req.body.startAt } : {}),
      ...(req.body?.endAt !== undefined ? { endAt: req.body.endAt } : {}),
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.message,
        code: result.code,
      });
    }

    return res.json(result.booking);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Update failed" });
  }
});

// -------------------------------------
// DELETE /bookings/prune
// Query:
//   ?scope=all
//   ?scope=slot-system&slotSystemId=1
// -------------------------------------
router.delete(
  "/prune",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const rawScope = String(req.query.scope ?? "all").trim().toLowerCase();

      if (rawScope !== "all" && rawScope !== "slot-system") {
        return res.status(400).json({
          error: "scope must be either 'all' or 'slot-system'",
        });
      }

      if (rawScope === "all") {
        const deleted = await db.delete(bookings).returning({ id: bookings.id });

        return res.json({
          scope: "all",
          deletedBookings: deleted.length,
        });
      }

      const slotSystemId = Number(req.query.slotSystemId);

      if (!Number.isInteger(slotSystemId) || slotSystemId <= 0) {
        return res.status(400).json({
          error: "slotSystemId is required for scope=slot-system",
        });
      }

      const [slotSystem] = await db
        .select({ id: slotSystems.id })
        .from(slotSystems)
        .where(eq(slotSystems.id, slotSystemId))
        .limit(1);

      if (!slotSystem) {
        return res.status(404).json({ error: "Slot system not found" });
      }

      const occurrenceRows = await db
        .select({ bookingId: timetableImportOccurrences.bookingId })
        .from(timetableImportOccurrences)
        .innerJoin(
          timetableImportBatches,
          eq(timetableImportOccurrences.batchId, timetableImportBatches.id),
        )
        .where(eq(timetableImportBatches.slotSystemId, slotSystemId));

      const bookingIds = Array.from(
        new Set(
          occurrenceRows
            .map((row) => row.bookingId)
            .filter((bookingId): bookingId is number => typeof bookingId === "number"),
        ),
      );

      if (bookingIds.length === 0) {
        return res.json({
          scope: "slot-system",
          slotSystemId,
          deletedBookings: 0,
        });
      }

      const deleted = await db
        .delete(bookings)
        .where(inArray(bookings.id, bookingIds))
        .returning({ id: bookings.id });

      return res.json({
        scope: "slot-system",
        slotSystemId,
        deletedBookings: deleted.length,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Prune failed" });
    }
  },
);

// -------------------------------------
// DELETE /bookings/:id
// -------------------------------------
router.delete("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
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