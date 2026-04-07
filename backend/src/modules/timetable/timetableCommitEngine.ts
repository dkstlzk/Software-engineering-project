import { createHash } from "crypto";
import { and, asc, eq, gt, inArray, like, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  bookings,
  commitSessions,
  timetableImportBatches,
  timetableImportOccurrences,
  timetableImportRowResolutions,
  timetableImportRows,
} from "../../db/schema";
import { saveTimetableImportDecisions } from "./importService";
import { slotBlocks, slotDays, slotSystems, slotTimeBands } from "./schema";
import {
  computeTimetableDiff,
  normalizeSnapshotState,
  type TimetableDayOfWeek,
  type TimetableDiffOperationType,
  type TimetableSnapshotState,
  type TimetableSlotDescriptor,
} from "./timetableDiffEngine";
import {
  freezeBookings,
  getBookingFreezeState,
  unfreezeBookings,
} from "./services/bookingFreezeService";
import { lockSlotSystem } from "./service";
import logger from "../../shared/utils/logger";

export type TimetableCommitStage = "external" | "internal" | "runtime";
export type TimetableCommitConflictType = "external" | "internal" | "runtime";

export type TimetableCommitResolutionAction =
  | "SKIP"
  | "CHANGE_ROOM"
  | "CHANGE_SLOT_EXISTING"
  | "CREATE_SLOT_AND_USE"
  | "FORCE_OVERWRITE"
  | "ALTERNATIVE_ROOM";

export type TimetableCommitResolutionTarget = "COMMITTING" | "CLASHING";

export type TimetableCommitConflict = {
  id: string;
  stage: TimetableCommitStage;
  type: TimetableCommitConflictType;
  operationId: string;
  rowId: number;
  rowIndex: number;
  roomId: number;
  startAt: string;
  endAt: string;
  reason: string;
  metadata: Record<string, unknown>;
};

export type TimetableCommitResolution = {
  conflictId: string;
  action: TimetableCommitResolutionAction;
  target?: TimetableCommitResolutionTarget;
  roomId?: number;
  startAt?: string;
  endAt?: string;
};

export type CommitStageReport = {
  commitSessionId: number;
  stage: TimetableCommitStage;
  conflictCount: number;
  conflicts: TimetableCommitConflict[];
};

export type CommitSessionStatus =
  | "STARTED"
  | "EXTERNAL_DONE"
  | "INTERNAL_DONE"
  | "FROZEN"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type CommitSessionSummary = {
  commitSessionId: number;
  batchId: number;
  slotSystemId: number;
  status: CommitSessionStatus;
  payloadSnapshot: string;
  isFrozen: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EditCommitDiffSummary = {
  total: number;
  added: number;
  removed: number;
  changedSlot: number;
  changedVenue: number;
};

export type EditCommitDiffOperationPreview = {
  type: TimetableDiffOperationType;
  label: string;
  oldDescriptorCount: number;
  newDescriptorCount: number;
  oldRoomId: number | null;
  newRoomId: number | null;
  operationGroupId: string;
  affectedBookings: number;
};

export type EditCommitSessionStartResponse = {
  session?: CommitSessionSummary;
  noChanges?: boolean;
  message?: string;
  diff: {
    summary: EditCommitDiffSummary;
    changedLabels: string[];
    operations: EditCommitDiffOperationPreview[];
    affectedRows: number;
    unchangedRows: number;
    expectedVersion: number;
    currentVersion: number;
    bookingImpact: {
      totalAffectedBookings: number;
      byOperation: Array<{
        operationId: string;
        affectedBookings: number;
      }>;
    };
  };
};

type ServiceError = Error & { status: number };

type SessionOperationKind = "UPSERT" | "DELETE_ONLY";

type SessionOperation = {
  operationId: string;
  kind: SessionOperationKind;
  operationType?: TimetableDiffOperationType;
  rowId: number;
  rowIndex: number;
  courseCode: string;
  slot: string;
  classroom: string;
  roomId: number;
  startAt: string;
  endAt: string;
  sourceRef: string;
  status: "ACTIVE" | "SKIPPED";
  forceOverwriteBookingIds: number[];
  cleanupBookingIds: number[];
};

type SlotDescriptor = {
  label: string;
  dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string;
  endTime: string;
  blockId: number;
};

type EditSessionMetadata = {
  mode: "EDIT";
  pruneBookings: boolean;
  expectedVersion: number;
  changedLabels: string[];
  diffSummary: EditCommitDiffSummary;
  affectedRows: number;
  unchangedRows: number;
  newSnapshot: TimetableSnapshotState;
};

type CommittedRowForEdit = {
  batchId: number;
  termStartDate: Date;
  termEndDate: Date;
  rowId: number;
  rowIndex: number;
  classification:
    | "VALID_AND_AUTOMATABLE"
    | "UNRESOLVED_SLOT"
    | "UNRESOLVED_ROOM"
    | "AMBIGUOUS_CLASSROOM"
    | "DUPLICATE_ROW"
    | "CONFLICTING_MAPPING"
    | "MISSING_REQUIRED_FIELD"
    | "OTHER_PROCESSING_ERROR";
  rawCourseCode: string | null;
  rawSlot: string | null;
  rawClassroom: string | null;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  resolutionAction: "AUTO" | "RESOLVE" | "SKIP" | null;
  resolutionSlotLabel: string | null;
  resolutionRoomId: number | null;
};

function createServiceError(status: number, message: string): ServiceError {
  const error = new Error(message) as ServiceError;
  error.status = status;
  return error;
}

function normalizeSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return normalizeSpace(value).toLowerCase();
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toJsDay(value: SlotDescriptor["dayOfWeek"]): number {
  switch (value) {
    case "MON":
      return 1;
    case "TUE":
      return 2;
    case "WED":
      return 3;
    case "THU":
      return 4;
    case "FRI":
      return 5;
    case "SAT":
      return 6;
    default:
      return 0;
  }
}

function parseClock(timeValue: string): { hours: number; minutes: number; seconds: number } {
  const [hoursRaw, minutesRaw, secondsRaw] = timeValue.split(":");

  return {
    hours: Number(hoursRaw ?? "0"),
    minutes: Number(minutesRaw ?? "0"),
    seconds: Number(secondsRaw ?? "0"),
  };
}

function combineDateAndTime(date: Date, timeValue: string): Date {
  const parts = parseClock(timeValue);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    parts.hours,
    parts.minutes,
    parts.seconds,
    0,
  );
}

function buildOccurrenceIntervals(input: {
  termStartDate: Date;
  termEndDate: Date;
  dayOfWeek: SlotDescriptor["dayOfWeek"];
  startTime: string;
  endTime: string;
}): Array<{ startAt: Date; endAt: Date }> {
  const intervals: Array<{ startAt: Date; endAt: Date }> = [];
  const cursor = new Date(input.termStartDate.getTime());
  const termEnd = new Date(input.termEndDate.getTime());
  const targetDay = toJsDay(input.dayOfWeek);

  while (cursor <= termEnd) {
    if (cursor.getDay() === targetDay) {
      const startAt = combineDateAndTime(cursor, input.startTime);
      const endAt = combineDateAndTime(cursor, input.endTime);

      if (startAt < endAt) {
        intervals.push({ startAt, endAt });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return intervals;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseEditSessionMetadata(raw: unknown): EditSessionMetadata | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;

  if (source.mode !== "EDIT") {
    return null;
  }

  const expectedVersion = Number(source.expectedVersion);
  const pruneBookings = source.pruneBookings === true;
  const changedLabels = Array.isArray(source.changedLabels)
    ? source.changedLabels.filter((value): value is string => typeof value === "string")
    : [];

  const diffSummarySource =
    source.diffSummary && typeof source.diffSummary === "object"
      ? (source.diffSummary as Record<string, unknown>)
      : {};

  const newSnapshot = parseSnapshotState(source.newSnapshot, Number(source.slotSystemId ?? 0));

  if (!newSnapshot || !Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    return null;
  }

  return {
    mode: "EDIT",
    pruneBookings,
    expectedVersion,
    changedLabels,
    diffSummary: {
      total: Number(diffSummarySource.total ?? 0),
      added: Number(diffSummarySource.added ?? 0),
      removed: Number(diffSummarySource.removed ?? 0),
      changedSlot: Number(diffSummarySource.changedSlot ?? 0),
      changedVenue: Number(diffSummarySource.changedVenue ?? 0),
    },
    affectedRows: Number(source.affectedRows ?? 0),
    unchangedRows: Number(source.unchangedRows ?? 0),
    newSnapshot,
  };
}

function parseSnapshotState(
  raw: unknown,
  fallbackSlotSystemId: number,
): TimetableSnapshotState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Partial<TimetableSnapshotState>;

  if (!Array.isArray(source.days) || !Array.isArray(source.timeBands) || !Array.isArray(source.blocks)) {
    return null;
  }

  const snapshotInput: TimetableSnapshotState = {
    slotSystemId:
      Number.isInteger(Number(source.slotSystemId)) && Number(source.slotSystemId) > 0
        ? Number(source.slotSystemId)
        : fallbackSlotSystemId,
    days: source.days,
    timeBands: source.timeBands,
    blocks: source.blocks,
    ...(source.roomAssignments && typeof source.roomAssignments === "object"
      ? { roomAssignments: source.roomAssignments as Record<string, number> }
      : {}),
  };

  const parsed = normalizeSnapshotState(snapshotInput);

  if (parsed.days.length === 0 || parsed.timeBands.length === 0) {
    return null;
  }

  return parsed;
}

function normalizeLabel(value: string): string {
  return normalizeSpace(value).toLowerCase();
}

function buildSnapshotDescriptorLookup(
  snapshot: TimetableSnapshotState,
): Map<string, TimetableSlotDescriptor[]> {
  const dayById = new Map(snapshot.days.map((day) => [day.id, day]));
  const timeBands = [...snapshot.timeBands].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) {
      return a.orderIndex - b.orderIndex;
    }

    if (a.startTime !== b.startTime) {
      return a.startTime.localeCompare(b.startTime);
    }

    if (a.endTime !== b.endTime) {
      return a.endTime.localeCompare(b.endTime);
    }

    return a.id - b.id;
  });

  const bandIndexById = new Map<number, number>();
  timeBands.forEach((band, index) => {
    bandIndexById.set(band.id, index);
  });

  const output = new Map<string, TimetableSlotDescriptor[]>();

  for (const block of snapshot.blocks) {
    const normalizedLabel = normalizeLabel(block.label);
    const day = dayById.get(block.dayId);
    const startBandIndex = bandIndexById.get(block.startBandId);

    if (!normalizedLabel || !day || startBandIndex === undefined) {
      continue;
    }

    const endBandIndex = startBandIndex + Math.max(1, block.rowSpan) - 1;
    const startBand = timeBands[startBandIndex];
    const endBand = timeBands[endBandIndex];

    if (!startBand || !endBand) {
      continue;
    }

    const descriptor: TimetableSlotDescriptor = {
      dayOfWeek: day.dayOfWeek,
      startTime: startBand.startTime,
      endTime: endBand.endTime,
      laneIndex: Math.max(0, block.laneIndex),
    };

    const existing = output.get(normalizedLabel) ?? [];
    existing.push(descriptor);
    output.set(normalizedLabel, existing);
  }

  for (const [label, descriptors] of output.entries()) {
    descriptors.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek.localeCompare(b.dayOfWeek);
      }

      if (a.startTime !== b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }

      if (a.endTime !== b.endTime) {
        return a.endTime.localeCompare(b.endTime);
      }

      return a.laneIndex - b.laneIndex;
    });

    output.set(label, descriptors);
  }

  return output;
}

async function loadLiveSnapshot(slotSystemId: number): Promise<TimetableSnapshotState> {
  const [days, timeBands, blocks] = await Promise.all([
    db
      .select({
        id: slotDays.id,
        dayOfWeek: slotDays.dayOfWeek,
        orderIndex: slotDays.orderIndex,
        laneCount: slotDays.laneCount,
      })
      .from(slotDays)
      .where(eq(slotDays.slotSystemId, slotSystemId))
      .orderBy(asc(slotDays.orderIndex), asc(slotDays.id)),
    db
      .select({
        id: slotTimeBands.id,
        startTime: slotTimeBands.startTime,
        endTime: slotTimeBands.endTime,
        orderIndex: slotTimeBands.orderIndex,
      })
      .from(slotTimeBands)
      .where(eq(slotTimeBands.slotSystemId, slotSystemId))
      .orderBy(asc(slotTimeBands.orderIndex), asc(slotTimeBands.id)),
    db
      .select({
        id: slotBlocks.id,
        dayId: slotBlocks.dayId,
        startBandId: slotBlocks.startBandId,
        laneIndex: slotBlocks.laneIndex,
        rowSpan: slotBlocks.rowSpan,
        label: slotBlocks.label,
      })
      .from(slotBlocks)
      .where(eq(slotBlocks.slotSystemId, slotSystemId))
      .orderBy(asc(slotBlocks.dayId), asc(slotBlocks.startBandId), asc(slotBlocks.id)),
  ]);

  return normalizeSnapshotState({
    slotSystemId,
    days,
    timeBands: timeBands.map((band) => ({
      id: band.id,
      startTime: String(band.startTime),
      endTime: String(band.endTime),
      orderIndex: band.orderIndex,
    })),
    blocks,
  });
}

async function getExistingRowBookings(batchId: number, rowId: number): Promise<
  Array<{
    id: number;
    startAt: Date;
    endAt: Date;
  }>
> {
  return db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.source, "TIMETABLE_ALLOCATION"),
        like(bookings.sourceRef, `batch:${batchId}:row:${rowId}:%`),
      ),
    );
}

async function getCommittedRowsForEdit(slotSystemId: number): Promise<CommittedRowForEdit[]> {
  const rows = await db
    .select({
      batchId: timetableImportBatches.id,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      rowId: timetableImportRows.id,
      rowIndex: timetableImportRows.rowIndex,
      classification: timetableImportRows.classification,
      rawCourseCode: timetableImportRows.rawCourseCode,
      rawSlot: timetableImportRows.rawSlot,
      rawClassroom: timetableImportRows.rawClassroom,
      resolvedSlotLabel: timetableImportRows.resolvedSlotLabel,
      resolvedRoomId: timetableImportRows.resolvedRoomId,
      resolutionAction: timetableImportRowResolutions.action,
      resolutionSlotLabel: timetableImportRowResolutions.resolvedSlotLabel,
      resolutionRoomId: timetableImportRowResolutions.resolvedRoomId,
    })
    .from(timetableImportBatches)
    .innerJoin(timetableImportRows, eq(timetableImportRows.batchId, timetableImportBatches.id))
    .leftJoin(
      timetableImportRowResolutions,
      and(
        eq(timetableImportRowResolutions.batchId, timetableImportBatches.id),
        eq(timetableImportRowResolutions.rowId, timetableImportRows.id),
      ),
    )
    .where(
      and(
        eq(timetableImportBatches.slotSystemId, slotSystemId),
        eq(timetableImportBatches.status, "COMMITTED"),
      ),
    )
    .orderBy(asc(timetableImportBatches.id), asc(timetableImportRows.rowIndex));

  return rows;
}

function overlaps(input: {
  startAt: Date;
  endAt: Date;
  existingStartAt: Date;
  existingEndAt: Date;
}): boolean {
  return input.startAt < input.existingEndAt && input.endAt > input.existingStartAt;
}

async function createSyntheticEditBatch(input: {
  slotSystemId: number;
  userId: number;
}): Promise<number> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const now = new Date();

  const [createdBatch] = await db
    .insert(timetableImportBatches)
    .values({
      batchKey: `edit-session:${input.slotSystemId}:${token}`,
      slotSystemId: input.slotSystemId,
      termStartDate: now,
      termEndDate: now,
      fileName: `edit-session-${input.slotSystemId}.json`,
      fileHash: hashValue(token),
      fingerprint: hashValue(`edit-session|${input.slotSystemId}|${token}`),
      status: "COMMITTED",
      createdBy: input.userId,
      committedAt: now,
    })
    .returning({ id: timetableImportBatches.id });

  if (!createdBatch) {
    throw createServiceError(500, "Failed to create synthetic edit batch");
  }

  return createdBatch.id;
}

async function buildEditOperations(input: {
  slotSystemId: number;
  changedLabels: Set<string>;
  operationTypeByLabel: Map<string, TimetableDiffOperationType>;
  newSnapshot: TimetableSnapshotState;
  pruneBookings: boolean;
}): Promise<{
  operations: SessionOperation[];
  affectedRows: number;
  unchangedRows: number;
}> {
  const committedRows = await getCommittedRowsForEdit(input.slotSystemId);
  const descriptorsByLabel = buildSnapshotDescriptorLookup(input.newSnapshot);

  const operations: SessionOperation[] = [];
  let actionableRows = 0;
  let affectedRows = 0;

  for (const row of committedRows) {
    const action =
      row.resolutionAction ??
      (row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP");

    if (action === "SKIP") {
      continue;
    }

    const effectiveSlotLabel = normalizeSpace(
      row.resolutionSlotLabel ?? row.resolvedSlotLabel ?? row.rawSlot ?? "",
    );
    const normalizedLabel = normalizeLabel(effectiveSlotLabel);
    const effectiveRoomId = Number(row.resolutionRoomId ?? row.resolvedRoomId ?? 0);

    if (!normalizedLabel || !Number.isInteger(effectiveRoomId) || effectiveRoomId <= 0) {
      continue;
    }

    actionableRows += 1;

    if (!input.changedLabels.has(normalizedLabel)) {
      continue;
    }

    const operationTypeByLabel =
      input.operationTypeByLabel.get(normalizedLabel) ?? "CHANGE_SLOT";

    affectedRows += 1;

    const descriptors = descriptorsByLabel.get(normalizedLabel) ?? [];
    const existingRowBookings = await getExistingRowBookings(row.batchId, row.rowId);
    const allExistingBookingIds = existingRowBookings.map((booking) => booking.id);

    if (descriptors.length === 0) {
      if (input.pruneBookings && allExistingBookingIds.length > 0) {
        operations.push({
          operationId: hashValue(`edit|delete-only|${row.batchId}|${row.rowId}`),
          kind: "DELETE_ONLY",
          operationType:
            operationTypeByLabel === "REMOVE_SLOT" ? "REMOVE_SLOT" : operationTypeByLabel,
          rowId: row.rowId,
          rowIndex: row.rowIndex,
          courseCode: row.rawCourseCode ?? "",
          slot: row.rawSlot ?? "",
          classroom: row.rawClassroom ?? "",
          roomId: effectiveRoomId,
          startAt: row.termStartDate.toISOString(),
          endAt: row.termEndDate.toISOString(),
          sourceRef: `batch:${row.batchId}:row:${row.rowId}:edit-delete-only`,
          status: "ACTIVE",
          forceOverwriteBookingIds: [],
          cleanupBookingIds: allExistingBookingIds,
        });
      }

      continue;
    }

    for (const descriptor of descriptors) {
      const intervals = buildOccurrenceIntervals({
        termStartDate: row.termStartDate,
        termEndDate: row.termEndDate,
        dayOfWeek: descriptor.dayOfWeek,
        startTime: descriptor.startTime,
        endTime: descriptor.endTime,
      });

      for (const interval of intervals) {
        const overlapBookingIds = input.pruneBookings
          ? allExistingBookingIds
          : existingRowBookings
              .filter((booking) =>
                overlaps({
                  startAt: interval.startAt,
                  endAt: interval.endAt,
                  existingStartAt: booking.startAt,
                  existingEndAt: booking.endAt,
                }),
              )
              .map((booking) => booking.id);

        operations.push({
          operationId: hashValue(
            `edit|${row.batchId}|${row.rowId}|${effectiveRoomId}|${interval.startAt.toISOString()}|${interval.endAt.toISOString()}`,
          ),
          kind: "UPSERT",
          operationType: operationTypeByLabel,
          rowId: row.rowId,
          rowIndex: row.rowIndex,
          courseCode: row.rawCourseCode ?? "",
          slot: row.rawSlot ?? "",
          classroom: row.rawClassroom ?? "",
          roomId: effectiveRoomId,
          startAt: interval.startAt.toISOString(),
          endAt: interval.endAt.toISOString(),
          sourceRef: `batch:${row.batchId}:row:${row.rowId}:edit:${descriptor.dayOfWeek}:${descriptor.startTime}-${descriptor.endTime}:${descriptor.laneIndex}`,
          status: "ACTIVE",
          forceOverwriteBookingIds: overlapBookingIds,
          cleanupBookingIds: [],
        });
      }
    }
  }

  return {
    operations,
    affectedRows,
    unchangedRows: Math.max(0, actionableRows - affectedRows),
  };
}

async function applySnapshotToSlotSystem(input: {
  tx: any;
  slotSystemId: number;
  snapshot: TimetableSnapshotState;
}) {
  await input.tx
    .delete(slotBlocks)
    .where(eq(slotBlocks.slotSystemId, input.slotSystemId));

  await input.tx
    .delete(slotDays)
    .where(eq(slotDays.slotSystemId, input.slotSystemId));

  await input.tx
    .delete(slotTimeBands)
    .where(eq(slotTimeBands.slotSystemId, input.slotSystemId));

  const dayIdMap = new Map<number, number>();
  const sortedDays = [...input.snapshot.days].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) {
      return a.orderIndex - b.orderIndex;
    }

    if (a.dayOfWeek !== b.dayOfWeek) {
      return a.dayOfWeek.localeCompare(b.dayOfWeek);
    }

    return a.id - b.id;
  });

  for (const day of sortedDays) {
    const [createdDay] = await input.tx
      .insert(slotDays)
      .values({
        slotSystemId: input.slotSystemId,
        dayOfWeek: day.dayOfWeek,
        orderIndex: day.orderIndex,
        laneCount: Math.max(1, day.laneCount),
      })
      .returning({ id: slotDays.id });

    if (!createdDay) {
      throw createServiceError(500, "Failed to create day while applying edit snapshot");
    }

    dayIdMap.set(day.id, createdDay.id);
  }

  const bandIdMap = new Map<number, number>();
  const sortedBands = [...input.snapshot.timeBands].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) {
      return a.orderIndex - b.orderIndex;
    }

    if (a.startTime !== b.startTime) {
      return a.startTime.localeCompare(b.startTime);
    }

    if (a.endTime !== b.endTime) {
      return a.endTime.localeCompare(b.endTime);
    }

    return a.id - b.id;
  });

  for (const band of sortedBands) {
    const [createdBand] = await input.tx
      .insert(slotTimeBands)
      .values({
        slotSystemId: input.slotSystemId,
        startTime: band.startTime,
        endTime: band.endTime,
        orderIndex: band.orderIndex,
      })
      .returning({ id: slotTimeBands.id });

    if (!createdBand) {
      throw createServiceError(500, "Failed to create time band while applying edit snapshot");
    }

    bandIdMap.set(band.id, createdBand.id);
  }

  for (const block of input.snapshot.blocks) {
    const mappedDayId = dayIdMap.get(block.dayId);
    const mappedStartBandId = bandIdMap.get(block.startBandId);

    if (!mappedDayId || !mappedStartBandId) {
      continue;
    }

    await input.tx.insert(slotBlocks).values({
      slotSystemId: input.slotSystemId,
      dayId: mappedDayId,
      startBandId: mappedStartBandId,
      laneIndex: Math.max(0, block.laneIndex),
      rowSpan: Math.max(1, block.rowSpan),
      label: normalizeSpace(block.label),
    });
  }
}

function toSummary(row: {
  id: number;
  batchId: number;
  slotSystemId: number;
  status: CommitSessionStatus;
  payloadSnapshot: string;
  createdAt: Date;
  updatedAt: Date;
}): CommitSessionSummary {
  const freezeState = getBookingFreezeState();
  return {
    commitSessionId: row.id,
    batchId: row.batchId,
    slotSystemId: row.slotSystemId,
    status: row.status,
    payloadSnapshot: row.payloadSnapshot,
    isFrozen: freezeState.isFrozen && freezeState.frozenBy?.batchId === row.batchId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getSlotDescriptorLookup(slotSystemId: number): Promise<Map<string, SlotDescriptor[]>> {
  const [days, timeBands, blocks] = await Promise.all([
    db
      .select({
        id: slotDays.id,
        dayOfWeek: slotDays.dayOfWeek,
      })
      .from(slotDays)
      .where(eq(slotDays.slotSystemId, slotSystemId)),
    db
      .select({
        id: slotTimeBands.id,
        startTime: slotTimeBands.startTime,
        endTime: slotTimeBands.endTime,
      })
      .from(slotTimeBands)
      .where(eq(slotTimeBands.slotSystemId, slotSystemId))
      .orderBy(asc(slotTimeBands.startTime), asc(slotTimeBands.endTime), asc(slotTimeBands.id)),
    db
      .select({
        id: slotBlocks.id,
        dayId: slotBlocks.dayId,
        startBandId: slotBlocks.startBandId,
        rowSpan: slotBlocks.rowSpan,
        label: slotBlocks.label,
      })
      .from(slotBlocks)
      .where(eq(slotBlocks.slotSystemId, slotSystemId)),
  ]);

  const dayById = new Map<number, SlotDescriptor["dayOfWeek"]>();
  for (const day of days) {
    dayById.set(day.id, day.dayOfWeek);
  }

  const bandIndexById = new Map<number, number>();
  timeBands.forEach((band, index) => {
    bandIndexById.set(band.id, index);
  });

  const descriptorsByLabel = new Map<string, SlotDescriptor[]>();

  for (const block of blocks) {
    const dayOfWeek = dayById.get(block.dayId);
    const startIndex = bandIndexById.get(block.startBandId);

    if (!dayOfWeek || startIndex === undefined) {
      continue;
    }

    const endIndex = startIndex + block.rowSpan - 1;
    const startBand = timeBands[startIndex];
    const endBand = timeBands[endIndex];

    if (!startBand || !endBand) {
      continue;
    }

    const label = normalizeSpace(block.label);
    if (!label) {
      continue;
    }

    const descriptor: SlotDescriptor = {
      label,
      dayOfWeek,
      startTime: String(startBand.startTime),
      endTime: String(endBand.endTime),
      blockId: block.id,
    };

    const normalizedLabel = normalizeKey(label);
    const existing = descriptorsByLabel.get(normalizedLabel) ?? [];
    existing.push(descriptor);
    descriptorsByLabel.set(normalizedLabel, existing);
  }

  return descriptorsByLabel;
}

async function buildOperations(batchId: number): Promise<{ operations: SessionOperation[]; slotSystemId: number }> {
  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      status: timetableImportBatches.status,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status === "COMMITTED") {
    throw createServiceError(400, "Batch is already committed");
  }

  const [rows, storedResolutions] = await Promise.all([
    db
      .select({
        id: timetableImportRows.id,
        rowIndex: timetableImportRows.rowIndex,
        classification: timetableImportRows.classification,
        rawCourseCode: timetableImportRows.rawCourseCode,
        rawSlot: timetableImportRows.rawSlot,
        rawClassroom: timetableImportRows.rawClassroom,
        resolvedSlotLabel: timetableImportRows.resolvedSlotLabel,
        resolvedRoomId: timetableImportRows.resolvedRoomId,
      })
      .from(timetableImportRows)
      .where(eq(timetableImportRows.batchId, batchId))
      .orderBy(asc(timetableImportRows.rowIndex)),
    db
      .select({
        rowId: timetableImportRowResolutions.rowId,
        action: timetableImportRowResolutions.action,
        resolvedSlotLabel: timetableImportRowResolutions.resolvedSlotLabel,
        resolvedRoomId: timetableImportRowResolutions.resolvedRoomId,
      })
      .from(timetableImportRowResolutions)
      .where(eq(timetableImportRowResolutions.batchId, batchId)),
  ]);

  const resolutionByRowId = new Map(
    storedResolutions.map((resolution) => [resolution.rowId, resolution]),
  );

  const descriptorLookup = await getSlotDescriptorLookup(batch.slotSystemId);
  const operations: SessionOperation[] = [];

  for (const row of rows) {
    const resolution = resolutionByRowId.get(row.id);
    const action =
      resolution?.action ?? (row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP");

    if (action === "SKIP") {
      continue;
    }

    const resolvedSlotLabel = normalizeSpace(
      resolution?.resolvedSlotLabel ?? row.resolvedSlotLabel ?? "",
    );
    const resolvedRoomId = resolution?.resolvedRoomId ?? row.resolvedRoomId;

    if (!resolvedSlotLabel || !resolvedRoomId) {
      continue;
    }

    const descriptors = descriptorLookup.get(normalizeKey(resolvedSlotLabel)) ?? [];

    if (descriptors.length === 0) {
      continue;
    }

    for (const descriptor of descriptors) {
      const intervals = buildOccurrenceIntervals({
        termStartDate: batch.termStartDate,
        termEndDate: batch.termEndDate,
        dayOfWeek: descriptor.dayOfWeek,
        startTime: descriptor.startTime,
        endTime: descriptor.endTime,
      });

      for (const interval of intervals) {
        const operationId = hashValue(
          `${batch.id}|${row.id}|${resolvedRoomId}|${interval.startAt.toISOString()}|${interval.endAt.toISOString()}`,
        );

        operations.push({
          operationId,
          kind: "UPSERT",
          rowId: row.id,
          rowIndex: row.rowIndex,
          courseCode: row.rawCourseCode ?? "",
          slot: row.rawSlot ?? "",
          classroom: row.rawClassroom ?? "",
          roomId: resolvedRoomId,
          startAt: interval.startAt.toISOString(),
          endAt: interval.endAt.toISOString(),
          sourceRef: `batch:${batch.id}:row:${row.id}:block:${descriptor.blockId}`,
          status: "ACTIVE",
          forceOverwriteBookingIds: [],
          cleanupBookingIds: [],
        });
      }
    }
  }

  return {
    operations,
    slotSystemId: batch.slotSystemId,
  };
}

function buildSnapshot(operations: SessionOperation[]): string {
  const normalized = [...operations]
    .sort((a, b) => a.operationId.localeCompare(b.operationId))
    .map((item) => ({
      operationId: item.operationId,
      kind: item.kind,
      rowId: item.rowId,
      rowIndex: item.rowIndex,
      roomId: item.roomId,
      startAt: item.startAt,
      endAt: item.endAt,
      status: item.status,
    }));

  return hashValue(JSON.stringify(normalized));
}

async function getSessionRow(commitSessionId: number) {
  const [session] = await db
    .select()
    .from(commitSessions)
    .where(eq(commitSessions.id, commitSessionId))
    .limit(1);

  if (!session) {
    throw createServiceError(404, "Commit session not found");
  }

  return session;
}

function parseOperations(raw: unknown): SessionOperation[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const output: SessionOperation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const source = item as Record<string, unknown>;

    const operationId = typeof source.operationId === "string" ? source.operationId : "";
    const rowId = Number(source.rowId);
    const rowIndex = Number(source.rowIndex);
    const roomId = Number(source.roomId);
    const startAt = typeof source.startAt === "string" ? source.startAt : "";
    const endAt = typeof source.endAt === "string" ? source.endAt : "";
    const sourceRef = typeof source.sourceRef === "string" ? source.sourceRef : "";
    const status = source.status === "SKIPPED" ? "SKIPPED" : "ACTIVE";
    const kind = source.kind === "DELETE_ONLY" ? "DELETE_ONLY" : "UPSERT";

    if (!operationId || !Number.isInteger(rowId) || !Number.isInteger(rowIndex) || !Number.isInteger(roomId)) {
      continue;
    }

    if (!startAt || !endAt || !sourceRef) {
      continue;
    }

    const forceOverwriteBookingIds = Array.isArray(source.forceOverwriteBookingIds)
      ? source.forceOverwriteBookingIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    const cleanupBookingIds = Array.isArray(source.cleanupBookingIds)
      ? source.cleanupBookingIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    const operationType =
      source.operationType === "ADD_SLOT" ||
      source.operationType === "REMOVE_SLOT" ||
      source.operationType === "CHANGE_SLOT" ||
      source.operationType === "CHANGE_VENUE"
        ? source.operationType
        : undefined;

    output.push({
      operationId,
      kind,
      ...(operationType ? { operationType } : {}),
      rowId,
      rowIndex,
      courseCode: typeof source.courseCode === "string" ? source.courseCode : "",
      slot: typeof source.slot === "string" ? source.slot : "",
      classroom: typeof source.classroom === "string" ? source.classroom : "",
      roomId,
      startAt,
      endAt,
      sourceRef,
      status,
      forceOverwriteBookingIds,
      cleanupBookingIds,
    });
  }

  return output;
}

function parseConflicts(raw: unknown): TimetableCommitConflict[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is TimetableCommitConflict => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const source = item as Partial<TimetableCommitConflict>;

    return (
      typeof source.id === "string" &&
      typeof source.stage === "string" &&
      typeof source.type === "string" &&
      typeof source.operationId === "string" &&
      typeof source.rowId === "number" &&
      typeof source.rowIndex === "number" &&
      typeof source.roomId === "number" &&
      typeof source.startAt === "string" &&
      typeof source.endAt === "string" &&
      typeof source.reason === "string" &&
      typeof source.metadata === "object" &&
      source.metadata !== null
    );
  });
}

async function ensureNoActiveSession(slotSystemId: number): Promise<void> {
  const activeStatuses: CommitSessionStatus[] = [
    "STARTED",
    "EXTERNAL_DONE",
    "INTERNAL_DONE",
    "FROZEN",
  ];

  const [existing] = await db
    .select({ id: commitSessions.id, status: commitSessions.status })
    .from(commitSessions)
    .where(
      and(
        eq(commitSessions.slotSystemId, slotSystemId),
        inArray(commitSessions.status, activeStatuses),
      ),
    )
    .orderBy(asc(commitSessions.id))
    .limit(1);

  if (existing) {
    throw createServiceError(
      409,
      `Another active commit session (${existing.id}) is already running for this slot system`,
    );
  }
}

async function updateSessionPatch(
  commitSessionId: number,
  patch: Partial<{
    status: CommitSessionStatus;
    operations: SessionOperation[];
    payloadSnapshot: string;
    externalConflicts: TimetableCommitConflict[];
    internalConflicts: TimetableCommitConflict[];
    runtimeConflicts: TimetableCommitConflict[];
    resolutions: Record<string, unknown>;
    frozenAt: Date | null;
  }>,
) {
  const setPayload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (patch.status !== undefined) {
    setPayload.status = patch.status;
  }

  if (patch.operations !== undefined) {
    setPayload.operations = patch.operations;
  }

  if (patch.payloadSnapshot !== undefined) {
    setPayload.payloadSnapshot = patch.payloadSnapshot;
  }

  if (patch.externalConflicts !== undefined) {
    setPayload.externalConflicts = patch.externalConflicts;
  }

  if (patch.internalConflicts !== undefined) {
    setPayload.internalConflicts = patch.internalConflicts;
  }

  if (patch.runtimeConflicts !== undefined) {
    setPayload.runtimeConflicts = patch.runtimeConflicts;
  }

  if (patch.resolutions !== undefined) {
    setPayload.resolutions = patch.resolutions;
  }

  if (patch.frozenAt !== undefined) {
    setPayload.frozenAt = patch.frozenAt;
  }

  await db
    .update(commitSessions)
    .set(setPayload)
    .where(eq(commitSessions.id, commitSessionId));
}

function applyConflictResolutions(input: {
  operations: SessionOperation[];
  conflicts: TimetableCommitConflict[];
  resolutions: TimetableCommitResolution[];
  allowedActions: TimetableCommitResolutionAction[];
}) {
  type ExternalClashingBookingEntry = {
    bookingId: number;
    roomId: number;
    startAt: string;
    endAt: string;
    sourceRef: string;
    rowId: number;
    rowIndex: number;
  };

  const parseExternalClashingBookingEntries = (
    metadata: Record<string, unknown>,
    conflict: TimetableCommitConflict,
  ): ExternalClashingBookingEntry[] => {
    const entriesByBookingId = new Map<number, ExternalClashingBookingEntry>();

    const rawEntries = Array.isArray(metadata.conflictingBookingEntries)
      ? metadata.conflictingBookingEntries
      : [];

    for (const rawEntry of rawEntries) {
      if (!rawEntry || typeof rawEntry !== "object") {
        continue;
      }

      const entry = rawEntry as Record<string, unknown>;
      const bookingId = Number(entry.bookingId);
      const sourceRef = typeof entry.sourceRef === "string" ? entry.sourceRef : "";

      if (!Number.isInteger(bookingId) || bookingId <= 0 || sourceRef.length === 0) {
        continue;
      }

      const roomId = Number(entry.roomId);
      const startAt = typeof entry.startAt === "string" ? entry.startAt : conflict.startAt;
      const endAt = typeof entry.endAt === "string" ? entry.endAt : conflict.endAt;
      const rowId = Number(entry.rowId);
      const rowIndex = Number(entry.rowIndex);

      entriesByBookingId.set(bookingId, {
        bookingId,
        roomId: Number.isInteger(roomId) && roomId > 0 ? roomId : conflict.roomId,
        startAt,
        endAt,
        sourceRef,
        rowId: Number.isInteger(rowId) && rowId > 0 ? rowId : conflict.rowId,
        rowIndex: Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : conflict.rowIndex,
      });
    }

    if (entriesByBookingId.size > 0) {
      return Array.from(entriesByBookingId.values()).sort((a, b) => a.bookingId - b.bookingId);
    }

    const singleBookingId = Number(metadata.conflictingBookingId);
    const singleSourceRef =
      typeof metadata.conflictingSourceRef === "string"
        ? metadata.conflictingSourceRef
        : "";

    if (
      Number.isInteger(singleBookingId) &&
      singleBookingId > 0 &&
      singleSourceRef.length > 0
    ) {
      return [
        {
          bookingId: singleBookingId,
          roomId: conflict.roomId,
          startAt: conflict.startAt,
          endAt: conflict.endAt,
          sourceRef: singleSourceRef,
          rowId: conflict.rowId,
          rowIndex: conflict.rowIndex,
        },
      ];
    }

    return [];
  };

  const conflictsById = new Map(input.conflicts.map((conflict) => [conflict.id, conflict]));
  const operationsById = new Map(input.operations.map((operation) => [operation.operationId, operation]));

  for (const resolution of input.resolutions) {
    const conflict = conflictsById.get(resolution.conflictId);

    if (!conflict) {
      continue;
    }

    if (!input.allowedActions.includes(resolution.action)) {
      throw createServiceError(400, `Action ${resolution.action} is not allowed in this stage`);
    }

    const metadata = conflict.metadata ?? {};
    const resolutionTarget =
      resolution.target === "CLASHING" ? "CLASHING" : "COMMITTING";

    const committingOperationIds = Array.isArray(metadata.affectedOperationIds)
      ? metadata.affectedOperationIds.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : [];

    const committingTargetOperationIds =
      committingOperationIds.length > 0
        ? committingOperationIds
        : [conflict.operationId];

    let targetOperations = committingTargetOperationIds
      .map((operationId) => operationsById.get(operationId))
      .filter((operation): operation is SessionOperation => Boolean(operation));

    if (resolutionTarget === "CLASHING" && conflict.stage !== "runtime") {
      if (conflict.stage === "internal") {
        const secondaryOperationIds = Array.isArray(metadata.secondaryOperationIds)
          ? metadata.secondaryOperationIds.filter(
              (value): value is string => typeof value === "string" && value.length > 0,
            )
          : [];

        targetOperations = secondaryOperationIds
          .map((operationId) => operationsById.get(operationId))
          .filter((operation): operation is SessionOperation => Boolean(operation));
      } else if (conflict.stage === "external") {
        const clashingBookingEntries = parseExternalClashingBookingEntries(metadata, conflict);

        if (clashingBookingEntries.length === 0) {
          throw createServiceError(400, "No clashing allocation is available for this conflict");
        }

        for (const operation of targetOperations) {
          for (const entry of clashingBookingEntries) {
            if (!operation.forceOverwriteBookingIds.includes(entry.bookingId)) {
              operation.forceOverwriteBookingIds.push(entry.bookingId);
            }
          }
        }

        const clashingTargetOperations: SessionOperation[] = [];

        for (const entry of clashingBookingEntries) {
          const syntheticOperationId = hashValue(
            `external-clashing|booking:${entry.bookingId}|${entry.sourceRef}`,
          );

          let syntheticOperation = operationsById.get(syntheticOperationId);

          if (!syntheticOperation) {
            syntheticOperation = {
              operationId: syntheticOperationId,
              kind: "UPSERT",
              rowId: entry.rowId,
              rowIndex: entry.rowIndex,
              courseCode: "",
              slot: "",
              classroom: "",
              roomId: entry.roomId,
              startAt: entry.startAt,
              endAt: entry.endAt,
              sourceRef: entry.sourceRef,
              status: "ACTIVE",
              forceOverwriteBookingIds: [entry.bookingId],
              cleanupBookingIds: [],
            };

            input.operations.push(syntheticOperation);
            operationsById.set(syntheticOperationId, syntheticOperation);
          }

          if (!syntheticOperation.forceOverwriteBookingIds.includes(entry.bookingId)) {
            syntheticOperation.forceOverwriteBookingIds.push(entry.bookingId);
          }

          clashingTargetOperations.push(syntheticOperation);
        }

        targetOperations = clashingTargetOperations;
      }
    }

    if (targetOperations.length === 0) {
      throw createServiceError(400, "No matching operations found for the selected resolution target");
    }

    if (resolution.action === "SKIP") {
      for (const operation of targetOperations) {
        operation.status = "SKIPPED";
      }

      continue;
    }

    if (resolution.action === "CHANGE_ROOM" || resolution.action === "ALTERNATIVE_ROOM") {
      const roomId = Number(resolution.roomId);

      if (!Number.isInteger(roomId) || roomId <= 0) {
        throw createServiceError(400, `roomId is required for ${resolution.action}`);
      }

      for (const operation of targetOperations) {
        operation.roomId = roomId;
      }

      continue;
    }

    if (resolution.action === "FORCE_OVERWRITE") {
      const metadataBookingIds = Array.isArray(metadata.conflictingBookingIds)
        ? metadata.conflictingBookingIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        : [];

      const singleBookingId = Number(metadata.conflictingBookingId);
      const bookingIds = metadataBookingIds.length > 0
        ? metadataBookingIds
        : Number.isInteger(singleBookingId) && singleBookingId > 0
          ? [singleBookingId]
          : [];

      if (bookingIds.length === 0) {
        throw createServiceError(400, "FORCE_OVERWRITE requires a conflicting booking");
      }

      for (const operation of targetOperations) {
        for (const bookingId of bookingIds) {
          if (!operation.forceOverwriteBookingIds.includes(bookingId)) {
            operation.forceOverwriteBookingIds.push(bookingId);
          }
        }
      }

      continue;
    }

    if (resolution.action === "CHANGE_SLOT_EXISTING" || resolution.action === "CREATE_SLOT_AND_USE") {
      const nextStart = parseOptionalDate(resolution.startAt);
      const nextEnd = parseOptionalDate(resolution.endAt);

      if (!nextStart || !nextEnd || nextStart >= nextEnd) {
        throw createServiceError(
          400,
          `${resolution.action} requires valid startAt and endAt`,
        );
      }

      for (const operation of targetOperations) {
        operation.startAt = nextStart.toISOString();
        operation.endAt = nextEnd.toISOString();
      }

      continue;
    }
  }

  return input.operations;
}

async function computeExternalConflicts(batchId: number, operations: SessionOperation[]): Promise<TimetableCommitConflict[]> {
  const activeOperations = operations.filter(
    (operation) => operation.status === "ACTIVE" && operation.kind === "UPSERT",
  );
  const conflicts: TimetableCommitConflict[] = [];

  type ExternalConflictGroup = {
    rowId: number;
    rowIndex: number;
    roomId: number;
    representativeOperationId: string;
    affectedOperationIds: Set<string>;
    conflictingBookingIds: Set<number>;
    conflictingBatchIds: Set<number>;
    conflictingSlotSystemIds: Set<number>;
    conflictingSourceRefs: Set<string>;
    conflictingBookingEntriesById: Map<number, {
      bookingId: number;
      roomId: number;
      startAt: string;
      endAt: string;
      sourceRef: string;
      batchId: number;
      slotSystemId: number;
      rowId: number;
      rowIndex: number;
    }>;
    earliestOperationStart: Date;
    latestOperationEnd: Date;
    earliestConflictStart: Date;
    latestConflictEnd: Date;
  };

  const groupedConflicts = new Map<string, ExternalConflictGroup>();

  const overlapRowsByOperationId = new Map<string, Array<{
    id: number;
    roomId: number;
    startAt: Date;
    endAt: Date;
    sourceRef: string | null;
  }>>();

  const conflictingBatchIds = new Set<number>();

  for (const operation of activeOperations) {
    const opStart = new Date(operation.startAt);
    const opEnd = new Date(operation.endAt);

    const overlaps = await db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        sourceRef: bookings.sourceRef,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.source, "TIMETABLE_ALLOCATION"),
          eq(bookings.roomId, operation.roomId),
          lt(bookings.startAt, opEnd),
          gt(bookings.endAt, opStart),
        ),
      );

    overlapRowsByOperationId.set(operation.operationId, overlaps);

    for (const overlap of overlaps) {
      if (typeof overlap.sourceRef !== "string") {
        continue;
      }

      const match = /^batch:(\d+):/.exec(overlap.sourceRef);
      if (!match) {
        continue;
      }

      const overlapBatchId = Number(match[1]);
      if (Number.isInteger(overlapBatchId) && overlapBatchId > 0) {
        conflictingBatchIds.add(overlapBatchId);
      }
    }
  }

  const conflictingBatches = conflictingBatchIds.size > 0
    ? await db
        .select({
          id: timetableImportBatches.id,
          slotSystemId: timetableImportBatches.slotSystemId,
          status: timetableImportBatches.status,
        })
        .from(timetableImportBatches)
        .where(inArray(timetableImportBatches.id, Array.from(conflictingBatchIds)))
    : [];

  const conflictBatchById = new Map(conflictingBatches.map((batch) => [batch.id, batch]));

  for (const operation of activeOperations) {
    const overlaps = overlapRowsByOperationId.get(operation.operationId) ?? [];

    for (const overlap of overlaps) {
      if (operation.forceOverwriteBookingIds.includes(overlap.id)) {
        continue;
      }

      if (typeof overlap.sourceRef !== "string") {
        continue;
      }

      if (overlap.sourceRef.startsWith(`batch:${batchId}:`)) {
        continue;
      }

      const match = /^batch:(\d+):/.exec(overlap.sourceRef);
      if (!match) {
        continue;
      }

      const overlapBatchId = Number(match[1]);
      if (!Number.isInteger(overlapBatchId) || overlapBatchId <= 0) {
        continue;
      }

      const overlapBatch = conflictBatchById.get(overlapBatchId);

      // External cross-system clashes should only use committed timetable batches.
      if (!overlapBatch || overlapBatch.status !== "COMMITTED") {
        continue;
      }

      const groupKey = `${operation.rowId}|${operation.roomId}`;
      const operationStartAt = new Date(operation.startAt);
      const operationEndAt = new Date(operation.endAt);

      let group = groupedConflicts.get(groupKey);
      if (!group) {
        group = {
          rowId: operation.rowId,
          rowIndex: operation.rowIndex,
          roomId: operation.roomId,
          representativeOperationId: operation.operationId,
          affectedOperationIds: new Set<string>(),
          conflictingBookingIds: new Set<number>(),
          conflictingBatchIds: new Set<number>(),
          conflictingSlotSystemIds: new Set<number>(),
          conflictingSourceRefs: new Set<string>(),
          conflictingBookingEntriesById: new Map(),
          earliestOperationStart: operationStartAt,
          latestOperationEnd: operationEndAt,
          earliestConflictStart: overlap.startAt,
          latestConflictEnd: overlap.endAt,
        };

        groupedConflicts.set(groupKey, group);
      }

      group.affectedOperationIds.add(operation.operationId);
      group.conflictingBookingIds.add(overlap.id);
      group.conflictingBatchIds.add(overlapBatchId);
      group.conflictingSlotSystemIds.add(overlapBatch.slotSystemId);

      if (typeof overlap.sourceRef === "string" && overlap.sourceRef.length > 0) {
        group.conflictingSourceRefs.add(overlap.sourceRef);

        const sourceRefRowMatch = /^batch:(\d+):row:(\d+):/.exec(overlap.sourceRef);
        const parsedRowId = sourceRefRowMatch ? Number(sourceRefRowMatch[2]) : Number.NaN;

        group.conflictingBookingEntriesById.set(overlap.id, {
          bookingId: overlap.id,
          roomId: overlap.roomId,
          startAt: overlap.startAt.toISOString(),
          endAt: overlap.endAt.toISOString(),
          sourceRef: overlap.sourceRef,
          batchId: overlapBatchId,
          slotSystemId: overlapBatch.slotSystemId,
          rowId: Number.isInteger(parsedRowId) && parsedRowId > 0 ? parsedRowId : operation.rowId,
          rowIndex: operation.rowIndex,
        });
      }

      if (operationStartAt < group.earliestOperationStart) {
        group.earliestOperationStart = operationStartAt;
      }

      if (operationEndAt > group.latestOperationEnd) {
        group.latestOperationEnd = operationEndAt;
      }

      if (overlap.startAt < group.earliestConflictStart) {
        group.earliestConflictStart = overlap.startAt;
      }

      if (overlap.endAt > group.latestConflictEnd) {
        group.latestConflictEnd = overlap.endAt;
      }
    }
  }

  const sortedGroups = Array.from(groupedConflicts.values()).sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) {
      return a.rowIndex - b.rowIndex;
    }

    if (a.rowId !== b.rowId) {
      return a.rowId - b.rowId;
    }

    return a.roomId - b.roomId;
  });

  for (const group of sortedGroups) {
    const affectedOperationIds = Array.from(group.affectedOperationIds).sort();
    const conflictingBookingIds = Array.from(group.conflictingBookingIds).sort((a, b) => a - b);
    const conflictingBatchIds = Array.from(group.conflictingBatchIds).sort((a, b) => a - b);
    const conflictingSlotSystemIds = Array.from(group.conflictingSlotSystemIds).sort((a, b) => a - b);
    const conflictingSourceRefs = Array.from(group.conflictingSourceRefs).sort();
    const conflictingBookingEntries = Array.from(group.conflictingBookingEntriesById.values()).sort(
      (a, b) => a.bookingId - b.bookingId,
    );

    const conflictId = hashValue(
      `external|row:${group.rowId}|room:${group.roomId}|systems:${conflictingSlotSystemIds.join(",")}`,
    );

    const involvesMultipleSystems = conflictingSlotSystemIds.length > 1;

    conflicts.push({
      id: conflictId,
      stage: "external",
      type: "external",
      operationId: affectedOperationIds[0] ?? group.representativeOperationId,
      rowId: group.rowId,
      rowIndex: group.rowIndex,
      roomId: group.roomId,
      startAt: group.earliestOperationStart.toISOString(),
      endAt: group.latestOperationEnd.toISOString(),
      reason: involvesMultipleSystems
        ? "Clashes with committed timetable allocations from multiple slot systems"
        : "Clashes with committed timetable allocation",
      metadata: {
        affectedOperationIds,
        affectedOperationCount: affectedOperationIds.length,
        conflictingBookingIds,
        conflictingBookingCount: conflictingBookingIds.length,
        conflictingBookingEntries,
        conflictingBatchIds,
        conflictingSlotSystemIds,
        conflictingBatchStatus: "COMMITTED",
        conflictingStartAt: group.earliestConflictStart.toISOString(),
        conflictingEndAt: group.latestConflictEnd.toISOString(),
        ...(conflictingBookingIds.length > 0
          ? { conflictingBookingId: conflictingBookingIds[0] }
          : {}),
        ...(conflictingSourceRefs.length > 0
          ? {
              conflictingSourceRef: conflictingSourceRefs[0],
              conflictingSourceRefs,
            }
          : {}),
      },
    });
  }

  return conflicts;
}

function computeInternalConflicts(operations: SessionOperation[]): TimetableCommitConflict[] {
  const activeOperations = operations.filter(
    (operation) => operation.status === "ACTIVE" && operation.kind === "UPSERT",
  );
  const conflicts: TimetableCommitConflict[] = [];

  type InternalConflictGroup = {
    rowId: number;
    rowIndex: number;
    roomId: number;
    representativeOperationId: string;
    affectedOperationIds: Set<string>;
    secondaryRowIds: Set<number>;
    secondaryRowIndexes: Set<number>;
    secondaryOperationIds: Set<string>;
    earliestStart: Date;
    latestEnd: Date;
    collisionCount: number;
  };

  const groupedConflicts = new Map<string, InternalConflictGroup>();

  for (let i = 0; i < activeOperations.length; i += 1) {
    const a = activeOperations[i];
    if (!a) {
      continue;
    }

    const aStart = new Date(a.startAt);
    const aEnd = new Date(a.endAt);

    for (let j = i + 1; j < activeOperations.length; j += 1) {
      const b = activeOperations[j];

      if (!b || a.roomId !== b.roomId) {
        continue;
      }

      const bStart = new Date(b.startAt);
      const bEnd = new Date(b.endAt);

      if (!rangesOverlap(aStart, aEnd, bStart, bEnd)) {
        continue;
      }

      const shouldSwapPrimary =
        b.rowId < a.rowId ||
        (b.rowId === a.rowId && b.rowIndex < a.rowIndex) ||
        (b.rowId === a.rowId && b.rowIndex === a.rowIndex && b.operationId < a.operationId);

      const primary = shouldSwapPrimary ? b : a;
      const secondary = shouldSwapPrimary ? a : b;
      const primaryStart = shouldSwapPrimary ? bStart : aStart;
      const primaryEnd = shouldSwapPrimary ? bEnd : aEnd;

      const groupKey = `${primary.rowId}|${primary.roomId}`;
      let group = groupedConflicts.get(groupKey);

      if (!group) {
        group = {
          rowId: primary.rowId,
          rowIndex: primary.rowIndex,
          roomId: primary.roomId,
          representativeOperationId: primary.operationId,
          affectedOperationIds: new Set<string>(),
          secondaryRowIds: new Set<number>(),
          secondaryRowIndexes: new Set<number>(),
          secondaryOperationIds: new Set<string>(),
          earliestStart: primaryStart,
          latestEnd: primaryEnd,
          collisionCount: 0,
        };

        groupedConflicts.set(groupKey, group);
      }

      group.affectedOperationIds.add(primary.operationId);
      group.secondaryRowIds.add(secondary.rowId);
      group.secondaryRowIndexes.add(secondary.rowIndex);
      group.secondaryOperationIds.add(secondary.operationId);
      group.collisionCount += 1;

      if (primaryStart < group.earliestStart) {
        group.earliestStart = primaryStart;
      }

      if (primaryEnd > group.latestEnd) {
        group.latestEnd = primaryEnd;
      }
    }
  }

  const sortedGroups = Array.from(groupedConflicts.values()).sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) {
      return a.rowIndex - b.rowIndex;
    }

    if (a.rowId !== b.rowId) {
      return a.rowId - b.rowId;
    }

    return a.roomId - b.roomId;
  });

  for (const group of sortedGroups) {
    const affectedOperationIds = Array.from(group.affectedOperationIds).sort();
    const secondaryRowIds = Array.from(group.secondaryRowIds).sort((a, b) => a - b);
    const secondaryRowIndexes = Array.from(group.secondaryRowIndexes).sort((a, b) => a - b);
    const secondaryOperationIds = Array.from(group.secondaryOperationIds).sort();

    const conflictId = hashValue(
      `internal|row:${group.rowId}|room:${group.roomId}|secondary:${secondaryRowIds.join(",")}`,
    );

    conflicts.push({
      id: conflictId,
      stage: "internal",
      type: "internal",
      operationId: affectedOperationIds[0] ?? group.representativeOperationId,
      rowId: group.rowId,
      rowIndex: group.rowIndex,
      roomId: group.roomId,
      startAt: group.earliestStart.toISOString(),
      endAt: group.latestEnd.toISOString(),
      reason: "Internal room-time collision with current timetable allocation",
      metadata: {
        affectedOperationIds,
        affectedOperationCount: affectedOperationIds.length,
        collisionCount: group.collisionCount,
        secondaryOperationIds,
        secondaryRowIds,
        secondaryRowIndexes,
        ...(secondaryRowIds.length > 0 ? { secondaryRowId: secondaryRowIds[0] } : {}),
        ...(secondaryRowIndexes.length > 0 ? { secondaryRowIndex: secondaryRowIndexes[0] } : {}),
      },
    });
  }

  return conflicts;
}

async function computeRuntimeConflicts(operations: SessionOperation[]): Promise<TimetableCommitConflict[]> {
  const activeOperations = operations.filter(
    (operation) => operation.status === "ACTIVE" && operation.kind === "UPSERT",
  );
  const conflicts: TimetableCommitConflict[] = [];

  for (const operation of activeOperations) {
    const opStart = new Date(operation.startAt);
    const opEnd = new Date(operation.endAt);

    const overlaps = await db
      .select({
        id: bookings.id,
        roomId: bookings.roomId,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        source: bookings.source,
        sourceRef: bookings.sourceRef,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.roomId, operation.roomId),
          lt(bookings.startAt, opEnd),
          gt(bookings.endAt, opStart),
          ne(bookings.sourceRef, operation.sourceRef),
        ),
      );

    for (const overlap of overlaps) {
      if (operation.forceOverwriteBookingIds.includes(overlap.id)) {
        continue;
      }

      const conflictId = hashValue(`runtime|${operation.operationId}|${overlap.id}`);

      conflicts.push({
        id: conflictId,
        stage: "runtime",
        type: "runtime",
        operationId: operation.operationId,
        rowId: operation.rowId,
        rowIndex: operation.rowIndex,
        roomId: operation.roomId,
        startAt: operation.startAt,
        endAt: operation.endAt,
        reason: "Runtime overlap with live booking",
        metadata: {
          conflictingBookingId: overlap.id,
          conflictingStartAt: overlap.startAt.toISOString(),
          conflictingEndAt: overlap.endAt.toISOString(),
          conflictingSource: overlap.source,
          conflictingSourceRef: overlap.sourceRef,
        },
      });
    }
  }

  return conflicts;
}

export async function startCommitSession(input: {
  batchId: number;
  userId: number;
  decisions?: unknown;
}): Promise<CommitSessionSummary> {
  const batchId = Number(input.batchId);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  if (input.decisions !== undefined) {
    await saveTimetableImportDecisions({
      batchId,
      decisions: input.decisions,
    });
  }

  const { operations, slotSystemId } = await buildOperations(batchId);
  await ensureNoActiveSession(slotSystemId);

  const payloadSnapshot = buildSnapshot(operations);

  const [created] = await db
    .insert(commitSessions)
    .values({
      batchId,
      slotSystemId,
      status: "STARTED",
      payloadSnapshot,
      operations,
      createdBy: input.userId,
    })
    .returning({
      id: commitSessions.id,
      batchId: commitSessions.batchId,
      slotSystemId: commitSessions.slotSystemId,
      status: commitSessions.status,
      payloadSnapshot: commitSessions.payloadSnapshot,
      createdAt: commitSessions.createdAt,
      updatedAt: commitSessions.updatedAt,
    });

  if (!created) {
    throw createServiceError(500, "Failed to start commit session");
  }

  return toSummary(created);
}

async function findBookingsAffectedByOperations(
  operations: SessionOperation[],
): Promise<Map<string, number>> {
  const bookingsByOperationId = new Map<string, number>();

  for (const operation of operations) {
    if (operation.kind !== "UPSERT") {
      continue;
    }

    const opStart = new Date(operation.startAt);
    const opEnd = new Date(operation.endAt);

    const overlaps = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.roomId, operation.roomId),
          lt(bookings.startAt, opEnd),
          gt(bookings.endAt, opStart),
          ne(bookings.sourceRef, operation.sourceRef),
        ),
      );

    bookingsByOperationId.set(operation.operationId, overlaps.length);
  }

  return bookingsByOperationId;
}

function computeOperationGroupId(
  operationType: TimetableDiffOperationType,
  attributes: {
    oldRoomId: number | null;
    newRoomId: number | null;
  },
): string {
  let groupKey: string = operationType;

  if (operationType === "CHANGE_SLOT") {
    groupKey = `${operationType}`;
  } else if (operationType === "CHANGE_VENUE") {
    groupKey = `${operationType}_${attributes.oldRoomId}_to_${attributes.newRoomId}`;
  } else if (operationType === "ADD_SLOT") {
    groupKey = `${operationType}_${attributes.newRoomId}`;
  } else if (operationType === "REMOVE_SLOT") {
    groupKey = `${operationType}`;
  }

  return hashValue(groupKey);
}

export async function startEditCommitSession(input: {
  slotSystemId: number;
  expectedVersion: number;
  newState: unknown;
  pruneBookings?: boolean;
  userId: number;
}): Promise<EditCommitSessionStartResponse> {
  const slotSystemId = Number(input.slotSystemId);
  const expectedVersion = Number(input.expectedVersion);

  if (!Number.isInteger(slotSystemId) || slotSystemId <= 0) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    throw createServiceError(400, "expectedVersion must be a positive integer");
  }

  const [slotSystem] = await db
    .select({
      id: slotSystems.id,
      isLocked: slotSystems.isLocked,
      version: slotSystems.version,
      committedSnapshotJson: slotSystems.committedSnapshotJson,
    })
    .from(slotSystems)
    .where(eq(slotSystems.id, slotSystemId))
    .limit(1);

  if (!slotSystem) {
    throw createServiceError(404, "Slot system not found");
  }

  if (!slotSystem.isLocked) {
    throw createServiceError(409, "Edit mode is only available for locked slot systems");
  }

  if (slotSystem.version !== expectedVersion) {
    throw createServiceError(
      409,
      `Version mismatch. Expected ${expectedVersion}, found ${slotSystem.version}`,
    );
  }

  await ensureNoActiveSession(slotSystemId);

  const oldSnapshot =
    parseSnapshotState(slotSystem.committedSnapshotJson, slotSystemId) ??
    (await loadLiveSnapshot(slotSystemId));

  const newSnapshot = parseSnapshotState(input.newState, slotSystemId);

  if (!newSnapshot) {
    throw createServiceError(400, "newState must include days, timeBands, and blocks");
  }

  const diff = computeTimetableDiff({
    oldSnapshot,
    newState: newSnapshot,
  });

  // Safety check for empty diff (no changes detected)
  if (diff.summary.total === 0) {
    return {
      noChanges: true,
      message: "No changes detected",
      diff: {
        summary: {
          total: 0,
          added: 0,
          removed: 0,
          changedSlot: 0,
          changedVenue: 0,
        },
        changedLabels: [],
        operations: [],
        affectedRows: 0,
        unchangedRows: 0,
        expectedVersion,
        currentVersion: slotSystem.version,
        bookingImpact: {
          totalAffectedBookings: 0,
          byOperation: [],
        },
      },
    };
  }

  const editOperationBuild = await buildEditOperations({
    slotSystemId,
    changedLabels: new Set(diff.changedLabels),
    operationTypeByLabel: new Map(
      diff.operations.map((operation) => [operation.normalizedLabel, operation.type]),
    ),
    newSnapshot: diff.newSnapshot,
    pruneBookings: input.pruneBookings === true,
  });

  const operations = editOperationBuild.operations;

  // Calculate booking impacts per operation
  const bookingsByOperationId = await findBookingsAffectedByOperations(operations);
  const totalAffectedBookings = Array.from(bookingsByOperationId.values()).reduce(
    (sum, count) => sum + count,
    0,
  );

  const payloadSnapshot = buildSnapshot(operations);
  const syntheticBatchId = await createSyntheticEditBatch({
    slotSystemId,
    userId: input.userId,
  });

  const metadata: EditSessionMetadata = {
    mode: "EDIT",
    pruneBookings: input.pruneBookings === true,
    expectedVersion,
    changedLabels: diff.changedLabels,
    diffSummary: {
      total: diff.summary.total,
      added: diff.summary.added,
      removed: diff.summary.removed,
      changedSlot: diff.summary.changedSlot,
      changedVenue: diff.summary.changedVenue,
    },
    affectedRows: editOperationBuild.affectedRows,
    unchangedRows: editOperationBuild.unchangedRows,
    newSnapshot: diff.newSnapshot,
  };

  const [created] = await db
    .insert(commitSessions)
    .values({
      batchId: syntheticBatchId,
      slotSystemId,
      status: "STARTED",
      payloadSnapshot,
      operations,
      resolutions: metadata,
      createdBy: input.userId,
    })
    .returning({
      id: commitSessions.id,
      batchId: commitSessions.batchId,
      slotSystemId: commitSessions.slotSystemId,
      status: commitSessions.status,
      payloadSnapshot: commitSessions.payloadSnapshot,
      createdAt: commitSessions.createdAt,
      updatedAt: commitSessions.updatedAt,
    });

  if (!created) {
    throw createServiceError(500, "Failed to start edit commit session");
  }

  // Compute operation groupIds and build preview with booking impact
  const operationsPreview = diff.operations.map((operation) => {
    const operationGroupId = computeOperationGroupId(operation.type, {
      oldRoomId: operation.oldRoomId,
      newRoomId: operation.newRoomId,
    });

    // Find matching session operation to get operationId
    const matchingSessionOp = operations.find(
      (op) => op.courseCode === operation.label,
    );

    const affectedBookings = matchingSessionOp
      ? bookingsByOperationId.get(matchingSessionOp.operationId) ?? 0
      : 0;

    return {
      type: operation.type,
      label: operation.label,
      oldDescriptorCount: operation.oldDescriptors.length,
      newDescriptorCount: operation.newDescriptors.length,
      oldRoomId: operation.oldRoomId,
      newRoomId: operation.newRoomId,
      operationGroupId,
      affectedBookings,
    };
  });

  return {
    session: toSummary(created),
    diff: {
      summary: {
        total: diff.summary.total,
        added: diff.summary.added,
        removed: diff.summary.removed,
        changedSlot: diff.summary.changedSlot,
        changedVenue: diff.summary.changedVenue,
      },
      changedLabels: diff.changedLabels,
      operations: operationsPreview,
      affectedRows: editOperationBuild.affectedRows,
      unchangedRows: editOperationBuild.unchangedRows,
      expectedVersion,
      currentVersion: slotSystem.version,
      bookingImpact: {
        totalAffectedBookings,
        byOperation: operations
          .filter((op) => op.kind === "UPSERT")
          .map((operation) => ({
            operationId: operation.operationId,
            affectedBookings: bookingsByOperationId.get(operation.operationId) ?? 0,
          })),
      },
    },
  };
}

export async function runExternalCheck(commitSessionId: number): Promise<CommitStageReport> {
  const session = await getSessionRow(commitSessionId);

  if (session.status === "CANCELLED" || session.status === "COMPLETED" || session.status === "FAILED") {
    throw createServiceError(400, `Cannot run external check in status ${session.status}`);
  }

  const operations = parseOperations(session.operations);
  const conflicts = await computeExternalConflicts(session.batchId, operations);

  await updateSessionPatch(commitSessionId, {
    externalConflicts: conflicts,
    status: conflicts.length === 0 ? "EXTERNAL_DONE" : session.status,
  });

  return {
    commitSessionId,
    stage: "external",
    conflictCount: conflicts.length,
    conflicts,
  };
}

export async function resolveExternalConflicts(input: {
  commitSessionId: number;
  resolutions: TimetableCommitResolution[];
}): Promise<CommitSessionSummary> {
  const session = await getSessionRow(input.commitSessionId);

  if (session.status !== "STARTED" && session.status !== "EXTERNAL_DONE") {
    throw createServiceError(400, `Cannot resolve external conflicts in status ${session.status}`);
  }

  const operations = parseOperations(session.operations);
  const externalConflicts = parseConflicts(session.externalConflicts);

  const nextOperations = applyConflictResolutions({
    operations,
    conflicts: externalConflicts,
    resolutions: input.resolutions,
    allowedActions: ["SKIP", "CHANGE_ROOM", "CHANGE_SLOT_EXISTING", "CREATE_SLOT_AND_USE"],
  });

  const payloadSnapshot = buildSnapshot(nextOperations);

  const existingResolutions =
    session.resolutions && typeof session.resolutions === "object"
      ? (session.resolutions as Record<string, unknown>)
      : {};

  const nextResolutions = {
    ...existingResolutions,
    external: input.resolutions,
  };

  await updateSessionPatch(input.commitSessionId, {
    operations: nextOperations,
    payloadSnapshot,
    externalConflicts: [],
    resolutions: nextResolutions,
    status: "EXTERNAL_DONE",
  });

  const updated = await getSessionRow(input.commitSessionId);

  return toSummary({
    id: updated.id,
    batchId: updated.batchId,
    slotSystemId: updated.slotSystemId,
    status: updated.status,
    payloadSnapshot: updated.payloadSnapshot,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}

export async function runInternalCheck(commitSessionId: number): Promise<CommitStageReport> {
  const session = await getSessionRow(commitSessionId);

  if (session.status !== "EXTERNAL_DONE" && session.status !== "INTERNAL_DONE") {
    throw createServiceError(400, `Cannot run internal check in status ${session.status}`);
  }

  const operations = parseOperations(session.operations);
  const conflicts = computeInternalConflicts(operations);

  await updateSessionPatch(commitSessionId, {
    internalConflicts: conflicts,
    status: conflicts.length === 0 ? "INTERNAL_DONE" : "EXTERNAL_DONE",
  });

  return {
    commitSessionId,
    stage: "internal",
    conflictCount: conflicts.length,
    conflicts,
  };
}

export async function resolveInternalConflicts(input: {
  commitSessionId: number;
  resolutions: TimetableCommitResolution[];
}): Promise<CommitSessionSummary> {
  const session = await getSessionRow(input.commitSessionId);

  if (session.status !== "EXTERNAL_DONE" && session.status !== "INTERNAL_DONE") {
    throw createServiceError(400, `Cannot resolve internal conflicts in status ${session.status}`);
  }

  const operations = parseOperations(session.operations);
  const internalConflicts = parseConflicts(session.internalConflicts);

  const nextOperations = applyConflictResolutions({
    operations,
    conflicts: internalConflicts,
    resolutions: input.resolutions,
    allowedActions: ["SKIP", "CHANGE_ROOM", "CHANGE_SLOT_EXISTING", "CREATE_SLOT_AND_USE"],
  });

  const payloadSnapshot = buildSnapshot(nextOperations);

  const existingResolutions =
    session.resolutions && typeof session.resolutions === "object"
      ? (session.resolutions as Record<string, unknown>)
      : {};

  const nextResolutions = {
    ...existingResolutions,
    internal: input.resolutions,
  };

  await updateSessionPatch(input.commitSessionId, {
    operations: nextOperations,
    payloadSnapshot,
    internalConflicts: [],
    resolutions: nextResolutions,
    status: "INTERNAL_DONE",
  });

  const updated = await getSessionRow(input.commitSessionId);

  return toSummary({
    id: updated.id,
    batchId: updated.batchId,
    slotSystemId: updated.slotSystemId,
    status: updated.status,
    payloadSnapshot: updated.payloadSnapshot,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}

export async function startFrozenApply(input: {
  commitSessionId: number;
  userId: number;
  userName: string;
}): Promise<CommitSessionSummary> {
  const session = await getSessionRow(input.commitSessionId);

  if (session.status !== "INTERNAL_DONE") {
    throw createServiceError(400, `Cannot start freeze in status ${session.status}`);
  }

  const freezeResult = freezeBookings(session.batchId, input.userId, input.userName);

  if (!freezeResult.ok) {
    throw createServiceError(409, freezeResult.message);
  }

  await updateSessionPatch(input.commitSessionId, {
    status: "FROZEN",
    frozenAt: new Date(),
  });

  const updated = await getSessionRow(input.commitSessionId);

  return toSummary({
    id: updated.id,
    batchId: updated.batchId,
    slotSystemId: updated.slotSystemId,
    status: updated.status,
    payloadSnapshot: updated.payloadSnapshot,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}

export async function runRuntimeCheck(commitSessionId: number): Promise<CommitStageReport> {
  const session = await getSessionRow(commitSessionId);

  if (session.status !== "FROZEN") {
    throw createServiceError(400, `Cannot run runtime check in status ${session.status}`);
  }

  const operations = parseOperations(session.operations);
  const conflicts = await computeRuntimeConflicts(operations);

  await updateSessionPatch(commitSessionId, {
    runtimeConflicts: conflicts,
  });

  return {
    commitSessionId,
    stage: "runtime",
    conflictCount: conflicts.length,
    conflicts,
  };
}

export async function resolveRuntimeConflicts(input: {
  commitSessionId: number;
  resolutions: TimetableCommitResolution[];
}): Promise<CommitSessionSummary> {
  const session = await getSessionRow(input.commitSessionId);

  if (session.status !== "FROZEN") {
    throw createServiceError(400, `Cannot resolve runtime conflicts in status ${session.status}`);
  }

  const operations = parseOperations(session.operations);
  const runtimeConflicts = parseConflicts(session.runtimeConflicts);

  const nextOperations = applyConflictResolutions({
    operations,
    conflicts: runtimeConflicts,
    resolutions: input.resolutions,
    allowedActions: ["SKIP", "FORCE_OVERWRITE", "ALTERNATIVE_ROOM"],
  });

  const payloadSnapshot = buildSnapshot(nextOperations);

  const existingResolutions =
    session.resolutions && typeof session.resolutions === "object"
      ? (session.resolutions as Record<string, unknown>)
      : {};

  const nextResolutions = {
    ...existingResolutions,
    runtime: input.resolutions,
  };

  await updateSessionPatch(input.commitSessionId, {
    operations: nextOperations,
    payloadSnapshot,
    runtimeConflicts: [],
    resolutions: nextResolutions,
  });

  const updated = await getSessionRow(input.commitSessionId);

  return toSummary({
    id: updated.id,
    batchId: updated.batchId,
    slotSystemId: updated.slotSystemId,
    status: updated.status,
    payloadSnapshot: updated.payloadSnapshot,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}

export async function finalizeCommitSession(input: {
  commitSessionId: number;
  userId: number;
}): Promise<{
  commitSessionId: number;
  batchId: number;
  createdBookings: number;
  skippedOperations: number;
  deletedConflictingBookings: number;
}> {
  const session = await getSessionRow(input.commitSessionId);

  if (session.status !== "FROZEN") {
    throw createServiceError(400, `Cannot finalize in status ${session.status}`);
  }

  const operations = parseOperations(session.operations);
  const runtimeConflicts = await computeRuntimeConflicts(operations);

  if (runtimeConflicts.length > 0) {
    await updateSessionPatch(input.commitSessionId, {
      runtimeConflicts,
    });

    throw createServiceError(
      409,
      `Runtime conflicts still remain (${runtimeConflicts.length}). Resolve conflicts before finalizing.`,
    );
  }

  const editMetadata = parseEditSessionMetadata(session.resolutions);
  const activeOperations = operations.filter((operation) => operation.status === "ACTIVE");
  const activeUpsertOperations = activeOperations.filter(
    (operation) => operation.kind === "UPSERT",
  );
  const activeDeleteOnlyOperations = activeOperations.filter(
    (operation) => operation.kind === "DELETE_ONLY",
  );
  const skippedOperations = operations.filter((operation) => operation.status === "SKIPPED").length;

  const deleteBookingIds = Array.from(
    new Set(
      [
        ...activeUpsertOperations.flatMap((operation) => operation.forceOverwriteBookingIds),
        ...activeDeleteOnlyOperations.flatMap((operation) => operation.cleanupBookingIds),
      ],
    ),
  );

  try {
    await db.transaction(async (tx) => {
      if (deleteBookingIds.length > 0) {
        await tx.delete(bookings).where(inArray(bookings.id, deleteBookingIds));
      }

      if (editMetadata) {
        await applySnapshotToSlotSystem({
          tx,
          slotSystemId: session.slotSystemId,
          snapshot: editMetadata.newSnapshot,
        });

        await tx
          .update(slotSystems)
          .set({
            committedSnapshotJson: editMetadata.newSnapshot,
            version: sql`${slotSystems.version} + 1`,
          })
          .where(eq(slotSystems.id, session.slotSystemId));
      }

      for (const operation of activeUpsertOperations) {
        const startAt = new Date(operation.startAt);
        const endAt = new Date(operation.endAt);

        const [createdBooking] = await tx
          .insert(bookings)
          .values({
            roomId: operation.roomId,
            startAt,
            endAt,
            source: "TIMETABLE_ALLOCATION",
            sourceRef: operation.sourceRef,
            approvedBy: input.userId,
            approvedAt: new Date(),
          })
          .returning({ id: bookings.id });

        if (!createdBooking) {
          throw createServiceError(500, "Failed to create booking during finalize");
        }

        const dedupeKey = hashValue(
          `${session.batchId}|${operation.rowId}|${operation.roomId}|${operation.startAt}|${operation.endAt}`,
        );

        const [existingOccurrence] = await tx
          .select({ id: timetableImportOccurrences.id })
          .from(timetableImportOccurrences)
          .where(eq(timetableImportOccurrences.dedupeKey, dedupeKey))
          .limit(1);

        if (existingOccurrence) {
          await tx
            .update(timetableImportOccurrences)
            .set({
              status: "CREATED",
              bookingId: createdBooking.id,
              errorMessage: null,
              roomId: operation.roomId,
              startAt,
              endAt,
              sourceRef: operation.sourceRef,
            })
            .where(eq(timetableImportOccurrences.id, existingOccurrence.id));
        } else {
          await tx.insert(timetableImportOccurrences).values({
            batchId: session.batchId,
            rowId: operation.rowId,
            roomId: operation.roomId,
            startAt,
            endAt,
            source: "TIMETABLE_ALLOCATION",
            sourceRef: operation.sourceRef,
            dedupeKey,
            bookingId: createdBooking.id,
            status: "CREATED",
          });
        }
      }

      await tx
        .update(timetableImportBatches)
        .set({
          status: "COMMITTED",
          committedAt: new Date(),
        })
        .where(eq(timetableImportBatches.id, session.batchId));
    });

    try {
      await lockSlotSystem(session.slotSystemId);
    } catch (lockError) {
      logger.warn("Failed to lock slot system after commit-session finalize", {
        commitSessionId: session.id,
        slotSystemId: session.slotSystemId,
        error: lockError,
      });
    }

    if (!editMetadata) {
      try {
        const latestSnapshot = await loadLiveSnapshot(session.slotSystemId);
        await db
          .update(slotSystems)
          .set({
            committedSnapshotJson: latestSnapshot,
            version: sql`${slotSystems.version} + 1`,
          })
          .where(eq(slotSystems.id, session.slotSystemId));
      } catch (snapshotError) {
        logger.warn("Failed to update slot system snapshot after finalize", {
          commitSessionId: session.id,
          slotSystemId: session.slotSystemId,
          error: snapshotError,
        });
      }
    }

    await updateSessionPatch(input.commitSessionId, {
      status: "COMPLETED",
      runtimeConflicts: [],
    });

    unfreezeBookings(session.batchId);

    return {
      commitSessionId: session.id,
      batchId: session.batchId,
      createdBookings: activeUpsertOperations.length,
      skippedOperations,
      deletedConflictingBookings: deleteBookingIds.length,
    };
  } catch (error) {
    await updateSessionPatch(input.commitSessionId, {
      status: "FAILED",
    });

    unfreezeBookings(session.batchId, true);

    throw error;
  }
}

export async function cancelCommitSession(commitSessionId: number): Promise<{ commitSessionId: number; status: "CANCELLED" }> {
  const session = await getSessionRow(commitSessionId);

  if (session.status === "COMPLETED") {
    throw createServiceError(400, "Cannot cancel a completed commit session");
  }

  if (session.status === "FROZEN") {
    unfreezeBookings(session.batchId, true);
  }

  await updateSessionPatch(commitSessionId, {
    status: "CANCELLED",
  });

  return {
    commitSessionId,
    status: "CANCELLED",
  };
}

export async function getCommitSessionStatus(commitSessionId: number): Promise<CommitSessionSummary> {
  const session = await getSessionRow(commitSessionId);

  return toSummary({
    id: session.id,
    batchId: session.batchId,
    slotSystemId: session.slotSystemId,
    status: session.status,
    payloadSnapshot: session.payloadSnapshot,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
}

export function getFreezeStatusForSession(commitSessionId: number): {
  commitSessionId: number;
  isFrozen: boolean;
  freezeInfo: {
    batchId: number;
    userId: number;
    userName: string;
    startedAt: string;
  } | null;
} {
  const freezeState = getBookingFreezeState();

  return {
    commitSessionId,
    isFrozen: freezeState.isFrozen,
    freezeInfo: freezeState.frozenBy
      ? {
          batchId: freezeState.frozenBy.batchId,
          userId: freezeState.frozenBy.userId,
          userName: freezeState.frozenBy.userName,
          startedAt: freezeState.frozenBy.startedAt.toISOString(),
        }
      : null,
  };
}
