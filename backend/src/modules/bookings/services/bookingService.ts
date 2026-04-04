import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "../../../db";
import { bookingCourseLink, bookings, courseEnrollments, courses, rooms } from "../../../db/schema";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

const FORBIDDEN_SLOT_KEYS = [
  "slot",
  "slotId",
  "slotLabel",
  "slotSystemId",
  "blockId",
  "startBandId",
  "dayId",
] as const;

export type BookingSource =
  | "MANUAL_REQUEST"
  | "TIMETABLE_ALLOCATION"
  | "SLOT_CHANGE"
  | "VENUE_CHANGE";

export type BookingSourceMetadata = {
  source?: BookingSource;
  sourceRef?: string;
  approvedBy?: number;
  approvedAt?: string | Date;
  auxiliaryData?: Record<string, unknown>;
  courseId?: number;
};

export type CreateBookingInput = {
  roomId: number;
  startAt: string | Date;
  endAt: string | Date;
  requestId?: number | null;
  courseId?: number | null;
  source?: BookingSource;
  sourceRef?: string;
  approvedBy?: number;
  approvedAt?: string | Date;
  auxiliaryData?: Record<string, unknown>;
  metadata?: BookingSourceMetadata;
};

export type BookingCreateFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type BookingCreateSuccess = {
  ok: true;
  booking: {
    id: number;
    roomId: number;
    startAt: Date;
    endAt: Date;
    requestId: number | null;
    approvedBy: number | null;
    approvedAt: Date | null;
    source: BookingSource;
    sourceRef: string | null;
  };
};

export type BookingCreateResult = BookingCreateSuccess | BookingCreateFailure;

export type UpdateBookingInput = {
  bookingId: number;
  roomId?: number;
  startAt?: string | Date;
  endAt?: string | Date;
};

export type BookingUpdateSuccess = {
  ok: true;
  booking: {
    id: number;
    roomId: number;
    startAt: Date;
    endAt: Date;
    requestId: number | null;
    approvedBy: number | null;
    approvedAt: Date | null;
    source: BookingSource;
    sourceRef: string | null;
  };
};

export type BookingUpdateResult = BookingUpdateSuccess | BookingCreateFailure;

export type BulkBookingItemInput = {
  roomId: unknown;
  startAt: unknown;
  endAt: unknown;
  requestId?: unknown;
  courseId?: unknown;
  source?: unknown;
  sourceRef?: unknown;
  approvedBy?: unknown;
  approvedAt?: unknown;
  auxiliaryData?: unknown;
  clientRowId?: string;
  metadata?: BookingSourceMetadata;
  [key: string]: unknown;
};

export type BulkBookingItemResult = {
  index: number;
  clientRowId?: string;
  result: BookingCreateResult;
};

export type BulkBookingResult = {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkBookingItemResult[];
};

type BookingServiceError = Error & {
  status: number;
  code: string;
};

function createBookingServiceError(
  status: number,
  code: string,
  message: string,
): BookingServiceError {
  const error = new Error(message) as BookingServiceError;
  error.status = status;
  error.code = code;
  return error;
}

function getObjectKeys(input: unknown): string[] {
  if (!input || typeof input !== "object") {
    return [];
  }

  return Object.keys(input as Record<string, unknown>);
}

export function assertNoSlotFieldsInPayload(input: unknown) {
  const keys = getObjectKeys(input);
  const slotKeys = keys.filter((key) =>
    FORBIDDEN_SLOT_KEYS.some((forbiddenKey) =>
      forbiddenKey.toLowerCase() === key.toLowerCase(),
    ),
  );

  if (slotKeys.length > 0) {
    throw createBookingServiceError(
      400,
      "FORBIDDEN_SLOT_FIELDS",
      `Primary booking payload must not include slot fields: ${slotKeys.join(", ")}`,
    );
  }
}

function normalizeCreateInput(raw: CreateBookingInput | BulkBookingItemInput) {
  assertNoSlotFieldsInPayload(raw);

  const typedRaw = raw as CreateBookingInput;

  const parsedRoomId = Number(raw.roomId);
  if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
    throw createBookingServiceError(400, "INVALID_ROOM_ID", "Invalid roomId");
  }

  const startRaw = raw.startAt;
  const endRaw = raw.endAt;

  if (startRaw === undefined || endRaw === undefined) {
    throw createBookingServiceError(
      400,
      "MISSING_REQUIRED_FIELDS",
      "Missing required fields",
    );
  }

  const startAt = new Date(startRaw as string | Date);
  const endAt = new Date(endRaw as string | Date);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw createBookingServiceError(
      400,
      "INVALID_DATETIME",
      "Invalid datetime format",
    );
  }

  if (startAt >= endAt) {
    throw createBookingServiceError(
      400,
      "INVALID_INTERVAL",
      "startAt must be before endAt",
    );
  }

  const requestIdRaw = (raw as CreateBookingInput).requestId;
  const requestId =
    requestIdRaw === undefined || requestIdRaw === null
      ? null
      : Number(requestIdRaw);

  if (requestId !== null && (!Number.isInteger(requestId) || requestId <= 0)) {
    throw createBookingServiceError(400, "INVALID_REQUEST_ID", "Invalid requestId");
  }

  const sourceRaw = typedRaw.metadata?.source ?? typedRaw.source;
  const source: BookingSource = sourceRaw ?? "MANUAL_REQUEST";

  if (
    source !== "MANUAL_REQUEST" &&
    source !== "TIMETABLE_ALLOCATION" &&
    source !== "SLOT_CHANGE" &&
    source !== "VENUE_CHANGE"
  ) {
    throw createBookingServiceError(400, "INVALID_SOURCE", "Invalid booking source");
  }

  const sourceRefRaw = typedRaw.metadata?.sourceRef ?? typedRaw.sourceRef;
  const sourceRef =
    typeof sourceRefRaw === "string" && sourceRefRaw.trim()
      ? sourceRefRaw.trim()
      : null;

  const approvedByRaw = typedRaw.metadata?.approvedBy ?? typedRaw.approvedBy;
  const approvedBy =
    approvedByRaw === undefined || approvedByRaw === null
      ? null
      : Number(approvedByRaw);

  if (
    approvedBy !== null &&
    (!Number.isInteger(approvedBy) || approvedBy <= 0)
  ) {
    throw createBookingServiceError(400, "INVALID_APPROVER", "Invalid approvedBy");
  }

  const approvedAtRaw = typedRaw.metadata?.approvedAt ?? typedRaw.approvedAt;
  const approvedAtCandidate =
    approvedAtRaw === undefined || approvedAtRaw === null || approvedAtRaw === ""
      ? null
      : new Date(approvedAtRaw as string | Date);

  if (approvedAtCandidate !== null && Number.isNaN(approvedAtCandidate.getTime())) {
    throw createBookingServiceError(400, "INVALID_APPROVED_AT", "Invalid approvedAt");
  }

  const approvedAt = approvedBy !== null ? approvedAtCandidate ?? new Date() : null;

  const courseIdRaw = typedRaw.metadata?.courseId ?? typedRaw.courseId;

  const courseId =
    courseIdRaw === undefined ||
    courseIdRaw === null
      ? null
      : Number(courseIdRaw);

  if (courseId !== null && (!Number.isInteger(courseId) || courseId <= 0)) {
    throw createBookingServiceError(400, "INVALID_COURSE_ID", "Invalid courseId");
  }

  const metadataAuxiliaryData =
    typedRaw.metadata?.auxiliaryData && typeof typedRaw.metadata.auxiliaryData === "object"
      ? typedRaw.metadata.auxiliaryData
      : undefined;

  const rootAuxiliaryData =
    typedRaw.auxiliaryData && typeof typedRaw.auxiliaryData === "object"
      ? typedRaw.auxiliaryData
      : undefined;

  const auxiliaryData = metadataAuxiliaryData ?? rootAuxiliaryData;

  return {
    roomId: parsedRoomId,
    startAt,
    endAt,
    requestId,
    approvedBy,
    approvedAt,
    source,
    sourceRef,
    courseId,
    auxiliaryData,
  };
}

function readBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return null;
}

function hasRequiredFlag(
  auxiliaryData: Record<string, unknown> | undefined,
  keys: string[],
): boolean {
  if (!auxiliaryData) {
    return false;
  }

  for (const key of keys) {
    const parsed = readBooleanLike(auxiliaryData[key]);
    if (parsed === true) {
      return true;
    }
  }

  return false;
}

async function ensureRoomExists(roomId: number, executor: DbExecutor) {
  const row = await executor
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (row.length === 0) {
    throw createBookingServiceError(404, "ROOM_NOT_FOUND", "Room not found");
  }
}

async function ensureRoomCanHostBooking(
  roomId: number,
  courseId: number | null,
  auxiliaryData: Record<string, unknown> | undefined,
  executor: DbExecutor,
) {
  const roomRows = await executor
    .select({
      id: rooms.id,
      capacity: rooms.capacity,
      hasProjector: rooms.hasProjector,
      hasMic: rooms.hasMic,
      accessible: rooms.accessible,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  const room = roomRows[0];

  if (!room) {
    throw createBookingServiceError(404, "ROOM_NOT_FOUND", "Room not found");
  }

  if (courseId !== null && room.capacity !== null) {
    const enrollmentRows = await executor
      .select({ studentId: courseEnrollments.studentId })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.courseId, courseId));

    if (enrollmentRows.length > room.capacity) {
      throw createBookingServiceError(
        400,
        "ROOM_CAPACITY_INSUFFICIENT",
        `Room capacity (${room.capacity}) is insufficient for enrolled students (${enrollmentRows.length})`,
      );
    }
  }

  const requiredProjector = hasRequiredFlag(auxiliaryData, [
    "requiresProjector",
    "projectorRequired",
    "needsProjector",
  ]);
  const requiredMic = hasRequiredFlag(auxiliaryData, [
    "requiresMic",
    "micRequired",
    "needsMic",
  ]);
  const requiredAccessible = hasRequiredFlag(auxiliaryData, [
    "requiresAccessible",
    "accessibilityRequired",
    "needsAccessible",
  ]);

  const missingFeatures: string[] = [];

  if (requiredProjector && !room.hasProjector) {
    missingFeatures.push("projector");
  }

  if (requiredMic && !room.hasMic) {
    missingFeatures.push("microphone");
  }

  if (requiredAccessible && !room.accessible) {
    missingFeatures.push("accessibility");
  }

  if (missingFeatures.length > 0) {
    throw createBookingServiceError(
      400,
      "ROOM_EQUIPMENT_MISMATCH",
      `Room is missing required features: ${missingFeatures.join(", ")}`,
    );
  }
}

export async function validateRoomCompatibility(
  input: {
    roomId: number;
    courseId?: number | null;
    auxiliaryData?: Record<string, unknown>;
  },
  executor: DbExecutor = db,
) {
  try {
    await ensureRoomCanHostBooking(
      input.roomId,
      input.courseId ?? null,
      input.auxiliaryData,
      executor,
    );

    return {
      ok: true as const,
    };
  } catch (error: unknown) {
    const typedError = error as Partial<BookingServiceError>;

    if (typeof typedError.status === "number" && typeof typedError.code === "string") {
      return {
        ok: false as const,
        status: typedError.status,
        code: typedError.code,
        message: typedError.message ?? "Room validation failed",
      };
    }

    return {
      ok: false as const,
      status: 500,
      code: "ROOM_VALIDATION_FAILED",
      message: "Room validation failed",
    };
  }
}

async function ensureCourseExists(courseId: number, executor: DbExecutor) {
  const row = await executor
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (row.length === 0) {
    throw createBookingServiceError(404, "COURSE_NOT_FOUND", "Course not found");
  }
}

export async function hasBookingOverlap(
  roomId: number,
  startAt: Date,
  endAt: Date,
  executor: DbExecutor = db,
  excludeBookingId?: number,
) {
  const overlapConditions = [
    eq(bookings.roomId, roomId),
    lt(bookings.startAt, endAt),
    gt(bookings.endAt, startAt),
  ];

  if (typeof excludeBookingId === "number" && excludeBookingId > 0) {
    overlapConditions.push(ne(bookings.id, excludeBookingId));
  }

  const overlapping = await executor
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(...overlapConditions))
    .limit(1);

  return overlapping.length > 0;
}

export async function checkBookingConflict(input: {
  roomId: number;
  startAt: Date;
  endAt: Date;
  excludeBookingId?: number;
}) {
  return hasBookingOverlap(
    input.roomId,
    input.startAt,
    input.endAt,
    db,
    input.excludeBookingId,
  );
}

export async function createBooking(
  raw: CreateBookingInput,
  executor: DbExecutor = db,
): Promise<BookingCreateResult> {
  try {
    const input = normalizeCreateInput(raw);

    if (input.courseId !== null) {
      await ensureCourseExists(input.courseId, executor);
    }

    await ensureRoomCanHostBooking(
      input.roomId,
      input.courseId,
      input.auxiliaryData,
      executor,
    );

    const overlap = await hasBookingOverlap(
      input.roomId,
      input.startAt,
      input.endAt,
      executor,
    );

    if (overlap) {
      return {
        ok: false,
        status: 409,
        code: "ROOM_OVERLAP",
        message: "Room already booked for this time range",
      };
    }

    const inserted = await executor
      .insert(bookings)
      .values({
        roomId: input.roomId,
        startAt: input.startAt,
        endAt: input.endAt,
        requestId: input.requestId,
        approvedBy: input.approvedBy,
        approvedAt: input.approvedAt,
        source: input.source,
        sourceRef: input.sourceRef,
      })
      .returning();

    if (!inserted[0]) {
      return {
        ok: false,
        status: 500,
        code: "BOOKING_INSERT_FAILED",
        message: "Insert failed",
      };
    }

    if (input.courseId !== null) {
      await executor
        .insert(bookingCourseLink)
        .values({
          bookingId: inserted[0].id,
          courseId: input.courseId,
        })
        .onConflictDoNothing({
          target: [bookingCourseLink.bookingId, bookingCourseLink.courseId],
        });
    }

    return {
      ok: true,
      booking: inserted[0],
    };
  } catch (error: unknown) {
    const typedError = error as Partial<BookingServiceError> & {
      cause?: { code?: string; constraint?: string };
    };

    if (typeof typedError.status === "number" && typeof typedError.code === "string") {
      return {
        ok: false,
        status: typedError.status,
        code: typedError.code,
        message: typedError.message ?? "Booking validation failed",
      };
    }

    if (typedError?.cause?.code === "23503") {
      if (
        typeof typedError?.cause?.constraint === "string" &&
        typedError.cause.constraint.includes("booking_course_link_course_id")
      ) {
        return {
          ok: false,
          status: 404,
          code: "COURSE_NOT_FOUND",
          message: "Course not found",
        };
      }

      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room not found",
      };
    }

    if (typedError?.cause?.code === "23P01") {
      return {
        ok: false,
        status: 409,
        code: "ROOM_OVERLAP",
        message: "Room already booked for this time range",
      };
    }

    return {
      ok: false,
      status: 500,
      code: "BOOKING_CREATE_FAILED",
      message: "Insert failed",
    };
  }
}

export async function updateBooking(
  raw: UpdateBookingInput,
  executor: DbExecutor = db,
): Promise<BookingUpdateResult> {
  try {
    const bookingId = Number(raw.bookingId);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_BOOKING_ID",
        message: "Invalid booking id",
      };
    }

    const existingRows = await executor
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    const existing = existingRows[0];

    if (!existing) {
      return {
        ok: false,
        status: 404,
        code: "BOOKING_NOT_FOUND",
        message: "Booking not found",
      };
    }

    const roomId = raw.roomId === undefined ? existing.roomId : Number(raw.roomId);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_ROOM_ID",
        message: "Invalid roomId",
      };
    }

    const startAt =
      raw.startAt === undefined ? new Date(existing.startAt) : new Date(raw.startAt);
    const endAt = raw.endAt === undefined ? new Date(existing.endAt) : new Date(raw.endAt);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_DATETIME",
        message: "Invalid datetime format",
      };
    }

    if (startAt >= endAt) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_INTERVAL",
        message: "startAt must be before endAt",
      };
    }

    await ensureRoomExists(roomId, executor);

    const overlap = await hasBookingOverlap(roomId, startAt, endAt, executor, bookingId);

    if (overlap) {
      return {
        ok: false,
        status: 409,
        code: "ROOM_OVERLAP",
        message: "Room already booked for this time range",
      };
    }

    const updatedRows = await executor
      .update(bookings)
      .set({
        roomId,
        startAt,
        endAt,
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    const updated = updatedRows[0];

    if (!updated) {
      return {
        ok: false,
        status: 500,
        code: "BOOKING_UPDATE_FAILED",
        message: "Update failed",
      };
    }

    return {
      ok: true,
      booking: updated,
    };
  } catch (error: unknown) {
    const typedError = error as Partial<BookingServiceError> & {
      cause?: { code?: string };
    };

    if (typeof typedError.status === "number" && typeof typedError.code === "string") {
      return {
        ok: false,
        status: typedError.status,
        code: typedError.code,
        message: typedError.message ?? "Booking validation failed",
      };
    }

    if (typedError?.cause?.code === "23503") {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room not found",
      };
    }

    if (typedError?.cause?.code === "23P01") {
      return {
        ok: false,
        status: 409,
        code: "ROOM_OVERLAP",
        message: "Room already booked for this time range",
      };
    }

    return {
      ok: false,
      status: 500,
      code: "BOOKING_UPDATE_FAILED",
      message: "Update failed",
    };
  }
}

export async function createBookingsBulk(
  items: BulkBookingItemInput[],
  executor: DbExecutor = db,
): Promise<BulkBookingResult> {
  const results: BulkBookingItemResult[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }

    const metadata: BookingSourceMetadata = {
      ...(item.metadata ?? {}),
      ...(item.source !== undefined ? { source: item.source as BookingSource } : {}),
      ...(item.sourceRef !== undefined ? { sourceRef: item.sourceRef as string } : {}),
      ...(item.approvedBy !== undefined ? { approvedBy: item.approvedBy as number } : {}),
      ...(item.approvedAt !== undefined
        ? { approvedAt: item.approvedAt as string | Date }
        : {}),
      ...(item.auxiliaryData !== undefined
        ? { auxiliaryData: item.auxiliaryData as Record<string, unknown> }
        : {}),
      ...(item.courseId !== undefined ? { courseId: item.courseId as number } : {}),
    };

    const result = await createBooking(
      {
        roomId: item.roomId as number,
        startAt: item.startAt as string,
        endAt: item.endAt as string,
        ...(item.requestId !== undefined
          ? { requestId: item.requestId as number | null }
          : {}),
        ...(item.courseId !== undefined ? { courseId: item.courseId as number } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
      executor,
    );

    const rowResult: BulkBookingItemResult = {
      index,
      result,
    };

    if (typeof item.clientRowId === "string" && item.clientRowId.trim()) {
      rowResult.clientRowId = item.clientRowId;
    }

    results.push(rowResult);
  }

  const succeeded = results.filter((entry) => entry.result.ok).length;

  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  };
}
