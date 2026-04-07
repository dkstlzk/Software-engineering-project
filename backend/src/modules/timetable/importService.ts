import { createHash } from "crypto";
import { and, asc, desc, eq, inArray, like, sql, lt, gt } from "drizzle-orm";
import XLSX from "xlsx";
import { db } from "../../db";
import {
  bookings,
  buildings,
  rooms,
  timetableImportBatches,
  timetableImportRowResolutions,
  timetableImportRows,
  timetableImportOccurrences,
} from "../../db/schema";
import { createBookingsBulk, hasBookingOverlap } from "../bookings/services/bookingService";
import type { BookingCreateResult } from "../bookings/services/bookingService";
import {
  freezeBookings,
  unfreezeBookings,
  getBookingFreezeState,
  isBookingFrozen,
} from "./services/bookingFreezeService";
import logger from "../../shared/utils/logger";
import { DAY_OF_WEEK_VALUES, slotBlocks, slotDays, slotSystems, slotTimeBands } from "./schema";
import { createBlock, lockSlotSystem } from "./service";

type DayOfWeek = (typeof DAY_OF_WEEK_VALUES)[number];

type PreviewClassification =
  | "VALID_AND_AUTOMATABLE"
  | "UNRESOLVED_SLOT"
  | "UNRESOLVED_ROOM"
  | "AMBIGUOUS_CLASSROOM"
  | "DUPLICATE_ROW"
  | "CONFLICTING_MAPPING"
  | "MISSING_REQUIRED_FIELD"
  | "OTHER_PROCESSING_ERROR";

type ImportDecisionAction = "AUTO" | "RESOLVE" | "SKIP";

type ImportBatchStatus = "PREVIEWED" | "COMMITTED";

type ImportDecisionCreateSlot = {
  dayId: number;
  startBandId: number;
  endBandId: number;
  laneIndex?: number;
  label?: string;
};

type ImportDecisionCreateRoom = {
  buildingName: string;
  roomName: string;
};

type ImportDecision = {
  rowId: number;
  action: ImportDecisionAction;
  resolvedSlotLabel?: string;
  resolvedRoomId?: number;
  createSlot?: ImportDecisionCreateSlot;
  createRoom?: ImportDecisionCreateRoom;
};

type BuildingRoomLookup = Awaited<ReturnType<typeof getBuildingRoomLookup>>;

type SlotSystemStructure = {
  dayById: Map<number, { id: number; laneCount: number }>;
  bandIndexById: Map<number, number>;
};

type SlotDescriptor = {
  label: string;
  normalizedLabel: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  blockId: number;
};

type PreviewRowBuildResult = {
  rowIndex: number;
  rawRow: unknown[];
  rawCourseCode: string;
  rawSlot: string;
  rawClassroom: string;
  normalizedCourseCode: string;
  normalizedSlot: string;
  normalizedClassroom: string;
  classification: PreviewClassification;
  reasons: string[];
  suggestions: string[];
  parsedBuilding: string | null;
  parsedRoom: string | null;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  rowHash: string | null;
  auxiliaryData: Record<string, string>;
};

type PreviewResponseRow = {
  rowId: number;
  rowIndex: number;
  courseCode: string;
  slot: string;
  classroom: string;
  classification: PreviewClassification;
  reasons: string[];
  suggestions: string[];
  parsedBuilding: string | null;
  parsedRoom: string | null;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  auxiliaryData: Record<string, string>;
};

type PreviewReport = {
  batchId: number;
  reused: boolean;
  status: ImportBatchStatus;
  slotSystemId: number;
  termStartDate: string;
  termEndDate: string;
  processedRows: number;
  validRows: number;
  unresolvedRows: number;
  warnings: string[];
  savedDecisions: SavedDecisionSnapshot[];
  rows: PreviewResponseRow[];
  auxiliaryHeaders: string[];
};

type SavedDecisionSnapshot = {
  rowId: number;
  action: ImportDecisionAction;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  createSlot: ImportDecisionCreateSlot | null;
  createRoom: ImportDecisionCreateRoom | null;
  updatedAt: string;
};

type ImportBatchSummary = {
  batchId: number;
  slotSystemId: number;
  slotSystemName: string;
  fileName: string;
  status: ImportBatchStatus;
  validRows: number;
  resolvedRows: number;
  unresolvedRows: number;
  termStartDate: string;
  termEndDate: string;
  createdAt: string;
  committedAt: string | null;
};

type SaveDecisionsReport = {
  batchId: number;
  status: ImportBatchStatus;
  savedDecisions: SavedDecisionSnapshot[];
};

type DeleteImportBatchReport = {
  batchId: number;
  status: "DELETED";
  deletedBookings: number;
};

type CommitRowSummary = {
  rowId: number;
  rowIndex: number;
  classification: PreviewClassification;
  action: ImportDecisionAction;
  created: number;
  failed: number;
  skipped: number;
  alreadyProcessed: number;
  unresolved: number;
  reasons: string[];
  bookingConflictReasons: string[];
};

type CommitConflictItem = {
  rowId: number;
  rowIndex: number;
  occurrenceId: number;
  roomId: number;
  startAt: string;
  endAt: string;
  message: string;
};

type CommitReport = {
  batchId: number;
  status: "COMMITTED" | "ALREADY_COMMITTED";
  processedRows: number;
  autoCreatedBookings: number;
  alreadyProcessedBookings: number;
  failedOccurrences: number;
  unresolvedRows: number;
  skippedRows: number;
  bookingConflictRows: number;
  bookingConflictOccurrences: number;
  conflictingBookings: CommitConflictItem[];
  rowResults: CommitRowSummary[];
  warnings: string[];
};

type ProcessedOccurrenceReport = {
  occurrenceId: number;
  status:
    | "PENDING"
    | "CREATED"
    | "FAILED"
    | "SKIPPED"
    | "UNRESOLVED"
    | "ALREADY_PROCESSED";
  roomId: number;
  startAt: string;
  endAt: string;
  sourceRef: string | null;
  errorMessage: string | null;
  booking: {
    id: number;
    roomId: number;
    startAt: string;
    endAt: string;
    requestId: number | null;
    source:
      | "MANUAL_REQUEST"
      | "TIMETABLE_ALLOCATION"
      | "SLOT_CHANGE"
      | "VENUE_CHANGE";
    sourceRef: string | null;
  } | null;
};

type ProcessedRowReport = {
  rowId: number;
  rowIndex: number;
  classification: PreviewClassification;
  courseCode: string;
  slot: string;
  classroom: string;
  action: ImportDecisionAction;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  createSlot: ImportDecisionCreateSlot | null;
  createRoom: ImportDecisionCreateRoom | null;
  created: number;
  failed: number;
  skipped: number;
  alreadyProcessed: number;
  unresolved: number;
  reasons: string[];
  bookingConflictReasons: string[];
  occurrences: ProcessedOccurrenceReport[];
};

type ProcessedRowsReport = {
  batchId: number;
  status: "PREVIEWED" | "COMMITTED";
  warnings: string[];
  rows: ProcessedRowReport[];
};

export type PreviewImportInput = {
  slotSystemId: number;
  termStartDate: string;
  termEndDate: string;
  aliasMap?: unknown;
  fileName: string;
  fileBuffer: Buffer;
  createdBy?: number;
};

export type CommitImportInput = {
  batchId: number;
  decisions?: unknown;
};

export type ListImportBatchesInput = {
  slotSystemId?: number;
  limit?: number;
};

export type SaveImportDecisionsInput = {
  batchId: number;
  decisions?: unknown;
};

export type DeleteImportBatchInput = {
  batchId: number;
};

export type TransferImportRowInput = {
  sourceBatchId: number;
  rowId: number;
  targetSlotSystemId: number;
  createdBy?: number;
};

export type TransferImportRowReport = {
  sourceBatchId: number;
  sourceRowId: number;
  targetSlotSystemId: number;
  targetBatchId: number;
  targetProcessedRows: number;
  targetBatchStatus: ImportBatchStatus;
};

// ============================================================================
// Conflict Resolution Types
// ============================================================================

export type ConflictResolutionAction = "FORCE_OVERWRITE" | "SKIP" | "ALTERNATIVE_ROOM";

export type DetectedConflict = {
  occurrenceId: number;
  rowId: number;
  rowIndex: number;
  courseCode: string;
  slot: string;
  classroom: string;
  roomId: number;
  roomName: string;
  buildingName: string;
  startAt: string;
  endAt: string;
  conflictingBooking: {
    id: number;
    roomId: number;
    startAt: string;
    endAt: string;
    source: string;
    sourceRef: string | null;
  };
};

export type ConflictResolutionDecision = {
  occurrenceId: number;
  action: ConflictResolutionAction;
  alternativeRoomId?: number;
};

export type ConflictDetectionReport = {
  batchId: number;
  status: "FROZEN" | "NO_CONFLICTS";
  totalOccurrences: number;
  conflictCount: number;
  conflicts: DetectedConflict[];
  frozenAt: string | null;
  frozenBy: {
    userId: number;
    userName: string;
  } | null;
};

export type CommitWithResolutionsInput = {
  batchId: number;
  resolutions: ConflictResolutionDecision[];
};

export type CommitWithResolutionsReport = {
  batchId: number;
  status: "COMMITTED";
  totalOccurrences: number;
  createdBookings: number;
  skippedOccurrences: number;
  overwrittenBookings: number;
  alternativeRoomBookings: number;
  deletedConflictingBookings: number;
  warnings: string[];
  changes: {
    created: Array<{
      occurrenceId: number;
      bookingId: number;
      roomId: number;
      startAt: string;
      endAt: string;
    }>;
    deleted: Array<{
      bookingId: number;
      roomId: number;
      startAt: string;
      endAt: string;
      reason: string;
    }>;
    skipped: Array<{
      occurrenceId: number;
      reason: string;
    }>;
  };
};

type ServiceError = Error & { status: number };

const TIMETABLE_IMPORT_PARSER_VERSION = "2026-04-02-classroom-space-v3";

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

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

const BOOKING_CONFLICT_CODE = "ROOM_OVERLAP";

function isBookingConflictMessage(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }

  return normalizeKey(message).includes("already booked");
}

function toSavedDecisionSignature(decision: SavedDecisionSnapshot | undefined): string {
  if (!decision) {
    return "__MISSING__";
  }

  return JSON.stringify({
    action: decision.action,
    resolvedSlotLabel: decision.resolvedSlotLabel
      ? normalizeSpace(decision.resolvedSlotLabel)
      : null,
    resolvedRoomId: decision.resolvedRoomId ?? null,
    createSlot: decision.createSlot ?? null,
    createRoom: decision.createRoom ?? null,
  });
}

function toDecisionSnapshot(row: {
  rowId: number;
  action: ImportDecisionAction;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  createSlot: ImportDecisionCreateSlot | null;
  createRoom: ImportDecisionCreateRoom | null;
  updatedAt: Date;
}): SavedDecisionSnapshot {
  return {
    rowId: row.rowId,
    action: row.action,
    resolvedSlotLabel: row.resolvedSlotLabel,
    resolvedRoomId: row.resolvedRoomId,
    createSlot: row.createSlot,
    createRoom: row.createRoom,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toDateOnlyString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeCsvValue(value: string): string {
  const sanitized = value.replace(/"/g, '""');

  if (/[",\n]/.test(value)) {
    return `"${sanitized}"`;
  }

  return sanitized;
}

type TransferCsvRow = {
  courseCode: string;
  slot: string;
  classroom: string;
};

function toTransferCsvRow(input: {
  rawCourseCode: string | null;
  rawSlot: string | null;
  rawClassroom: string | null;
}): TransferCsvRow {
  return {
    courseCode: normalizeSpace(input.rawCourseCode ?? ""),
    slot: normalizeSpace(input.rawSlot ?? ""),
    classroom: normalizeSpace(input.rawClassroom ?? ""),
  };
}

function toTransferCsvRowKey(row: TransferCsvRow): string {
  return `${normalizeKey(row.courseCode)}|${normalizeKey(row.slot)}|${normalizeKey(row.classroom)}`;
}

function buildTransferCsvBuffer(rows: TransferCsvRow[]): Buffer {
  const header = "Course Code,Slot,Classroom";
  const lines = rows.map((row) =>
    [row.courseCode, row.slot, row.classroom]
      .map((value) => escapeCsvValue(value))
      .join(","),
  );

  return Buffer.from(`${header}\n${lines.join("\n")}\n`, "utf8");
}

function parseDateOnlyInput(value: string, fieldName: string): Date {
  const trimmed = String(value ?? "").trim();
  const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

  if (dayPattern.test(trimmed)) {
    const [yearStr, monthStr, dayStr] = trimmed.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) {
      throw createServiceError(400, `${fieldName} is invalid`);
    }

    return date;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw createServiceError(400, `${fieldName} is invalid`);
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
}

function parseAliasMap(rawAliasMap: unknown) {
  if (rawAliasMap === undefined || rawAliasMap === null || rawAliasMap === "") {
    return new Map<string, string>();
  }

  let parsed: unknown = rawAliasMap;

  if (typeof rawAliasMap === "string") {
    try {
      parsed = JSON.parse(rawAliasMap);
    } catch {
      throw createServiceError(400, "aliasMap must be valid JSON");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createServiceError(400, "aliasMap must be an object");
  }

  const aliasMap = new Map<string, string>();

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      continue;
    }

    const alias = normalizeKey(key);
    const canonical = normalizeSpace(value);

    if (!alias || !canonical) {
      continue;
    }

    aliasMap.set(alias, canonical);
  }

  return aliasMap;
}

function parseSheetRows(fileBuffer: Buffer, fileName: string): unknown[][] {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(fileBuffer, {
      type: "buffer",
      raw: false,
      cellText: true,
    });
  } catch {
    throw createServiceError(400, "Unable to parse uploaded file");
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw createServiceError(400, "Uploaded file has no sheets");
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  if (!firstSheet) {
    throw createServiceError(400, "Uploaded file has no readable worksheet");
  }

  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][];

  if (rows.length === 0) {
    throw createServiceError(400, `Uploaded file ${fileName} is empty`);
  }

  return rows;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const c1 = normalizeKey(String(row[0] ?? ""));
  const c2 = normalizeKey(String(row[1] ?? ""));
  const c3 = normalizeKey(String(row[2] ?? ""));

  return (
    (c1 === "course code" || c1 === "course") &&
    c2 === "slot" &&
    (c3 === "classroom" || c3 === "room")
  );
}

function getClassroomParts(
  value: string,
  input: {
    buildingByKey: Map<string, { id: number; name: string }>;
    aliasMap: Map<string, string>;
  },
): { building: string; room: string } | null {
  const normalizedValue = normalizeSpace(value);
  if (!normalizedValue) {
    return null;
  }

  // Backward-compatible support for historical uploads that used "Building - Room".
  const delimiterIndex = normalizedValue.indexOf(" - ");
  if (delimiterIndex > 0) {
    const building = normalizeSpace(normalizedValue.slice(0, delimiterIndex));
    const room = normalizeSpace(normalizedValue.slice(delimiterIndex + 3));

    if (building && room) {
      return { building, room };
    }
  }

  // Canonical format: "Building Name RoomNumber".
  const parts = normalizedValue.split(" ").filter(Boolean);
  if (parts.length < 2) {
    // Also accept compact values like "BB102" by splitting trailing room token.
    const compactMatch = normalizedValue.match(/^(.+?)(\d[\w-]*)$/);
    if (!compactMatch) {
      return null;
    }

    const building = normalizeSpace(compactMatch[1] ?? "");
    const room = normalizeSpace(compactMatch[2] ?? "");

    if (!building || !room) {
      return null;
    }

    return { building, room };
  }

  // Prefer splits that resolve to an existing building (or alias -> existing building).
  for (let splitIndex = parts.length - 1; splitIndex >= 1; splitIndex -= 1) {
    const buildingCandidate = normalizeSpace(parts.slice(0, splitIndex).join(" "));
    const roomCandidate = normalizeSpace(parts.slice(splitIndex).join(" "));

    if (!buildingCandidate || !roomCandidate) {
      continue;
    }

    const aliasResolved =
      input.aliasMap.get(normalizeKey(buildingCandidate)) ?? buildingCandidate;

    if (input.buildingByKey.has(normalizeKey(aliasResolved))) {
      return {
        building: buildingCandidate,
        room: roomCandidate,
      };
    }
  }

  // Fallback split: all except last token as building, last token as room.
  const fallbackBuilding = normalizeSpace(parts.slice(0, -1).join(" "));
  const fallbackRoom = normalizeSpace(parts.slice(-1).join(" "));

  if (!fallbackBuilding || !fallbackRoom) {
    return null;
  }

  return {
    building: fallbackBuilding,
    room: fallbackRoom,
  };
}

function toJsDay(dayOfWeek: DayOfWeek): number {
  switch (dayOfWeek) {
    case "SUN":
      return 0;
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

  const hours = Number(hoursRaw ?? "0");
  const minutes = Number(minutesRaw ?? "0");
  const seconds = Number(secondsRaw ?? "0");

  return {
    hours,
    minutes,
    seconds,
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
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}) {
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

async function getSlotDescriptorLookup(slotSystemId: number) {
  const [slotSystem] = await db
    .select({ id: slotSystems.id })
    .from(slotSystems)
    .where(eq(slotSystems.id, slotSystemId))
    .limit(1);

  if (!slotSystem) {
    throw createServiceError(404, "Slot system not found");
  }

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

  const dayById = new Map<number, DayOfWeek>();
  for (const day of days) {
    dayById.set(day.id, day.dayOfWeek);
  }

  const bandIndexById = new Map<number, number>();
  timeBands.forEach((band, index) => {
    bandIndexById.set(band.id, index);
  });

  const descriptorsByLabel = new Map<string, SlotDescriptor[]>();
  const allLabels: string[] = [];

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

    allLabels.push(label);

    const normalizedLabel = normalizeKey(label);
    const descriptor: SlotDescriptor = {
      label,
      normalizedLabel,
      dayOfWeek,
      startTime: String(startBand.startTime),
      endTime: String(endBand.endTime),
      blockId: block.id,
    };

    const existing = descriptorsByLabel.get(normalizedLabel) ?? [];
    existing.push(descriptor);
    descriptorsByLabel.set(normalizedLabel, existing);
  }

  return {
    descriptorsByLabel,
    allLabels,
  };
}

function buildSlotStructureSignature(
  descriptorsByLabel: Map<string, SlotDescriptor[]>,
): string {
  const signatureParts: string[] = [];

  for (const [normalizedLabel, descriptors] of descriptorsByLabel.entries()) {
    const descriptorParts = descriptors
      .map((descriptor) =>
        `${descriptor.dayOfWeek}|${descriptor.startTime}|${descriptor.endTime}`,
      )
      .sort();

    signatureParts.push(`${normalizedLabel}:${descriptorParts.join("&&")}`);
  }

  signatureParts.sort();
  return hashValue(signatureParts.join("||"));
}

async function getBuildingRoomLookup() {
  const [buildingRows, roomRows] = await Promise.all([
    db
      .select({
        id: buildings.id,
        name: buildings.name,
      })
      .from(buildings),
    db
      .select({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
      })
      .from(rooms),
  ]);

  const buildingByKey = new Map<string, { id: number; name: string }>();
  const buildingNameById = new Map<number, string>();

  for (const building of buildingRows) {
    buildingByKey.set(normalizeKey(building.name), { id: building.id, name: building.name });
    buildingNameById.set(building.id, building.name);
  }

  const roomsByBuildingId = new Map<number, Map<string, { id: number; name: string }>>();
  const roomById = new Map<number, { id: number; name: string; buildingId: number }>();

  for (const room of roomRows) {
    roomById.set(room.id, room);

    const perBuilding = roomsByBuildingId.get(room.buildingId) ?? new Map();
    perBuilding.set(normalizeKey(room.name), { id: room.id, name: room.name });
    roomsByBuildingId.set(room.buildingId, perBuilding);
  }

  return {
    buildingByKey,
    roomsByBuildingId,
    roomById,
    allBuildingNames: buildingRows.map((item) => item.name),
    buildingNameById,
  };
}

async function getSlotSystemStructure(slotSystemId: number): Promise<SlotSystemStructure> {
  const [dayRows, timeBands] = await Promise.all([
    db
      .select({
        id: slotDays.id,
        laneCount: slotDays.laneCount,
      })
      .from(slotDays)
      .where(eq(slotDays.slotSystemId, slotSystemId)),
    db
      .select({
        id: slotTimeBands.id,
      })
      .from(slotTimeBands)
      .where(eq(slotTimeBands.slotSystemId, slotSystemId))
      .orderBy(asc(slotTimeBands.startTime), asc(slotTimeBands.endTime), asc(slotTimeBands.id)),
  ]);

  const dayById = new Map<number, { id: number; laneCount: number }>();

  for (const day of dayRows) {
    dayById.set(day.id, {
      id: day.id,
      laneCount: Math.max(1, day.laneCount),
    });
  }

  const bandIndexById = new Map<number, number>();

  timeBands.forEach((band, index) => {
    bandIndexById.set(band.id, index);
  });

  return {
    dayById,
    bandIndexById,
  };
}

async function ensureBuildingByName(input: {
  buildingName: string;
  buildingLookup: BuildingRoomLookup;
}) {
  const buildingName = normalizeSpace(input.buildingName);
  const buildingKey = normalizeKey(buildingName);

  const existingBuilding = input.buildingLookup.buildingByKey.get(buildingKey);
  if (existingBuilding) {
    return existingBuilding;
  }

  try {
    const [created] = await db
      .insert(buildings)
      .values({
        name: buildingName,
      })
      .returning({
        id: buildings.id,
        name: buildings.name,
      });

    if (!created) {
      throw createServiceError(500, "Failed to create building during resolution");
    }

    const createdBuilding = {
      id: created.id,
      name: created.name,
    };

    input.buildingLookup.buildingByKey.set(normalizeKey(createdBuilding.name), createdBuilding);
    input.buildingLookup.buildingNameById.set(createdBuilding.id, createdBuilding.name);

    if (
      !input.buildingLookup.allBuildingNames.some(
        (name) => normalizeKey(name) === normalizeKey(createdBuilding.name),
      )
    ) {
      input.buildingLookup.allBuildingNames.push(createdBuilding.name);
    }

    if (!input.buildingLookup.roomsByBuildingId.has(createdBuilding.id)) {
      input.buildingLookup.roomsByBuildingId.set(createdBuilding.id, new Map());
    }

    return createdBuilding;
  } catch (error: unknown) {
    const pgError = (error as { cause?: { code?: string } }).cause;

    if (pgError?.code !== "23505") {
      throw error;
    }

    const [existing] = await db
      .select({
        id: buildings.id,
        name: buildings.name,
      })
      .from(buildings)
      .where(sql`lower(${buildings.name}) = ${buildingKey}`)
      .limit(1);

    if (!existing) {
      throw error;
    }

    const existingBuilding = {
      id: existing.id,
      name: existing.name,
    };

    input.buildingLookup.buildingByKey.set(normalizeKey(existingBuilding.name), existingBuilding);
    input.buildingLookup.buildingNameById.set(existingBuilding.id, existingBuilding.name);

    if (
      !input.buildingLookup.allBuildingNames.some(
        (name) => normalizeKey(name) === normalizeKey(existingBuilding.name),
      )
    ) {
      input.buildingLookup.allBuildingNames.push(existingBuilding.name);
    }

    if (!input.buildingLookup.roomsByBuildingId.has(existingBuilding.id)) {
      input.buildingLookup.roomsByBuildingId.set(existingBuilding.id, new Map());
    }

    return existingBuilding;
  }
}

async function ensureRoomForDecision(input: {
  createRoom: ImportDecisionCreateRoom;
  buildingLookup: BuildingRoomLookup;
}): Promise<number> {
  const buildingName = normalizeSpace(input.createRoom.buildingName);
  const roomName = normalizeSpace(input.createRoom.roomName);

  if (!buildingName || !roomName) {
    throw createServiceError(400, "createRoom requires buildingName and roomName");
  }

  const building = await ensureBuildingByName({
    buildingName,
    buildingLookup: input.buildingLookup,
  });

  let roomsInBuilding = input.buildingLookup.roomsByBuildingId.get(building.id);
  if (!roomsInBuilding) {
    roomsInBuilding = new Map();
    input.buildingLookup.roomsByBuildingId.set(building.id, roomsInBuilding);
  }

  const normalizedRoomName = normalizeKey(roomName);
  const existingRoom = roomsInBuilding.get(normalizedRoomName);

  if (existingRoom) {
    return existingRoom.id;
  }

  try {
    const [createdRoom] = await db
      .insert(rooms)
      .values({
        name: roomName,
        buildingId: building.id,
      })
      .returning({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
      });

    if (!createdRoom) {
      throw createServiceError(500, "Failed to create room during resolution");
    }

    roomsInBuilding.set(normalizeKey(createdRoom.name), {
      id: createdRoom.id,
      name: createdRoom.name,
    });

    input.buildingLookup.roomById.set(createdRoom.id, {
      id: createdRoom.id,
      name: createdRoom.name,
      buildingId: createdRoom.buildingId,
    });

    return createdRoom.id;
  } catch (error: unknown) {
    const pgError = (error as { cause?: { code?: string } }).cause;

    if (pgError?.code !== "23505") {
      throw error;
    }

    const [existingRoom] = await db
      .select({
        id: rooms.id,
        name: rooms.name,
        buildingId: rooms.buildingId,
      })
      .from(rooms)
      .where(and(eq(rooms.buildingId, building.id), sql`lower(${rooms.name}) = ${normalizedRoomName}`))
      .limit(1);

    if (!existingRoom) {
      throw error;
    }

    roomsInBuilding.set(normalizeKey(existingRoom.name), {
      id: existingRoom.id,
      name: existingRoom.name,
    });

    input.buildingLookup.roomById.set(existingRoom.id, {
      id: existingRoom.id,
      name: existingRoom.name,
      buildingId: existingRoom.buildingId,
    });

    return existingRoom.id;
  }
}

async function ensureSlotForDecision(input: {
  slotSystemId: number;
  createSlot: ImportDecisionCreateSlot;
  defaultLabel: string;
  slotSystemStructure: SlotSystemStructure;
  createdSlotLabelByKey: Map<string, string>;
}): Promise<string> {
  const day = input.slotSystemStructure.dayById.get(input.createSlot.dayId);

  if (!day) {
    throw createServiceError(400, "createSlot.dayId does not belong to the selected slot system");
  }

  const startIndex = input.slotSystemStructure.bandIndexById.get(input.createSlot.startBandId);
  const endIndex = input.slotSystemStructure.bandIndexById.get(input.createSlot.endBandId);

  if (startIndex === undefined || endIndex === undefined) {
    throw createServiceError(400, "createSlot start/end band does not belong to the selected slot system");
  }

  if (endIndex < startIndex) {
    throw createServiceError(400, "createSlot end band must be after or equal to start band");
  }

  const preferredLaneIndex = input.createSlot.laneIndex;

  if (
    preferredLaneIndex !== undefined &&
    (!Number.isInteger(preferredLaneIndex) || preferredLaneIndex < 0)
  ) {
    throw createServiceError(400, "createSlot laneIndex must be a non-negative integer");
  }

  const fallbackLabel = normalizeSpace(input.defaultLabel);
  const label = normalizeSpace(input.createSlot.label ?? fallbackLabel);

  if (!label) {
    throw createServiceError(400, "createSlot label is required");
  }

  const rowSpan = endIndex - startIndex + 1;
  const normalizedLabel = normalizeKey(label);

  const creationKey = [
    input.slotSystemId,
    day.id,
    input.createSlot.startBandId,
    rowSpan,
    normalizedLabel,
  ].join(":");

  const cachedLabel = input.createdSlotLabelByKey.get(creationKey);
  if (cachedLabel) {
    return cachedLabel;
  }

  const existingBlocks = await db
    .select({
      id: slotBlocks.id,
      startBandId: slotBlocks.startBandId,
      rowSpan: slotBlocks.rowSpan,
      laneIndex: slotBlocks.laneIndex,
      label: slotBlocks.label,
    })
    .from(slotBlocks)
    .where(
      and(
        eq(slotBlocks.slotSystemId, input.slotSystemId),
        eq(slotBlocks.dayId, day.id),
      ),
    );

  const existingMatchingBlock = existingBlocks.find(
    (block) =>
      block.startBandId === input.createSlot.startBandId &&
      block.rowSpan === rowSpan &&
      normalizeKey(block.label) === normalizedLabel,
  );

  if (existingMatchingBlock) {
    const existingLabel = normalizeSpace(existingMatchingBlock.label) || label;
    input.createdSlotLabelByKey.set(creationKey, existingLabel);
    return existingLabel;
  }

  const bandCount = input.slotSystemStructure.bandIndexById.size;
  const nextEndIndexExclusive = startIndex + rowSpan;

  const isLaneFree = (candidateLaneIndex: number): boolean => {
    for (const block of existingBlocks) {
      if (block.laneIndex !== candidateLaneIndex) {
        continue;
      }

      const existingStartIndex = input.slotSystemStructure.bandIndexById.get(block.startBandId);
      if (existingStartIndex === undefined) {
        continue;
      }

      const safeExistingRowSpan = Math.max(
        1,
        Math.min(block.rowSpan, bandCount - existingStartIndex),
      );
      const existingEndIndexExclusive = existingStartIndex + safeExistingRowSpan;

      if (startIndex < existingEndIndexExclusive && nextEndIndexExclusive > existingStartIndex) {
        return false;
      }
    }

    return true;
  };

  const laneCandidates: number[] = [];

  if (
    preferredLaneIndex !== undefined &&
    preferredLaneIndex < day.laneCount
  ) {
    laneCandidates.push(preferredLaneIndex);
  }

  for (let lane = 0; lane < day.laneCount; lane += 1) {
    if (!laneCandidates.includes(lane)) {
      laneCandidates.push(lane);
    }
  }

  let laneIndex = laneCandidates.find((lane) => isLaneFree(lane));

  if (laneIndex === undefined) {
    const [updatedDay] = await db
      .update(slotDays)
      .set({
        laneCount: sql`${slotDays.laneCount} + 1`,
      })
      .where(
        and(
          eq(slotDays.id, day.id),
          eq(slotDays.slotSystemId, input.slotSystemId),
        ),
      )
      .returning({
        laneCount: slotDays.laneCount,
      });

    if (!updatedDay) {
      throw createServiceError(500, "Failed to allocate lane for createSlot decision");
    }

    day.laneCount = Math.max(1, updatedDay.laneCount);
    input.slotSystemStructure.dayById.set(day.id, day);
    laneIndex = day.laneCount - 1;
  }

  const createdBlock = await createBlock({
    slotSystemId: input.slotSystemId,
    dayId: day.id,
    startBandId: input.createSlot.startBandId,
    laneIndex,
    rowSpan,
    label,
  });

  if (!createdBlock) {
    throw createServiceError(500, "Failed to create slot block during resolution");
  }

  const createdLabel = normalizeSpace(createdBlock.label) || label;
  input.createdSlotLabelByKey.set(creationKey, createdLabel);

  return createdLabel;
}

function parseCreateSlotDecision(raw: unknown): ImportDecisionCreateSlot | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const source = raw as Record<string, unknown>;

  const dayId = Number(source.dayId);
  const startBandId = Number(source.startBandId);
  const endBandId = Number(source.endBandId);

  if (
    !Number.isInteger(dayId) ||
    dayId <= 0 ||
    !Number.isInteger(startBandId) ||
    startBandId <= 0 ||
    !Number.isInteger(endBandId) ||
    endBandId <= 0
  ) {
    return undefined;
  }

  const laneIndexRaw = source.laneIndex;
  let laneIndex: number | undefined;

  if (laneIndexRaw !== undefined) {
    const parsedLaneIndex = Number(laneIndexRaw);

    if (!Number.isInteger(parsedLaneIndex) || parsedLaneIndex < 0) {
      return undefined;
    }

    laneIndex = parsedLaneIndex;
  }

  const label =
    typeof source.label === "string" ? normalizeSpace(source.label) : "";

  const decision: ImportDecisionCreateSlot = {
    dayId,
    startBandId,
    endBandId,
  };

  if (laneIndex !== undefined) {
    decision.laneIndex = laneIndex;
  }

  if (label) {
    decision.label = label;
  }

  return decision;
}

function parseCreateRoomDecision(raw: unknown): ImportDecisionCreateRoom | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const source = raw as Record<string, unknown>;

  if (typeof source.buildingName !== "string" || typeof source.roomName !== "string") {
    return undefined;
  }

  const buildingName = normalizeSpace(source.buildingName);
  const roomName = normalizeSpace(source.roomName);

  if (!buildingName || !roomName) {
    return undefined;
  }

  return {
    buildingName,
    roomName,
  };
}

function buildSuggestions(candidates: string[], input: string, limit = 5) {
  const target = normalizeKey(input);
  if (!target) {
    return [];
  }

  const scored = candidates
    .map((candidate) => {
      const normalized = normalizeKey(candidate);
      const exact = normalized === target ? 100 : 0;
      const starts = normalized.startsWith(target) ? 40 : 0;
      const contains = normalized.includes(target) ? 20 : 0;
      return {
        candidate,
        score: exact + starts + contains,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate));

  const unique: string[] = [];
  for (const item of scored) {
    if (!unique.includes(item.candidate)) {
      unique.push(item.candidate);
    }

    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

function parseDecisionInput(raw: unknown): Map<number, ImportDecision> {
  if (!Array.isArray(raw)) {
    return new Map();
  }

  const decisions = new Map<number, ImportDecision>();

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const source = item as Record<string, unknown>;
    const rowId = Number(source.rowId);
    const action = String(source.action ?? "").toUpperCase() as ImportDecisionAction;

    if (!Number.isInteger(rowId) || rowId <= 0) {
      continue;
    }

    if (action !== "AUTO" && action !== "RESOLVE" && action !== "SKIP") {
      continue;
    }

    const decision: ImportDecision = {
      rowId,
      action,
    };

    if (typeof source.resolvedSlotLabel === "string") {
      const slot = normalizeSpace(source.resolvedSlotLabel);
      if (slot) {
        decision.resolvedSlotLabel = slot;
      }
    }

    if (source.resolvedRoomId !== undefined) {
      const resolvedRoomId = Number(source.resolvedRoomId);
      if (Number.isInteger(resolvedRoomId) && resolvedRoomId > 0) {
        decision.resolvedRoomId = resolvedRoomId;
      }
    }

    const createSlot = parseCreateSlotDecision(source.createSlot);
    if (createSlot) {
      decision.createSlot = createSlot;
    }

    const createRoom = parseCreateRoomDecision(source.createRoom);
    if (createRoom) {
      decision.createRoom = createRoom;
    }

    decisions.set(rowId, decision);
  }

  return decisions;
}

function toPreviewRowResponse(row: {
  id: number;
  rowIndex: number;
  rawCourseCode: string | null;
  rawSlot: string | null;
  rawClassroom: string | null;
  classification: PreviewClassification;
  reasons: unknown;
  suggestions: unknown;
  parsedBuilding: string | null;
  parsedRoom: string | null;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  auxiliaryData: Record<string, string>;
}): PreviewResponseRow {
  return {
    rowId: row.id,
    rowIndex: row.rowIndex,
    courseCode: row.rawCourseCode ?? "",
    slot: row.rawSlot ?? "",
    classroom: row.rawClassroom ?? "",
    classification: row.classification,
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    suggestions: Array.isArray(row.suggestions) ? (row.suggestions as string[]) : [],
    parsedBuilding: row.parsedBuilding,
    parsedRoom: row.parsedRoom,
    resolvedSlotLabel: row.resolvedSlotLabel,
    resolvedRoomId: row.resolvedRoomId,
    auxiliaryData: row.auxiliaryData,
  };
}

function buildPreviewReportFromRows(input: {
  batchId: number;
  reused: boolean;
  status: ImportBatchStatus;
  slotSystemId: number;
  termStartDate: Date;
  termEndDate: Date;
  warnings: string[];
  savedDecisions: SavedDecisionSnapshot[];
  auxiliaryHeaders: string[];
  rows: Array<{
    id: number;
    rowIndex: number;
    rawCourseCode: string | null;
    rawSlot: string | null;
    rawClassroom: string | null;
    classification: PreviewClassification;
    reasons: unknown;
    suggestions: unknown;
    parsedBuilding: string | null;
    parsedRoom: string | null;
    resolvedSlotLabel: string | null;
    resolvedRoomId: number | null;
    auxiliaryData: Record<string, string>;
  }>;
}): PreviewReport {
  const responseRows = input.rows.map(toPreviewRowResponse);

  const validRows = responseRows.filter(
    (row) => row.classification === "VALID_AND_AUTOMATABLE",
  ).length;

  return {
    batchId: input.batchId,
    reused: input.reused,
    status: input.status,
    slotSystemId: input.slotSystemId,
    termStartDate: input.termStartDate.toISOString(),
    termEndDate: input.termEndDate.toISOString(),
    processedRows: responseRows.length,
    validRows,
    unresolvedRows: responseRows.length - validRows,
    warnings: input.warnings,
    savedDecisions: input.savedDecisions,
    rows: responseRows,
    auxiliaryHeaders: input.auxiliaryHeaders,
  };
}

async function getSavedDecisions(batchId: number): Promise<SavedDecisionSnapshot[]> {
  const rows = await db
    .select({
      rowId: timetableImportRowResolutions.rowId,
      action: timetableImportRowResolutions.action,
      resolvedSlotLabel: timetableImportRowResolutions.resolvedSlotLabel,
      resolvedRoomId: timetableImportRowResolutions.resolvedRoomId,
      createSlot: timetableImportRowResolutions.createSlot,
      createRoom: timetableImportRowResolutions.createRoom,
      updatedAt: timetableImportRowResolutions.updatedAt,
    })
    .from(timetableImportRowResolutions)
    .where(eq(timetableImportRowResolutions.batchId, batchId))
    .orderBy(asc(timetableImportRowResolutions.rowId));

  return rows.map((row) =>
    toDecisionSnapshot({
      rowId: row.rowId,
      action: row.action,
      resolvedSlotLabel: row.resolvedSlotLabel,
      resolvedRoomId: row.resolvedRoomId,
      createSlot: (row.createSlot as ImportDecisionCreateSlot | null | undefined) ?? null,
      createRoom: (row.createRoom as ImportDecisionCreateRoom | null | undefined) ?? null,
      updatedAt: row.updatedAt,
    }),
  );
}

async function fetchBatchPreviewReport(batchId: number, reused: boolean): Promise<PreviewReport> {
  const [batchRows, savedDecisions] = await Promise.all([
    db
      .select({
        id: timetableImportBatches.id,
        slotSystemId: timetableImportBatches.slotSystemId,
        termStartDate: timetableImportBatches.termStartDate,
        termEndDate: timetableImportBatches.termEndDate,
        status: timetableImportBatches.status,
        warnings: timetableImportBatches.warnings,
        auxiliaryHeaders: timetableImportBatches.auxiliaryHeaders,
      })
      .from(timetableImportBatches)
      .where(eq(timetableImportBatches.id, batchId))
      .limit(1),
    getSavedDecisions(batchId),
  ]);

  const batch = batchRows[0];

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status === "PREVIEWED") {
    await synchronizePreviewedBatchRowsWithCurrentStructure({
      batchId: batch.id,
      slotSystemId: batch.slotSystemId,
    });
  }

  const rows = await db
    .select({
      id: timetableImportRows.id,
      rowIndex: timetableImportRows.rowIndex,
      rawCourseCode: timetableImportRows.rawCourseCode,
      rawSlot: timetableImportRows.rawSlot,
      rawClassroom: timetableImportRows.rawClassroom,
      classification: timetableImportRows.classification,
      reasons: timetableImportRows.reasons,
      suggestions: timetableImportRows.suggestions,
      parsedBuilding: timetableImportRows.parsedBuilding,
      parsedRoom: timetableImportRows.parsedRoom,
      resolvedSlotLabel: timetableImportRows.resolvedSlotLabel,
      resolvedRoomId: timetableImportRows.resolvedRoomId,
      auxiliaryData: timetableImportRows.auxiliaryData,
    })
    .from(timetableImportRows)
    .where(eq(timetableImportRows.batchId, batch.id))
    .orderBy(asc(timetableImportRows.rowIndex));

  return buildPreviewReportFromRows({
    batchId: batch.id,
    reused,
    status: batch.status,
    slotSystemId: batch.slotSystemId,
    termStartDate: batch.termStartDate,
    termEndDate: batch.termEndDate,
    warnings: Array.isArray(batch.warnings) ? (batch.warnings as string[]) : [],
    savedDecisions,
    auxiliaryHeaders: Array.isArray(batch.auxiliaryHeaders) ? (batch.auxiliaryHeaders as string[]) : [],
    rows,
  });
}

export async function previewTimetableImport(input: PreviewImportInput): Promise<PreviewReport> {
  if (!input.fileBuffer || input.fileBuffer.length === 0) {
    throw createServiceError(400, "Uploaded file is required");
  }

  const termStartDate = parseDateOnlyInput(input.termStartDate, "termStartDate");
  const termEndDate = parseDateOnlyInput(input.termEndDate, "termEndDate");

  if (termStartDate > termEndDate) {
    throw createServiceError(400, "termStartDate must be before or equal to termEndDate");
  }

  const slotSystemId = Number(input.slotSystemId);
  if (!Number.isInteger(slotSystemId) || slotSystemId <= 0) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  const aliasMap = parseAliasMap(input.aliasMap);
  const rows = parseSheetRows(input.fileBuffer, input.fileName);
  const { descriptorsByLabel, allLabels } = await getSlotDescriptorLookup(slotSystemId);
  const slotStructureSignature = buildSlotStructureSignature(descriptorsByLabel);
  const buildingLookup = await getBuildingRoomLookup();

  const aliasObj: Record<string, string> = {};
  for (const [key, value] of aliasMap.entries()) {
    aliasObj[key] = value;
  }

  const fileHash = hashValue(input.fileBuffer.toString("base64"));
  const fingerprint = hashValue(
    `${TIMETABLE_IMPORT_PARSER_VERSION}|${slotStructureSignature}|${fileHash}|${slotSystemId}|${termStartDate.toISOString()}|${termEndDate.toISOString()}|${JSON.stringify(
      aliasObj,
    )}`,
  );

  const existingBatchesForSystem = await db
    .select({
      id: timetableImportBatches.id,
      fingerprint: timetableImportBatches.fingerprint,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.slotSystemId, slotSystemId))
    .orderBy(desc(timetableImportBatches.createdAt), desc(timetableImportBatches.id));

  const matchingFingerprintBatch = existingBatchesForSystem.find(
    (batch) => batch.fingerprint === fingerprint,
  );

  if (matchingFingerprintBatch) {
    const redundantBatchIds = existingBatchesForSystem
      .filter((batch) => batch.id !== matchingFingerprintBatch.id)
      .map((batch) => batch.id);

    for (const redundantBatchId of redundantBatchIds) {
      await deleteTimetableImportBatch({ batchId: redundantBatchId });
    }

    return fetchBatchPreviewReport(matchingFingerprintBatch.id, true);
  }

  for (const existingBatch of existingBatchesForSystem) {
    await deleteTimetableImportBatch({ batchId: existingBatch.id });
  }

  const warnings: string[] = [];

  const hasHeader = rows.length > 0 && looksLikeHeaderRow(rows[0] ?? []);
  const startIndex = hasHeader ? 1 : 0;

  // Extract auxiliary headers (columns 3+) from header row
  const auxiliaryHeaders: string[] = [];
  if (hasHeader) {
    const headerRow = rows[0] ?? [];
    for (let i = 3; i < headerRow.length; i++) {
      const headerValue = normalizeSpace(String(headerRow[i] ?? ""));
      if (headerValue) {
        auxiliaryHeaders.push(headerValue);
      }
    }
  }

  const seenRowHash = new Map<string, number>();

  const preparedRows: PreviewRowBuildResult[] = [];

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const rowIndex = index + 1;

    const rawCourseCode = normalizeSpace(String(row[0] ?? ""));
    const rawSlot = normalizeSpace(String(row[1] ?? ""));
    const rawClassroom = normalizeSpace(String(row[2] ?? ""));

    // Build auxiliary data by mapping headers to values (columns 3+)
    const auxiliaryData: Record<string, string> = {};
    for (let i = 0; i < auxiliaryHeaders.length; i++) {
      const headerName = auxiliaryHeaders[i];
      const cellValue = normalizeSpace(String(row[i + 3] ?? ""));
      if (headerName && cellValue) {
        auxiliaryData[headerName] = cellValue;
      }
    }

    const isBlankRow = !rawCourseCode && !rawSlot && !rawClassroom;
    if (isBlankRow) {
      warnings.push(`Skipped empty row ${rowIndex}`);
      continue;
    }

    const normalizedCourseCode = normalizeKey(rawCourseCode);
    const normalizedSlot = normalizeKey(rawSlot);
    const normalizedClassroom = normalizeKey(rawClassroom);

    const reasons: string[] = [];
    const suggestions: string[] = [];

    let classification: PreviewClassification = "OTHER_PROCESSING_ERROR";

    let parsedBuilding: string | null = null;
    let parsedRoom: string | null = null;
    let resolvedRoomId: number | null = null;
    let resolvedSlotLabel: string | null = null;

    const hasMissingRequired = !rawCourseCode || !rawSlot || !rawClassroom;
    if (hasMissingRequired) {
      classification = "MISSING_REQUIRED_FIELD";
      reasons.push("Course Code, Slot, and Classroom are required");
    } else {
      const rowHashSource = `${normalizedCourseCode}|${normalizedSlot}|${normalizedClassroom}`;
      const rowHash = hashValue(rowHashSource);

      const duplicateOfRow = seenRowHash.get(rowHash);
      if (duplicateOfRow !== undefined) {
        classification = "DUPLICATE_ROW";
        reasons.push(`Duplicate of row ${duplicateOfRow}`);
      } else {
        seenRowHash.set(rowHash, rowIndex);
      }

      const slotDescriptors = descriptorsByLabel.get(normalizedSlot) ?? [];

      if (slotDescriptors.length === 0) {
        if (classification !== "DUPLICATE_ROW") {
          classification = "UNRESOLVED_SLOT";
        }

        reasons.push("Slot does not exist in selected slot system");
        suggestions.push(...buildSuggestions(allLabels, rawSlot));
      } else {
        resolvedSlotLabel = rawSlot;
      }

      const classroomParts = getClassroomParts(rawClassroom, {
        buildingByKey: buildingLookup.buildingByKey,
        aliasMap,
      });

      if (!classroomParts) {
        if (
          classification !== "DUPLICATE_ROW" &&
          classification !== "UNRESOLVED_SLOT"
        ) {
          classification = "AMBIGUOUS_CLASSROOM";
        }

        reasons.push("Classroom must use canonical format: Building Name RoomNumber");
      } else {
        parsedBuilding = classroomParts.building;
        parsedRoom = classroomParts.room;

        const buildingAliasKey = normalizeKey(parsedBuilding);
        const aliasResolvedBuilding = aliasMap.get(buildingAliasKey) ?? parsedBuilding;
        const buildingMatch = buildingLookup.buildingByKey.get(normalizeKey(aliasResolvedBuilding));

        if (!buildingMatch) {
          if (
            classification !== "DUPLICATE_ROW" &&
            classification !== "UNRESOLVED_SLOT"
          ) {
            classification = "UNRESOLVED_ROOM";
          }

          reasons.push("Building not found");
          suggestions.push(...buildSuggestions(buildingLookup.allBuildingNames, aliasResolvedBuilding));
        } else {
          const roomsInBuilding = buildingLookup.roomsByBuildingId.get(buildingMatch.id) ?? new Map();
          const roomMatch = roomsInBuilding.get(normalizeKey(parsedRoom));

          if (!roomMatch) {
            if (
              classification !== "DUPLICATE_ROW" &&
              classification !== "UNRESOLVED_SLOT"
            ) {
              classification = "UNRESOLVED_ROOM";
            }

            reasons.push("Room not found in resolved building");
            suggestions.push(...buildSuggestions(Array.from(roomsInBuilding.values()).map((item) => item.name), parsedRoom));
          } else {
            resolvedRoomId = roomMatch.id;
          }
        }
      }

      if (
        classification !== "DUPLICATE_ROW" &&
        classification !== "UNRESOLVED_SLOT" &&
        classification !== "AMBIGUOUS_CLASSROOM" &&
        classification !== "UNRESOLVED_ROOM"
      ) {
        classification = "VALID_AND_AUTOMATABLE";
      }

      preparedRows.push({
        rowIndex,
        rawRow: row,
        rawCourseCode,
        rawSlot,
        rawClassroom,
        normalizedCourseCode,
        normalizedSlot,
        normalizedClassroom,
        classification,
        reasons: Array.from(new Set(reasons)),
        suggestions: Array.from(new Set(suggestions)),
        parsedBuilding,
        parsedRoom,
        resolvedSlotLabel,
        resolvedRoomId,
        rowHash,
        auxiliaryData,
      });

      continue;
    }

    preparedRows.push({
      rowIndex,
      rawRow: row,
      rawCourseCode,
      rawSlot,
      rawClassroom,
      normalizedCourseCode,
      normalizedSlot,
      normalizedClassroom,
      classification,
      reasons: Array.from(new Set(reasons)),
      suggestions: Array.from(new Set(suggestions)),
      parsedBuilding,
      parsedRoom,
      resolvedSlotLabel,
      resolvedRoomId,
      rowHash: null,
      auxiliaryData,
    });
  }

  if (preparedRows.length === 0) {
    throw createServiceError(400, "No processable rows found in uploaded file");
  }

  const [insertedBatch] = await db
    .insert(timetableImportBatches)
    .values({
      batchKey: hashValue(`${fingerprint}|${Date.now()}`),
      slotSystemId,
      termStartDate,
      termEndDate,
      fileName: input.fileName,
      fileHash,
      fingerprint,
      aliasMap: aliasObj,
      warnings,
      auxiliaryHeaders,
      status: "PREVIEWED",
      createdBy: input.createdBy ?? null,
    })
    .returning();

  if (!insertedBatch) {
    throw createServiceError(500, "Failed to create import batch");
  }

  const insertedRows = await db
    .insert(timetableImportRows)
    .values(
      preparedRows.map((row) => ({
        batchId: insertedBatch.id,
        rowIndex: row.rowIndex,
        rawRow: row.rawRow,
        rawCourseCode: row.rawCourseCode || null,
        rawSlot: row.rawSlot || null,
        rawClassroom: row.rawClassroom || null,
        normalizedCourseCode: row.normalizedCourseCode || null,
        normalizedSlot: row.normalizedSlot || null,
        normalizedClassroom: row.normalizedClassroom || null,
        classification: row.classification,
        reasons: row.reasons,
        suggestions: row.suggestions,
        parsedBuilding: row.parsedBuilding,
        parsedRoom: row.parsedRoom,
        resolvedSlotLabel: row.resolvedSlotLabel,
        resolvedRoomId: row.resolvedRoomId,
        rowHash: row.rowHash,
        auxiliaryData: row.auxiliaryData,
      })),
    )
    .returning({
      id: timetableImportRows.id,
      rowIndex: timetableImportRows.rowIndex,
      rawCourseCode: timetableImportRows.rawCourseCode,
      rawSlot: timetableImportRows.rawSlot,
      rawClassroom: timetableImportRows.rawClassroom,
      classification: timetableImportRows.classification,
      reasons: timetableImportRows.reasons,
      suggestions: timetableImportRows.suggestions,
      parsedBuilding: timetableImportRows.parsedBuilding,
      parsedRoom: timetableImportRows.parsedRoom,
      resolvedSlotLabel: timetableImportRows.resolvedSlotLabel,
      resolvedRoomId: timetableImportRows.resolvedRoomId,
      auxiliaryData: timetableImportRows.auxiliaryData,
    });

  return buildPreviewReportFromRows({
    batchId: insertedBatch.id,
    reused: false,
    status: insertedBatch.status,
    slotSystemId,
    termStartDate,
    termEndDate,
    warnings,
    savedDecisions: [],
    auxiliaryHeaders,
    rows: insertedRows,
  });
}

export async function listTimetableImportBatches(
  input: ListImportBatchesInput = {},
): Promise<ImportBatchSummary[]> {
  const parsedLimit = Number(input.limit ?? 25);
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 25;

  const parsedSlotSystemId =
    input.slotSystemId === undefined ? undefined : Number(input.slotSystemId);

  if (
    parsedSlotSystemId !== undefined &&
    (!Number.isInteger(parsedSlotSystemId) || parsedSlotSystemId <= 0)
  ) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  const baseQuery = db
    .select({
      batchId: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
      slotSystemName: slotSystems.name,
      fileName: timetableImportBatches.fileName,
      status: timetableImportBatches.status,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      createdAt: timetableImportBatches.createdAt,
      committedAt: timetableImportBatches.committedAt,
    })
    .from(timetableImportBatches)
    .innerJoin(slotSystems, eq(timetableImportBatches.slotSystemId, slotSystems.id));

  const batchSummaryRows =
    parsedSlotSystemId === undefined
      ? await baseQuery
          .orderBy(desc(timetableImportBatches.createdAt), desc(timetableImportBatches.id))
          .limit(limit)
      : await baseQuery
          .where(eq(timetableImportBatches.slotSystemId, parsedSlotSystemId))
          .orderBy(desc(timetableImportBatches.createdAt), desc(timetableImportBatches.id))
          .limit(limit);

  if (batchSummaryRows.length === 0) {
    return [];
  }

  const batchIds = batchSummaryRows.map((row) => row.batchId);

  const [batchRows, resolutionRows] = await Promise.all([
    db
      .select({
        batchId: timetableImportRows.batchId,
        rowId: timetableImportRows.id,
        classification: timetableImportRows.classification,
      })
      .from(timetableImportRows)
      .where(inArray(timetableImportRows.batchId, batchIds)),
    db
      .select({
        batchId: timetableImportRowResolutions.batchId,
        rowId: timetableImportRowResolutions.rowId,
        action: timetableImportRowResolutions.action,
      })
      .from(timetableImportRowResolutions)
      .where(inArray(timetableImportRowResolutions.batchId, batchIds)),
  ]);

  const resolutionActionByBatchRow = new Map<string, ImportDecisionAction>();

  for (const resolution of resolutionRows) {
    resolutionActionByBatchRow.set(
      `${resolution.batchId}:${resolution.rowId}`,
      resolution.action,
    );
  }

  const countsByBatchId = new Map<
    number,
    {
      validRows: number;
      resolvedRows: number;
      unresolvedRows: number;
    }
  >();

  for (const row of batchRows) {
    const counts = countsByBatchId.get(row.batchId) ?? {
      validRows: 0,
      resolvedRows: 0,
      unresolvedRows: 0,
    };

    if (row.classification === "VALID_AND_AUTOMATABLE") {
      counts.validRows += 1;
      countsByBatchId.set(row.batchId, counts);
      continue;
    }

    const action = resolutionActionByBatchRow.get(`${row.batchId}:${row.rowId}`);

    if (action === "RESOLVE") {
      counts.resolvedRows += 1;
    } else {
      counts.unresolvedRows += 1;
    }

    countsByBatchId.set(row.batchId, counts);
  }

  return batchSummaryRows.map((row) => {
    const counts = countsByBatchId.get(row.batchId) ?? {
      validRows: 0,
      resolvedRows: 0,
      unresolvedRows: 0,
    };

    return {
    batchId: row.batchId,
    slotSystemId: row.slotSystemId,
    slotSystemName: row.slotSystemName,
    fileName: row.fileName,
    status: row.status,
    validRows: counts.validRows,
    resolvedRows: counts.resolvedRows,
    unresolvedRows: counts.unresolvedRows,
    termStartDate: row.termStartDate.toISOString(),
    termEndDate: row.termEndDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    committedAt: row.committedAt ? row.committedAt.toISOString() : null,
    };
  });
}

export async function getTimetableImportBatch(batchIdInput: number): Promise<PreviewReport> {
  const batchId = Number(batchIdInput);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  return fetchBatchPreviewReport(batchId, true);
}

export async function saveTimetableImportDecisions(
  input: SaveImportDecisionsInput,
): Promise<SaveDecisionsReport> {
  const batchId = Number(input.batchId);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      status: timetableImportBatches.status,
      slotSystemId: timetableImportBatches.slotSystemId,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status === "PREVIEWED") {
    await synchronizePreviewedBatchRowsWithCurrentStructure({
      batchId,
      slotSystemId: batch.slotSystemId,
    });
  }

  const decisions = parseDecisionInput(input.decisions);

  if (decisions.size === 0) {
    throw createServiceError(400, "At least one valid decision is required");
  }

  const rows = await getBatchRows(batchId);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const rowIdsByNormalizedRawSlot = new Map<string, number[]>();

  for (const row of rows) {
    const normalizedRawSlot = normalizeKey(row.rawSlot ?? "");

    if (!normalizedRawSlot) {
      continue;
    }

    const siblingRowIds = rowIdsByNormalizedRawSlot.get(normalizedRawSlot);

    if (siblingRowIds) {
      siblingRowIds.push(row.id);
      continue;
    }

    rowIdsByNormalizedRawSlot.set(normalizedRawSlot, [row.id]);
  }

  const unknownRowIds = Array.from(decisions.keys()).filter((rowId) => !rowById.has(rowId));

  if (unknownRowIds.length > 0) {
    throw createServiceError(400, `Unknown rowId values: ${unknownRowIds.join(", ")}`);
  }

  const existingResolutionRows = await db
    .select({
      rowId: timetableImportRowResolutions.rowId,
      action: timetableImportRowResolutions.action,
      resolvedRoomId: timetableImportRowResolutions.resolvedRoomId,
      createSlot: timetableImportRowResolutions.createSlot,
      createRoom: timetableImportRowResolutions.createRoom,
    })
    .from(timetableImportRowResolutions)
    .where(eq(timetableImportRowResolutions.batchId, batchId));

  const existingResolutionByRowId = new Map(
    existingResolutionRows.map((row) => [row.rowId, row]),
  );

  const slotSystemStructure = await getSlotSystemStructure(batch.slotSystemId);
  const createdSlotLabelByKey = new Map<string, string>();
  const materializedSlotLabelByRowId = new Map<number, string>();
  const normalizedResolvedSlotLabelByRowId = new Map<number, string>();

  for (const [rowId, decision] of decisions.entries()) {
    if (decision.action !== "RESOLVE" || !decision.createSlot) {
      const normalizedResolvedSlotLabel =
        decision.action === "RESOLVE" && decision.resolvedSlotLabel
          ? normalizeSpace(decision.resolvedSlotLabel)
          : "";

      if (normalizedResolvedSlotLabel) {
        normalizedResolvedSlotLabelByRowId.set(rowId, normalizedResolvedSlotLabel);
      }

      continue;
    }

    const row = rowById.get(rowId);
    if (!row) {
      continue;
    }

    const createdSlotLabel = await ensureSlotForDecision({
      slotSystemId: batch.slotSystemId,
      createSlot: decision.createSlot,
      defaultLabel: decision.resolvedSlotLabel ?? row.resolvedSlotLabel ?? row.rawSlot ?? "",
      slotSystemStructure,
      createdSlotLabelByKey,
    });

    normalizedResolvedSlotLabelByRowId.set(rowId, normalizeSpace(createdSlotLabel));
    materializedSlotLabelByRowId.set(rowId, createdSlotLabel);
  }

  const allDecisions = new Map(decisions);
  const propagatedSlotLabelByRowId = new Map<number, string>();

  for (const [rowId, resolvedSlotLabel] of normalizedResolvedSlotLabelByRowId.entries()) {
    const sourceRow = rowById.get(rowId);
    if (!sourceRow) {
      continue;
    }

    const normalizedSourceRawSlot = normalizeKey(sourceRow.rawSlot ?? "");
    if (!normalizedSourceRawSlot) {
      continue;
    }

    const siblingRowIds = rowIdsByNormalizedRawSlot.get(normalizedSourceRawSlot) ?? [];

    for (const siblingRowId of siblingRowIds) {
      if (siblingRowId === rowId) {
        continue;
      }

      if (decisions.has(siblingRowId)) {
        continue;
      }

      const siblingRow = rowById.get(siblingRowId);
      if (!siblingRow) {
        continue;
      }

      if (siblingRow.classification !== "UNRESOLVED_SLOT") {
        continue;
      }

      const alreadyPropagatedLabel = propagatedSlotLabelByRowId.get(siblingRowId);

      if (alreadyPropagatedLabel && alreadyPropagatedLabel !== resolvedSlotLabel) {
        continue;
      }

      const existingResolution = existingResolutionByRowId.get(siblingRowId);

      if (existingResolution) {
        if (existingResolution.action !== "RESOLVE") {
          continue;
        }

        if (existingResolution.createSlot || existingResolution.createRoom) {
          continue;
        }
      }

      const propagatedDecision: ImportDecision = {
        rowId: siblingRowId,
        action: "RESOLVE",
        resolvedSlotLabel,
      };

      if (
        existingResolution?.resolvedRoomId !== null &&
        existingResolution?.resolvedRoomId !== undefined
      ) {
        propagatedDecision.resolvedRoomId = existingResolution.resolvedRoomId;
      }

      allDecisions.set(siblingRowId, propagatedDecision);

      propagatedSlotLabelByRowId.set(siblingRowId, resolvedSlotLabel);
    }
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    for (const [rowId, decision] of allDecisions.entries()) {
      const row = rowById.get(rowId);

      if (!row) {
        continue;
      }

      const materializedSlotLabel = materializedSlotLabelByRowId.get(rowId);

      const normalizedResolvedSlotLabel = materializedSlotLabel
        ? normalizeSpace(materializedSlotLabel)
        : decision.resolvedSlotLabel
          ? normalizeSpace(decision.resolvedSlotLabel)
          : null;

      const normalizedResolvedRoomId =
        decision.resolvedRoomId !== undefined &&
        Number.isInteger(decision.resolvedRoomId) &&
        decision.resolvedRoomId > 0
          ? decision.resolvedRoomId
          : null;

      const rowUpdatePayload: {
        resolvedSlotLabel?: string | null;
        resolvedRoomId?: number | null;
      } = {};

      if (materializedSlotLabel !== undefined || decision.resolvedSlotLabel !== undefined) {
        rowUpdatePayload.resolvedSlotLabel = normalizedResolvedSlotLabel;
      }

      if (decision.resolvedRoomId !== undefined) {
        rowUpdatePayload.resolvedRoomId = normalizedResolvedRoomId;
      }

      if (Object.keys(rowUpdatePayload).length > 0) {
        await tx
          .update(timetableImportRows)
          .set(rowUpdatePayload)
          .where(eq(timetableImportRows.id, rowId));
      }

      await tx
        .insert(timetableImportRowResolutions)
        .values({
          batchId,
          rowId,
          action: decision.action,
          resolvedSlotLabel: normalizedResolvedSlotLabel,
          resolvedRoomId: normalizedResolvedRoomId,
          createSlot: decision.createSlot ?? null,
          createRoom: decision.createRoom ?? null,
          reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            timetableImportRowResolutions.batchId,
            timetableImportRowResolutions.rowId,
          ],
          set: {
            action: decision.action,
            resolvedSlotLabel: normalizedResolvedSlotLabel,
            resolvedRoomId: normalizedResolvedRoomId,
            createSlot: decision.createSlot ?? null,
            createRoom: decision.createRoom ?? null,
            reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
            updatedAt: now,
          },
        });
    }
  });

  const savedDecisions = await getSavedDecisions(batchId);

  return {
    batchId,
    status: batch.status,
    savedDecisions,
  };
}

async function getBatchLinkedBookingIds(batchId: number): Promise<number[]> {
  const [occurrenceBookingRows, sourceRefBookingRows] = await Promise.all([
    db
      .select({
        bookingId: timetableImportOccurrences.bookingId,
      })
      .from(timetableImportOccurrences)
      .where(eq(timetableImportOccurrences.batchId, batchId)),
    db
      .select({
        id: bookings.id,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.source, "TIMETABLE_ALLOCATION"),
          like(bookings.sourceRef, `batch:${batchId}:%`),
        ),
      ),
  ]);

  const ids = new Set<number>();

  for (const row of occurrenceBookingRows) {
    if (typeof row.bookingId === "number") {
      ids.add(row.bookingId);
    }
  }

  for (const row of sourceRefBookingRows) {
    ids.add(row.id);
  }

  return Array.from(ids);
}

function parseRowIdFromSourceRef(sourceRef: string | null | undefined): number | null {
  if (!sourceRef) {
    return null;
  }

  const match = sourceRef.match(/^batch:\d+:row:(\d+):/);

  if (!match) {
    return null;
  }

  const parsedRowId = Number(match[1]);

  if (!Number.isInteger(parsedRowId) || parsedRowId <= 0) {
    return null;
  }

  return parsedRowId;
}

async function getBatchLinkedBookingIdsForRows(
  batchId: number,
  rowIds: number[],
): Promise<number[]> {
  const uniqueRowIds = Array.from(
    new Set(rowIds.filter((rowId) => Number.isInteger(rowId) && rowId > 0)),
  );

  if (uniqueRowIds.length === 0) {
    return [];
  }

  const rowIdSet = new Set(uniqueRowIds);

  const [occurrenceBookingRows, sourceRefBookingRows] = await Promise.all([
    db
      .select({
        bookingId: timetableImportOccurrences.bookingId,
      })
      .from(timetableImportOccurrences)
      .where(
        and(
          eq(timetableImportOccurrences.batchId, batchId),
          inArray(timetableImportOccurrences.rowId, uniqueRowIds),
        ),
      ),
    db
      .select({
        id: bookings.id,
        sourceRef: bookings.sourceRef,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.source, "TIMETABLE_ALLOCATION"),
          like(bookings.sourceRef, `batch:${batchId}:row:%`),
        ),
      ),
  ]);

  const ids = new Set<number>();

  for (const row of occurrenceBookingRows) {
    if (typeof row.bookingId === "number") {
      ids.add(row.bookingId);
    }
  }

  for (const row of sourceRefBookingRows) {
    const sourceRowId = parseRowIdFromSourceRef(row.sourceRef);

    if (sourceRowId && rowIdSet.has(sourceRowId)) {
      ids.add(row.id);
    }
  }

  return Array.from(ids);
}

async function resetRowsForReallocation(
  batchId: number,
  rowIds: number[],
): Promise<{ deletedBookings: number }> {
  const uniqueRowIds = Array.from(
    new Set(rowIds.filter((rowId) => Number.isInteger(rowId) && rowId > 0)),
  );

  if (uniqueRowIds.length === 0) {
    return {
      deletedBookings: 0,
    };
  }

  const bookingIds = await getBatchLinkedBookingIdsForRows(batchId, uniqueRowIds);
  const now = new Date();

  await db.transaction(async (tx) => {
    if (bookingIds.length > 0) {
      await tx.delete(bookings).where(inArray(bookings.id, bookingIds));
    }

    await tx
      .delete(timetableImportOccurrences)
      .where(
        and(
          eq(timetableImportOccurrences.batchId, batchId),
          inArray(timetableImportOccurrences.rowId, uniqueRowIds),
        ),
      );

    await tx
      .update(timetableImportRowResolutions)
      .set({
        createdCount: 0,
        failedCount: 0,
        skippedCount: 0,
        alreadyProcessedCount: 0,
        unresolvedCount: 0,
        reasons: sql`'[]'::jsonb`,
        updatedAt: now,
      })
      .where(
        and(
          eq(timetableImportRowResolutions.batchId, batchId),
          inArray(timetableImportRowResolutions.rowId, uniqueRowIds),
        ),
      );
  });

  return {
    deletedBookings: bookingIds.length,
  };
}

export async function recomputeCommittedBatchRows(input: {
  batchId: number;
  rowIds: number[];
}): Promise<{
  batchId: number;
  targetRows: number;
  deletedBookings: number;
  warnings: string[];
}> {
  const batchId = Number(input.batchId);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  const targetRowIds = Array.from(
    new Set(
      (input.rowIds ?? []).filter(
        (rowId) => Number.isInteger(rowId) && rowId > 0,
      ),
    ),
  );

  if (targetRowIds.length === 0) {
    return {
      batchId,
      targetRows: 0,
      deletedBookings: 0,
      warnings: ["No affected rows detected for recomputation."],
    };
  }

  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      status: timetableImportBatches.status,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status !== "COMMITTED") {
    throw createServiceError(409, "Only committed batches can be recomputed");
  }

  const resetResult = await resetRowsForReallocation(batchId, targetRowIds);

  const commitReport = await commitTimetableImport(
    { batchId },
    {
      allowCommittedBatch: true,
      targetRowIds,
    },
  );

  const warnings = [...commitReport.warnings];

  if (commitReport.failedOccurrences > 0) {
    warnings.push(
      `Recompute finished with ${commitReport.failedOccurrences} failed occurrence(s).`,
    );
  }

  if (commitReport.unresolvedRows > 0) {
    warnings.push(`Recompute left ${commitReport.unresolvedRows} unresolved row(s).`);
  }

  return {
    batchId,
    targetRows: targetRowIds.length,
    deletedBookings: resetResult.deletedBookings,
    warnings,
  };
}

export async function reallocateTimetableImport(input: CommitImportInput): Promise<CommitReport> {
  const batchId = Number(input.batchId);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      status: timetableImportBatches.status,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status !== "COMMITTED") {
    throw createServiceError(409, "Only committed batches can be reallocated");
  }

  const beforeSavedDecisionByRowId = new Map(
    (await getSavedDecisions(batchId)).map((decision) => [decision.rowId, decision]),
  );

  if (input.decisions !== undefined) {
    await saveTimetableImportDecisions({
      batchId,
      decisions: input.decisions,
    });
  }

  const afterSavedDecisionByRowId = new Map(
    (await getSavedDecisions(batchId)).map((decision) => [decision.rowId, decision]),
  );

  const changedRowIds: number[] = [];
  const candidateRowIds = new Set<number>([
    ...beforeSavedDecisionByRowId.keys(),
    ...afterSavedDecisionByRowId.keys(),
  ]);

  for (const rowId of candidateRowIds) {
    const beforeSignature = toSavedDecisionSignature(beforeSavedDecisionByRowId.get(rowId));
    const afterSignature = toSavedDecisionSignature(afterSavedDecisionByRowId.get(rowId));

    if (beforeSignature !== afterSignature) {
      changedRowIds.push(rowId);
    }
  }

  if (changedRowIds.length === 0) {
    const committedReport = await buildCommittedReport(batchId);

    return {
      ...committedReport,
      warnings: [...committedReport.warnings, "No changed rows detected. Reallocation skipped."],
    };
  }

  await resetRowsForReallocation(batchId, changedRowIds);

  return commitTimetableImport({
    batchId,
  }, {
    allowCommittedBatch: true,
    targetRowIds: changedRowIds,
  });
}

export async function deleteTimetableImportBatch(
  input: DeleteImportBatchInput,
): Promise<DeleteImportBatchReport> {
  const batchId = Number(input.batchId);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  const bookingIds = await getBatchLinkedBookingIds(batchId);

  await db.transaction(async (tx) => {
    if (bookingIds.length > 0) {
      await tx.delete(bookings).where(inArray(bookings.id, bookingIds));
    }

    await tx
      .delete(timetableImportBatches)
      .where(eq(timetableImportBatches.id, batchId));
  });

  return {
    batchId,
    status: "DELETED",
    deletedBookings: bookingIds.length,
  };
}

export async function transferTimetableImportRow(
  input: TransferImportRowInput,
): Promise<TransferImportRowReport> {
  const sourceBatchId = Number(input.sourceBatchId);
  const sourceRowId = Number(input.rowId);
  const targetSlotSystemId = Number(input.targetSlotSystemId);

  if (!Number.isInteger(sourceBatchId) || sourceBatchId <= 0) {
    throw createServiceError(400, "Invalid sourceBatchId");
  }

  if (!Number.isInteger(sourceRowId) || sourceRowId <= 0) {
    throw createServiceError(400, "Invalid rowId");
  }

  if (!Number.isInteger(targetSlotSystemId) || targetSlotSystemId <= 0) {
    throw createServiceError(400, "Invalid targetSlotSystemId");
  }

  const [sourceBatch] = await db
    .select({
      id: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      aliasMap: timetableImportBatches.aliasMap,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, sourceBatchId))
    .limit(1);

  if (!sourceBatch) {
    throw createServiceError(404, "Source import batch not found");
  }

  if (sourceBatch.slotSystemId === targetSlotSystemId) {
    throw createServiceError(400, "Target slot system must differ from source slot system");
  }

  const [sourceRow] = await db
    .select({
      id: timetableImportRows.id,
      rawCourseCode: timetableImportRows.rawCourseCode,
      rawSlot: timetableImportRows.rawSlot,
      rawClassroom: timetableImportRows.rawClassroom,
    })
    .from(timetableImportRows)
    .where(
      and(
        eq(timetableImportRows.batchId, sourceBatchId),
        eq(timetableImportRows.id, sourceRowId),
      ),
    )
    .limit(1);

  if (!sourceRow) {
    throw createServiceError(404, "Row not found in source import batch");
  }

  const transferSourceRow = toTransferCsvRow(sourceRow);

  if (!transferSourceRow.courseCode || !transferSourceRow.slot || !transferSourceRow.classroom) {
    throw createServiceError(
      400,
      "Transferred row must include Course Code, Slot, and Classroom",
    );
  }

  const [targetLinkedBatch] = await db
    .select({
      id: timetableImportBatches.id,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      aliasMap: timetableImportBatches.aliasMap,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.slotSystemId, targetSlotSystemId))
    .orderBy(desc(timetableImportBatches.createdAt), desc(timetableImportBatches.id))
    .limit(1);

  const targetLinkedRows =
    targetLinkedBatch === undefined
      ? []
      : await db
          .select({
            rawCourseCode: timetableImportRows.rawCourseCode,
            rawSlot: timetableImportRows.rawSlot,
            rawClassroom: timetableImportRows.rawClassroom,
          })
          .from(timetableImportRows)
          .where(eq(timetableImportRows.batchId, targetLinkedBatch.id))
          .orderBy(asc(timetableImportRows.rowIndex));

  const mergedRows: TransferCsvRow[] = [];
  const seenKeys = new Set<string>();

  for (const existingRow of targetLinkedRows) {
    const nextRow = toTransferCsvRow(existingRow);

    if (!nextRow.courseCode || !nextRow.slot || !nextRow.classroom) {
      continue;
    }

    const key = toTransferCsvRowKey(nextRow);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    mergedRows.push(nextRow);
  }

  const sourceKey = toTransferCsvRowKey(transferSourceRow);

  if (!seenKeys.has(sourceKey)) {
    seenKeys.add(sourceKey);
    mergedRows.push(transferSourceRow);
  }

  if (mergedRows.length === 0) {
    throw createServiceError(400, "No transferable rows available for target slot system");
  }

  const selectedAliasMapRaw =
    targetLinkedBatch?.aliasMap ?? sourceBatch.aliasMap ?? {};
  const parsedAliasMap = parseAliasMap(selectedAliasMapRaw);
  const aliasMap: Record<string, string> = {};

  for (const [key, value] of parsedAliasMap.entries()) {
    aliasMap[key] = value;
  }

  const previewInput: PreviewImportInput = {
    slotSystemId: targetSlotSystemId,
    termStartDate: toDateOnlyString(
      targetLinkedBatch?.termStartDate ?? sourceBatch.termStartDate,
    ),
    termEndDate: toDateOnlyString(
      targetLinkedBatch?.termEndDate ?? sourceBatch.termEndDate,
    ),
    aliasMap,
    fileName: `transfer-row-${sourceBatchId}-${sourceRowId}.csv`,
    fileBuffer: buildTransferCsvBuffer(mergedRows),
  };

  if (input.createdBy !== undefined) {
    previewInput.createdBy = input.createdBy;
  }

  const targetReport = await previewTimetableImport(previewInput);

  await saveTimetableImportDecisions({
    batchId: sourceBatchId,
    decisions: [
      {
        rowId: sourceRowId,
        action: "SKIP",
      },
    ],
  });

  return {
    sourceBatchId,
    sourceRowId,
    targetSlotSystemId,
    targetBatchId: targetReport.batchId,
    targetProcessedRows: targetReport.processedRows,
    targetBatchStatus: targetReport.status,
  };
}

async function getBatchRows(batchId: number) {
  return db
    .select({
      id: timetableImportRows.id,
      rowIndex: timetableImportRows.rowIndex,
      classification: timetableImportRows.classification,
      reasons: timetableImportRows.reasons,
      rawCourseCode: timetableImportRows.rawCourseCode,
      rawSlot: timetableImportRows.rawSlot,
      rawClassroom: timetableImportRows.rawClassroom,
      parsedBuilding: timetableImportRows.parsedBuilding,
      parsedRoom: timetableImportRows.parsedRoom,
      resolvedSlotLabel: timetableImportRows.resolvedSlotLabel,
      resolvedRoomId: timetableImportRows.resolvedRoomId,
      auxiliaryData: timetableImportRows.auxiliaryData,
    })
    .from(timetableImportRows)
    .where(eq(timetableImportRows.batchId, batchId))
    .orderBy(asc(timetableImportRows.rowIndex));
}

function getClassificationReasonsForCurrentStructure(
  classification: PreviewClassification,
  fallbackReasons: string[],
): string[] {
  if (classification === "VALID_AND_AUTOMATABLE") {
    return [];
  }

  if (classification === "UNRESOLVED_SLOT") {
    return ["Slot does not exist in selected slot system"];
  }

  if (classification === "UNRESOLVED_ROOM") {
    return ["Room not found in resolved building"];
  }

  if (classification === "AMBIGUOUS_CLASSROOM") {
    return ["Classroom must use canonical format: Building Name RoomNumber"];
  }

  return fallbackReasons;
}

async function synchronizePreviewedBatchRowsWithCurrentStructure(input: {
  batchId: number;
  slotSystemId: number;
}): Promise<void> {
  const rows = await getBatchRows(input.batchId);

  if (rows.length === 0) {
    return;
  }

  const [slotLookup, buildingLookup] = await Promise.all([
    getSlotDescriptorLookup(input.slotSystemId),
    getBuildingRoomLookup(),
  ]);

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (
        row.classification !== "UNRESOLVED_SLOT" &&
        row.classification !== "VALID_AND_AUTOMATABLE"
      ) {
        continue;
      }

      const normalizedRawSlot = normalizeSpace(row.rawSlot ?? "");
      const normalizedCurrentResolvedSlot = row.resolvedSlotLabel
        ? normalizeSpace(row.resolvedSlotLabel)
        : "";
      const effectiveSlotLabel = normalizedCurrentResolvedSlot || normalizedRawSlot;

      const hasEffectiveSlot =
        effectiveSlotLabel.length > 0 &&
        (slotLookup.descriptorsByLabel.get(normalizeKey(effectiveSlotLabel))?.length ?? 0) > 0;

      const hasResolvedRoom =
        typeof row.resolvedRoomId === "number" &&
        buildingLookup.roomById.has(row.resolvedRoomId);

      let nextClassification: PreviewClassification = row.classification;

      if (row.classification === "UNRESOLVED_SLOT") {
        if (!hasEffectiveSlot) {
          nextClassification = "UNRESOLVED_SLOT";
        } else if (hasResolvedRoom) {
          nextClassification = "VALID_AND_AUTOMATABLE";
        } else if (row.parsedBuilding && row.parsedRoom) {
          nextClassification = "UNRESOLVED_ROOM";
        } else {
          nextClassification = "AMBIGUOUS_CLASSROOM";
        }
      } else if (row.classification === "VALID_AND_AUTOMATABLE") {
        if (!hasEffectiveSlot) {
          nextClassification = "UNRESOLVED_SLOT";
        } else if (!hasResolvedRoom) {
          nextClassification = row.parsedBuilding && row.parsedRoom
            ? "UNRESOLVED_ROOM"
            : "AMBIGUOUS_CLASSROOM";
        }
      }

      const normalizedStoredResolvedSlotLabel = row.resolvedSlotLabel
        ? normalizeSpace(row.resolvedSlotLabel)
        : null;

      const nextResolvedSlotLabel =
        hasEffectiveSlot &&
        !normalizedCurrentResolvedSlot &&
        normalizedRawSlot.length > 0
          ? normalizedRawSlot
          : normalizedStoredResolvedSlotLabel;

      const classificationChanged = nextClassification !== row.classification;
      const resolvedSlotChanged = nextResolvedSlotLabel !== normalizedStoredResolvedSlotLabel;

      if (!classificationChanged && !resolvedSlotChanged) {
        continue;
      }

      const updatePayload: {
        classification?: PreviewClassification;
        reasons?: string[];
        resolvedSlotLabel?: string | null;
      } = {};

      if (classificationChanged) {
        updatePayload.classification = nextClassification;
        updatePayload.reasons = getClassificationReasonsForCurrentStructure(
          nextClassification,
          Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
        );
      }

      if (resolvedSlotChanged) {
        updatePayload.resolvedSlotLabel = nextResolvedSlotLabel;
      }

      await tx
        .update(timetableImportRows)
        .set(updatePayload)
        .where(eq(timetableImportRows.id, row.id));
    }
  });
}

type RowResolutionPersistRecord = {
  action: ImportDecisionAction;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  createSlot: ImportDecisionCreateSlot | null;
  createRoom: ImportDecisionCreateRoom | null;
};

async function persistRowResolution(input: {
  batchId: number;
  rowSummary: CommitRowSummary;
  resolution: RowResolutionPersistRecord;
}) {
  const now = new Date();

  await db
    .insert(timetableImportRowResolutions)
    .values({
      batchId: input.batchId,
      rowId: input.rowSummary.rowId,
      action: input.resolution.action,
      resolvedSlotLabel: input.resolution.resolvedSlotLabel,
      resolvedRoomId: input.resolution.resolvedRoomId,
      createSlot: input.resolution.createSlot,
      createRoom: input.resolution.createRoom,
      createdCount: input.rowSummary.created,
      failedCount: input.rowSummary.failed,
      skippedCount: input.rowSummary.skipped,
      alreadyProcessedCount: input.rowSummary.alreadyProcessed,
      unresolvedCount: input.rowSummary.unresolved,
      reasons: Array.from(new Set(input.rowSummary.reasons)),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        timetableImportRowResolutions.batchId,
        timetableImportRowResolutions.rowId,
      ],
      set: {
        action: input.resolution.action,
        resolvedSlotLabel: input.resolution.resolvedSlotLabel,
        resolvedRoomId: input.resolution.resolvedRoomId,
        createSlot: input.resolution.createSlot,
        createRoom: input.resolution.createRoom,
        createdCount: input.rowSummary.created,
        failedCount: input.rowSummary.failed,
        skippedCount: input.rowSummary.skipped,
        alreadyProcessedCount: input.rowSummary.alreadyProcessed,
        unresolvedCount: input.rowSummary.unresolved,
        reasons: Array.from(new Set(input.rowSummary.reasons)),
        updatedAt: now,
      },
    });
}

async function buildCommittedReport(batchId: number): Promise<CommitReport> {
  const [rows, occurrences, storedResolutions] = await Promise.all([
    getBatchRows(batchId),
    db
      .select({
        occurrenceId: timetableImportOccurrences.id,
        rowId: timetableImportOccurrences.rowId,
        status: timetableImportOccurrences.status,
        roomId: timetableImportOccurrences.roomId,
        startAt: timetableImportOccurrences.startAt,
        endAt: timetableImportOccurrences.endAt,
        bookingId: timetableImportOccurrences.bookingId,
        errorMessage: timetableImportOccurrences.errorMessage,
      })
      .from(timetableImportOccurrences)
      .where(eq(timetableImportOccurrences.batchId, batchId)),
    db
      .select({
        rowId: timetableImportRowResolutions.rowId,
        action: timetableImportRowResolutions.action,
        createdCount: timetableImportRowResolutions.createdCount,
        failedCount: timetableImportRowResolutions.failedCount,
        skippedCount: timetableImportRowResolutions.skippedCount,
        alreadyProcessedCount: timetableImportRowResolutions.alreadyProcessedCount,
        unresolvedCount: timetableImportRowResolutions.unresolvedCount,
        reasons: timetableImportRowResolutions.reasons,
      })
      .from(timetableImportRowResolutions)
      .where(eq(timetableImportRowResolutions.batchId, batchId)),
  ]);

  const resolutionByRowId = new Map(
    storedResolutions.map((resolution) => [resolution.rowId, resolution]),
  );

  const summaryByRowId = new Map<number, CommitRowSummary>();
  const conflictingBookings: CommitConflictItem[] = [];

  for (const row of rows) {
    const storedResolution = resolutionByRowId.get(row.id);

    summaryByRowId.set(row.id, {
      rowId: row.id,
      rowIndex: row.rowIndex,
      classification: row.classification,
      action:
        storedResolution?.action ??
        (row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP"),
      created: storedResolution?.createdCount ?? 0,
      failed: storedResolution?.failedCount ?? 0,
      skipped: storedResolution?.skippedCount ?? 0,
      alreadyProcessed: storedResolution?.alreadyProcessedCount ?? 0,
      unresolved:
        storedResolution?.unresolvedCount ??
        (row.classification === "VALID_AND_AUTOMATABLE" ? 0 : 1),
      reasons: storedResolution
        ? Array.isArray(storedResolution.reasons)
          ? [...(storedResolution.reasons as string[])]
          : []
        : Array.isArray(row.reasons)
          ? (row.reasons as string[])
          : [],
      bookingConflictReasons: [],
    });
  }

  for (const occurrence of occurrences) {
    const rowSummary = summaryByRowId.get(occurrence.rowId);
    if (!rowSummary) {
      continue;
    }

    const isBookingConflict =
      occurrence.status === "FAILED" && isBookingConflictMessage(occurrence.errorMessage);

    if (isBookingConflict && occurrence.errorMessage) {
      rowSummary.bookingConflictReasons.push(occurrence.errorMessage);
      conflictingBookings.push({
        rowId: occurrence.rowId,
        rowIndex: rowSummary.rowIndex,
        occurrenceId: occurrence.occurrenceId,
        roomId: occurrence.roomId,
        startAt: occurrence.startAt.toISOString(),
        endAt: occurrence.endAt.toISOString(),
        message: occurrence.errorMessage,
      });
    }

    if (resolutionByRowId.has(occurrence.rowId)) {
      continue;
    }

    if (occurrence.status === "CREATED") {
      rowSummary.created += 1;
    } else if (occurrence.status === "ALREADY_PROCESSED") {
      rowSummary.alreadyProcessed += 1;
    } else if (occurrence.status === "SKIPPED") {
      rowSummary.skipped += 1;
    } else {
      rowSummary.failed += 1;
      if (occurrence.errorMessage && !isBookingConflict) {
        rowSummary.reasons.push(occurrence.errorMessage);
      }
    }
  }

  const rowResults = Array.from(summaryByRowId.values()).sort((a, b) => a.rowIndex - b.rowIndex);

  for (const row of rowResults) {
    row.reasons = Array.from(new Set(row.reasons));
    row.bookingConflictReasons = Array.from(new Set(row.bookingConflictReasons));
  }

  const autoCreatedBookings = rowResults.reduce((sum, row) => sum + row.created, 0);
  const alreadyProcessedBookings = rowResults.reduce((sum, row) => sum + row.alreadyProcessed, 0);
  const failedOccurrences = rowResults.reduce((sum, row) => sum + row.failed, 0);
  const unresolvedRows = rowResults.filter((row) => row.unresolved > 0).length;
  const skippedRows = rowResults.filter((row) => row.skipped > 0 || row.action === "SKIP").length;
  const bookingConflictRows = rowResults.filter(
    (row) => row.bookingConflictReasons.length > 0,
  ).length;
  const bookingConflictOccurrences = rowResults.reduce(
    (sum, row) => sum + row.bookingConflictReasons.length,
    0,
  );

  return {
    batchId,
    status: "ALREADY_COMMITTED",
    processedRows: rowResults.length,
    autoCreatedBookings,
    alreadyProcessedBookings,
    failedOccurrences,
    unresolvedRows,
    skippedRows,
    bookingConflictRows,
    bookingConflictOccurrences,
    conflictingBookings,
    rowResults,
    warnings: [],
  };
}

type CommitExecutionOptions = {
  allowCommittedBatch?: boolean;
  targetRowIds?: number[];
};

export async function commitTimetableImport(
  input: CommitImportInput,
  options: CommitExecutionOptions = {},
): Promise<CommitReport> {
  const batchId = Number(input.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  const explicitDecisions = parseDecisionInput(input.decisions);
  const targetRowIdSet =
    Array.isArray(options.targetRowIds) && options.targetRowIds.length > 0
      ? new Set(
          options.targetRowIds.filter(
            (rowId) => Number.isInteger(rowId) && rowId > 0,
          ),
        )
      : null;

  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      status: timetableImportBatches.status,
      warnings: timetableImportBatches.warnings,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status === "COMMITTED" && !options.allowCommittedBatch) {
    return buildCommittedReport(batchId);
  }

  if (batch.status === "PREVIEWED") {
    await synchronizePreviewedBatchRowsWithCurrentStructure({
      batchId,
      slotSystemId: batch.slotSystemId,
    });
  }

  const decisions = new Map<number, ImportDecision>();
  const savedDecisions = await getSavedDecisions(batchId);

  for (const saved of savedDecisions) {
    decisions.set(saved.rowId, {
      rowId: saved.rowId,
      action: saved.action,
      ...(saved.resolvedSlotLabel ? { resolvedSlotLabel: saved.resolvedSlotLabel } : {}),
      ...(saved.resolvedRoomId ? { resolvedRoomId: saved.resolvedRoomId } : {}),
      ...(saved.createSlot ? { createSlot: saved.createSlot } : {}),
      ...(saved.createRoom ? { createRoom: saved.createRoom } : {}),
    });
  }

  for (const [rowId, decision] of explicitDecisions.entries()) {
    decisions.set(rowId, decision);
  }

  const batchRows = await getBatchRows(batchId);
  const rows = targetRowIdSet
    ? batchRows.filter((row) => targetRowIdSet.has(row.id))
    : batchRows;
  let slotLookup = await getSlotDescriptorLookup(batch.slotSystemId);
  const buildingLookup = await getBuildingRoomLookup();
  const slotSystemStructure = await getSlotSystemStructure(batch.slotSystemId);
  const createdSlotLabelByKey = new Map<string, string>();

  const rowSummaries = new Map<number, CommitRowSummary>();
  const rowResolutionRecords = new Map<number, RowResolutionPersistRecord>();
  const queue: Array<{
    rowId: number;
    occurrenceId: number;
    dedupeKey: string;
    roomId: number;
    startAt: Date;
    endAt: Date;
    sourceRef: string;
    auxiliaryData: Record<string, string>;
  }> = [];

  const warnings: string[] = [];
  const conflictingBookings: CommitConflictItem[] = [];

  for (const row of rows) {
    const summary: CommitRowSummary = {
      rowId: row.id,
      rowIndex: row.rowIndex,
      classification: row.classification,
      action: row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP",
      created: 0,
      failed: 0,
      skipped: 0,
      alreadyProcessed: 0,
      unresolved: 0,
      reasons: Array.isArray(row.reasons) ? [...(row.reasons as string[])] : [],
      bookingConflictReasons: [],
    };

    const decision = decisions.get(row.id);
    if (decision) {
      summary.action = decision.action;
    }

    const rowResolutionRecord: RowResolutionPersistRecord = {
      action: summary.action,
      resolvedSlotLabel: row.resolvedSlotLabel ? normalizeSpace(row.resolvedSlotLabel) : null,
      resolvedRoomId: row.resolvedRoomId ?? null,
      createSlot:
        decision?.action === "RESOLVE" && decision.createSlot ? decision.createSlot : null,
      createRoom:
        decision?.action === "RESOLVE" && decision.createRoom ? decision.createRoom : null,
    };

    rowResolutionRecords.set(row.id, rowResolutionRecord);

    if (summary.action === "SKIP") {
      summary.skipped += 1;
      summary.unresolved += 1;
      rowSummaries.set(row.id, summary);
      continue;
    }

    let resolvedSlotLabel = rowResolutionRecord.resolvedSlotLabel ?? "";
    let resolvedRoomId = rowResolutionRecord.resolvedRoomId;

    if (decision?.action === "RESOLVE") {
      try {
        if (decision.createSlot) {
          resolvedSlotLabel = await ensureSlotForDecision({
            slotSystemId: batch.slotSystemId,
            createSlot: decision.createSlot,
            defaultLabel: resolvedSlotLabel || row.rawSlot || "",
            slotSystemStructure,
            createdSlotLabelByKey,
          });

          slotLookup = await getSlotDescriptorLookup(batch.slotSystemId);
        } else if (decision.resolvedSlotLabel) {
          resolvedSlotLabel = normalizeSpace(decision.resolvedSlotLabel);
        }

        if (decision.createRoom) {
          resolvedRoomId = await ensureRoomForDecision({
            createRoom: decision.createRoom,
            buildingLookup,
          });
        } else if (decision.resolvedRoomId !== undefined) {
          resolvedRoomId = decision.resolvedRoomId;
        }
      } catch (error: unknown) {
        summary.unresolved += 1;
        summary.reasons.push(toErrorMessage(error, "Failed to apply resolution decision"));
        rowSummaries.set(row.id, summary);
        continue;
      }

      rowResolutionRecord.resolvedSlotLabel = resolvedSlotLabel || null;
      rowResolutionRecord.resolvedRoomId = resolvedRoomId ?? null;

      await db
        .update(timetableImportRows)
        .set({
          resolvedSlotLabel: resolvedSlotLabel || null,
          resolvedRoomId: resolvedRoomId ?? null,
        })
        .where(eq(timetableImportRows.id, row.id));
    }

    if (!resolvedSlotLabel) {
      summary.unresolved += 1;
      summary.reasons.push("Missing resolved slot label");
      rowSummaries.set(row.id, summary);
      continue;
    }

    if (!resolvedRoomId) {
      summary.unresolved += 1;
      summary.reasons.push("Missing resolved room id");
      rowSummaries.set(row.id, summary);
      continue;
    }

    if (!buildingLookup.roomById.has(resolvedRoomId)) {
      summary.unresolved += 1;
      summary.reasons.push("Resolved room id does not exist");
      rowSummaries.set(row.id, summary);
      continue;
    }

    const descriptors = slotLookup.descriptorsByLabel.get(normalizeKey(resolvedSlotLabel)) ?? [];
    if (descriptors.length === 0) {
      summary.unresolved += 1;
      summary.reasons.push("Resolved slot label does not exist in selected slot system");
      rowSummaries.set(row.id, summary);
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
        const dedupeKey = hashValue(
          `${batch.id}|${row.id}|${resolvedRoomId}|${interval.startAt.toISOString()}|${interval.endAt.toISOString()}`,
        );

        const [existingOccurrence] = await db
          .select({
            id: timetableImportOccurrences.id,
            bookingId: timetableImportOccurrences.bookingId,
            status: timetableImportOccurrences.status,
          })
          .from(timetableImportOccurrences)
          .where(eq(timetableImportOccurrences.dedupeKey, dedupeKey))
          .limit(1);

        if (existingOccurrence?.bookingId) {
          summary.alreadyProcessed += 1;
          continue;
        }

        let occurrenceId = existingOccurrence?.id;

        if (!occurrenceId) {
          const [createdOccurrence] = await db
            .insert(timetableImportOccurrences)
            .values({
              batchId: batch.id,
              rowId: row.id,
              roomId: resolvedRoomId,
              startAt: interval.startAt,
              endAt: interval.endAt,
              source: "TIMETABLE_ALLOCATION",
              sourceRef: `batch:${batch.id}:row:${row.id}:block:${descriptor.blockId}`,
              dedupeKey,
              status: "PENDING",
            })
            .returning({
              id: timetableImportOccurrences.id,
            });

          if (!createdOccurrence) {
            summary.failed += 1;
            summary.reasons.push("Failed to prepare occurrence for commit");
            continue;
          }

          occurrenceId = createdOccurrence.id;
        }

        queue.push({
          rowId: row.id,
          occurrenceId,
          dedupeKey,
          roomId: resolvedRoomId,
          startAt: interval.startAt,
          endAt: interval.endAt,
          sourceRef: `batch:${batch.id}:row:${row.id}:block:${descriptor.blockId}`,
          auxiliaryData: row.auxiliaryData,
        });
      }
    }

    rowResolutionRecord.resolvedSlotLabel = resolvedSlotLabel || null;
    rowResolutionRecord.resolvedRoomId = resolvedRoomId ?? null;

    rowSummaries.set(row.id, summary);
  }

  if (queue.length > 0) {
    const bulkResult = await createBookingsBulk(
      queue.map((item) => ({
        roomId: item.roomId,
        startAt: item.startAt.toISOString(),
        endAt: item.endAt.toISOString(),
        clientRowId: item.dedupeKey,
        metadata: {
          source: "TIMETABLE_ALLOCATION",
          sourceRef: item.sourceRef,
          ...(Object.keys(item.auxiliaryData).length > 0
            ? { auxiliaryData: item.auxiliaryData }
            : {}),
        },
      })),
    );

    const resultByDedupeKey = new Map<
      string,
      {
        index: number;
        result: BookingCreateResult;
      }
    >();
    for (const item of bulkResult.results) {
      if (item.clientRowId) {
        resultByDedupeKey.set(item.clientRowId, {
          index: item.index,
          result: item.result,
        });
      }
    }

    for (const queued of queue) {
      const outcome = resultByDedupeKey.get(queued.dedupeKey);
      const rowSummary = rowSummaries.get(queued.rowId);

      if (!outcome || !rowSummary) {
        continue;
      }

      if (outcome.result.ok) {
        rowSummary.created += 1;
        await db
          .update(timetableImportOccurrences)
          .set({
            status: "CREATED",
            bookingId: outcome.result.booking.id,
            errorMessage: null,
          })
          .where(eq(timetableImportOccurrences.id, queued.occurrenceId));
      } else {
        rowSummary.failed += 1;

        const isBookingConflict =
          outcome.result.code === BOOKING_CONFLICT_CODE ||
          isBookingConflictMessage(outcome.result.message);

        if (isBookingConflict) {
          rowSummary.bookingConflictReasons.push(outcome.result.message);
          conflictingBookings.push({
            rowId: queued.rowId,
            rowIndex: rowSummary.rowIndex,
            occurrenceId: queued.occurrenceId,
            roomId: queued.roomId,
            startAt: queued.startAt.toISOString(),
            endAt: queued.endAt.toISOString(),
            message: outcome.result.message,
          });
        } else {
          rowSummary.reasons.push(outcome.result.message);
        }

        await db
          .update(timetableImportOccurrences)
          .set({
            status: "FAILED",
            errorMessage: outcome.result.message,
          })
          .where(eq(timetableImportOccurrences.id, queued.occurrenceId));
      }
    }
  }

  const rowResults = Array.from(rowSummaries.values()).sort((a, b) => a.rowIndex - b.rowIndex);

  for (const rowResult of rowResults) {
    rowResult.reasons = Array.from(new Set(rowResult.reasons));
    rowResult.bookingConflictReasons = Array.from(new Set(rowResult.bookingConflictReasons));
  }

  for (const rowResult of rowResults) {
    const resolution =
      rowResolutionRecords.get(rowResult.rowId) ?? {
        action: rowResult.action,
        resolvedSlotLabel: null,
        resolvedRoomId: null,
        createSlot: null,
        createRoom: null,
      };

    await persistRowResolution({
      batchId: batch.id,
      rowSummary: rowResult,
      resolution,
    });
  }

  await db
    .update(timetableImportBatches)
    .set({
      status: "COMMITTED",
      committedAt: new Date(),
    })
    .where(eq(timetableImportBatches.id, batch.id));

  // Lock the slot system after first commit
  try {
    await lockSlotSystem(batch.slotSystemId);
  } catch (lockError) {
    logger.warn("Failed to lock slot system after commit", {
      batchId: batch.id,
      slotSystemId: batch.slotSystemId,
      error: lockError,
    });
  }

  const autoCreatedBookings = rowResults.reduce((sum, row) => sum + row.created, 0);
  const alreadyProcessedBookings = rowResults.reduce((sum, row) => sum + row.alreadyProcessed, 0);
  const failedOccurrences = rowResults.reduce((sum, row) => sum + row.failed, 0);
  const unresolvedRows = rowResults.filter((row) => row.unresolved > 0).length;
  const skippedRows = rowResults.filter((row) => row.action === "SKIP").length;
  const bookingConflictRows = rowResults.filter(
    (row) => row.bookingConflictReasons.length > 0,
  ).length;
  const bookingConflictOccurrences = rowResults.reduce(
    (sum, row) => sum + row.bookingConflictReasons.length,
    0,
  );

  return {
    batchId: batch.id,
    status: "COMMITTED",
    processedRows: rowResults.length,
    autoCreatedBookings,
    alreadyProcessedBookings,
    failedOccurrences,
    unresolvedRows,
    skippedRows,
    bookingConflictRows,
    bookingConflictOccurrences,
    conflictingBookings,
    rowResults,
    warnings: [
      ...(Array.isArray(batch.warnings) ? (batch.warnings as string[]) : []),
      ...warnings,
    ],
  };
}

export async function getTimetableImportProcessedRows(
  batchIdInput: number,
): Promise<ProcessedRowsReport> {
  const batchId = Number(batchIdInput);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
      status: timetableImportBatches.status,
      warnings: timetableImportBatches.warnings,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status === "PREVIEWED") {
    await synchronizePreviewedBatchRowsWithCurrentStructure({
      batchId,
      slotSystemId: batch.slotSystemId,
    });
  }

  const [rows, resolutions, occurrences] = await Promise.all([
    getBatchRows(batchId),
    db
      .select({
        rowId: timetableImportRowResolutions.rowId,
        action: timetableImportRowResolutions.action,
        resolvedSlotLabel: timetableImportRowResolutions.resolvedSlotLabel,
        resolvedRoomId: timetableImportRowResolutions.resolvedRoomId,
        createSlot: timetableImportRowResolutions.createSlot,
        createRoom: timetableImportRowResolutions.createRoom,
        createdCount: timetableImportRowResolutions.createdCount,
        failedCount: timetableImportRowResolutions.failedCount,
        skippedCount: timetableImportRowResolutions.skippedCount,
        alreadyProcessedCount: timetableImportRowResolutions.alreadyProcessedCount,
        unresolvedCount: timetableImportRowResolutions.unresolvedCount,
        reasons: timetableImportRowResolutions.reasons,
      })
      .from(timetableImportRowResolutions)
      .where(eq(timetableImportRowResolutions.batchId, batchId)),
    db
      .select({
        occurrenceId: timetableImportOccurrences.id,
        rowId: timetableImportOccurrences.rowId,
        status: timetableImportOccurrences.status,
        roomId: timetableImportOccurrences.roomId,
        startAt: timetableImportOccurrences.startAt,
        endAt: timetableImportOccurrences.endAt,
        sourceRef: timetableImportOccurrences.sourceRef,
        errorMessage: timetableImportOccurrences.errorMessage,
        bookingId: bookings.id,
        bookingRoomId: bookings.roomId,
        bookingStartAt: bookings.startAt,
        bookingEndAt: bookings.endAt,
        bookingRequestId: bookings.requestId,
        bookingSource: bookings.source,
        bookingSourceRef: bookings.sourceRef,
      })
      .from(timetableImportOccurrences)
      .leftJoin(bookings, eq(timetableImportOccurrences.bookingId, bookings.id))
      .where(eq(timetableImportOccurrences.batchId, batchId))
      .orderBy(
        asc(timetableImportOccurrences.rowId),
        asc(timetableImportOccurrences.startAt),
        asc(timetableImportOccurrences.id),
      ),
  ]);

  const resolutionByRowId = new Map(resolutions.map((resolution) => [resolution.rowId, resolution]));

  const reportRows: ProcessedRowReport[] = rows.map((row) => {
    const storedResolution = resolutionByRowId.get(row.id);
    const resolvedAction =
      storedResolution?.action ??
      (row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP");
    const useStoredCounts = batch.status === "COMMITTED" && Boolean(storedResolution);

    const baseReasons = storedResolution
      ? Array.isArray(storedResolution.reasons)
        ? [...(storedResolution.reasons as string[])]
        : []
      : Array.isArray(row.reasons)
        ? [...(row.reasons as string[])]
        : [];

    return {
      rowId: row.id,
      rowIndex: row.rowIndex,
      classification: row.classification,
      courseCode: row.rawCourseCode ?? "",
      slot: row.rawSlot ?? "",
      classroom: row.rawClassroom ?? "",
      action: resolvedAction,
      resolvedSlotLabel: storedResolution?.resolvedSlotLabel ?? row.resolvedSlotLabel,
      resolvedRoomId: storedResolution?.resolvedRoomId ?? row.resolvedRoomId,
      createSlot:
        (storedResolution?.createSlot as ImportDecisionCreateSlot | null | undefined) ?? null,
      createRoom:
        (storedResolution?.createRoom as ImportDecisionCreateRoom | null | undefined) ?? null,
      created: useStoredCounts ? (storedResolution?.createdCount ?? 0) : 0,
      failed: useStoredCounts ? (storedResolution?.failedCount ?? 0) : 0,
      skipped: useStoredCounts ? (storedResolution?.skippedCount ?? 0) : 0,
      alreadyProcessed: useStoredCounts ? (storedResolution?.alreadyProcessedCount ?? 0) : 0,
      unresolved: useStoredCounts
        ? (storedResolution?.unresolvedCount ?? 0)
        : resolvedAction === "SKIP"
          ? 1
          : row.classification === "VALID_AND_AUTOMATABLE"
            ? 0
            : 1,
      reasons: baseReasons,
      bookingConflictReasons: [],
      occurrences: [],
    };
  });

  const rowById = new Map(reportRows.map((row) => [row.rowId, row]));

  for (const occurrence of occurrences) {
    const row = rowById.get(occurrence.rowId);
    if (!row) {
      continue;
    }

    const occurrenceStartAt =
      occurrence.startAt instanceof Date
        ? occurrence.startAt.toISOString()
        : new Date(occurrence.startAt).toISOString();
    const occurrenceEndAt =
      occurrence.endAt instanceof Date
        ? occurrence.endAt.toISOString()
        : new Date(occurrence.endAt).toISOString();

    const booking =
      typeof occurrence.bookingId === "number" &&
      typeof occurrence.bookingRoomId === "number" &&
      occurrence.bookingStartAt instanceof Date &&
      occurrence.bookingEndAt instanceof Date &&
      (occurrence.bookingSource === "MANUAL_REQUEST" ||
        occurrence.bookingSource === "TIMETABLE_ALLOCATION" ||
        occurrence.bookingSource === "SLOT_CHANGE" ||
        occurrence.bookingSource === "VENUE_CHANGE")
        ? {
            id: occurrence.bookingId,
            roomId: occurrence.bookingRoomId,
            startAt: occurrence.bookingStartAt.toISOString(),
            endAt: occurrence.bookingEndAt.toISOString(),
            requestId: occurrence.bookingRequestId,
            source: occurrence.bookingSource,
            sourceRef: occurrence.bookingSourceRef,
          }
        : null;

    row.occurrences.push({
      occurrenceId: occurrence.occurrenceId,
      status: occurrence.status,
      roomId: occurrence.roomId,
      startAt: occurrenceStartAt,
      endAt: occurrenceEndAt,
      sourceRef: occurrence.sourceRef,
      errorMessage: occurrence.errorMessage,
      booking,
    });

    const isBookingConflict =
      occurrence.status === "FAILED" && isBookingConflictMessage(occurrence.errorMessage);

    if (isBookingConflict && occurrence.errorMessage) {
      row.bookingConflictReasons.push(occurrence.errorMessage);
    }

    if (batch.status === "COMMITTED" && resolutionByRowId.has(occurrence.rowId)) {
      continue;
    }

    if (occurrence.status === "CREATED") {
      row.created += 1;
    } else if (occurrence.status === "ALREADY_PROCESSED") {
      row.alreadyProcessed += 1;
    } else if (occurrence.status === "SKIPPED") {
      row.skipped += 1;
    } else {
      row.failed += 1;
      if (occurrence.errorMessage && !isBookingConflict) {
        row.reasons.push(occurrence.errorMessage);
      }
    }
  }

  for (const row of reportRows) {
    if (batch.status !== "COMMITTED" && row.action === "SKIP" && row.skipped === 0) {
      row.skipped = 1;
      if (row.unresolved === 0) {
        row.unresolved = 1;
      }
    }

    row.reasons = Array.from(new Set(row.reasons));
    row.bookingConflictReasons = Array.from(new Set(row.bookingConflictReasons));
  }

  return {
    batchId: batch.id,
    status: batch.status,
    warnings: Array.isArray(batch.warnings) ? (batch.warnings as string[]) : [],
    rows: reportRows,
  };
}

// ============================================================================
// Conflict Detection and Resolution Functions
// ============================================================================

/**
 * Detect conflicts for a batch commit. This function:
 * 1. Freezes booking operations
 * 2. Analyzes all pending occurrences
 * 3. Returns conflicts with existing bookings
 *
 * If no conflicts are found, the batch can proceed to commit directly.
 * If conflicts are found, they must be resolved before commit.
 */
export async function detectCommitConflicts(
  input: CommitImportInput,
  userId: number,
  userName: string
): Promise<ConflictDetectionReport> {
  const batchId = Number(input.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  logger.info("Starting conflict detection for timetable import", { batchId, userId });

  // Get batch info
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

  // Freeze bookings
  const freezeResult = freezeBookings(batchId, userId, userName);
  if (!freezeResult.ok) {
    throw createServiceError(409, freezeResult.message);
  }

  logger.info("Booking operations frozen for conflict detection", { batchId, userId });

  try {
    // Parse decisions
    const explicitDecisions = parseDecisionInput(input.decisions);
    const savedDecisions = await getSavedDecisions(batchId);
    const decisions = new Map<number, ImportDecision>();

    for (const saved of savedDecisions) {
      decisions.set(saved.rowId, {
        rowId: saved.rowId,
        action: saved.action,
        ...(saved.resolvedSlotLabel ? { resolvedSlotLabel: saved.resolvedSlotLabel } : {}),
        ...(saved.resolvedRoomId ? { resolvedRoomId: saved.resolvedRoomId } : {}),
        ...(saved.createSlot ? { createSlot: saved.createSlot } : {}),
        ...(saved.createRoom ? { createRoom: saved.createRoom } : {}),
      });
    }

    for (const [rowId, decision] of explicitDecisions.entries()) {
      decisions.set(rowId, decision);
    }

    // Get rows and lookups
    const batchRows = await getBatchRows(batchId);
    let slotLookup = await getSlotDescriptorLookup(batch.slotSystemId);
    const buildingLookup = await getBuildingRoomLookup();
    const slotSystemStructure = await getSlotSystemStructure(batch.slotSystemId);
    const createdSlotLabelByKey = new Map<string, string>();

    const conflicts: DetectedConflict[] = [];
    let totalOccurrences = 0;

    for (const row of batchRows) {
      const decision = decisions.get(row.id);
      const action = decision?.action ?? (row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP");

      if (action === "SKIP") {
        continue;
      }

      let resolvedSlotLabel = row.resolvedSlotLabel ? normalizeSpace(row.resolvedSlotLabel) : "";
      let resolvedRoomId = row.resolvedRoomId ?? null;

      // Apply decision
      if (decision?.action === "RESOLVE") {
        if (decision.createSlot) {
          resolvedSlotLabel = await ensureSlotForDecision({
            slotSystemId: batch.slotSystemId,
            createSlot: decision.createSlot,
            defaultLabel: resolvedSlotLabel || row.rawSlot || "",
            slotSystemStructure,
            createdSlotLabelByKey,
          });
          slotLookup = await getSlotDescriptorLookup(batch.slotSystemId);
        } else if (decision.resolvedSlotLabel) {
          resolvedSlotLabel = normalizeSpace(decision.resolvedSlotLabel);
        }

        if (decision.createRoom) {
          resolvedRoomId = await ensureRoomForDecision({
            createRoom: decision.createRoom,
            buildingLookup,
          });
        } else if (decision.resolvedRoomId !== undefined) {
          resolvedRoomId = decision.resolvedRoomId;
        }
      }

      if (!resolvedSlotLabel || !resolvedRoomId) {
        continue;
      }

      const descriptors = slotLookup.descriptorsByLabel.get(normalizeKey(resolvedSlotLabel)) ?? [];
      if (descriptors.length === 0) {
        continue;
      }

      // Get room details for conflict info
      const roomInfo = buildingLookup.roomById.get(resolvedRoomId);
      const roomName = roomInfo?.name ?? `Room ${resolvedRoomId}`;
      const buildingName = roomInfo?.buildingId
        ? (buildingLookup.buildingNameById.get(roomInfo.buildingId) ?? "Unknown Building")
        : "Unknown Building";

      for (const descriptor of descriptors) {
        const intervals = buildOccurrenceIntervals({
          termStartDate: batch.termStartDate,
          termEndDate: batch.termEndDate,
          dayOfWeek: descriptor.dayOfWeek,
          startTime: descriptor.startTime,
          endTime: descriptor.endTime,
        });

        for (const interval of intervals) {
          totalOccurrences++;

          const dedupeKey = hashValue(
            `${batch.id}|${row.id}|${resolvedRoomId}|${interval.startAt.toISOString()}|${interval.endAt.toISOString()}`
          );

          // Check if occurrence already exists and has a booking
          const [existingOccurrence] = await db
            .select({
              id: timetableImportOccurrences.id,
              bookingId: timetableImportOccurrences.bookingId,
            })
            .from(timetableImportOccurrences)
            .where(eq(timetableImportOccurrences.dedupeKey, dedupeKey))
            .limit(1);

          if (existingOccurrence?.bookingId) {
            // Already processed, skip
            continue;
          }

          // Check for overlapping bookings
          const overlappingBookings = await db
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
                eq(bookings.roomId, resolvedRoomId),
                lt(bookings.startAt, interval.endAt),
                gt(bookings.endAt, interval.startAt)
              )
            );

          if (overlappingBookings.length > 0) {
            // Get or create occurrence ID for tracking
            let occurrenceId = existingOccurrence?.id;
            if (!occurrenceId) {
              const [createdOccurrence] = await db
                .insert(timetableImportOccurrences)
                .values({
                  batchId: batch.id,
                  rowId: row.id,
                  roomId: resolvedRoomId,
                  startAt: interval.startAt,
                  endAt: interval.endAt,
                  source: "TIMETABLE_ALLOCATION",
                  sourceRef: `batch:${batch.id}:row:${row.id}:block:${descriptor.blockId}`,
                  dedupeKey,
                  status: "PENDING",
                })
                .returning({ id: timetableImportOccurrences.id });

              occurrenceId = createdOccurrence?.id ?? 0;
            }

            for (const conflicting of overlappingBookings) {
              conflicts.push({
                occurrenceId: occurrenceId,
                rowId: row.id,
                rowIndex: row.rowIndex,
                courseCode: row.rawCourseCode || "",
                slot: row.rawSlot || "",
                classroom: row.rawClassroom || "",
                roomId: resolvedRoomId,
                roomName,
                buildingName,
                startAt: interval.startAt.toISOString(),
                endAt: interval.endAt.toISOString(),
                conflictingBooking: {
                  id: conflicting.id,
                  roomId: conflicting.roomId,
                  startAt: conflicting.startAt.toISOString(),
                  endAt: conflicting.endAt.toISOString(),
                  source: conflicting.source,
                  sourceRef: conflicting.sourceRef,
                },
              });
            }
          }
        }
      }
    }

    const freezeState = getBookingFreezeState();

    logger.info("Conflict detection completed", {
      batchId,
      totalOccurrences,
      conflictCount: conflicts.length,
    });

    if (conflicts.length === 0) {
      // No conflicts, can proceed
      return {
        batchId,
        status: "NO_CONFLICTS",
        totalOccurrences,
        conflictCount: 0,
        conflicts: [],
        frozenAt: freezeState.frozenBy?.startedAt?.toISOString() ?? null,
        frozenBy: freezeState.frozenBy
          ? { userId: freezeState.frozenBy.userId, userName: freezeState.frozenBy.userName }
          : null,
      };
    }

    return {
      batchId,
      status: "FROZEN",
      totalOccurrences,
      conflictCount: conflicts.length,
      conflicts,
      frozenAt: freezeState.frozenBy?.startedAt?.toISOString() ?? null,
      frozenBy: freezeState.frozenBy
        ? { userId: freezeState.frozenBy.userId, userName: freezeState.frozenBy.userName }
        : null,
    };
  } catch (error) {
    // Unfreeze on error
    unfreezeBookings(batchId);
    logger.error("Error during conflict detection, unfreezing", { batchId, error });
    throw error;
  }
}

/**
 * Commit with conflict resolutions.
 * This function applies the resolution decisions and creates/deletes bookings accordingly.
 */
export async function commitWithResolutions(
  input: CommitWithResolutionsInput,
  userId: number
): Promise<CommitWithResolutionsReport> {
  const batchId = Number(input.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  // Verify batch is frozen by this batch
  const freezeState = getBookingFreezeState();
  if (!freezeState.isFrozen || freezeState.frozenBy?.batchId !== batchId) {
    throw createServiceError(400, "Batch is not in frozen state for commit. Please restart the commit process.");
  }

  logger.info("Starting commit with resolutions", {
    batchId,
    userId,
    resolutionCount: input.resolutions?.length ?? 0,
  });

  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      status: timetableImportBatches.status,
      warnings: timetableImportBatches.warnings,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    unfreezeBookings(batchId);
    throw createServiceError(404, "Import batch not found");
  }

  if (batch.status === "COMMITTED") {
    unfreezeBookings(batchId);
    throw createServiceError(400, "Batch is already committed");
  }

  try {
    // Build resolution map
    const resolutionMap = new Map<number, ConflictResolutionDecision>();
    for (const resolution of input.resolutions ?? []) {
      resolutionMap.set(resolution.occurrenceId, resolution);
    }

    // Get all pending occurrences
    const pendingOccurrences = await db
      .select({
        id: timetableImportOccurrences.id,
        rowId: timetableImportOccurrences.rowId,
        roomId: timetableImportOccurrences.roomId,
        startAt: timetableImportOccurrences.startAt,
        endAt: timetableImportOccurrences.endAt,
        sourceRef: timetableImportOccurrences.sourceRef,
        dedupeKey: timetableImportOccurrences.dedupeKey,
        status: timetableImportOccurrences.status,
        bookingId: timetableImportOccurrences.bookingId,
      })
      .from(timetableImportOccurrences)
      .where(
        and(
          eq(timetableImportOccurrences.batchId, batchId),
          eq(timetableImportOccurrences.status, "PENDING")
        )
      );

    const changes: CommitWithResolutionsReport["changes"] = {
      created: [],
      deleted: [],
      skipped: [],
    };

    let createdBookings = 0;
    let skippedOccurrences = 0;
    let overwrittenBookings = 0;
    let alternativeRoomBookings = 0;
    let deletedConflictingBookings = 0;
    const warnings: string[] = [];

    for (const occurrence of pendingOccurrences) {
      if (occurrence.bookingId) {
        // Already processed — idempotency guard
        continue;
      }

      // Also skip non-PENDING occurrences for idempotency
      if (occurrence.status !== "PENDING") {
        continue;
      }

      const resolution = resolutionMap.get(occurrence.id);
      let targetRoomId = occurrence.roomId;

      // Check for conflicts
      const overlappingBookings = await db
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
            eq(bookings.roomId, targetRoomId),
            lt(bookings.startAt, occurrence.endAt),
            gt(bookings.endAt, occurrence.startAt)
          )
        );

      const hasConflict = overlappingBookings.length > 0;

      if (hasConflict && !resolution) {
        // Conflict without resolution - skip
        skippedOccurrences++;
        changes.skipped.push({
          occurrenceId: occurrence.id,
          reason: "Unresolved conflict",
        });

        await db
          .update(timetableImportOccurrences)
          .set({ status: "SKIPPED", errorMessage: "Unresolved conflict" })
          .where(eq(timetableImportOccurrences.id, occurrence.id));

        continue;
      }

      if (hasConflict && resolution) {
        if (resolution.action === "SKIP") {
          skippedOccurrences++;
          changes.skipped.push({
            occurrenceId: occurrence.id,
            reason: "User chose to skip",
          });

          await db
            .update(timetableImportOccurrences)
            .set({ status: "SKIPPED", errorMessage: "Skipped by user resolution" })
            .where(eq(timetableImportOccurrences.id, occurrence.id));

          continue;
        }

        if (resolution.action === "FORCE_OVERWRITE") {
          // Delete conflicting bookings
          for (const conflicting of overlappingBookings) {
            await db.delete(bookings).where(eq(bookings.id, conflicting.id));
            deletedConflictingBookings++;
            changes.deleted.push({
              bookingId: conflicting.id,
              roomId: conflicting.roomId,
              startAt: conflicting.startAt.toISOString(),
              endAt: conflicting.endAt.toISOString(),
              reason: `Overwritten by timetable import batch ${batchId}`,
            });

            logger.info("Deleted conflicting booking (FORCE_OVERWRITE)", {
              deletedBookingId: conflicting.id,
              batchId,
              occurrenceId: occurrence.id,
            });
          }
          overwrittenBookings++;
        }

        if (resolution.action === "ALTERNATIVE_ROOM") {
          if (!resolution.alternativeRoomId) {
            skippedOccurrences++;
            changes.skipped.push({
              occurrenceId: occurrence.id,
              reason: "Alternative room not specified",
            });

            await db
              .update(timetableImportOccurrences)
              .set({ status: "SKIPPED", errorMessage: "Alternative room not specified" })
              .where(eq(timetableImportOccurrences.id, occurrence.id));

            warnings.push(
              `Occurrence ${occurrence.id}: Alternative room action specified but no room ID provided`
            );
            continue;
          }

          // Check if alternative room also has conflict
          const altRoomConflicts = await db
            .select({ id: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.roomId, resolution.alternativeRoomId),
                lt(bookings.startAt, occurrence.endAt),
                gt(bookings.endAt, occurrence.startAt)
              )
            )
            .limit(1);

          if (altRoomConflicts.length > 0) {
            skippedOccurrences++;
            changes.skipped.push({
              occurrenceId: occurrence.id,
              reason: "Alternative room also has conflict",
            });

            await db
              .update(timetableImportOccurrences)
              .set({ status: "SKIPPED", errorMessage: "Alternative room also has conflict" })
              .where(eq(timetableImportOccurrences.id, occurrence.id));

            warnings.push(
              `Occurrence ${occurrence.id}: Alternative room ${resolution.alternativeRoomId} also has conflicts`
            );
            continue;
          }

          targetRoomId = resolution.alternativeRoomId;
          alternativeRoomBookings++;

          // Update occurrence with new room
          await db
            .update(timetableImportOccurrences)
            .set({ roomId: targetRoomId })
            .where(eq(timetableImportOccurrences.id, occurrence.id));
        }
      }

      // Create the booking
      const [insertedBooking] = await db
        .insert(bookings)
        .values({
          roomId: targetRoomId,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          source: "TIMETABLE_ALLOCATION",
          sourceRef: occurrence.sourceRef,
        })
        .returning();

      if (insertedBooking) {
        createdBookings++;
        changes.created.push({
          occurrenceId: occurrence.id,
          bookingId: insertedBooking.id,
          roomId: targetRoomId,
          startAt: occurrence.startAt.toISOString(),
          endAt: occurrence.endAt.toISOString(),
        });

        await db
          .update(timetableImportOccurrences)
          .set({ status: "CREATED", bookingId: insertedBooking.id, errorMessage: null })
          .where(eq(timetableImportOccurrences.id, occurrence.id));
      } else {
        await db
          .update(timetableImportOccurrences)
          .set({ status: "FAILED", errorMessage: "Failed to create booking" })
          .where(eq(timetableImportOccurrences.id, occurrence.id));

        warnings.push(`Occurrence ${occurrence.id}: Failed to create booking`);
      }
    }

    // Mark batch as committed
    await db
      .update(timetableImportBatches)
      .set({ status: "COMMITTED", committedAt: new Date() })
      .where(eq(timetableImportBatches.id, batchId));

    // Lock the slot system after commit
    try {
      await lockSlotSystem(batch.slotSystemId);
    } catch (lockError) {
      logger.warn("Failed to lock slot system after commit with resolutions", {
        batchId,
        slotSystemId: batch.slotSystemId,
        error: lockError,
      });
    }

    // Unfreeze
    unfreezeBookings(batchId);

    logger.info("Commit with resolutions completed", {
      batchId,
      createdBookings,
      skippedOccurrences,
      overwrittenBookings,
      alternativeRoomBookings,
      deletedConflictingBookings,
    });

    return {
      batchId,
      status: "COMMITTED",
      totalOccurrences: pendingOccurrences.length,
      createdBookings,
      skippedOccurrences,
      overwrittenBookings,
      alternativeRoomBookings,
      deletedConflictingBookings,
      warnings: [
        ...(Array.isArray(batch.warnings) ? (batch.warnings as string[]) : []),
        ...warnings,
      ],
      changes,
    };
  } catch (error) {
    unfreezeBookings(batchId);
    logger.error("Error during commit with resolutions, unfreezing", { batchId, error });
    throw error;
  }
}

/**
 * Cancel a commit that is in progress (frozen state).
 * Unfreezes booking operations without making any changes.
 */
export async function cancelCommit(batchId: number): Promise<{ batchId: number; status: "CANCELLED" }> {
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

  const freezeState = getBookingFreezeState();

  if (!freezeState.isFrozen) {
    logger.debug("Cancel commit called but bookings are not frozen", { batchId });
    return { batchId, status: "CANCELLED" };
  }

  if (freezeState.frozenBy?.batchId !== batchId) {
    throw createServiceError(
      400,
      `Cannot cancel: bookings are frozen by batch ${freezeState.frozenBy?.batchId}, not batch ${batchId}`
    );
  }

  unfreezeBookings(batchId);

  logger.info("Commit cancelled and bookings unfrozen", { batchId });

  return { batchId, status: "CANCELLED" };
}

/**
 * Get freeze status for a batch
 */
export function getCommitFreezeStatus(batchId: number): {
  batchId: number;
  isFrozen: boolean;
  frozenByThisBatch: boolean;
  freezeInfo: {
    batchId: number;
    userId: number;
    userName: string;
    startedAt: string;
  } | null;
} {
  const freezeState = getBookingFreezeState();

  return {
    batchId,
    isFrozen: freezeState.isFrozen,
    frozenByThisBatch: freezeState.frozenBy?.batchId === batchId,
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

