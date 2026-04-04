import { db } from "../db";
import { bookingCourseLink, bookingEditRequests, bookingRequests, bookings } from "../db/schema";
import { and, eq } from "drizzle-orm";
import {
  checkBookingConflict,
  createBooking,
  type BookingUpdateSuccess,
  updateBooking,
  validateRoomCompatibility,
} from "../modules/bookings/services/bookingService";

export type EditFlow = "DIRECT_EDIT" | "REQUEST_EDIT";

type UserContext = {
  id: number;
  role: "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "PENDING_ROLE";
};

type BookingContext = {
  id: number;
  roomId: number;
  startAt: Date;
  endAt: Date;
  requestStatus: "PENDING_FACULTY" | "PENDING_STAFF" | "APPROVED" | "REJECTED" | "CANCELLED" | null;
};

export type EditChangesInput = {
  newRoomId?: number;
  newStartAt?: string | Date;
  newEndAt?: string | Date;
};

export type EditServiceError = {
  status: number;
  code: string;
  message: string;
};

export type EditServiceResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: EditServiceError;
    };

function fail<T>(status: number, code: string, message: string): EditServiceResult<T> {
  return {
    ok: false,
    error: { status, code, message },
  };
}

function parseOptionalDate(value: string | Date | undefined, field: string): Date | null {
  if (value === undefined) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field}`);
  }

  return parsed;
}

export function decideEditFlow(user: UserContext, booking: BookingContext): EditFlow {
  if (user.role === "ADMIN" || user.role === "STAFF") {
    return "DIRECT_EDIT";
  }

  if (booking.requestStatus === "PENDING_FACULTY") {
    return "DIRECT_EDIT";
  }

  if (booking.requestStatus === "PENDING_STAFF" || booking.requestStatus === "APPROVED") {
    return "REQUEST_EDIT";
  }

  if (booking.requestStatus === "REJECTED" || booking.requestStatus === "CANCELLED") {
    throw new Error("BOOKING_NOT_EDITABLE");
  }

  return "REQUEST_EDIT";
}

export async function applyDirectEdit(
  booking: Pick<BookingContext, "id" | "roomId" | "startAt" | "endAt">,
  changes: EditChangesInput,
): Promise<EditServiceResult<BookingUpdateSuccess["booking"]>> {
  let parsedStartAt: Date | null = null;
  let parsedEndAt: Date | null = null;

  try {
    parsedStartAt = parseOptionalDate(changes.newStartAt, "newStartAt");
    parsedEndAt = parseOptionalDate(changes.newEndAt, "newEndAt");
  } catch {
    return fail(400, "INVALID_DATETIME", "Invalid datetime format");
  }

  const updated = {
    roomId: changes.newRoomId ?? booking.roomId,
    startAt: parsedStartAt ?? new Date(booking.startAt),
    endAt: parsedEndAt ?? new Date(booking.endAt),
  };

  if (updated.startAt >= updated.endAt) {
    return fail(400, "INVALID_INTERVAL", "startAt must be before endAt");
  }

  const courseLinkRows = await db
    .select({ courseId: bookingCourseLink.courseId })
    .from(bookingCourseLink)
    .where(eq(bookingCourseLink.bookingId, booking.id))
    .limit(1);

  const courseId = courseLinkRows[0]?.courseId ?? null;

  const compatibility = await validateRoomCompatibility({
    roomId: updated.roomId,
    courseId,
  });

  if (!compatibility.ok) {
    return fail(compatibility.status, compatibility.code, compatibility.message);
  }

  const hasConflict = await checkBookingConflict({
    roomId: updated.roomId,
    startAt: updated.startAt,
    endAt: updated.endAt,
    excludeBookingId: booking.id,
  });

  if (hasConflict) {
    return fail(409, "BOOKING_CONFLICT", "Room already booked for this time range");
  }

  const result = await updateBooking({
    bookingId: booking.id,
    roomId: updated.roomId,
    startAt: updated.startAt,
    endAt: updated.endAt,
  });

  if (!result.ok) {
    return fail(result.status, result.code, result.message);
  }

  return {
    ok: true,
    data: result.booking,
  };
}

export async function createEditRequest(
  booking: Pick<BookingContext, "id">,
  changes: EditChangesInput,
  user: Pick<UserContext, "id">,
) {
  let proposedStartAt: Date | null = null;
  let proposedEndAt: Date | null = null;

  try {
    proposedStartAt = parseOptionalDate(changes.newStartAt, "newStartAt");
    proposedEndAt = parseOptionalDate(changes.newEndAt, "newEndAt");
  } catch {
    return fail(400, "INVALID_DATETIME", "Invalid datetime format");
  }

  if (
    proposedStartAt !== null &&
    proposedEndAt !== null &&
    proposedStartAt >= proposedEndAt
  ) {
    return fail(400, "INVALID_INTERVAL", "startAt must be before endAt");
  }

  const nextRoomId = changes.newRoomId;

  if (
    nextRoomId === undefined &&
    proposedStartAt === null &&
    proposedEndAt === null
  ) {
    return fail(400, "MISSING_EDIT_FIELDS", "At least one edit field must be provided");
  }

  const inserted = await db
    .insert(bookingEditRequests)
    .values({
      bookingId: booking.id,
      proposedRoomId: nextRoomId ?? null,
      proposedStartAt,
      proposedEndAt,
      status: "PENDING",
      requestedBy: user.id,
    })
    .returning();

  const row = inserted[0];

  if (!row) {
    return fail(500, "EDIT_REQUEST_CREATE_FAILED", "Failed to create edit request");
  }

  return {
    ok: true as const,
    data: row,
  };
}

export async function getBookingForEdit(bookingId: number) {
  const rows = await db
    .select({
      id: bookings.id,
      roomId: bookings.roomId,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      requestId: bookings.requestId,
      requestStatus: bookingRequests.status,
      requestUserId: bookingRequests.userId,
      requestFacultyId: bookingRequests.facultyId,
    })
    .from(bookings)
    .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  return rows[0] ?? null;
}

export async function getBookingRequestContextByBookingId(bookingId: number) {
  const rows = await db
    .select({
      id: bookingRequests.id,
      status: bookingRequests.status,
      userId: bookingRequests.userId,
      facultyId: bookingRequests.facultyId,
    })
    .from(bookingRequests)
    .innerJoin(bookings, eq(bookings.requestId, bookingRequests.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  return rows[0] ?? null;
}

export async function approveEditRequest(
  requestId: number,
  reviewer: Pick<UserContext, "id">,
) {
  const requestRows = await db
    .select()
    .from(bookingEditRequests)
    .where(eq(bookingEditRequests.id, requestId))
    .limit(1);

  const request = requestRows[0];

  if (!request) {
    return fail(404, "EDIT_REQUEST_NOT_FOUND", "Edit request not found");
  }

  if (request.status !== "PENDING") {
    return fail(409, "EDIT_REQUEST_NOT_PENDING", "Edit request is already processed");
  }

  const bookingRows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, request.bookingId))
    .limit(1);

  const booking = bookingRows[0];

  if (!booking) {
    return fail(404, "BOOKING_NOT_FOUND", "Original booking not found");
  }

  const updated = {
    roomId: request.proposedRoomId ?? booking.roomId,
    startAt: request.proposedStartAt ?? booking.startAt,
    endAt: request.proposedEndAt ?? booking.endAt,
  };

  if (updated.startAt >= updated.endAt) {
    return fail(400, "INVALID_INTERVAL", "startAt must be before endAt");
  }

  const courseLinkRows = await db
    .select({ courseId: bookingCourseLink.courseId })
    .from(bookingCourseLink)
    .where(eq(bookingCourseLink.bookingId, booking.id));

  const primaryCourseId = courseLinkRows[0]?.courseId ?? null;

  const compatibility = await validateRoomCompatibility({
    roomId: updated.roomId,
    courseId: primaryCourseId,
  });

  if (!compatibility.ok) {
    return fail(compatibility.status, compatibility.code, compatibility.message);
  }

  const hasConflict = await checkBookingConflict({
    roomId: updated.roomId,
    startAt: updated.startAt,
    endAt: updated.endAt,
    excludeBookingId: booking.id,
  });

  if (hasConflict) {
    return fail(409, "BOOKING_CONFLICT", "Room already booked for this time range");
  }

  const approvedAt = new Date();

  const txResult = await db.transaction(async (tx) => {
    const deletedRows = await tx
      .delete(bookings)
      .where(eq(bookings.id, booking.id))
      .returning({ id: bookings.id });

    if (deletedRows.length === 0) {
      throw new Error("BOOKING_MISSING_DURING_APPROVAL");
    }

    const created = await createBooking(
      {
        roomId: updated.roomId,
        startAt: updated.startAt,
        endAt: updated.endAt,
        requestId: booking.requestId,
        metadata: {
          source: booking.source,
          approvedBy: reviewer.id,
          approvedAt,
          ...(booking.sourceRef ? { sourceRef: booking.sourceRef } : {}),
          ...(primaryCourseId !== null ? { courseId: primaryCourseId } : {}),
        },
      },
      tx,
    );

    if (!created.ok) {
      throw new Error(`BOOKING_RECREATE_FAILED:${created.code}:${created.message}`);
    }

    const updatedRequestRows = await tx
      .update(bookingEditRequests)
      .set({
        status: "APPROVED",
        reviewedBy: reviewer.id,
        updatedAt: approvedAt,
      })
      .where(
        and(
          eq(bookingEditRequests.id, requestId),
          eq(bookingEditRequests.status, "PENDING"),
        ),
      )
      .returning();

    if (updatedRequestRows.length === 0) {
      throw new Error("EDIT_REQUEST_ALREADY_PROCESSED");
    }

    return {
      booking: created.booking,
      editRequest: updatedRequestRows[0],
    };
  });

  return {
    ok: true as const,
    data: txResult,
  };
}

export async function rejectEditRequest(
  requestId: number,
  reviewer: Pick<UserContext, "id">,
) {
  const existingRows = await db
    .select({ id: bookingEditRequests.id, status: bookingEditRequests.status })
    .from(bookingEditRequests)
    .where(eq(bookingEditRequests.id, requestId))
    .limit(1);

  const existing = existingRows[0];

  if (!existing) {
    return fail(404, "EDIT_REQUEST_NOT_FOUND", "Edit request not found");
  }

  if (existing.status !== "PENDING") {
    return fail(409, "EDIT_REQUEST_NOT_PENDING", "Edit request is already processed");
  }

  const now = new Date();

  const updatedRows = await db
    .update(bookingEditRequests)
    .set({
      status: "REJECTED",
      reviewedBy: reviewer.id,
      updatedAt: now,
    })
    .where(
      and(
        eq(bookingEditRequests.id, requestId),
        eq(bookingEditRequests.status, "PENDING"),
      ),
    )
    .returning();

  if (updatedRows.length === 0) {
    return fail(409, "EDIT_REQUEST_NOT_PENDING", "Edit request is already processed");
  }

  return {
    ok: true as const,
    data: updatedRows[0],
  };
}
