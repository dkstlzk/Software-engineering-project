import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "../db";
import { bookings, rooms } from "../db/schema";

type DbExecutor = typeof db | any;

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
};

export type CreateBookingInput = {
  roomId: number;
  startAt: string | Date;
  endAt: string | Date;
  requestId?: number | null;
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

  const sourceRaw = (raw as CreateBookingInput).metadata?.source;
  const source: BookingSource = sourceRaw ?? "MANUAL_REQUEST";

  if (
    source !== "MANUAL_REQUEST" &&
    source !== "TIMETABLE_ALLOCATION" &&
    source !== "SLOT_CHANGE" &&
    source !== "VENUE_CHANGE"
  ) {
    throw createBookingServiceError(400, "INVALID_SOURCE", "Invalid booking source");
  }

  const sourceRefRaw = (raw as CreateBookingInput).metadata?.sourceRef;
  const sourceRef =
    typeof sourceRefRaw === "string" && sourceRefRaw.trim()
      ? sourceRefRaw.trim()
      : null;

  const approvedByRaw = (raw as CreateBookingInput).metadata?.approvedBy;
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

  const approvedAtRaw = (raw as CreateBookingInput).metadata?.approvedAt;
  const approvedAtCandidate =
    approvedAtRaw === undefined || approvedAtRaw === null || approvedAtRaw === ""
      ? null
      : new Date(approvedAtRaw as string | Date);

  if (approvedAtCandidate !== null && Number.isNaN(approvedAtCandidate.getTime())) {
    throw createBookingServiceError(400, "INVALID_APPROVED_AT", "Invalid approvedAt");
  }

  const approvedAt = approvedBy !== null ? approvedAtCandidate ?? new Date() : null;

  return {
    roomId: parsedRoomId,
    startAt,
    endAt,
    requestId,
    approvedBy,
    approvedAt,
    source,
    sourceRef,
  };
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

export async function createBooking(
  raw: CreateBookingInput,
  executor: DbExecutor = db,
): Promise<BookingCreateResult> {
  try {
    const input = normalizeCreateInput(raw);

    await ensureRoomExists(input.roomId, executor);

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

    return {
      ok: true,
      booking: inserted[0],
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
): Promise<BulkBookingResult> {
  const results: BulkBookingItemResult[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }

    const result = await createBooking({
      roomId: item.roomId as number,
      startAt: item.startAt as string,
      endAt: item.endAt as string,
      ...(item.metadata ? { metadata: item.metadata } : {}),
    });

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
