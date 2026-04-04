import { Router } from "express";
import { db } from "../../../db";
import { eq, lt, gt, and, or, isNull, inArray, ne } from "drizzle-orm";
import { bookingRequests, users, rooms, bookings, buildings } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import { requireRole } from "../../../middleware/rbac";
import { requireBookingsUnfrozen } from "../../../middleware/bookingFreeze";
import { createBooking, hasBookingOverlap } from "../../bookings/services/bookingService";
import { getAssignedBuildingIdsForStaff } from "../../users/services/staffBuildingScope";
import {
  getActiveAdminIds,
  getActiveStaffIdsForBuilding,
  sendRoleAwareNotifications,
  type NotificationDraft,
} from "../../notifications/services/notificationService";
import logger from "../../../shared/utils/logger";

const router = Router();

const ALL_STATUSES = [
  "PENDING_FACULTY",
  "PENDING_STAFF",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

const ALL_EVENT_TYPES = [
  "QUIZ",
  "SEMINAR",
  "SPEAKER_SESSION",
  "MEETING",
  "CULTURAL_EVENT",
  "WORKSHOP",
  "CLASS",
  "OTHER",
] as const;

type BookingRequestStatus = (typeof ALL_STATUSES)[number];
type BookingEventType = (typeof ALL_EVENT_TYPES)[number];

type ApproveRouteErrorType =
  | "NOT_FOUND"
  | "INVALID_STATUS"
  | "ROOM_NOT_FOUND"
  | "COURSE_NOT_FOUND"
  | "ROOM_OVERLAP"
  | "BOOKING_CREATE_FAILED";

type ApproveRouteError = {
  type?: ApproveRouteErrorType;
  message?: string;
  cause?: {
    code?: string;
  };
};

type PgCauseError = {
  cause?: {
    code?: string;
  };
};

type ChangeCapableRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT";

async function getRequestWithBuilding(requestId: number) {
  const rows = await db
    .select({
      request: bookingRequests,
      buildingId: rooms.buildingId,
    })
    .from(bookingRequests)
    .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
    .where(eq(bookingRequests.id, requestId))
    .limit(1);

  return rows[0] ?? null;
}

function isBookingRequestStatus(value: unknown): value is BookingRequestStatus {
  return typeof value === "string" && (ALL_STATUSES as readonly string[]).includes(value);
}

function isBookingEventType(value: unknown): value is BookingEventType {
  return typeof value === "string" && (ALL_EVENT_TYPES as readonly string[]).includes(value);
}

function canViewRequest(
  role: "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "PENDING_ROLE",
  userId: number,
  request: {
    userId: number | null;
    facultyId: number | null;
    status: BookingRequestStatus;
  }
) {
  if (role === "ADMIN") {
    return true;
  }

  if (role === "STUDENT") {
    return request.userId === userId;
  }

  if (role === "FACULTY") {
    return (
      request.userId === userId ||
      request.facultyId === userId ||
      (request.facultyId === null && request.status === "PENDING_FACULTY")
    );
  }

  if (role === "STAFF") {
    return request.status === "PENDING_STAFF";
  }

  return false;
}

function formatDateTimeForNotification(value: Date): string {
  return value.toISOString().replace("T", " ").slice(0, 16);
}

function formatRequestWindow(startAt: Date, endAt: Date): string {
  return `${formatDateTimeForNotification(startAt)} to ${formatDateTimeForNotification(endAt)}`;
}

async function getRoomDisplayLabel(roomId: number): Promise<string> {
  const rows = await db
    .select({
      roomName: rooms.name,
      buildingName: buildings.name,
    })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(eq(rooms.id, roomId))
    .limit(1);

  const room = rows[0];

  if (!room) {
    return "the selected room";
  }

  return `${room.roomName} (${room.buildingName})`;
}

function uniqueRecipientIds(
  rawIds: Array<number | null | undefined>,
  excludedIds: number[] = [],
): number[] {
  const excluded = new Set(excludedIds);

  return Array.from(
    new Set(
      rawIds.filter(
        (value): value is number =>
          typeof value === "number" && Number.isInteger(value) && value > 0,
      ),
    ),
  ).filter((value) => !excluded.has(value));
}

async function dispatchNotificationsSafely(drafts: NotificationDraft[]) {
  if (drafts.length === 0) {
    return;
  }

  try {
    await sendRoleAwareNotifications(drafts);
  } catch (error) {
    logger.error("Failed to dispatch booking request notifications", error);
  }
}

async function getPendingStaffAndAdminRecipientIds(
  buildingId: number,
  excludedIds: number[] = [],
): Promise<number[]> {
  const [staffIds, adminIds] = await Promise.all([
    getActiveStaffIdsForBuilding(buildingId),
    getActiveAdminIds(),
  ]);

  return uniqueRecipientIds([...staffIds, ...adminIds], excludedIds);
}

function parseOptionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function canReferenceRequestForChange(
  role: ChangeCapableRole,
  userId: number,
  request: {
    userId: number | null;
    facultyId: number | null;
  },
): boolean {
  if (role === "ADMIN" || role === "STAFF") {
    return true;
  }

  if (role === "STUDENT") {
    return request.userId === userId;
  }

  return request.userId === userId || request.facultyId === userId;
}

function canApplyDirectChangeToRequest(
  role: ChangeCapableRole,
  userId: number,
  request: {
    userId: number | null;
    facultyId: number | null;
    status: BookingRequestStatus;
  },
): boolean {
  if (request.status !== "PENDING_FACULTY") {
    return false;
  }

  if (role === "STUDENT") {
    return request.userId === userId;
  }

  if (role === "FACULTY") {
    return request.userId === userId || request.facultyId === userId;
  }

  return false;
}

async function isActiveFacultyUser(userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.role, "FACULTY"),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function createBookingRequestWithNotifications(input: {
  actorId: number;
  roomId: number;
  buildingId: number;
  startAt: Date;
  endAt: Date;
  eventType: BookingEventType;
  purpose: string;
  participantCount: number | null;
  facultyId: number | null;
  status: "PENDING_FACULTY" | "PENDING_STAFF";
  bookingId?: number | null;
}) {
  const result = await db
    .insert(bookingRequests)
    .values({
      userId: input.actorId,
      facultyId: input.facultyId,
      roomId: input.roomId,
      startAt: input.startAt,
      endAt: input.endAt,
      eventType: input.eventType,
      purpose: input.purpose,
      participantCount: input.participantCount,
      status: input.status,
      bookingId: input.bookingId ?? null,
    })
    .returning();

  const created = result[0];

  if (!created) {
    throw new Error("Insert failed");
  }

  const windowText = formatRequestWindow(created.startAt, created.endAt);
  const roomLabel = await getRoomDisplayLabel(created.roomId);

  if (created.status === "PENDING_FACULTY") {
    const facultyRecipients = uniqueRecipientIds([created.facultyId], [input.actorId]);
    const requesterRecipients = uniqueRecipientIds([created.userId]);

    await dispatchNotificationsSafely(
      [
        ...facultyRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_CREATED",
          subject: "Booking request awaiting faculty review",
          message: `Booking request for ${roomLabel} (${windowText}) requires your faculty approval.`,
        })),
        ...requesterRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_CREATED",
          subject: "Booking request submitted",
          message: `Your booking request for ${roomLabel} (${windowText}) has been submitted for faculty approval.`,
        })),
      ],
    );
  }

  if (created.status === "PENDING_STAFF") {
    const staffAdminRecipients = await getPendingStaffAndAdminRecipientIds(
      input.buildingId,
      [input.actorId],
    );
    const requesterRecipients = uniqueRecipientIds([created.userId, created.facultyId]);

    await dispatchNotificationsSafely(
      [
        ...staffAdminRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_CREATED",
          subject: "Booking request awaiting staff approval",
          message: `Booking request for ${roomLabel} (${windowText}) is awaiting staff/admin review.`,
          skipEmail: true,
        })),
        ...requesterRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_CREATED",
          subject: "Booking request submitted",
          message: `Your booking request for ${roomLabel} (${windowText}) has been submitted for staff/admin approval.`,
        })),
      ],
    );
  }

  return created;
}

// GET /booking-requests/:id
// Fetch a single booking request by ID
// Returns: booking request object
// Errors: 400 (invalid id), 404 (not found)

router.get("/:id", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const row = await getRequestWithBuilding(id);

    const bookingRequest = row?.request;

    if (!bookingRequest) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (!canViewRequest(req.user!.role, req.user!.id, bookingRequest)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (req.user!.role === "STAFF") {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user!.id);

      if (
        assignedBuildingIds.length === 0 ||
        !assignedBuildingIds.includes(row!.buildingId)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    return res.json(bookingRequest);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch request" });
  }
});

// GET /booking-requests
// Fetch all booking requests
// Optional query param: ?status=PENDING | APPROVED | REJECTED | CANCELLED
// Returns: array of booking requests

router.get("/", authMiddleware, async (req, res) => {
  const { status } = req.query;

  if (status !== undefined && !isBookingRequestStatus(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const role = req.user!.role;
    const userId = req.user!.id;

    if (role === "STAFF") {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(userId);

      if (assignedBuildingIds.length === 0) {
        return res.json([]);
      }

      const conditions = [
        eq(bookingRequests.status, "PENDING_STAFF"),
        inArray(rooms.buildingId, assignedBuildingIds),
      ];

      if (status) {
        conditions.push(eq(bookingRequests.status, status));
      }

      const requests = await db
        .select({ request: bookingRequests })
        .from(bookingRequests)
        .innerJoin(rooms, eq(bookingRequests.roomId, rooms.id))
        .where(and(...conditions));

      return res.json(requests.map((row) => row.request));
    }

    let visibilityCondition;

    if (role === "ADMIN") {
      visibilityCondition = undefined;
    } else if (role === "STUDENT") {
      visibilityCondition = eq(bookingRequests.userId, userId);
    } else if (role === "FACULTY") {
      visibilityCondition = or(
        eq(bookingRequests.userId, userId),
        eq(bookingRequests.facultyId, userId),
        and(
          eq(bookingRequests.status, "PENDING_FACULTY"),
          isNull(bookingRequests.facultyId)
        )
      );
    } else {
      return res.status(403).json({ message: "Forbidden" });
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
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch requests" });
  }
});

router.post("/:id/reject", authMiddleware, requireRole(["FACULTY", "STAFF"]), requireBookingsUnfrozen(), async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const row = await getRequestWithBuilding(id);

    const request = row?.request;

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const role = req.user!.role;

    // Role-based validation
    if (
      (role === "FACULTY" && request.status !== "PENDING_FACULTY") ||
      (role === "STAFF" && request.status !== "PENDING_STAFF")
    ) {
      return res.status(400).json({
        message: "Invalid status for rejection",
      });
    }

    if (
      role === "FACULTY" &&
      request.facultyId !== null &&
      request.facultyId !== req.user!.id
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (role === "STAFF") {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user!.id);

      if (
        assignedBuildingIds.length === 0 ||
        !assignedBuildingIds.includes(row!.buildingId)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const updated = await db
      .update(bookingRequests)
      .set({ status: "REJECTED" })
      .where(eq(bookingRequests.id, id))
      .returning();

    const participantRecipients = uniqueRecipientIds(
      [request.userId, request.facultyId],
      [req.user!.id],
    );

    const reviewerRecipients =
      role === "STAFF"
        ? await getPendingStaffAndAdminRecipientIds(row!.buildingId, [req.user!.id])
        : [];

    const windowText = formatRequestWindow(request.startAt, request.endAt);
    const roomLabel = await getRoomDisplayLabel(request.roomId);

    await dispatchNotificationsSafely(
      [
        ...participantRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_REJECTED",
          subject: "Booking request rejected",
          message: `Booking request for ${roomLabel} (${windowText}) was rejected.`,
        })),
        ...reviewerRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_REJECTED",
          subject: "Booking request rejected",
          message: `Booking request for ${roomLabel} (${windowText}) has been rejected.`,
          skipEmail: true, // Staff/Admin get in-app notification only
        })),
      ],
    );

    return res.json(updated[0]);

  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Reject failed" });
  }
});

router.post("/:id/approve", authMiddleware, requireRole("STAFF"), requireBookingsUnfrozen(), async (req, res) => {
  const id = Number(req.params.id);
  const courseIdRaw = req.body?.courseId;
  const hasCourseId =
    courseIdRaw !== undefined &&
    courseIdRaw !== null &&
    String(courseIdRaw).trim() !== "";

  const courseId = hasCourseId ? Number(courseIdRaw) : undefined;

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  if (hasCourseId && (!Number.isInteger(courseId) || (courseId ?? 0) <= 0)) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
    const scopeRow = await getRequestWithBuilding(id);

    if (!scopeRow) {
      return res.status(404).json({ message: "Request not found" });
    }

    const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user!.id);

    if (
      assignedBuildingIds.length === 0 ||
      !assignedBuildingIds.includes(scopeRow.buildingId)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const approvalResult = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.id, id),
            eq(bookingRequests.status, "PENDING_STAFF"),
          ),
        )
        .limit(1);

      const request = rows[0];

      if (!request) {
        const existingRows = await tx
          .select({ id: bookingRequests.id })
          .from(bookingRequests)
          .where(eq(bookingRequests.id, id))
          .limit(1);

        throw { type: existingRows[0] ? "INVALID_STATUS" : "NOT_FOUND" };
      }

      const hasOverlap = await hasBookingOverlap(
        request.roomId,
        new Date(request.startAt),
        new Date(request.endAt),
        tx,
      );

      if (hasOverlap) {
        throw { type: "ROOM_OVERLAP" };
      }

      const inserted = await createBooking(
        {
          roomId: request.roomId,
          startAt: request.startAt,
          endAt: request.endAt,
          requestId: request.id,
          metadata: {
            source: "MANUAL_REQUEST",
            sourceRef: `request:${request.id}`,
            ...(courseId !== undefined ? { courseId } : {}),
            ...(req.user?.id !== undefined
              ? {
                  approvedBy: req.user.id,
                  approvedAt: new Date(),
                }
              : {}),
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

        if (inserted.code === "COURSE_NOT_FOUND") {
          throw { type: "COURSE_NOT_FOUND" };
        }

        throw {
          type: "BOOKING_CREATE_FAILED",
          message: inserted.message,
        };
      }

      const updatedRequestRows = await tx
        .update(bookingRequests)
        .set({ status: "APPROVED" })
        .where(
          and(
            eq(bookingRequests.id, id),
            eq(bookingRequests.status, "PENDING_STAFF"),
          ),
        )
        .returning({ id: bookingRequests.id });

      if (updatedRequestRows.length === 0) {
        throw { type: "INVALID_STATUS" };
      }

      return {
        booking: inserted.booking,
        request,
      };
    });

    const participantRecipients = uniqueRecipientIds(
      [approvalResult.request.userId, approvalResult.request.facultyId],
      [req.user!.id],
    );

    const reviewerRecipients = await getPendingStaffAndAdminRecipientIds(
      scopeRow.buildingId,
      [req.user!.id],
    );

    const approvalWindowText = formatRequestWindow(
      approvalResult.request.startAt,
      approvalResult.request.endAt,
    );
    const roomLabel = await getRoomDisplayLabel(approvalResult.request.roomId);

    await dispatchNotificationsSafely(
      [
        ...participantRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_APPROVED",
          subject: "Booking request approved",
          message: `Booking request for ${roomLabel} (${approvalWindowText}) has been approved.`,
        })),
        ...reviewerRecipients.map<NotificationDraft>((recipientId) => ({
          recipientId,
          type: "BOOKING_REQUEST_APPROVED",
          subject: "Booking request approved",
          message: `Booking request for ${roomLabel} (${approvalWindowText}) was approved and converted to a booking.`,
          skipEmail: true, // Staff/Admin get in-app notification only
        })),
      ],
    );

    return res.json(approvalResult.booking);

  } catch (error: unknown) {
    const routeError = error as ApproveRouteError;

    if (routeError.type === "NOT_FOUND") {
      return res.status(404).json({ message: "Request not found" });
    }

    if (routeError.type === "INVALID_STATUS") {
      return res.status(400).json({ message: "Request is not pending staff approval" });
    }

    if (routeError.type === "ROOM_NOT_FOUND") {
      return res.status(404).json({ message: "Room not found" });
    }

    if (routeError.type === "COURSE_NOT_FOUND") {
      return res.status(404).json({ message: "Course not found" });
    }

    if (routeError.type === "ROOM_OVERLAP") {
      return res.status(409).json({
        message: "Room already booked for this time range",
      });
    }

    if (routeError.type === "BOOKING_CREATE_FAILED") {
      return res.status(500).json({
        message: routeError.message ?? "Approval failed",
      });
    }

    if (routeError.cause?.code === "23P01") {
      return res.status(409).json({
        message: "Room already booked for this time range",
      });
    }

    logger.error(error);
    return res.status(500).json({ message: "Approval failed" });
  }
});

router.post("/:id/forward", authMiddleware, requireRole("FACULTY"), async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const row = await getRequestWithBuilding(id);
    const request = row?.request;

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== "PENDING_FACULTY") {
      return res.status(400).json({
        message: "Only PENDING_FACULTY requests can be forwarded",
      });
    }

    if (
      request.facultyId !== null &&
      request.facultyId !== req.user!.id
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Update status
    const updated = await db
      .update(bookingRequests)
      .set({ status: "PENDING_STAFF" })
      .where(eq(bookingRequests.id, id))
      .returning();

    const reviewRecipients = await getPendingStaffAndAdminRecipientIds(
      row!.buildingId,
      [req.user!.id],
    );

    const notifyRequesterRecipients = uniqueRecipientIds(
      [request.userId],
      [req.user!.id],
    );

    const windowText = formatRequestWindow(request.startAt, request.endAt);
    const roomLabel = await getRoomDisplayLabel(request.roomId);

    const drafts: NotificationDraft[] = [
      ...reviewRecipients.map<NotificationDraft>((recipientId) => ({
        recipientId,
        type: "BOOKING_REQUEST_FORWARDED",
        subject: "Booking request awaiting staff approval",
        message: `Booking request for ${roomLabel} (${windowText}) is awaiting staff/admin review.`,
        skipEmail: true, // Staff/Admin get in-app notification only
      })),
      ...notifyRequesterRecipients.map<NotificationDraft>((recipientId) => ({
        recipientId,
        type: "BOOKING_REQUEST_FORWARDED",
        subject: "Booking request moved to staff review",
        message: `Booking request for ${roomLabel} (${windowText}) has been forwarded for staff/admin approval.`,
      })),
    ];

    await dispatchNotificationsSafely(drafts);

    return res.json(updated[0]);

  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Forward failed" });
  }
});

router.post("/:id/cancel",authMiddleware, requireBookingsUnfrozen(), async (req, res) => {
  const id = Number(req.params.id);

  // Validate id
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  try {
    const existingRow = await getRequestWithBuilding(id);
    const existing = existingRow?.request;

    if (!existing) {
      return res.status(404).json({ message: "Request not found" });
    }

    const actorRole = req.user!.role;
    const actorId = req.user!.id;

    const canCancelAsOwner =
      actorRole === "ADMIN" ||
      existing.userId === actorId ||
      (actorRole === "FACULTY" && existing.facultyId === actorId);

    if (!canCancelAsOwner) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (
      existing.status !== "PENDING_FACULTY" &&
      existing.status !== "PENDING_STAFF" &&
      existing.status !== "APPROVED"
    ) {
      return res.status(400).json({
        message: "Only pending or approved requests can be cancelled",
      });
    }

    if (existing.status === "APPROVED") {
      const linkedBookingRows = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.requestId, existing.id))
        .limit(1);

      const linkedBookingId = linkedBookingRows[0]?.id ?? existing.bookingId;

      if (linkedBookingId !== null && linkedBookingId !== undefined) {
        await db.delete(bookings).where(eq(bookings.id, linkedBookingId));
      }
    }

    // Update status to CANCELLED
    const updated = await db
      .update(bookingRequests)
      .set({ status: "CANCELLED" })
      .where(eq(bookingRequests.id, id))
      .returning();

    // Determine email recipients based on who cancelled:
    // - Student cancels their own request: no email (student is excluded as actor)
    // - Admin cancels: student + faculty get email
    const skipEmailForParticipants = actorRole === "STUDENT";

    const participantRecipients = uniqueRecipientIds(
      [existing.userId, existing.facultyId],
      [req.user!.id],
    );

    const reviewerRecipients =
      existing.status === "PENDING_STAFF" || existing.status === "APPROVED"
        ? await getPendingStaffAndAdminRecipientIds(existingRow!.buildingId, [req.user!.id])
        : [];

    const windowText = formatRequestWindow(existing.startAt, existing.endAt);
    const roomLabel = await getRoomDisplayLabel(existing.roomId);

    const cancellationDrafts: NotificationDraft[] = [
      ...participantRecipients.map<NotificationDraft>((recipientId) => ({
        recipientId,
        type: "BOOKING_REQUEST_CANCELLED",
        subject: "Booking request cancelled",
        message: `Booking request for ${roomLabel} (${windowText}) was cancelled.`,
        skipEmail: skipEmailForParticipants,
      })),
      ...reviewerRecipients.map<NotificationDraft>((recipientId) => ({
        recipientId,
        type: "BOOKING_REQUEST_CANCELLED",
        subject: "Booking request cancelled",
        message: `Booking request for ${roomLabel} (${windowText}) was cancelled by the requester/admin.`,
        skipEmail: true, // Staff/Admin never get emails for cancellations
      })),
    ];

    await dispatchNotificationsSafely(cancellationDrafts);

    return res.json(updated[0]);
  } catch (error) {
    logger.error("Cancel booking request error:", error);
    return res.status(500).json({ message: "Failed to cancel request" });
  }
});

router.post(
  "/change",
  authMiddleware,
  requireRole(["STUDENT", "FACULTY", "STAFF", "ADMIN"]),
  async (req, res) => {
    try {
      const actorId = req.user!.id;
      const actorRole = req.user!.role as ChangeCapableRole;

      const sourceRequestId = parseOptionalPositiveInteger(req.body?.sourceRequestId);
      const sourceBookingId = parseOptionalPositiveInteger(req.body?.sourceBookingId);

      if (
        (sourceRequestId === null && sourceBookingId === null) ||
        (sourceRequestId !== null && sourceBookingId !== null)
      ) {
        return res.status(400).json({
          message: "Provide exactly one source: sourceRequestId or sourceBookingId",
        });
      }

      let sourceRequest: (typeof bookingRequests.$inferSelect) | null = null;
      let sourceBooking: (typeof bookings.$inferSelect) | null = null;
      let bookingLinkedRequest: (typeof bookingRequests.$inferSelect) | null = null;

      if (sourceRequestId !== null) {
        const sourceRow = await getRequestWithBuilding(sourceRequestId);

        if (!sourceRow) {
          return res.status(404).json({ message: "Source request not found" });
        }

        sourceRequest = sourceRow.request;

        if (!canReferenceRequestForChange(actorRole, actorId, sourceRequest)) {
          return res.status(403).json({ message: "Forbidden" });
        }

        if (actorRole === "STAFF") {
          const assignedBuildingIds = await getAssignedBuildingIdsForStaff(actorId);

          if (
            assignedBuildingIds.length === 0 ||
            !assignedBuildingIds.includes(sourceRow.buildingId)
          ) {
            return res.status(403).json({ message: "Forbidden" });
          }
        }
      }

      if (sourceBookingId !== null) {
        const bookingRows = await db
          .select({
            booking: bookings,
            linkedRequest: bookingRequests,
            buildingId: rooms.buildingId,
          })
          .from(bookings)
          .innerJoin(rooms, eq(bookings.roomId, rooms.id))
          .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
          .where(eq(bookings.id, sourceBookingId))
          .limit(1);

        const bookingRow = bookingRows[0];

        if (!bookingRow) {
          return res.status(404).json({ message: "Source booking not found" });
        }

        sourceBooking = bookingRow.booking;
        bookingLinkedRequest = bookingRow.linkedRequest;

        if (actorRole === "STUDENT") {
          if (!bookingLinkedRequest || bookingLinkedRequest.userId !== actorId) {
            return res.status(403).json({ message: "Forbidden" });
          }
        }

        if (actorRole === "FACULTY") {
          if (
            !bookingLinkedRequest ||
            (bookingLinkedRequest.userId !== actorId &&
              bookingLinkedRequest.facultyId !== actorId)
          ) {
            return res.status(403).json({ message: "Forbidden" });
          }
        }

        if (actorRole === "STAFF") {
          const assignedBuildingIds = await getAssignedBuildingIdsForStaff(actorId);

          if (
            assignedBuildingIds.length === 0 ||
            !assignedBuildingIds.includes(bookingRow.buildingId)
          ) {
            return res.status(403).json({ message: "Forbidden" });
          }
        }
      }

      const parsedRoomId = parseOptionalPositiveInteger(req.body?.roomId);
      const roomId = parsedRoomId ?? sourceRequest?.roomId ?? sourceBooking?.roomId ?? null;

      if (roomId === null) {
        return res.status(400).json({ message: "roomId is required" });
      }

      const startAtRaw = req.body?.startAt ?? sourceRequest?.startAt ?? sourceBooking?.startAt;
      const endAtRaw = req.body?.endAt ?? sourceRequest?.endAt ?? sourceBooking?.endAt;

      if (!startAtRaw || !endAtRaw) {
        return res.status(400).json({ message: "startAt and endAt are required" });
      }

      const start = new Date(startAtRaw);
      const end = new Date(endAtRaw);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid datetime format" });
      }

      if (start >= end) {
        return res.status(400).json({ message: "startAt must be before endAt" });
      }

      const roomRows = await db
        .select({
          id: rooms.id,
          buildingId: rooms.buildingId,
          accessible: rooms.accessible,
        })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1);

      const room = roomRows[0];

      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.accessible === false) {
        return res.status(400).json({
          message: "This room is currently not accessible and cannot accept bookings",
        });
      }

      const eventTypeRaw = req.body?.eventType;
      let eventTypeOverride: BookingEventType | null = null;

      if (eventTypeRaw !== undefined && eventTypeRaw !== null && String(eventTypeRaw).trim() !== "") {
        if (!isBookingEventType(eventTypeRaw)) {
          return res.status(400).json({ message: "Invalid eventType" });
        }

        eventTypeOverride = eventTypeRaw;
      }

      const eventType = eventTypeOverride ?? sourceRequest?.eventType ?? "OTHER";

      const providedPurpose =
        typeof req.body?.purpose === "string" ? req.body.purpose.trim() : "";
      const purpose = providedPurpose || sourceRequest?.purpose || "";

      if (!purpose) {
        return res.status(400).json({ message: "Purpose is required" });
      }

      let participantCount = sourceRequest?.participantCount ?? null;
      const participantCountRaw = req.body?.participantCount;

      if (participantCountRaw !== undefined && participantCountRaw !== null) {
        if (String(participantCountRaw).trim() === "") {
          participantCount = null;
        } else {
          const parsedParticipantCount = Number(participantCountRaw);

          if (!Number.isInteger(parsedParticipantCount) || parsedParticipantCount <= 0) {
            return res.status(400).json({
              message: "participantCount must be a positive integer",
            });
          }

          participantCount = parsedParticipantCount;
        }
      }

      const selectedFacultyId = parseOptionalPositiveInteger(req.body?.facultyId);
      let facultyId: number | null = null;

      if (actorRole === "STUDENT") {
        facultyId =
          selectedFacultyId ??
          sourceRequest?.facultyId ??
          bookingLinkedRequest?.facultyId ??
          null;

        if (facultyId === null) {
          return res.status(400).json({ message: "facultyId is required for student requests" });
        }
      } else if (actorRole === "FACULTY") {
        facultyId = actorId;
      } else {
        facultyId =
          selectedFacultyId ??
          sourceRequest?.facultyId ??
          bookingLinkedRequest?.facultyId ??
          null;
      }

      if (facultyId !== null) {
        const validFaculty = await isActiveFacultyUser(facultyId);

        if (!validFaculty) {
          return res.status(400).json({ message: "Selected faculty is invalid" });
        }
      }

      let linkedBookingId = sourceBooking?.id ?? null;

      if (linkedBookingId === null && sourceRequest) {
        linkedBookingId = sourceRequest.bookingId;

        if (linkedBookingId === null) {
          const linkedBookingRows = await db
            .select({ id: bookings.id })
            .from(bookings)
            .where(eq(bookings.requestId, sourceRequest.id))
            .limit(1);

          linkedBookingId = linkedBookingRows[0]?.id ?? null;
        }
      }

      if (linkedBookingId !== null && sourceBooking === null) {
        const linkedRows = await db
          .select()
          .from(bookings)
          .where(eq(bookings.id, linkedBookingId))
          .limit(1);

        sourceBooking = linkedRows[0] ?? null;
      }

      if (
        sourceBooking &&
        sourceBooking.roomId === roomId &&
        sourceBooking.startAt.getTime() === start.getTime() &&
        sourceBooking.endAt.getTime() === end.getTime()
      ) {
        return res.status(400).json({ message: "No changes detected" });
      }

      const hasOverlap = await hasBookingOverlap(
        roomId,
        start,
        end,
        db,
        linkedBookingId ?? undefined,
      );

      if (hasOverlap) {
        return res.status(409).json({
          message: "Room is not available in the selected time range",
        });
      }

      const pendingConditions = [
        eq(bookingRequests.userId, actorId),
        eq(bookingRequests.roomId, roomId),
        or(
          eq(bookingRequests.status, "PENDING_FACULTY"),
          eq(bookingRequests.status, "PENDING_STAFF"),
        ),
        lt(bookingRequests.startAt, end),
        gt(bookingRequests.endAt, start),
      ];

      if (sourceRequest) {
        pendingConditions.push(ne(bookingRequests.id, sourceRequest.id));
      }

      const pendingOverlap = await db
        .select({ id: bookingRequests.id })
        .from(bookingRequests)
        .where(and(...pendingConditions))
        .limit(1);

      if (pendingOverlap.length > 0) {
        return res.status(409).json({
          message: "A pending request already exists for this time range",
        });
      }

      if (
        sourceRequest &&
        canApplyDirectChangeToRequest(actorRole, actorId, sourceRequest)
      ) {
        const updatedRows = await db
          .update(bookingRequests)
          .set({
            roomId,
            startAt: start,
            endAt: end,
            eventType,
            purpose,
            participantCount,
            facultyId,
          })
          .where(
            and(
              eq(bookingRequests.id, sourceRequest.id),
              eq(bookingRequests.status, "PENDING_FACULTY"),
            ),
          )
          .returning();

        const updated = updatedRows[0];

        if (!updated) {
          return res.status(409).json({
            message: "Request is no longer editable",
          });
        }

        return res.json({
          mode: "UPDATED_EXISTING_REQUEST",
          request: updated,
        });
      }

      const targetStatus = actorRole === "STUDENT" ? "PENDING_FACULTY" : "PENDING_STAFF";

      const created = await createBookingRequestWithNotifications({
        actorId,
        roomId,
        buildingId: room.buildingId,
        startAt: start,
        endAt: end,
        eventType,
        purpose,
        participantCount,
        facultyId,
        status: targetStatus,
        bookingId: linkedBookingId,
      });

      return res.status(201).json({
        mode: "CREATED_CHANGE_REQUEST",
        request: created,
      });
    } catch (error: unknown) {
      const pgError = error as PgCauseError;

      if (pgError.cause?.code === "23503") {
        return res.status(404).json({ message: "Room not found" });
      }

      logger.error(error);
      return res.status(500).json({ message: "Failed to process booking change" });
    }
  },
);

router.post("/", authMiddleware, requireRole(["STUDENT", "FACULTY"]), async (req, res) => {
  try {
    const roomId = Number(req.body?.roomId);
    const startAt = req.body?.startAt;
    const endAt = req.body?.endAt;
    const eventTypeRaw = req.body?.eventType;
    const purpose = req.body?.purpose?.trim();
    const participantCountRaw = req.body?.participantCount;
    const selectedFacultyId = Number(req.body?.facultyId);

    // Validation
    if (isNaN(roomId)) {
      return res.status(400).json({ message: "Invalid roomId" });
    }

    if (!startAt || !endAt) {
      return res.status(400).json({ message: "startAt and endAt are required" });
    }

    if (!purpose) {
      return res.status(400).json({ message: "Purpose is required" });
    }

    let eventType: BookingEventType = "OTHER";

    if (eventTypeRaw !== undefined && eventTypeRaw !== null && eventTypeRaw !== "") {
      if (!isBookingEventType(eventTypeRaw)) {
        return res.status(400).json({ message: "Invalid eventType" });
      }

      eventType = eventTypeRaw;
    }

    let participantCount: number | null = null;

    if (
      participantCountRaw !== undefined &&
      participantCountRaw !== null &&
      String(participantCountRaw).trim() !== ""
    ) {
      const parsedParticipantCount = Number(participantCountRaw);

      if (!Number.isInteger(parsedParticipantCount) || parsedParticipantCount <= 0) {
        return res.status(400).json({ message: "participantCount must be a positive integer" });
      }

      participantCount = parsedParticipantCount;
    }

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid datetime format" });
    }

    if (start >= end) {
      return res.status(400).json({ message: "startAt must be before endAt" });
    }

    const roomRows = await db
      .select({
        id: rooms.id,
        buildingId: rooms.buildingId,
        accessible: rooms.accessible,
      })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    const room = roomRows[0];

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Block booking requests for inaccessible rooms
    if (room.accessible === false) {
      return res.status(400).json({
        message: "This room is currently not accessible and cannot accept bookings",
      });
    }

    let facultyId: number | null = null;

    if (req.user!.role === "STUDENT") {
      if (!Number.isInteger(selectedFacultyId) || selectedFacultyId <= 0) {
        return res.status(400).json({ message: "facultyId is required for student requests" });
      }

      const facultyRows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, selectedFacultyId),
            eq(users.role, "FACULTY"),
            eq(users.isActive, true)
          )
        )
        .limit(1);

      if (!facultyRows[0]) {
        return res.status(400).json({ message: "Selected faculty is invalid" });
      }

      facultyId = selectedFacultyId;
    } else {
      facultyId = req.user!.id;
    }

    /**
     * SOFT CHECK 1: Prevent conflict with existing bookings
     */
    const overlap = await hasBookingOverlap(roomId, start, end);

    if (overlap) {
      return res.status(409).json({
        message: "Room is not available in the selected time range",
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
        message: "A pending request already exists for this time range",
      });
    }

    const result = await db
      .insert(bookingRequests)
      .values({
        userId: req.user!.id,
        facultyId,
        roomId,
        startAt: start,
        endAt: end,
        eventType,
        purpose,
        participantCount,
        status: req.user!.role === "STUDENT" ? "PENDING_FACULTY" : "PENDING_STAFF",
      })
      .returning();

    const created = result[0];

    if (!created) {
      return res.status(500).json({ message: "Insert failed" });
    }

    const windowText = formatRequestWindow(created.startAt, created.endAt);
    const roomLabel = await getRoomDisplayLabel(created.roomId);

    if (created.status === "PENDING_FACULTY") {
      const facultyRecipients = uniqueRecipientIds([created.facultyId], [req.user!.id]);
      const requesterRecipients = uniqueRecipientIds([created.userId]);

      await dispatchNotificationsSafely(
        [
          ...facultyRecipients.map<NotificationDraft>((recipientId) => ({
            recipientId,
            type: "BOOKING_REQUEST_CREATED",
            subject: "Booking request awaiting faculty review",
            message: `Booking request for ${roomLabel} (${windowText}) requires your faculty approval.`,
          })),
          ...requesterRecipients.map<NotificationDraft>((recipientId) => ({
            recipientId,
            type: "BOOKING_REQUEST_CREATED",
            subject: "Booking request submitted",
            message: `Your booking request for ${roomLabel} (${windowText}) has been submitted for faculty approval.`,
          })),
        ],
      );
    } else if (created.status === "PENDING_STAFF") {
      const staffAdminRecipients = await getPendingStaffAndAdminRecipientIds(
        room.buildingId,
        [req.user!.id],
      );
      const requesterRecipients = uniqueRecipientIds([created.userId, created.facultyId]);

      await dispatchNotificationsSafely(
        [
          ...staffAdminRecipients.map<NotificationDraft>((recipientId) => ({
            recipientId,
            type: "BOOKING_REQUEST_CREATED",
            subject: "Booking request awaiting staff approval",
            message: `Booking request for ${roomLabel} (${windowText}) is awaiting staff/admin review.`,
            skipEmail: true, // Staff/Admin get in-app notification only
          })),
          ...requesterRecipients.map<NotificationDraft>((recipientId) => ({
            recipientId,
            type: "BOOKING_REQUEST_CREATED",
            subject: "Booking request submitted",
            message: `Your booking request for ${roomLabel} (${windowText}) has been submitted for staff/admin approval.`,
          })),
        ],
      );
    }

    return res.status(201).json(created);
  } catch (error: unknown) {
    const pgError = error as PgCauseError;

    if (pgError.cause?.code === "23503") {
      return res.status(404).json({ message: "Room not found" });
    }

    logger.error(error);
    return res.status(500).json({ message: "Insert failed" });
  }
});

export default router;