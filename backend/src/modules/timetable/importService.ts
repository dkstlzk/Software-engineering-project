import { createHash } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import XLSX from "xlsx";
import { db } from "../../db";
import {
  buildings,
  rooms,
  timetableImportBatches,
  timetableImportRows,
  timetableImportOccurrences,
} from "../../db/schema";
import { createBookingsBulk } from "../../services/bookingService";
import type { BookingCreateResult } from "../../services/bookingService";
import { DAY_OF_WEEK_VALUES, slotBlocks, slotDays, slotSystems, slotTimeBands } from "./schema";

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

type ImportDecision = {
  rowId: number;
  action: ImportDecisionAction;
  resolvedSlotLabel?: string;
  resolvedRoomId?: number;
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
};

type PreviewReport = {
  batchId: number;
  reused: boolean;
  slotSystemId: number;
  termStartDate: string;
  termEndDate: string;
  processedRows: number;
  validRows: number;
  unresolvedRows: number;
  warnings: string[];
  rows: PreviewResponseRow[];
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
  rowResults: CommitRowSummary[];
  warnings: string[];
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

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
  };
}

function buildPreviewReportFromRows(input: {
  batchId: number;
  reused: boolean;
  slotSystemId: number;
  termStartDate: Date;
  termEndDate: Date;
  warnings: string[];
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
  }>;
}): PreviewReport {
  const responseRows = input.rows.map(toPreviewRowResponse);

  const validRows = responseRows.filter(
    (row) => row.classification === "VALID_AND_AUTOMATABLE",
  ).length;

  return {
    batchId: input.batchId,
    reused: input.reused,
    slotSystemId: input.slotSystemId,
    termStartDate: input.termStartDate.toISOString(),
    termEndDate: input.termEndDate.toISOString(),
    processedRows: responseRows.length,
    validRows,
    unresolvedRows: responseRows.length - validRows,
    warnings: input.warnings,
    rows: responseRows,
  };
}

async function fetchBatchPreviewReport(batchId: number, reused: boolean): Promise<PreviewReport> {
  const [batch] = await db
    .select({
      id: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
      termStartDate: timetableImportBatches.termStartDate,
      termEndDate: timetableImportBatches.termEndDate,
      warnings: timetableImportBatches.warnings,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw createServiceError(404, "Import batch not found");
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
    })
    .from(timetableImportRows)
    .where(eq(timetableImportRows.batchId, batch.id))
    .orderBy(asc(timetableImportRows.rowIndex));

  return buildPreviewReportFromRows({
    batchId: batch.id,
    reused,
    slotSystemId: batch.slotSystemId,
    termStartDate: batch.termStartDate,
    termEndDate: batch.termEndDate,
    warnings: Array.isArray(batch.warnings) ? (batch.warnings as string[]) : [],
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
  const buildingLookup = await getBuildingRoomLookup();

  const aliasObj: Record<string, string> = {};
  for (const [key, value] of aliasMap.entries()) {
    aliasObj[key] = value;
  }

  const fileHash = hashValue(input.fileBuffer.toString("base64"));
  const fingerprint = hashValue(
    `${TIMETABLE_IMPORT_PARSER_VERSION}|${fileHash}|${slotSystemId}|${termStartDate.toISOString()}|${termEndDate.toISOString()}|${JSON.stringify(
      aliasObj,
    )}`,
  );

  const [existingBatch] = await db
    .select({
      id: timetableImportBatches.id,
    })
    .from(timetableImportBatches)
    .where(eq(timetableImportBatches.fingerprint, fingerprint))
    .limit(1);

  if (existingBatch) {
    return fetchBatchPreviewReport(existingBatch.id, true);
  }

  const warnings: string[] = [];

  const hasHeader = rows.length > 0 && looksLikeHeaderRow(rows[0] ?? []);
  const startIndex = hasHeader ? 1 : 0;

  const seenRowHash = new Map<string, number>();

  const preparedRows: PreviewRowBuildResult[] = [];

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const rowIndex = index + 1;

    const rawCourseCode = normalizeSpace(String(row[0] ?? ""));
    const rawSlot = normalizeSpace(String(row[1] ?? ""));
    const rawClassroom = normalizeSpace(String(row[2] ?? ""));

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
    });

  return buildPreviewReportFromRows({
    batchId: insertedBatch.id,
    reused: false,
    slotSystemId,
    termStartDate,
    termEndDate,
    warnings,
    rows: insertedRows,
  });
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
      resolvedSlotLabel: timetableImportRows.resolvedSlotLabel,
      resolvedRoomId: timetableImportRows.resolvedRoomId,
    })
    .from(timetableImportRows)
    .where(eq(timetableImportRows.batchId, batchId))
    .orderBy(asc(timetableImportRows.rowIndex));
}

async function buildCommittedReport(batchId: number): Promise<CommitReport> {
  const rows = await getBatchRows(batchId);
  const occurrences = await db
    .select({
      rowId: timetableImportOccurrences.rowId,
      status: timetableImportOccurrences.status,
      bookingId: timetableImportOccurrences.bookingId,
      errorMessage: timetableImportOccurrences.errorMessage,
    })
    .from(timetableImportOccurrences)
    .where(eq(timetableImportOccurrences.batchId, batchId));

  const summaryByRowId = new Map<number, CommitRowSummary>();

  for (const row of rows) {
    summaryByRowId.set(row.id, {
      rowId: row.id,
      rowIndex: row.rowIndex,
      classification: row.classification,
      action: row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP",
      created: 0,
      failed: 0,
      skipped: 0,
      alreadyProcessed: 0,
      unresolved: row.classification === "VALID_AND_AUTOMATABLE" ? 0 : 1,
      reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    });
  }

  for (const occurrence of occurrences) {
    const rowSummary = summaryByRowId.get(occurrence.rowId);
    if (!rowSummary) {
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
      if (occurrence.errorMessage) {
        rowSummary.reasons.push(occurrence.errorMessage);
      }
    }
  }

  const rowResults = Array.from(summaryByRowId.values()).sort((a, b) => a.rowIndex - b.rowIndex);

  const autoCreatedBookings = rowResults.reduce((sum, row) => sum + row.created, 0);
  const alreadyProcessedBookings = rowResults.reduce((sum, row) => sum + row.alreadyProcessed, 0);
  const failedOccurrences = rowResults.reduce((sum, row) => sum + row.failed, 0);
  const unresolvedRows = rowResults.filter((row) => row.unresolved > 0).length;
  const skippedRows = rowResults.filter((row) => row.skipped > 0 || row.action === "SKIP").length;

  return {
    batchId,
    status: "ALREADY_COMMITTED",
    processedRows: rowResults.length,
    autoCreatedBookings,
    alreadyProcessedBookings,
    failedOccurrences,
    unresolvedRows,
    skippedRows,
    rowResults,
    warnings: [],
  };
}

export async function commitTimetableImport(input: CommitImportInput): Promise<CommitReport> {
  const batchId = Number(input.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw createServiceError(400, "Invalid batchId");
  }

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

  if (batch.status === "COMMITTED") {
    return buildCommittedReport(batchId);
  }

  const decisions = parseDecisionInput(input.decisions);
  const rows = await getBatchRows(batchId);
  const slotLookup = await getSlotDescriptorLookup(batch.slotSystemId);
  const buildingLookup = await getBuildingRoomLookup();

  const rowSummaries = new Map<number, CommitRowSummary>();
  const queue: Array<{
    rowId: number;
    occurrenceId: number;
    dedupeKey: string;
    roomId: number;
    startAt: Date;
    endAt: Date;
    sourceRef: string;
  }> = [];

  const warnings: string[] = [];

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
    };

    const decision = decisions.get(row.id);
    if (decision) {
      summary.action = decision.action;
    }

    if (summary.action === "SKIP") {
      summary.skipped += 1;
      summary.unresolved += 1;
      rowSummaries.set(row.id, summary);
      continue;
    }

    let resolvedSlotLabel = row.resolvedSlotLabel ? normalizeSpace(row.resolvedSlotLabel) : "";
    let resolvedRoomId = row.resolvedRoomId ?? null;

    if (decision?.action === "RESOLVE") {
      if (decision.resolvedSlotLabel) {
        resolvedSlotLabel = normalizeSpace(decision.resolvedSlotLabel);
      }

      if (decision.resolvedRoomId !== undefined) {
        resolvedRoomId = decision.resolvedRoomId;
      }

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
              source: "TIMETABLE_IMPORT",
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
        });
      }
    }

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
          source: "TIMETABLE_IMPORT",
          sourceRef: item.sourceRef,
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
        rowSummary.reasons.push(outcome.result.message);

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

  await db
    .update(timetableImportBatches)
    .set({
      status: "COMMITTED",
      committedAt: new Date(),
    })
    .where(eq(timetableImportBatches.id, batch.id));

  const rowResults = Array.from(rowSummaries.values()).sort((a, b) => a.rowIndex - b.rowIndex);

  const autoCreatedBookings = rowResults.reduce((sum, row) => sum + row.created, 0);
  const alreadyProcessedBookings = rowResults.reduce((sum, row) => sum + row.alreadyProcessed, 0);
  const failedOccurrences = rowResults.reduce((sum, row) => sum + row.failed, 0);
  const unresolvedRows = rowResults.filter((row) => row.unresolved > 0).length;
  const skippedRows = rowResults.filter((row) => row.action === "SKIP").length;

  return {
    batchId: batch.id,
    status: "COMMITTED",
    processedRows: rowResults.length,
    autoCreatedBookings,
    alreadyProcessedBookings,
    failedOccurrences,
    unresolvedRows,
    skippedRows,
    rowResults,
    warnings: [
      ...(Array.isArray(batch.warnings) ? (batch.warnings as string[]) : []),
      ...warnings,
    ],
  };
}

