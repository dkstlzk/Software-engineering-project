import { Router } from "express";
import { db } from "../db";
import { eq, lt, gt, and, or } from "drizzle-orm";
import { bookingRequests } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { createBooking, hasBookingOverlap } from "../services/bookingService";

const router = Router();

const ALL_STATUSES = [
  "PENDING_FACULTY",
  "PENDING_STAFF",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

type BookingRequestStatus = (typeof ALL_STATUSES)[number];

function isBookingRequestStatus(value: unknown): value is BookingRequestStatus {
  return typeof value === "string" && (ALL_STATUSES as readonly string[]).includes(value);
}

function canViewRequest(
  role: "ADMIN" | "STAFF" | "FACULTY" | "STUDENT",
  userId: number,
  request: { userId: number | null; status: BookingRequestStatus }
) {
  if (role === "ADMIN") {
    return true;
  }

  if (role === "STUDENT") {
    return request.userId === userId;
  }

  if (role === "FACULTY") {
    return request.userId === userId || request.status === "PENDING_FACULTY";
  }

  if (role === "STAFF") {
    return request.status === "PENDING_STAFF";
  }

  return false;
}

// GET /booking-requests/:id
// Fetch a single booking request by ID
// Returns: booking request object
// Errors: 400 (invalid id), 404 (not found)

router.get("/:id", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const rows = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, id));

    const [bookingRequest] = rows;

    if (!bookingRequest) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (!canViewRequest(req.user!.role, req.user!.id, bookingRequest)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json(bookingRequest);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch request" });
  }
});

// GET /booking-requests
// Fetch all booking requests
// Optional query param: ?status=PENDING | APPROVED | REJECTED | CANCELLED
// Returns: array of booking requests

router.get("/", authMiddleware, async (req, res) => {
  const { status } = req.query;

  if (status !== undefined && !isBookingRequestStatus(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const role = req.user!.role;
    const userId = req.user!.id;

    let visibilityCondition;

    if (role === "ADMIN") {
      visibilityCondition = undefined;
    } else if (role === "STUDENT") {
      visibilityCondition = eq(bookingRequests.userId, userId);
    } else if (role === "FACULTY") {
      visibilityCondition = or(
        eq(bookingRequests.userId, userId),
        eq(bookingRequests.status, "PENDING_FACULTY")
      );
    } else {
      visibilityCondition = eq(bookingRequests.status, "PENDING_STAFF");
    }

    const statusCondition = status
      ? eq(bookingRequests.status, status)
      : undefined;

    const whereClause =
      visibilityCondition && statusCondition
        ? and(visibilityCondition, statusCondition)
        : visibilityCondition ?? statusCondition;

    const requests = whereClause
      ? await db.select().from(bookingRequests).where(whereClause)
      : await db.select().from(bookingRequests);

    return res.json(requests);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch requests" });
  }
});

router.post("/:id/reject", authMiddleware, requireRole(["FACULTY", "STAFF"]), async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const rows = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, id));

    const request = rows[0];

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    const role = req.user!.role;

    // Role-based validation
    if (
      (role === "FACULTY" && request.status !== "PENDING_FACULTY") ||
      (role === "STAFF" && request.status !== "PENDING_STAFF")
    ) {
      return res.status(400).json({
        error: "Invalid status for rejection",
      });
    }

    const updated = await db
      .update(bookingRequests)
      .set({ status: "REJECTED" })
      .where(eq(bookingRequests.id, id))
      .returning();

    return res.json(updated[0]);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Reject failed" });
  }
});

router.post("/:id/approve", authMiddleware, requireRole("STAFF"), async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const booking = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(bookingRequests)
        .where(eq(bookingRequests.id, id));

      const request = rows[0];

      if (!request) {
        throw { type: "NOT_FOUND" };
      }

      if (request.status !== "PENDING_STAFF") {
        throw { type: "INVALID_STATUS" };
      }

      const inserted = await createBooking(
        {
          roomId: request.roomId,
          startAt: request.startAt,
          endAt: request.endAt,
          requestId: request.id,
          metadata: {
            source: "BOOKING_REQUEST",
            sourceRef: `request:${request.id}`,
          },
        },
        tx,
      );

      if (!inserted.ok) {
        if (inserted.code === "ROOM_OVERLAP") {
          throw { type: "ROOM_OVERLAP" };
        }

        if (inserted.code === "ROOM_NOT_FOUND") {
          throw { type: "ROOM_NOT_FOUND" };
        }

        throw {
          type: "BOOKING_CREATE_FAILED",
          message: inserted.message,
        };
      }

      await tx
        .update(bookingRequests)
        .set({ status: "APPROVED" })
        .where(eq(bookingRequests.id, id));

      return inserted.booking;
    });

    return res.json(booking);

  } catch (error: any) {
    if (error?.type === "NOT_FOUND") {
      return res.status(404).json({ error: "Request not found" });
    }

    if (error?.type === "INVALID_STATUS") {
      return res.status(400).json({ error: "Request is not pending staff approval" });
    }

    if (error?.type === "ROOM_NOT_FOUND") {
      return res.status(404).json({ error: "Room not found" });
    }

    if (error?.type === "ROOM_OVERLAP") {
      return res.status(409).json({
        error: "Room already booked for this time range",
      });
    }

    if (error?.type === "BOOKING_CREATE_FAILED") {
      return res.status(500).json({
        error: error.message ?? "Approval failed",
      });
    }

    if (error?.cause?.code === "23P01") {
      return res.status(409).json({
        error: "Room already booked for this time range",
      });
    }

    console.error(error);
    return res.status(500).json({ error: "Approval failed" });
  }
});

router.post("/:id/forward", authMiddleware, requireRole("FACULTY"), async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    // Fetch request
    const rows = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, id));

    const request = rows[0];

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (request.status !== "PENDING_FACULTY") {
      return res.status(400).json({
        error: "Only PENDING_FACULTY requests can be forwarded",
      });
    }

    // Update status
    const updated = await db
      .update(bookingRequests)
      .set({ status: "PENDING_STAFF" })
      .where(eq(bookingRequests.id, id))
      .returning();

    return res.json(updated[0]);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Forward failed" });
  }
});

router.post("/:id/cancel",authMiddleware, async (req, res) => {
  const id = Number(req.params.id);

  // Validate id
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid request id" });
  }

  try {
    // Fetch request
    const existingRows = await db
      .select({
        id: bookingRequests.id,
        userId: bookingRequests.userId,
        status: bookingRequests.status,
      })
      .from(bookingRequests)
      .where(eq(bookingRequests.id, id))
      .limit(1);

    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (req.user!.role !== "ADMIN") {
      if (existing.userId !== req.user!.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    if (
      existing.status !== "PENDING_FACULTY" &&
      existing.status !== "PENDING_STAFF"
    ) {
      return res.status(400).json({
        error: "Only pending requests can be cancelled",
      });
    }

    // Update status to CANCELLED
    const updated = await db
      .update(bookingRequests)
      .set({ status: "CANCELLED" })
      .where(eq(bookingRequests.id, id))
      .returning();

    return res.json(updated[0]);
  } catch (error) {
    console.error("Cancel booking request error:", error);
    return res.status(500).json({ error: "Failed to cancel request" });
  }
});

router.post("/", authMiddleware, requireRole(["STUDENT", "FACULTY"]), async (req, res) => {
  try {
    const roomId = Number(req.body?.roomId);
    const startAt = req.body?.startAt;
    const endAt = req.body?.endAt;
    const purpose = req.body?.purpose?.trim();

    // Validation
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid roomId" });
    }

    if (!startAt || !endAt) {
      return res.status(400).json({ error: "startAt and endAt are required" });
    }

    if (!purpose) {
      return res.status(400).json({ error: "Purpose is required" });
    }

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid datetime format" });
    }

    if (start >= end) {
      return res.status(400).json({ error: "startAt must be before endAt" });
    }

    /**
     * SOFT CHECK 1: Prevent conflict with existing bookings
     */
    const overlap = await hasBookingOverlap(roomId, start, end);

    if (overlap) {
      return res.status(409).json({
        error: "Room is not available in the selected time range",
      });
    }

    /**
     * SOFT CHECK 2: Prevent duplicate pending requests
     *
     * NOTE (IMPORTANT - FUTURE USER SYSTEM INTEGRATION)
     *
     * Current behavior:
     * - Prevents ANY overlapping PENDING booking requests for the same room.
     * - This is global because there is NO user system yet.
     *
     * FUTURE:
     * - Must include userId in this condition.
     */
    const pendingOverlap = await db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.userId, req.user!.id),
          eq(bookingRequests.roomId, roomId),
          or(
            eq(bookingRequests.status, "PENDING_FACULTY"),
            eq(bookingRequests.status, "PENDING_STAFF")
          ),
          lt(bookingRequests.startAt, end),
          gt(bookingRequests.endAt, start)
        )
      )
      .limit(1);

    if (pendingOverlap.length > 0) {
      return res.status(409).json({
        error: "A pending request already exists for this time range",
      });
    }

    const result = await db
      .insert(bookingRequests)
      .values({
        userId: req.user!.id,
        roomId,
        startAt: start,
        endAt: end,
        purpose,
        status: req.user!.role === "STUDENT" ? "PENDING_FACULTY" : "PENDING_STAFF",
      })
      .returning();

    return res.status(201).json(result[0]);
  } catch (error: any) {
    if (error?.cause?.code === "23503") {
      return res.status(404).json({ error: "Room not found" });
    }

    console.error(error);
    return res.status(500).json({ error: "Insert failed" });
  }
});

export default router;