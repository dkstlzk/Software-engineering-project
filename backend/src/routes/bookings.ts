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
import {
  getAssignedBuildingIdsForStaff,
  isRoomAssignedToStaff,
} from "../services/staffBuildingScope";

const router = Router();

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const result = await db
      .select({
        booking: bookings,
        buildingId: rooms.buildingId,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(eq(bookings.id, id))
      .limit(1);

    const row = result[0];

    if (!row) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (req.user?.role === "STAFF") {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);
      if (!assignedBuildingIds.includes(row.buildingId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    return res.json(row.booking);
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

    const isStaff = req.user?.role === "STAFF";
    const assignedBuildingIds = isStaff
      ? await getAssignedBuildingIdsForStaff(req.user!.id)
      : [];

    if (isStaff && parsedBuildingId !== null && !assignedBuildingIds.includes(parsedBuildingId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (isStaff && assignedBuildingIds.length === 0) {
      return res.json([]);
    }

    const conditions = [];

    if (parsedRoomId !== null) {
      conditions.push(eq(bookings.roomId, parsedRoomId));
    }

    if (parsedStartAt && parsedEndAt) {
      conditions.push(
        and(
          lt(bookings.startAt, parsedEndAt),
          gt(bookings.endAt, parsedStartAt),
        ),
      );
    }

    if (parsedBuildingId !== null) {
      conditions.push(eq(rooms.buildingId, parsedBuildingId));
    }

    if (isStaff) {
      conditions.push(inArray(rooms.buildingId, assignedBuildingIds));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const shouldJoinRooms = parsedBuildingId !== null || isStaff;

    if (shouldJoinRooms) {
      const query = db
        .select({ booking: bookings })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id));

      const result = whereClause ? await query.where(whereClause) : await query;
      return res.json(result.map((row) => row.booking));
    }

    const query = db.select().from(bookings);
    const result = whereClause ? await query.where(whereClause) : await query;
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

      if (req.user?.role === "STAFF") {
        const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

        if (assignedBuildingIds.length === 0) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const allowedBuildingIdSet = new Set(assignedBuildingIds);
        const roomIds = Array.from(
          new Set(
            items
              .map((item: any) => Number(item?.roomId))
              .filter((roomId) => Number.isInteger(roomId) && roomId > 0),
          ),
        );

        if (roomIds.length > 0) {
          const roomRows = await db
            .select({ id: rooms.id, buildingId: rooms.buildingId })
            .from(rooms)
            .where(inArray(rooms.id, roomIds));

          const roomBuildingByRoomId = new Map(
            roomRows.map((roomRow) => [roomRow.id, roomRow.buildingId]),
          );

          for (const roomId of roomIds) {
            const buildingId = roomBuildingByRoomId.get(roomId);

            if (
              typeof buildingId === "number" &&
              !allowedBuildingIdSet.has(buildingId)
            ) {
              return res.status(403).json({ error: "Forbidden" });
            }
          }
        }
      }

      const stampedItems =
        req.user?.id !== undefined
          ? items.map((item: any) => {
              if (!item || typeof item !== "object") {
                return item;
              }

              const existingMetadata =
                item.metadata && typeof item.metadata === "object"
                  ? item.metadata
                  : {};

              return {
                ...item,
                metadata: {
                  ...existingMetadata,
                  approvedBy:
                    existingMetadata.approvedBy !== undefined
                      ? existingMetadata.approvedBy
                      : req.user?.id,
                  approvedAt:
                    existingMetadata.approvedAt !== undefined
                      ? existingMetadata.approvedAt
                      : new Date(),
                },
              };
            })
          : items;

      const result = await createBookingsBulk(stampedItems);

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
    const input = req.body ?? {};

    if (req.user?.role === "STAFF") {
      const roomId = Number((input as any).roomId);

      if (
        Number.isInteger(roomId) &&
        roomId > 0 &&
        !(await isRoomAssignedToStaff(req.user.id, roomId))
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    if (input && typeof input === "object" && req.user?.id !== undefined) {
      const existingMetadata =
        (input as any).metadata && typeof (input as any).metadata === "object"
          ? (input as any).metadata
          : {};

      (input as any).metadata = {
        ...existingMetadata,
        approvedBy:
          existingMetadata.approvedBy !== undefined
            ? existingMetadata.approvedBy
            : req.user.id,
        approvedAt:
          existingMetadata.approvedAt !== undefined
            ? existingMetadata.approvedAt
            : new Date(),
      };
    }

    const result = await createBooking(input);

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

    if (req.user?.role === "STAFF") {
      const existingRows = await db
        .select({
          id: bookings.id,
          roomId: bookings.roomId,
          buildingId: rooms.buildingId,
        })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id))
        .where(eq(bookings.id, bookingId))
        .limit(1);

      const existing = existingRows[0];

      if (!existing) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

      if (!assignedBuildingIds.includes(existing.buildingId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (req.body?.roomId !== undefined) {
        const nextRoomId = Number(req.body.roomId);

        if (
          Number.isInteger(nextRoomId) &&
          nextRoomId > 0 &&
          !(await isRoomAssignedToStaff(req.user.id, nextRoomId))
        ) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
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

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    if (req.user?.role === "STAFF") {
      const existingRows = await db
        .select({
          id: bookings.id,
          buildingId: rooms.buildingId,
        })
        .from(bookings)
        .innerJoin(rooms, eq(bookings.roomId, rooms.id))
        .where(eq(bookings.id, id))
        .limit(1);

      const existing = existingRows[0];

      if (!existing) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

      if (!assignedBuildingIds.includes(existing.buildingId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
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