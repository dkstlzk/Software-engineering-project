import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addDayLane as apiAddDayLane,
  createBooking as apiCreateBooking,
  createRoom as apiCreateRoom,

  getTimetableImportBatch as apiGetTimetableImportBatch,
  getTimetableImportBatches as apiGetTimetableImportBatches,
  deleteBooking as apiDeleteBooking,
  getBuildings,
  createBlock as apiCreateBlock,
  createDay as apiCreateDay,
  createSlotSystem as apiCreateSlotSystem,
  createTimeBand as apiCreateTimeBand,
  deleteDay as apiDeleteDay,
  deleteTimeBand as apiDeleteTimeBand,
  deleteBlock as apiDeleteBlock,
  deleteSlotSystem as apiDeleteSlotSystem,
  getFullGrid,
  pruneAllBookings as apiPruneAllBookings,
  pruneBookingsBySlotSystem as apiPruneBookingsBySlotSystem,
  reallocateTimetableImport as apiReallocateTimetableImport,
  removeDayLane as apiRemoveDayLane,
  getRooms,
  getSlotSystems,
  getTimetableImportProcessedRows as apiGetTimetableImportProcessedRows,
  previewTimetableImport as apiPreviewTimetableImport,
  saveTimetableImportDecisions as apiSaveTimetableImportDecisions,
  updateBooking as apiUpdateBooking,
  updateTimeBand as apiUpdateTimeBand,
  startCommitSession as apiStartCommitSession,
  startEditCommitSession as apiStartEditCommitSession,
  runExternalCommitCheck as apiRunExternalCommitCheck,
  resolveExternalCommitConflicts as apiResolveExternalCommitConflicts,
  runInternalCommitCheck as apiRunInternalCommitCheck,
  resolveInternalCommitConflicts as apiResolveInternalCommitConflicts,
  startCommitFreeze as apiStartCommitFreeze,
  runRuntimeCommitCheck as apiRunRuntimeCommitCheck,
  resolveRuntimeCommitConflicts as apiResolveRuntimeCommitConflicts,
  finalizeCommitSession as apiFinalizeCommitSession,
  cancelCommitSession as apiCancelCommitSession,
  previewSlotSystemChanges as apiPreviewSlotSystemChanges,

} from "../lib/api";
import type {
  Building,
  DayOfWeek,
  Room,
  SlotBlock,
  SlotDay,
  SlotFullGrid,
  SlotSystem,
  SlotTimeBand,
  TimetableImportBatchSummary,
  TimetableImportCommitDecision,
  TimetableImportCommitReport,
  TimetableImportProcessedRowsReport,
  TimetableImportPreviewRow,
  TimetableImportPreviewReport,
  TimetableImportSavedDecision,
  CommitStageReport,
  CommitSessionResolutionDecision,
  CommitResolutionAction,
  CommitResolutionTarget,
  CommitSessionStage,
  ChangePreviewResult,
  EditCommitSessionStartResponse,
  TimetableSnapshotState,

} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { formatDateDDMMYYYY } from "../utils/datetime";
import { DateInput } from "../components/DateInput";
import {
  formatBookingImpactMessage,
  formatEditDiffSummary,
  groupOperationsByGroupId,
  mapEditStartErrorToMessage,
  shouldShowPruneConfirmation,
} from "./timetableEditUtils";

const DAY_OF_WEEK_OPTIONS: DayOfWeek[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

const DAY_LABELS: Record<DayOfWeek, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

type DragSelection = {
  dayId: number;
  laneIndex: number;
  startBandIndex: number;
  endBandIndex: number;
};

type SlotResolutionMode = "SELECT_EXISTING" | "CREATE_SLOT";
type RoomResolutionMode = "SELECT_EXISTING" | "CREATE_ROOM";

type ProcessedBookingEditState = {
  roomId: number | "";
  startAt: string;
  endAt: string;
};

type RowDecisionAction = "AUTO" | "IGNORE" | "RESOLVE" | "SKIP";

type ConflictResolutionDraft = {
  action: CommitResolutionAction;
  target?: CommitResolutionTarget;
  roomId?: number;
  startAt?: string;
  endAt?: string;
  roomResolutionMode?: "SELECT_EXISTING" | "CREATE_ROOM";
  createRoomBuildingId?: number | "";
  createRoomName?: string;
};

type RowDecisionState = {
  action: RowDecisionAction;
  slotResolutionMode: SlotResolutionMode;
  roomResolutionMode: RoomResolutionMode;
  resolvedSlotLabel: string;
  resolvedRoomId: number | "";
  createSlotLabel: string;
  createSlotDayId: number | "";
  createSlotStartBandId: number | "";
  createSlotEndBandId: number | "";
  createSlotLaneIndex: number;
  createRoomBuildingName: string;
  createRoomName: string;
};

function createEmptyDecisionState(): RowDecisionState {
  return {
    action: "SKIP",
    slotResolutionMode: "SELECT_EXISTING",
    roomResolutionMode: "SELECT_EXISTING",
    resolvedSlotLabel: "",
    resolvedRoomId: "",
    createSlotLabel: "",
    createSlotDayId: "",
    createSlotStartBandId: "",
    createSlotEndBandId: "",
    createSlotLaneIndex: 0,
    createRoomBuildingName: "",
    createRoomName: "",
  };
}

function createDecisionForPreviewRow(row: TimetableImportPreviewRow): RowDecisionState {
  const slotResolutionMode: SlotResolutionMode =
    row.classification === "UNRESOLVED_SLOT" ? "CREATE_SLOT" : "SELECT_EXISTING";

  const roomResolutionMode: RoomResolutionMode =
    row.classification === "UNRESOLVED_ROOM" || row.classification === "AMBIGUOUS_CLASSROOM"
      ? "CREATE_ROOM"
      : "SELECT_EXISTING";

  return {
    action: row.classification === "VALID_AND_AUTOMATABLE" ? "AUTO" : "SKIP",
    slotResolutionMode,
    roomResolutionMode,
    resolvedSlotLabel: row.resolvedSlotLabel ?? row.slot,
    resolvedRoomId: row.resolvedRoomId ?? "",
    createSlotLabel: row.slot,
    createSlotDayId: "",
    createSlotStartBandId: "",
    createSlotEndBandId: "",
    createSlotLaneIndex: 0,
    createRoomBuildingName: row.parsedBuilding ?? "",
    createRoomName: row.parsedRoom ?? "",
  };
}

function applySavedDecisionToRow(
  row: TimetableImportPreviewRow,
  savedDecision: TimetableImportSavedDecision,
): RowDecisionState {
  const next = createDecisionForPreviewRow(row);

  next.action =
    savedDecision.action === "AUTO" && row.classification !== "VALID_AND_AUTOMATABLE"
      ? "SKIP"
      : savedDecision.action;

  if (savedDecision.resolvedSlotLabel) {
    next.resolvedSlotLabel = savedDecision.resolvedSlotLabel;
  }

  if (savedDecision.resolvedRoomId) {
    next.resolvedRoomId = savedDecision.resolvedRoomId;
  }

  if (savedDecision.createSlot) {
    next.slotResolutionMode = "CREATE_SLOT";
    next.createSlotDayId = savedDecision.createSlot.dayId;
    next.createSlotStartBandId = savedDecision.createSlot.startBandId;
    next.createSlotEndBandId = savedDecision.createSlot.endBandId;
    next.createSlotLaneIndex = savedDecision.createSlot.laneIndex ?? 0;
    next.createSlotLabel = savedDecision.createSlot.label ?? next.createSlotLabel;
  } else if (savedDecision.resolvedSlotLabel) {
    next.slotResolutionMode = "SELECT_EXISTING";
  }

  if (savedDecision.createRoom) {
    next.roomResolutionMode = "CREATE_ROOM";
    next.createRoomBuildingName = savedDecision.createRoom.buildingName;
    next.createRoomName = savedDecision.createRoom.roomName;
  } else if (savedDecision.resolvedRoomId) {
    next.roomResolutionMode = "SELECT_EXISTING";
  }

  return next;
}

function buildRowDecisionsFromReport(
  report: TimetableImportPreviewReport,
): Record<number, RowDecisionState> {
  const savedByRowId = new Map<number, TimetableImportSavedDecision>(
    report.savedDecisions.map((decision) => [decision.rowId, decision]),
  );

  const decisions: Record<number, RowDecisionState> = {};

  for (const row of report.rows) {
    const savedDecision = savedByRowId.get(row.rowId);

    decisions[row.rowId] = savedDecision
      ? applySavedDecisionToRow(row, savedDecision)
      : createDecisionForPreviewRow(row);
  }

  return decisions;
}

function toCellKey(dayId: number, laneIndex: number, bandIndex: number): string {
  return `${dayId}:${laneIndex}:${bandIndex}`;
}

function toTimeLabel(timeValue: string): string {
  return timeValue.slice(0, 5);
}

function parseAliasMap(raw: string): Record<string, string> {
  const output: Record<string, string> = {};

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const alias = line.slice(0, delimiterIndex).trim();
    const canonical = line.slice(delimiterIndex + 1).trim();

    if (!alias || !canonical) {
      continue;
    }

    output[alias] = canonical;
  }

  return output;
}

function toApiDecisionAction(
  action: RowDecisionAction,
): TimetableImportCommitDecision["action"] {
  if (action === "AUTO") {
    return "AUTO";
  }

  if (action === "RESOLVE") {
    return "RESOLVE";
  }

  return "SKIP";
}

function toRowActionLabel(action: "AUTO" | "RESOLVE" | "SKIP"): string {
  return action;
}

function toDateInputValue(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toDateOnlyInputValue(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toDecisionComparisonSignature(
  decision: TimetableImportCommitDecision | null,
): string {
  if (!decision) {
    return "__MISSING__";
  }

  return JSON.stringify({
    action: decision.action,
    resolvedSlotLabel: decision.resolvedSlotLabel?.trim() ?? null,
    resolvedRoomId: decision.resolvedRoomId ?? null,
    createSlot: decision.createSlot ?? null,
    createRoom: decision.createRoom ?? null,
  });
}

function toConflictWindowRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startAt} - ${endAt}`;
  }

  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

function toSnapshotStateFromGrid(grid: SlotFullGrid): TimetableSnapshotState {
  return {
    slotSystemId: grid.slotSystem.id,
    days: grid.days.map((day) => ({
      id: day.id,
      dayOfWeek: day.dayOfWeek,
      orderIndex: day.orderIndex,
      laneCount: day.laneCount,
    })),
    timeBands: grid.timeBands.map((band) => ({
      id: band.id,
      startTime: String(band.startTime),
      endTime: String(band.endTime),
      orderIndex: band.orderIndex,
    })),
    blocks: grid.blocks.map((block) => ({
      id: block.id,
      dayId: block.dayId,
      startBandId: block.startBandId,
      laneIndex: block.laneIndex,
      rowSpan: block.rowSpan,
      label: block.label,
    })),
  };
}

function showConflictingBookingsPopup(
  report: TimetableImportCommitReport,
  operationLabel: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  const conflicts = Array.isArray(report.conflictingBookings)
    ? report.conflictingBookings
    : [];

  if (conflicts.length === 0) {
    return;
  }

  const lines = conflicts.map(
    (conflict, index) =>
      `${index + 1}. Row ${conflict.rowIndex} · ${toConflictWindowRange(
        conflict.startAt,
        conflict.endAt,
      )}\n   ${conflict.message}`,
  );

  window.alert(
    `${operationLabel} found ${conflicts.length} conflicting booking(s):\n\n${lines.join("\n\n")}`,
  );
}

function toCommitStageLabel(stage: CommitSessionStage): string {
  if (stage === "external") {
    return "External";
  }

  if (stage === "internal") {
    return "Internal";
  }

  return "Runtime";
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("request failed (429)") ||
    normalized.includes(" 429")
  );
}

export type TimetableBuilderView = "all" | "structure" | "imports" | "processed" | "workspace";

type TimetableBuilderPageProps = {
  view?: TimetableBuilderView;
};

type CommitPipelineStep =
  | "IDLE"
  | "SESSION_STARTED"
  | "EXTERNAL_CHECK"
  | "EXTERNAL_CONFLICTS"
  | "EXTERNAL_RESOLVED"
  | "INTERNAL_CHECK"
  | "INTERNAL_CONFLICTS"
  | "INTERNAL_RESOLVED"
  | "FREEZE"
  | "RUNTIME_CHECK"
  | "RUNTIME_CONFLICTS"
  | "RUNTIME_RESOLVED"
  | "FINALIZE"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

function toCommitPipelineLabel(step: CommitPipelineStep): string {
  switch (step) {
    case "IDLE":
      return "Idle";
    case "SESSION_STARTED":
      return "Session started";
    case "EXTERNAL_CHECK":
      return "External check";
    case "EXTERNAL_CONFLICTS":
      return "External conflicts";
    case "EXTERNAL_RESOLVED":
      return "External resolved";
    case "INTERNAL_CHECK":
      return "Internal check";
    case "INTERNAL_CONFLICTS":
      return "Internal conflicts";
    case "INTERNAL_RESOLVED":
      return "Internal resolved";
    case "FREEZE":
      return "Freeze acquired";
    case "RUNTIME_CHECK":
      return "Runtime check";
    case "RUNTIME_CONFLICTS":
      return "Runtime conflicts";
    case "RUNTIME_RESOLVED":
      return "Runtime resolved";
    case "FINALIZE":
      return "Finalizing";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "FAILED":
      return "Failed";
    default:
      return "Idle";
  }
}

export function TimetableBuilderPage({ view = "all" }: TimetableBuilderPageProps = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [slotSystems, setSlotSystems] = useState<SlotSystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<number | "">("");
  const [grid, setGrid] = useState<SlotFullGrid | null>(null);

  const [loadingSystems, setLoadingSystems] = useState(false);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newSystemName, setNewSystemName] = useState("");
  const [newDayOfWeek, setNewDayOfWeek] = useState<DayOfWeek>("MON");
  const [newBandStart, setNewBandStart] = useState("");
  const [newBandEnd, setNewBandEnd] = useState("");
  const [blockLabel, setBlockLabel] = useState("L1");
  const [editingBandId, setEditingBandId] = useState<number | null>(null);
  const [editingBandStart, setEditingBandStart] = useState("");
  const [editingBandEnd, setEditingBandEnd] = useState("");
  const [deletingBandId, setDeletingBandId] = useState<number | null>(null);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [importTermStart, setImportTermStart] = useState("");
  const [importTermEnd, setImportTermEnd] = useState("");
  const [aliasMapText, setAliasMapText] = useState("");
  const [allocationFile, setAllocationFile] = useState<File | null>(null);

  const [importLoading, setImportLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [saveDecisionsLoading, setSaveDecisionsLoading] = useState(false);
  const [reallocateLoading, setReallocateLoading] = useState(false);
  const [deleteBatchLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);

  const [importBatches, setImportBatches] = useState<TimetableImportBatchSummary[]>([]);
  const [importBatchesLoading, setImportBatchesLoading] = useState(false);
  const [importBatchesError, setImportBatchesError] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number | "">("");

  const [previewReport, setPreviewReport] = useState<TimetableImportPreviewReport | null>(null);
  const [commitReport, setCommitReport] = useState<TimetableImportCommitReport | null>(null);
  const [processedRowsReport, setProcessedRowsReport] =
    useState<TimetableImportProcessedRowsReport | null>(null);
  const [processedRowsLoading, setProcessedRowsLoading] = useState(false);
  const [processedRowsError, setProcessedRowsError] = useState<string | null>(null);
  const [processedBookingEdits, setProcessedBookingEdits] =
    useState<Record<number, ProcessedBookingEditState>>({});
  const [newRowBookingDrafts, setNewRowBookingDrafts] =
    useState<Record<number, ProcessedBookingEditState>>({});
  const [savingBookingId, setSavingBookingId] = useState<number | null>(null);
  const [deletingBookingId, setDeletingBookingId] = useState<number | null>(null);
  const [creatingRowId, setCreatingRowId] = useState<number | null>(null);
  const [creatingResolveSlotRowId, setCreatingResolveSlotRowId] = useState<number | null>(null);
  const [rowDecisions, setRowDecisions] = useState<Record<number, RowDecisionState>>({});

  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);

  // Conflict-aware commit state
  const [commitSessionId, setCommitSessionId] = useState<number | null>(null);
  const [conflictStage, setConflictStage] = useState<CommitSessionStage | null>(null);
  const [conflictReport, setConflictReport] = useState<CommitStageReport | null>(null);
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, ConflictResolutionDraft>
  >({});
  const [conflictLoading, setConflictLoading] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [isCommitFreezeActive, setIsCommitFreezeActive] = useState(false);
  const [commitPipelineStep, setCommitPipelineStep] = useState<CommitPipelineStep>("IDLE");
  const [commitFlowContext, setCommitFlowContext] = useState<"import" | "edit" | null>(null);
  const [commitTargetSlotSystemId, setCommitTargetSlotSystemId] = useState<number | null>(null);

  // Change workspace state
  const [showChangeWorkspace, setShowChangeWorkspace] = useState(false);
  const [changePreview, setChangePreview] = useState<ChangePreviewResult | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);
  const [editPruneBookings, setEditPruneBookings] = useState(true);
  const [editStartLoading, setEditStartLoading] = useState(false);
  const [editStartResult, setEditStartResult] =
    useState<EditCommitSessionStartResponse | null>(null);
  const [editDraftJson, setEditDraftJson] = useState("");
  const [workspaceAutoOpenedForSystemId, setWorkspaceAutoOpenedForSystemId] = useState<number | null>(null);
  const [editSessionStatus, setEditSessionStatus] = useState<"VIEW" | "EDITING" | "COMMITTING">("VIEW");
  const [showPruneConfirmation, setShowPruneConfirmation] = useState(false);
  const [pendingPruneBookingCount, setPendingPruneBookingCount] = useState(0);
  const [maintenanceTab, setMaintenanceTab] = useState<"SLOT_SYSTEM" | "DANGER_ZONE">("SLOT_SYSTEM");

  const days: SlotDay[] = grid?.days ?? [];
  const timeBands: SlotTimeBand[] = grid?.timeBands ?? [];
  const blocks: SlotBlock[] = grid?.blocks ?? [];

  const isImportBatchCommitted = previewReport?.status === "COMMITTED";
  const isDecisionEditingLocked =
    commitLoading ||
    importLoading ||
    saveDecisionsLoading ||
    reallocateLoading ||
    deleteBatchLoading ||
    creatingResolveSlotRowId !== null;

  const slotLabelOptions = useMemo(() => {
    const labels = Array.from(
      new Set(
        blocks
          .map((block) => block.label.trim())
          .filter((label) => label.length > 0),
      ),
    );

    return labels.sort((a, b) => a.localeCompare(b));
  }, [blocks]);

  const buildingNameById = useMemo(() => {
    return new Map(buildings.map((building) => [building.id, building.name]));
  }, [buildings]);

  const roomLabelById = useMemo(() => {
    const map = new Map<number, string>();

    for (const room of rooms) {
      const buildingLabel = buildingNameById.get(room.buildingId) ?? "Unknown Building";
      map.set(room.id, `${buildingLabel} - ${room.name}`);
    }

    return map;
  }, [rooms, buildingNameById]);

  const bandIndexById = useMemo(() => {
    const map = new Map<number, number>();
    timeBands.forEach((band, index) => {
      map.set(band.id, index);
    });
    return map;
  }, [timeBands]);

  const dayLaneInfo = useMemo(() => {
    const laneByBlockId = new Map<number, number>();
    const laneCountByDay = new Map<number, number>();

    for (const day of days) {
      const configuredLaneCount = Math.max(1, day.laneCount);

      const dayBlocks = blocks
        .map((block) => {
          if (block.dayId !== day.id) {
            return null;
          }

          const startIndex = bandIndexById.get(block.startBandId);
          if (startIndex === undefined) {
            return null;
          }

          const safeRowSpan = Math.min(block.rowSpan, timeBands.length - startIndex);
          if (safeRowSpan <= 0) {
            return null;
          }

          return {
            block,
            startIndex,
            endIndex: startIndex + safeRowSpan,
          };
        })
        .filter(
          (
            value,
          ): value is { block: SlotBlock; startIndex: number; endIndex: number } =>
            value !== null,
        )
        .sort((a, b) => {
          if (a.startIndex !== b.startIndex) {
            return a.startIndex - b.startIndex;
          }

          if (a.endIndex !== b.endIndex) {
            return a.endIndex - b.endIndex;
          }

          return a.block.id - b.block.id;
        });

      const laneEndIndices: number[] = new Array(configuredLaneCount).fill(-1);

      for (const item of dayBlocks) {
        const preferredLaneRaw = Number.isInteger(item.block.laneIndex)
          ? item.block.laneIndex
          : 0;
        const preferredLane = preferredLaneRaw >= 0 ? preferredLaneRaw : 0;

        let laneIndex = -1;

        if (
          preferredLane < laneEndIndices.length &&
          item.startIndex >= (laneEndIndices[preferredLane] ?? -1)
        ) {
          laneIndex = preferredLane;
        }

        if (laneIndex === -1) {
          laneIndex = laneEndIndices.findIndex(
            (laneEndIndex) => item.startIndex >= (laneEndIndex ?? -1),
          );
        }

        if (laneIndex === -1) {
          laneIndex = laneEndIndices.length;
          laneEndIndices.push(item.endIndex);
        } else {
          laneEndIndices[laneIndex] = item.endIndex;
        }

        laneByBlockId.set(item.block.id, laneIndex);
      }

      const visibleLaneCount = Math.max(configuredLaneCount, laneEndIndices.length);

      laneCountByDay.set(day.id, visibleLaneCount);
    }

    return {
      laneByBlockId,
      laneCountByDay,
    };
  }, [bandIndexById, blocks, days, timeBands.length]);

  const hasMultipleLanes = useMemo(
    () => days.some((day) => (dayLaneInfo.laneCountByDay.get(day.id) ?? 1) > 1),
    [dayLaneInfo, days],
  );

  const blockLayout = useMemo(() => {
    const blockStartByCell = new Map<string, SlotBlock>();
    const coveredCells = new Set<string>();

    for (const block of blocks) {
      const startIndex = bandIndexById.get(block.startBandId);
      if (startIndex === undefined) {
        continue;
      }

      const laneIndex = dayLaneInfo.laneByBlockId.get(block.id) ?? 0;
      const safeRowSpan = Math.min(block.rowSpan, timeBands.length - startIndex);

      if (safeRowSpan <= 0) {
        continue;
      }

      blockStartByCell.set(toCellKey(block.dayId, laneIndex, startIndex), block);

      for (let offset = 1; offset < safeRowSpan; offset += 1) {
        coveredCells.add(toCellKey(block.dayId, laneIndex, startIndex + offset));
      }
    }

    return {
      blockStartByCell,
      coveredCells,
    };
  }, [bandIndexById, blocks, dayLaneInfo.laneByBlockId, timeBands.length]);

  const selectedSystem = useMemo(() => {
    if (selectedSystemId === "") {
      return null;
    }
    return slotSystems.find((system) => system.id === selectedSystemId) ?? null;
  }, [selectedSystemId, slotSystems]);

  const isSystemLocked = selectedSystem?.isLocked ?? false;
  const lockedStructureEditMessage =
    "Slot system is locked. Use Edit Structure to modify days, time bands, lanes, or blocks.";
  const showStructureSection = view === "all" || view === "structure" || view === "workspace";
  const showImportSection = view === "all" || view === "imports" || view === "processed";
  const showImportControls = view === "all" || view === "imports";
  const showProcessedSection = view === "all" || view === "processed";
  const showGridSection = view === "all" || view === "structure" || view === "workspace";

  const previewRowById = useMemo(() => {
    return new Map<number, TimetableImportPreviewRow>(
      (previewReport?.rows ?? []).map((row) => [row.rowId, row]),
    );
  }, [previewReport]);

  const loadSlotSystems = async () => {
    setLoadingSystems(true);
    setError(null);

    try {
      const systems = await getSlotSystems();
      setSlotSystems(systems);

      if (systems.length === 0) {
        setSelectedSystemId("");
        setGrid(null);
        return;
      }

      setSelectedSystemId((current) => {
        if (current !== "" && systems.some((system) => system.id === current)) {
          return current;
        }
        return systems[0].id;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load slot systems");
    } finally {
      setLoadingSystems(false);
    }
  };

  const loadGrid = async (slotSystemId: number) => {
    setLoadingGrid(true);
    setError(null);

    try {
      const fullGrid = await getFullGrid(slotSystemId);
      setGrid(fullGrid);
    } catch (e) {
      setGrid(null);
      setError(e instanceof Error ? e.message : "Failed to load timetable grid");
    } finally {
      setLoadingGrid(false);
    }
  };

  const loadRoomContext = async () => {
    try {
      const [loadedBuildings, loadedRooms] = await Promise.all([
        getBuildings(),
        getRooms(),
      ]);

      setBuildings(loadedBuildings);
      setRooms(loadedRooms);
    } catch {
      // Keep the page usable even if resolution helpers fail to load.
    }
  };

  const loadImportBatches = async (slotSystemId: number | "") => {
    if (slotSystemId === "") {
      setImportBatches([]);
      setImportBatchesError(null);
      setSelectedBatchId("");
      return;
    }

    setImportBatchesLoading(true);
    setImportBatchesError(null);

    try {
      const batches = await apiGetTimetableImportBatches({
        slotSystemId,
        limit: 50,
      });

      setImportBatches(batches);

      setSelectedBatchId((current) => {
        if (current !== "" && batches.some((batch) => batch.batchId === current)) {
          return current;
        }

        if (previewReport && batches.some((batch) => batch.batchId === previewReport.batchId)) {
          return previewReport.batchId;
        }

        return batches[0]?.batchId ?? "";
      });
    } catch (e) {
      setImportBatches([]);
      setImportBatchesError(e instanceof Error ? e.message : "Failed to load import batches");
    } finally {
      setImportBatchesLoading(false);
    }
  };

  const hydratePreviewFromBatch = (report: TimetableImportPreviewReport) => {
    setPreviewReport(report);
    setRowDecisions(buildRowDecisionsFromReport(report));
    setImportTermStart(toDateOnlyInputValue(report.termStartDate));
    setImportTermEnd(toDateOnlyInputValue(report.termEndDate));
    setSelectedBatchId(report.batchId);
  };

  const hydrateProcessedBookingState = (report: TimetableImportProcessedRowsReport) => {
    const nextEdits: Record<number, ProcessedBookingEditState> = {};
    const nextDrafts: Record<number, ProcessedBookingEditState> = {};

    for (const row of report.rows) {
      let draftRoomId: number | "" = row.resolvedRoomId ?? "";
      let draftStartAt = "";
      let draftEndAt = "";

      for (const occurrence of row.occurrences) {
        const sourceStart = occurrence.booking?.startAt ?? occurrence.startAt;
        const sourceEnd = occurrence.booking?.endAt ?? occurrence.endAt;

        if (!draftStartAt) {
          draftStartAt = toDateInputValue(sourceStart);
        }

        if (!draftEndAt) {
          draftEndAt = toDateInputValue(sourceEnd);
        }

        if (occurrence.booking) {
          draftRoomId = occurrence.booking.roomId;

          nextEdits[occurrence.booking.id] = {
            roomId: occurrence.booking.roomId,
            startAt: toDateInputValue(occurrence.booking.startAt),
            endAt: toDateInputValue(occurrence.booking.endAt),
          };
        } else if (draftRoomId === "") {
          draftRoomId = occurrence.roomId;
        }
      }

      nextDrafts[row.rowId] = {
        roomId: draftRoomId,
        startAt: draftStartAt,
        endAt: draftEndAt,
      };
    }

    setProcessedBookingEdits(nextEdits);
    setNewRowBookingDrafts(nextDrafts);
  };

  const loadProcessedRows = async (batchId: number) => {
    setProcessedRowsLoading(true);
    setProcessedRowsError(null);

    try {
      const report = await apiGetTimetableImportProcessedRows(batchId);
      setProcessedRowsReport(report);
      hydrateProcessedBookingState(report);
    } catch (e) {
      setProcessedRowsReport(null);
      setProcessedRowsError(
        e instanceof Error ? e.message : "Failed to load processed import rows",
      );
    } finally {
      setProcessedRowsLoading(false);
    }
  };

  const handleLoadImportBatch = useCallback(async (batchId: number) => {
    setImportLoading(true);
    setImportError(null);
    setImportInfo(null);

    try {
      const report = await apiGetTimetableImportBatch(batchId);
      hydratePreviewFromBatch(report);
      await loadProcessedRows(report.batchId);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to load import batch");
    } finally {
      setImportLoading(false);
    }
  }, []);

  const updateProcessedBookingEdit = (
    bookingId: number,
    patch: Partial<ProcessedBookingEditState>,
  ) => {
    setProcessedBookingEdits((current) => {
      const existing = current[bookingId] ?? {
        roomId: "",
        startAt: "",
        endAt: "",
      };

      return {
        ...current,
        [bookingId]: {
          ...existing,
          ...patch,
        },
      };
    });
  };

  const updateNewRowBookingDraft = (
    rowId: number,
    patch: Partial<ProcessedBookingEditState>,
  ) => {
    setNewRowBookingDrafts((current) => {
      const existing = current[rowId] ?? {
        roomId: "",
        startAt: "",
        endAt: "",
      };

      return {
        ...current,
        [rowId]: {
          ...existing,
          ...patch,
        },
      };
    });
  };

  const handleSaveProcessedBooking = async (batchId: number, bookingId: number) => {
    const draft = processedBookingEdits[bookingId];

    if (!draft || draft.roomId === "" || !draft.startAt || !draft.endAt) {
      setProcessedRowsError("Room, start, and end are required to update a booking");
      return;
    }

    setSavingBookingId(bookingId);
    setProcessedRowsError(null);

    try {
      await apiUpdateBooking(bookingId, {
        roomId: draft.roomId,
        startAt: draft.startAt,
        endAt: draft.endAt,
      });

      await loadProcessedRows(batchId);
    } catch (e) {
      setProcessedRowsError(e instanceof Error ? e.message : "Failed to update booking");
    } finally {
      setSavingBookingId(null);
    }
  };

  const handleDeleteProcessedBooking = async (batchId: number, bookingId: number) => {
    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm("Delete this booking? This action cannot be undone.");

    if (!approved) {
      return;
    }

    setDeletingBookingId(bookingId);
    setProcessedRowsError(null);

    try {
      await apiDeleteBooking(bookingId);
      await loadProcessedRows(batchId);
    } catch (e) {
      setProcessedRowsError(e instanceof Error ? e.message : "Failed to delete booking");
    } finally {
      setDeletingBookingId(null);
    }
  };

  const handleCreateRowBooking = async (batchId: number, rowId: number) => {
    const draft = newRowBookingDrafts[rowId];

    if (!draft || draft.roomId === "" || !draft.startAt || !draft.endAt) {
      setProcessedRowsError("Room, start, and end are required to create a booking");
      return;
    }

    setCreatingRowId(rowId);
    setProcessedRowsError(null);

    try {
      await apiCreateBooking({
        roomId: draft.roomId,
        startAt: draft.startAt,
        endAt: draft.endAt,
        metadata: {
          source: "TIMETABLE_ALLOCATION",
          sourceRef: `batch:${batchId}:row:${rowId}:manual-create`,
        },
      });

      await loadProcessedRows(batchId);
    } catch (e) {
      setProcessedRowsError(e instanceof Error ? e.message : "Failed to create booking");
    } finally {
      setCreatingRowId(null);
    }
  };

  useEffect(() => {
    void loadSlotSystems();
    void loadRoomContext();
  }, []);

  useEffect(() => {
    if (selectedSystemId === "") {
      setGrid(null);
      setImportBatches([]);
      setImportBatchesError(null);
      setSelectedBatchId("");
      return;
    }

    void loadGrid(selectedSystemId);
    void loadImportBatches(selectedSystemId);
  }, [selectedSystemId]);

  useEffect(() => {
    if (view !== "processed") {
      return;
    }

    if (selectedBatchId === "" || importLoading || processedRowsLoading) {
      return;
    }

    const hasPreview = previewReport?.batchId === selectedBatchId;
    const hasProcessedRows = processedRowsReport?.batchId === selectedBatchId;

    if (hasPreview && hasProcessedRows) {
      return;
    }

    void handleLoadImportBatch(selectedBatchId);
  }, [
    view,
    selectedBatchId,
    importLoading,
    processedRowsLoading,
    previewReport?.batchId,
    processedRowsReport?.batchId,
    handleLoadImportBatch,
  ]);

  const handleCreateSlotSystem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = newSystemName.trim();
    if (!trimmedName) {
      setError("Slot system name is required");
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const created = await apiCreateSlotSystem(trimmedName);
      setNewSystemName("");
      await loadSlotSystems();
      setSelectedSystemId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create slot system");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSlotSystem = async () => {
    if (selectedSystemId === "") {
      return;
    }

    const selectedLabel = selectedSystem?.name ?? "this slot system";
    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete slot system "${selectedLabel}"? This removes its grid structure and cannot be undone.`,
          );

    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiDeleteSlotSystem(selectedSystemId);
      setGrid(null);
      await loadSlotSystems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete slot system");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePruneAllBookings = async () => {
    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm("Prune ALL bookings across all rooms? This action cannot be undone.");

    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await apiPruneAllBookings();
      const bookingLabel = result.deletedBookings === 1 ? "booking" : "bookings";
      setSuccessMessage(`Pruned ${result.deletedBookings} ${bookingLabel} across all rooms.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to prune all bookings");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePruneSelectedSlotSystemBookings = async () => {
    if (selectedSystemId === "") {
      setError("Select a slot system first");
      return;
    }

    const selectedLabel = selectedSystem?.name ?? "Unknown";

    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Prune imported bookings linked to slot system "${selectedLabel}"? This keeps manual bookings and cannot be undone.`,
          );

    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await apiPruneBookingsBySlotSystem(selectedSystemId);
      const bookingLabel = result.deletedBookings === 1 ? "booking" : "bookings";
      setSuccessMessage(
        `Pruned ${result.deletedBookings} imported ${bookingLabel} for slot system ${selectedLabel}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to prune slot-system bookings");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateDay = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedSystemId === "") {
      setError("Select a slot system first");
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiCreateDay({
        slotSystemId: selectedSystemId,
        dayOfWeek: newDayOfWeek,
      });
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create day");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTimeBand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedSystemId === "") {
      setError("Select a slot system first");
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    if (!newBandStart || !newBandEnd) {
      setError("Start and end times are required");
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiCreateTimeBand({
        slotSystemId: selectedSystemId,
        startTime: newBandStart,
        endTime: newBandEnd,
      });
      setNewBandStart("");
      setNewBandEnd("");
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create time band");
    } finally {
      setActionLoading(false);
    }
  };

  const startEditingTimeBand = (band: SlotTimeBand) => {
    setEditingBandId(band.id);
    setEditingBandStart(toTimeLabel(String(band.startTime)));
    setEditingBandEnd(toTimeLabel(String(band.endTime)));
  };

  const cancelEditingTimeBand = () => {
    setEditingBandId(null);
    setEditingBandStart("");
    setEditingBandEnd("");
  };

  const handleUpdateTimeBand = async (bandId: number) => {
    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    if (!editingBandStart || !editingBandEnd) {
      setError("Band start and end times are required");
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiUpdateTimeBand(bandId, {
        startTime: editingBandStart,
        endTime: editingBandEnd,
      });
      cancelEditingTimeBand();
      if (selectedSystemId !== "") {
        await loadGrid(selectedSystemId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update time band");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTimeBand = async (bandId: number) => {
    if (selectedSystemId === "") {
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    const approved = typeof window === "undefined"
      ? true
      : window.confirm("Delete this time band?");

    if (!approved) {
      return;
    }

    setDeletingBandId(bandId);
    setActionLoading(true);
    setError(null);

    try {
      await apiDeleteTimeBand(bandId);
      if (editingBandId === bandId) {
        cancelEditingTimeBand();
      }
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete time band");
    } finally {
      setDeletingBandId(null);
      setActionLoading(false);
    }
  };

  const createBlockFromSelection = async (selection: DragSelection) => {
    if (selectedSystemId === "") {
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    const minIndex = Math.min(selection.startBandIndex, selection.endBandIndex);
    const maxIndex = Math.max(selection.startBandIndex, selection.endBandIndex);

    const startBand = timeBands[minIndex];
    if (!startBand) {
      return;
    }

    const rowSpan = maxIndex - minIndex + 1;
    const label = blockLabel.trim() || "L1";

    setActionLoading(true);
    setError(null);

    try {
      await apiCreateBlock({
        slotSystemId: selectedSystemId,
        dayId: selection.dayId,
        startBandId: startBand.id,
        laneIndex: selection.laneIndex,
        rowSpan,
        label,
      });
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create block");
    } finally {
      setActionLoading(false);
    }
  };

  const commitSelection = async () => {
    if (!dragSelection) {
      return;
    }

    if (isSystemLocked) {
      setDragSelection(null);
      setError(lockedStructureEditMessage);
      return;
    }

    const activeSelection = dragSelection;
    setDragSelection(null);
    await createBlockFromSelection(activeSelection);
  };

  const handleDeleteBlock = async (blockId: number) => {
    if (selectedSystemId === "") {
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    const blockLabel = blocks.find((block) => block.id === blockId)?.label ?? `#${blockId}`;
    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm(`Delete block "${blockLabel}"?`);

    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiDeleteBlock(blockId);
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete block");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddLane = async (dayId: number) => {
    if (selectedSystemId === "") {
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiAddDayLane(dayId);
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add lane");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveLane = async (day: SlotDay) => {
    if (selectedSystemId === "") {
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    if (day.laneCount <= 1) {
      setError("At least one lane must remain for a day");
      return;
    }

    const dayLabel = DAY_LABELS[day.dayOfWeek];
    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Remove one lane from ${dayLabel}? This change cannot be undone.`,
          );

    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiRemoveDayLane(day.id);
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove lane");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDay = async (day: SlotDay) => {
    if (selectedSystemId === "") {
      return;
    }

    if (isSystemLocked) {
      setError(lockedStructureEditMessage);
      return;
    }

    const dayLabel = DAY_LABELS[day.dayOfWeek];
    const approved = typeof window === "undefined"
      ? true
      : window.confirm(`Delete ${dayLabel}?`);

    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await apiDeleteDay(day.id);
      await loadGrid(selectedSystemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete day");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmptyCellMouseDown = (
    dayId: number,
    laneIndex: number,
    bandIndex: number,
  ) => {
    if (actionLoading || loadingGrid || selectedSystemId === "" || isSystemLocked) {
      return;
    }

    setDragSelection({
      dayId,
      laneIndex,
      startBandIndex: bandIndex,
      endBandIndex: bandIndex,
    });
  };

  const handleEmptyCellMouseEnter = (
    dayId: number,
    laneIndex: number,
    bandIndex: number,
  ) => {
    setDragSelection((current) => {
      if (
        !current ||
        current.dayId !== dayId ||
        current.laneIndex !== laneIndex
      ) {
        return current;
      }

      if (current.endBandIndex === bandIndex) {
        return current;
      }

      return {
        ...current,
        endBandIndex: bandIndex,
      };
    });
  };

  const isCellSelected = (
    dayId: number,
    laneIndex: number,
    bandIndex: number,
  ): boolean => {
    if (
      !dragSelection ||
      dragSelection.dayId !== dayId ||
      dragSelection.laneIndex !== laneIndex
    ) {
      return false;
    }

    const minIndex = Math.min(dragSelection.startBandIndex, dragSelection.endBandIndex);
    const maxIndex = Math.max(dragSelection.startBandIndex, dragSelection.endBandIndex);

    return bandIndex >= minIndex && bandIndex <= maxIndex;
  };

  const handlePreviewImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const activeSystemId = selectedSystemId;

    if (activeSystemId === "") {
      setImportError("Select a slot system before uploading");
      return;
    }

    if (!importTermStart || !importTermEnd) {
      setImportError("Term start and end dates are required");
      return;
    }

    if (!allocationFile) {
      setImportError("Choose a CSV/XLSX allocation file");
      return;
    }

    setImportLoading(true);
    setImportError(null);
    setImportInfo(null);
    setCommitReport(null);
    setProcessedRowsReport(null);
    setProcessedRowsError(null);
    setCommitPipelineStep("IDLE");

    try {
      const aliasMap = parseAliasMap(aliasMapText);

      const report = await apiPreviewTimetableImport({
        slotSystemId: activeSystemId,
        termStartDate: importTermStart,
        termEndDate: importTermEnd,
        file: allocationFile,
        aliasMap,
      });

      hydratePreviewFromBatch(report);
      await loadProcessedRows(report.batchId);
      await loadImportBatches(activeSystemId);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to preview import");
    } finally {
      setImportLoading(false);
    }
  };

  const updateRowDecision = (rowId: number, patch: Partial<RowDecisionState>) => {
    setRowDecisions((current) => {
      const existing = current[rowId] ?? createEmptyDecisionState();

      return {
        ...current,
        [rowId]: {
          ...existing,
          ...patch,
        },
      };
    });
  };

  const buildRowDecisionPayload = (
    rowId: number,
    decision: RowDecisionState,
  ): TimetableImportCommitDecision | null => {
    if (!Number.isInteger(rowId) || rowId <= 0) {
      return null;
    }

    const previewRow = previewRowById.get(rowId);
    const normalizedAction: RowDecisionAction =
      decision.action === "AUTO" && previewRow?.classification !== "VALID_AND_AUTOMATABLE"
        ? "SKIP"
        : decision.action;

    const mappedAction = toApiDecisionAction(normalizedAction);

    if (normalizedAction !== "RESOLVE") {
      return {
        rowId,
        action: mappedAction,
      };
    }

    const resolveDecision: TimetableImportCommitDecision = {
      rowId,
      action: "RESOLVE",
    };

    const trimmedResolvedSlotLabel = decision.resolvedSlotLabel.trim();
    const trimmedCreateSlotLabel = decision.createSlotLabel.trim();
    const trimmedCreateRoomBuilding = decision.createRoomBuildingName.trim();
    const trimmedCreateRoomName = decision.createRoomName.trim();

    if (decision.slotResolutionMode === "CREATE_SLOT") {
      if (
        decision.createSlotDayId !== "" &&
        decision.createSlotStartBandId !== "" &&
        decision.createSlotEndBandId !== ""
      ) {
        resolveDecision.createSlot = {
          dayId: decision.createSlotDayId,
          startBandId: decision.createSlotStartBandId,
          endBandId: decision.createSlotEndBandId,
          ...(trimmedCreateSlotLabel ? { label: trimmedCreateSlotLabel } : {}),
        };
      }
    } else if (trimmedResolvedSlotLabel) {
      resolveDecision.resolvedSlotLabel = trimmedResolvedSlotLabel;
    }

    if (decision.roomResolutionMode === "CREATE_ROOM") {
      if (trimmedCreateRoomBuilding && trimmedCreateRoomName) {
        resolveDecision.createRoom = {
          buildingName: trimmedCreateRoomBuilding,
          roomName: trimmedCreateRoomName,
        };
      }
    } else if (decision.resolvedRoomId !== "") {
      resolveDecision.resolvedRoomId = decision.resolvedRoomId;
    }

    return resolveDecision;
  };

  const buildImportDecisionsPayload = (): TimetableImportCommitDecision[] => {
    return Object.entries(rowDecisions).reduce<TimetableImportCommitDecision[]>(
      (acc, [rawRowId, decision]) => {
        const rowId = Number(rawRowId);
        const payload = buildRowDecisionPayload(rowId, decision);

        if (!payload) {
          return acc;
        }

        acc.push(payload);
        return acc;
      },
      [],
    );
  };

  const buildChangedImportDecisionsPayload = (): TimetableImportCommitDecision[] => {
    if (!previewReport) {
      return [];
    }

    const savedDecisionByRowId = new Map<number, TimetableImportSavedDecision>(
      previewReport.savedDecisions.map((decision) => [decision.rowId, decision]),
    );

    const changedDecisions: TimetableImportCommitDecision[] = [];

    for (const row of previewReport.rows) {
      const currentState = rowDecisions[row.rowId] ?? createDecisionForPreviewRow(row);
      const currentPayload = buildRowDecisionPayload(row.rowId, currentState);

      if (!currentPayload) {
        continue;
      }

      const savedDecision = savedDecisionByRowId.get(row.rowId);
      const baselineState = savedDecision
        ? applySavedDecisionToRow(row, savedDecision)
        : createDecisionForPreviewRow(row);
      const baselinePayload = buildRowDecisionPayload(row.rowId, baselineState);

      if (
        toDecisionComparisonSignature(currentPayload) !==
        toDecisionComparisonSignature(baselinePayload)
      ) {
        changedDecisions.push(currentPayload);
      }
    }

    return changedDecisions;
  };

  const handleCreateResolveSlot = async (
    rowId: number,
    rowIndex: number,
    decision: RowDecisionState,
  ) => {
    if (!previewReport) {
      return;
    }

    const payload = buildRowDecisionPayload(rowId, decision);

    if (!payload || payload.action !== "RESOLVE" || !payload.createSlot) {
      setImportError(
        "Select Resolve -> Create slot and provide day/start/end before creating slot",
      );
      return;
    }

    setCreatingResolveSlotRowId(rowId);
    setImportError(null);
    setImportInfo(null);

    try {
      await apiSaveTimetableImportDecisions(previewReport.batchId, [payload]);

      const refreshedReport = await apiGetTimetableImportBatch(previewReport.batchId);
      hydratePreviewFromBatch(refreshedReport);

      await loadGrid(refreshedReport.slotSystemId);
      await loadProcessedRows(refreshedReport.batchId);
      await loadImportBatches(refreshedReport.slotSystemId);

      setImportInfo(`Created slot for row ${rowIndex} and refreshed timetable grid.`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to create slot from resolution");
    } finally {
      setCreatingResolveSlotRowId(null);
    }
  };

  const handleSaveImportDecisions = async () => {
    if (!previewReport) {
      return;
    }

    setSaveDecisionsLoading(true);
    setImportError(null);
    setImportInfo(null);

    try {
      const decisions = buildImportDecisionsPayload();
      await apiSaveTimetableImportDecisions(previewReport.batchId, decisions);

      const refreshedReport = await apiGetTimetableImportBatch(previewReport.batchId);
      hydratePreviewFromBatch(refreshedReport);
      setImportInfo(`Saved allocation decisions.`);

      await loadGrid(refreshedReport.slotSystemId);
      await loadProcessedRows(refreshedReport.batchId);
      await loadImportBatches(refreshedReport.slotSystemId);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to save decisions");
    } finally {
      setSaveDecisionsLoading(false);
    }
  };

  const handleReallocateImport = async () => {
    if (!previewReport) {
      return;
    }

    if (previewReport.status !== "COMMITTED") {
      setImportError("Load a committed batch to run reallocation");
      return;
    }

    setReallocateLoading(true);
    setImportError(null);
    setImportInfo(null);

    try {
      const decisions = buildChangedImportDecisionsPayload();

      if (decisions.length === 0) {
        setImportInfo("No changed rows detected, so reallocation was skipped.");
        return;
      }

      const report = await apiReallocateTimetableImport(previewReport.batchId, decisions);
      setCommitReport(report);
      showConflictingBookingsPopup(report, "Reallocation");

      const refreshedReport = await apiGetTimetableImportBatch(previewReport.batchId);
      hydratePreviewFromBatch(refreshedReport);
      setImportInfo(`Allocation decisions reallocated.`);

      await loadGrid(refreshedReport.slotSystemId);
      await loadProcessedRows(previewReport.batchId);
      await loadImportBatches(refreshedReport.slotSystemId);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to reallocate batch");
    } finally {
      setReallocateLoading(false);
    }
  };

  const clearCommitConflictState = () => {
    setShowConflictDialog(false);
    setConflictReport(null);
    setConflictResolutions({});
    setConflictStage(null);
    setCommitSessionId(null);
    setIsCommitFreezeActive(false);
    setCommitFlowContext(null);
    setCommitTargetSlotSystemId(null);
  };

  const cleanupAfterRateLimitedCommitFailure = async (activeCommitSessionId: number | null) => {
    if (activeCommitSessionId !== null) {
      try {
        await apiCancelCommitSession(activeCommitSessionId);
      } catch {
        // If cancellation is also throttled, still reset local state to avoid a stuck running UI.
      }
    }

    clearCommitConflictState();
    setEditSessionStatus("VIEW");
  };

  const hydrateAfterFinalize = async (batchId: number) => {
    const refreshedReport = await apiGetTimetableImportBatch(batchId);
    hydratePreviewFromBatch(refreshedReport);

    await loadGrid(refreshedReport.slotSystemId);
    await loadProcessedRows(batchId);
    await loadImportBatches(refreshedReport.slotSystemId);
    await loadSlotSystems();
  };

  const runFreezeRuntimeAndFinalize = async (
    activeCommitSessionId: number,
    batchId: number,
  ) => {
    setCommitPipelineStep("FREEZE");
    await apiStartCommitFreeze(activeCommitSessionId);
    setIsCommitFreezeActive(true);

    setCommitPipelineStep("RUNTIME_CHECK");
    const runtimeReport = await apiRunRuntimeCommitCheck(activeCommitSessionId);

    if (runtimeReport.conflictCount > 0) {
      setCommitPipelineStep("RUNTIME_CONFLICTS");
      setConflictStage("runtime");
      setConflictReport(runtimeReport);
      setConflictResolutions({});
      setShowConflictDialog(true);
      setEditSessionStatus("VIEW");
      return;
    }

    setCommitPipelineStep("FINALIZE");
    const finalizeReport = await apiFinalizeCommitSession(activeCommitSessionId);
    setCommitReport(null);
    setCommitPipelineStep("COMPLETED");
    clearCommitConflictState();
    setImportInfo(
      `Commit completed. Created ${finalizeReport.createdBookings} bookings and skipped ${finalizeReport.skippedOperations} operation(s).`,
    );
    await hydrateAfterFinalize(batchId);
  };

  const runInternalThenFinalize = async (
    activeCommitSessionId: number,
    batchId: number,
  ) => {
    setCommitPipelineStep("INTERNAL_CHECK");
    const internalReport = await apiRunInternalCommitCheck(activeCommitSessionId);

    if (internalReport.conflictCount > 0) {
      setCommitPipelineStep("INTERNAL_CONFLICTS");
      setConflictStage("internal");
      setConflictReport(internalReport);
      setConflictResolutions({});
      setShowConflictDialog(true);
      return;
    }

    await runFreezeRuntimeAndFinalize(activeCommitSessionId, batchId);
  };

  const runFreezeRuntimeAndFinalizeForEdit = async (
    activeCommitSessionId: number,
    slotSystemId: number,
  ) => {
    setEditSessionStatus("COMMITTING");
    setCommitPipelineStep("FREEZE");
    await apiStartCommitFreeze(activeCommitSessionId);
    setIsCommitFreezeActive(true);

    setCommitPipelineStep("RUNTIME_CHECK");
    const runtimeReport = await apiRunRuntimeCommitCheck(activeCommitSessionId);

    if (runtimeReport.conflictCount > 0) {
      setCommitPipelineStep("RUNTIME_CONFLICTS");
      setConflictStage("runtime");
      setConflictReport(runtimeReport);
      setConflictResolutions({});
      setShowConflictDialog(true);
      return;
    }

    setCommitPipelineStep("FINALIZE");
    const finalizeReport = await apiFinalizeCommitSession(activeCommitSessionId);
    setCommitReport(null);
    setCommitPipelineStep("COMPLETED");
    clearCommitConflictState();
    setEditStartResult(null);
    setChangeSuccess(
      `Edit commit completed. Created ${finalizeReport.createdBookings} bookings and removed ${finalizeReport.deletedConflictingBookings} obsolete booking(s).`,
    );
    setShowChangeWorkspace(false);

    await loadGrid(slotSystemId);
    await loadSlotSystems();
    await loadImportBatches(slotSystemId);
    setEditSessionStatus("VIEW");
  };

  const runInternalThenFinalizeForEdit = async (
    activeCommitSessionId: number,
    slotSystemId: number,
  ) => {
    setCommitPipelineStep("INTERNAL_CHECK");
    const internalReport = await apiRunInternalCommitCheck(activeCommitSessionId);

    if (internalReport.conflictCount > 0) {
      setCommitPipelineStep("INTERNAL_CONFLICTS");
      setConflictStage("internal");
      setConflictReport(internalReport);
      setConflictResolutions({});
      setShowConflictDialog(true);
      return;
    }

    await runFreezeRuntimeAndFinalizeForEdit(activeCommitSessionId, slotSystemId);
  };

  const handleCommitImport = async () => {
    if (!previewReport) {
      return;
    }

    if (previewReport.status === "COMMITTED") {
      setImportError("This batch is already committed");
      return;
    }

    setCommitLoading(true);
    setImportError(null);
    setImportInfo(null);
    setCommitPipelineStep("SESSION_STARTED");

    let startedCommitSessionId: number | null = null;

    try {
      const decisions = buildImportDecisionsPayload();
      const session = await apiStartCommitSession(previewReport.batchId, decisions);
      startedCommitSessionId = session.commitSessionId;

      setCommitSessionId(session.commitSessionId);
      setCommitFlowContext("import");
      setCommitTargetSlotSystemId(previewReport.slotSystemId);

      setCommitPipelineStep("EXTERNAL_CHECK");
      const externalReport = await apiRunExternalCommitCheck(session.commitSessionId);

      if (externalReport.conflictCount > 0) {
        setCommitPipelineStep("EXTERNAL_CONFLICTS");
        setConflictStage("external");
        setConflictReport(externalReport);
        setConflictResolutions({});
        setShowConflictDialog(true);
        return;
      }

      await runInternalThenFinalize(session.commitSessionId, previewReport.batchId);
    } catch (e) {
      setCommitPipelineStep("FAILED");

      const message = e instanceof Error ? e.message : "Failed to start staged commit";

      if (isRateLimitError(e)) {
        await cleanupAfterRateLimitedCommitFailure(startedCommitSessionId);
        setImportError(
          `${message} Commit session was reset to avoid a stuck running state. Retry once the cooldown ends.`,
        );
      } else {
        setImportError(message);
      }
    } finally {
      setCommitLoading(false);
    }
  };

  const handleResolveConflicts = async () => {
    if (!conflictReport || !conflictStage || !commitSessionId) {
      return;
    }

    const unresolved = conflictReport.conflicts.filter(
      (conflict) => !conflictResolutions[conflict.id],
    );

    if (unresolved.length > 0) {
      setImportError(
        `Please resolve all ${unresolved.length} conflict(s) before continuing`,
      );
      return;
    }

    const missingRoom = conflictReport.conflicts.filter((conflict) => {
      const resolution = conflictResolutions[conflict.id];
      if (!resolution) {
        return true;
      }

      if (conflictStage === "runtime") {
        return resolution.action === "ALTERNATIVE_ROOM" && !resolution.roomId;
      }

      if (resolution.action !== "CHANGE_ROOM") {
        return false;
      }

      if (resolution.roomResolutionMode === "CREATE_ROOM") {
        return false;
      }

      return !resolution.roomId;
    });

    if (missingRoom.length > 0) {
      setImportError("Please select a room for all room-change resolutions");
      return;
    }

    const missingCreateRoomInputs = conflictReport.conflicts.filter((conflict) => {
      const resolution = conflictResolutions[conflict.id];
      if (!resolution || conflictStage === "runtime") {
        return false;
      }

      if (resolution.action !== "CHANGE_ROOM" || resolution.roomResolutionMode !== "CREATE_ROOM") {
        return false;
      }

      const buildingId = Number(resolution.createRoomBuildingId);
      const roomName = resolution.createRoomName?.trim() ?? "";

      return !Number.isInteger(buildingId) || buildingId <= 0 || roomName.length === 0;
    });

    if (missingCreateRoomInputs.length > 0) {
      setImportError("Please provide building and room name for all create-room resolutions");
      return;
    }

    const missingSlotRange = conflictReport.conflicts.filter((conflict) => {
      const resolution = conflictResolutions[conflict.id];
      if (!resolution || conflictStage === "runtime") {
        return false;
      }

      if (
        resolution.action !== "CHANGE_SLOT_EXISTING" &&
        resolution.action !== "CREATE_SLOT_AND_USE"
      ) {
        return false;
      }

      const nextStart = resolution.startAt ? new Date(resolution.startAt) : null;
      const nextEnd = resolution.endAt ? new Date(resolution.endAt) : null;

      if (!nextStart || !nextEnd) {
        return true;
      }

      if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
        return true;
      }

      return nextStart >= nextEnd;
    });

    if (missingSlotRange.length > 0) {
      setImportError("Please provide a valid start/end window for all slot-change resolutions");
      return;
    }

    setConflictLoading(true);
    setImportError(null);

    try {
      const resolutions: CommitSessionResolutionDecision[] = [];

      for (const conflict of conflictReport.conflicts) {
        const resolution = conflictResolutions[conflict.id]!;
        let resolvedRoomId = resolution.roomId;

        if (
          conflictStage !== "runtime" &&
          resolution.action === "CHANGE_ROOM" &&
          resolution.roomResolutionMode === "CREATE_ROOM"
        ) {
          const buildingId = Number(resolution.createRoomBuildingId);
          const roomName = resolution.createRoomName?.trim() ?? "";

          const createdRoom = await apiCreateRoom({
            buildingId,
            name: roomName,
          });

          resolvedRoomId = createdRoom.id;

          setRooms((prevRooms) => {
            if (prevRooms.some((room) => room.id === createdRoom.id)) {
              return prevRooms;
            }

            return [...prevRooms, createdRoom];
          });
        }

        const nextResolution: CommitSessionResolutionDecision = {
          conflictId: conflict.id,
          action: resolution.action,
          ...(resolution.target ? { target: resolution.target } : {}),
          ...(resolvedRoomId ? { roomId: resolvedRoomId } : {}),
        };

        if (
          (resolution.action === "CHANGE_SLOT_EXISTING" ||
            resolution.action === "CREATE_SLOT_AND_USE") &&
          resolution.startAt &&
          resolution.endAt
        ) {
          nextResolution.startAt = new Date(resolution.startAt).toISOString();
          nextResolution.endAt = new Date(resolution.endAt).toISOString();
        }

        resolutions.push(nextResolution);
      }

      if (conflictStage === "external") {
        setCommitPipelineStep("EXTERNAL_RESOLVED");
        await apiResolveExternalCommitConflicts(commitSessionId, resolutions);
        setCommitPipelineStep("EXTERNAL_CHECK");
        const externalReport = await apiRunExternalCommitCheck(commitSessionId);

        if (externalReport.conflictCount > 0) {
          setCommitPipelineStep("EXTERNAL_CONFLICTS");
          setConflictReport(externalReport);
          setConflictResolutions({});
          return;
        }

        setShowConflictDialog(false);

        if (commitFlowContext === "edit") {
          if (!commitTargetSlotSystemId) {
            throw new Error("Missing target slot system for edit commit");
          }

          await runInternalThenFinalizeForEdit(commitSessionId, commitTargetSlotSystemId);
        } else {
          if (!previewReport) {
            throw new Error("Missing import context for staged commit");
          }

          await runInternalThenFinalize(commitSessionId, previewReport.batchId);
        }

        return;
      }

      if (conflictStage === "internal") {
        setCommitPipelineStep("INTERNAL_RESOLVED");
        await apiResolveInternalCommitConflicts(commitSessionId, resolutions);
        setCommitPipelineStep("INTERNAL_CHECK");
        const internalReport = await apiRunInternalCommitCheck(commitSessionId);

        if (internalReport.conflictCount > 0) {
          setCommitPipelineStep("INTERNAL_CONFLICTS");
          setConflictReport(internalReport);
          setConflictResolutions({});
          return;
        }

        setShowConflictDialog(false);

        if (commitFlowContext === "edit") {
          if (!commitTargetSlotSystemId) {
            throw new Error("Missing target slot system for edit commit");
          }

          await runFreezeRuntimeAndFinalizeForEdit(commitSessionId, commitTargetSlotSystemId);
        } else {
          if (!previewReport) {
            throw new Error("Missing import context for staged commit");
          }

          await runFreezeRuntimeAndFinalize(commitSessionId, previewReport.batchId);
        }

        return;
      }

      setCommitPipelineStep("RUNTIME_RESOLVED");
      await apiResolveRuntimeCommitConflicts(commitSessionId, resolutions);
      setCommitPipelineStep("RUNTIME_CHECK");
      const runtimeReport = await apiRunRuntimeCommitCheck(commitSessionId);

      if (runtimeReport.conflictCount > 0) {
        setCommitPipelineStep("RUNTIME_CONFLICTS");
        setConflictReport(runtimeReport);
        setConflictResolutions({});
        return;
      }

      setCommitPipelineStep("FINALIZE");
      const finalizeReport = await apiFinalizeCommitSession(commitSessionId);
      setCommitReport(null);
      setCommitPipelineStep("COMPLETED");
      clearCommitConflictState();

      if (commitFlowContext === "edit") {
        const targetSlotSystemId = commitTargetSlotSystemId;

        if (!targetSlotSystemId) {
          throw new Error("Missing target slot system for edit commit");
        }

        setEditStartResult(null);
        setChangeSuccess(
          `Edit commit completed. Created ${finalizeReport.createdBookings} bookings and removed ${finalizeReport.deletedConflictingBookings} obsolete booking(s).`,
        );
        setShowChangeWorkspace(false);

        await loadGrid(targetSlotSystemId);
        await loadSlotSystems();
        await loadImportBatches(targetSlotSystemId);
      } else {
        if (!previewReport) {
          throw new Error("Missing import context for staged commit");
        }

        setImportInfo(
          `Commit completed. Created ${finalizeReport.createdBookings} bookings and skipped ${finalizeReport.skippedOperations} operation(s).`,
        );
        await hydrateAfterFinalize(previewReport.batchId);
      }
    } catch (e) {
      setCommitPipelineStep("FAILED");

      const message = e instanceof Error ? e.message : "Failed to resolve staged conflicts";

      if (isRateLimitError(e)) {
        await cleanupAfterRateLimitedCommitFailure(commitSessionId);
        setImportError(
          `${message} Commit session was reset to avoid a stuck running state. Retry once the cooldown ends.`,
        );
      } else {
        setImportError(message);
      }
    } finally {
      setConflictLoading(false);
    }
  };

  const handleCancelCommit = async () => {
    if (!commitSessionId) {
      clearCommitConflictState();
      return;
    }

    try {
      await apiCancelCommitSession(commitSessionId);
      const cancelledEditFlow = commitFlowContext === "edit";
      setCommitPipelineStep("CANCELLED");
      clearCommitConflictState();

      if (cancelledEditFlow) {
        setChangeSuccess("Edit commit session cancelled. Booking operations resumed.");
      } else {
        setImportInfo("Commit session cancelled. Booking operations resumed.");
      }
    } catch (e) {
      setCommitPipelineStep("FAILED");
      setImportError(e instanceof Error ? e.message : "Failed to cancel commit session");
    }
  };

  // Change workspace handlers
  const handlePreviewChanges = useCallback(async () => {
    if (selectedSystemId === "") return;

    setChangeLoading(true);
    setChangeError(null);
    setEditStartResult(null);
    setCommitPipelineStep("IDLE");

    try {
      const preview = await apiPreviewSlotSystemChanges(Number(selectedSystemId), {});
      setChangePreview(preview);
      if (grid && grid.slotSystem.id === Number(selectedSystemId)) {
        setEditDraftJson(JSON.stringify(toSnapshotStateFromGrid(grid), null, 2));
      } else {
        setEditDraftJson("");
      }
      setShowChangeWorkspace(true);
    } catch (e) {
      setChangeError(e instanceof Error ? e.message : "Failed to preview changes");
    } finally {
      setChangeLoading(false);
    }
  }, [grid, selectedSystemId]);

  useEffect(() => {
    if (view !== "workspace") {
      setWorkspaceAutoOpenedForSystemId(null);
      return;
    }

    if (selectedSystemId === "" || !selectedSystem?.isLocked) {
      return;
    }

    if (workspaceAutoOpenedForSystemId === selectedSystemId) {
      return;
    }

    if (changeLoading || showChangeWorkspace) {
      return;
    }

    setWorkspaceAutoOpenedForSystemId(selectedSystemId);
    void handlePreviewChanges();
  }, [
    view,
    selectedSystemId,
    selectedSystem?.isLocked,
    workspaceAutoOpenedForSystemId,
    changeLoading,
    showChangeWorkspace,
    handlePreviewChanges,
  ]);

  const handleStartEditCommit = async () => {
    if (selectedSystemId === "" || !grid || !selectedSystem) {
      setChangeError("Select a locked slot system with loaded grid before starting edit mode");
      return;
    }

    if (!selectedSystem.isLocked) {
      setChangeError("Edit mode is only available for locked slot systems");
      return;
    }

    setEditStartLoading(true);
    setChangeError(null);
    setChangeSuccess(null);
    setEditSessionStatus("EDITING");
    setImportError(null);
    setCommitPipelineStep("SESSION_STARTED");

    let startedCommitSessionId: number | null = null;

    try {
      let snapshot = toSnapshotStateFromGrid(grid);

      if (editDraftJson.trim().length > 0) {
        try {
          const parsed = JSON.parse(editDraftJson) as TimetableSnapshotState;
          snapshot = parsed;
        } catch {
          setChangeError("Edit draft JSON is invalid. Fix the JSON before starting commit.");
          setEditSessionStatus("VIEW");
          return;
        }
      }

      const result = await apiStartEditCommitSession({
        slotSystemId: selectedSystemId,
        expectedVersion: selectedSystem.version,
        newState: snapshot,
        pruneBookings: editPruneBookings,
      });

      if (result.noChanges === true || result.diff.affectedRows === 0) {
        setEditStartResult(result);
        setChangeError(result.message ?? "No changes detected");
        setCommitPipelineStep("IDLE");
        setEditSessionStatus("VIEW");
        return;
      }

      if (!result.session) {
        setChangeError("Edit session could not be started");
        setCommitPipelineStep("FAILED");
        setEditSessionStatus("VIEW");
        return;
      }

      setEditStartResult(result);
      startedCommitSessionId = result.session.commitSessionId;
      setCommitSessionId(result.session.commitSessionId);
      setCommitFlowContext("edit");
      setCommitTargetSlotSystemId(selectedSystemId);

      // Check if pruning is enabled and there are bookings to prune
      if (shouldShowPruneConfirmation({ pruneEnabled: editPruneBookings, result })) {
        setPendingPruneBookingCount(result.diff.bookingImpact.totalAffectedBookings);
        setShowPruneConfirmation(true);
        setEditSessionStatus("VIEW");
        return;
      }

      setCommitPipelineStep("EXTERNAL_CHECK");
      const externalReport = await apiRunExternalCommitCheck(result.session.commitSessionId);

      if (externalReport.conflictCount > 0) {
        setCommitPipelineStep("EXTERNAL_CONFLICTS");
        setConflictStage("external");
        setConflictReport(externalReport);
        setConflictResolutions({});
        setShowConflictDialog(true);
        return;
      }

      await runInternalThenFinalizeForEdit(result.session.commitSessionId, selectedSystemId);
    } catch (e) {
      setCommitPipelineStep("FAILED");
      const errorMsg = e instanceof Error ? e.message : "Failed to start edit commit";

      if (isRateLimitError(e)) {
        await cleanupAfterRateLimitedCommitFailure(startedCommitSessionId);
        setChangeError(
          `${mapEditStartErrorToMessage(errorMsg)} Commit session was reset to avoid a stuck running state. Retry once the cooldown ends.`,
        );
      } else {
        setChangeError(mapEditStartErrorToMessage(errorMsg));
      }
    } finally {
      setEditStartLoading(false);
      setEditSessionStatus("VIEW");
    }
  };

  const handleConfirmPrune = async () => {
    if (!editStartResult?.session) {
      setChangeError("No edit session found");
      return;
    }

    if (selectedSystemId === "") {
      setChangeError("Slot system is not selected");
      return;
    }

    setShowPruneConfirmation(false);
    setEditSessionStatus("EDITING");

    const activeCommitSessionId = editStartResult.session.commitSessionId;

    try {
      setCommitPipelineStep("EXTERNAL_CHECK");
      const externalReport = await apiRunExternalCommitCheck(activeCommitSessionId);

      if (externalReport.conflictCount > 0) {
        setCommitPipelineStep("EXTERNAL_CONFLICTS");
        setConflictStage("external");
        setConflictReport(externalReport);
        setConflictResolutions({});
        setShowConflictDialog(true);
        setEditSessionStatus("VIEW");
        return;
      }

      await runInternalThenFinalizeForEdit(activeCommitSessionId, selectedSystemId);
    } catch (e) {
      setCommitPipelineStep("FAILED");

      const message = e instanceof Error ? e.message : "Failed to proceed with prune confirmation";

      if (isRateLimitError(e)) {
        await cleanupAfterRateLimitedCommitFailure(activeCommitSessionId);
        setChangeError(
          `${message} Commit session was reset to avoid a stuck running state. Retry once the cooldown ends.`,
        );
      } else {
        setChangeError(message);
      }
    } finally {
      setEditSessionStatus("VIEW");
    }
  };

  return (
    <section className="min-h-screen bg-gray-50">
      <div className="mb-8 px-6 py-8">
        <h2 className="text-3xl font-bold mb-2">Timetable Builder</h2>
        <p className="text-gray-600">Build slot systems with day columns, time-band rows, and merged slot blocks</p>
      </div>

      <div className="flex flex-col">

      {showStructureSection && (
      <form
        id="timetable-structure-section"
        className="border rounded-lg p-6 mb-8 mx-4 bg-white"
        style={{ order: 1 }}
        onSubmit={handleCreateSlotSystem}
      >
        <div className="card-header">
          <h3>Slot System Setup</h3>
        </div>

        <div className="form-row lg:grid-cols-2">
          <div className="form-field">
            <label htmlFor="slotSystemSelect">Active slot system</label>
            <select
              id="slotSystemSelect"
              className="input"
              value={selectedSystemId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedSystemId(value === "" ? "" : Number(value));
              }}
              disabled={loadingSystems || actionLoading}
            >
              <option value="">Select a slot system</option>
              {slotSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.isLocked ? "🔒 " : ""}{system.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="newSlotSystemName">Create slot system</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="newSlotSystemName"
                className="input flex-1 min-w-0"
                type="text"
                value={newSystemName}
                onChange={(e) => setNewSystemName(e.target.value)}
                placeholder="e.g. UG Semester Grid"
                disabled={actionLoading}
              />
              <button
                type="submit"
                className="btn btn-primary whitespace-nowrap shrink-0"
                disabled={actionLoading}
              >
                {actionLoading ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>

        <div className="btn-group mt-4">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadSlotSystems()}
            disabled={loadingSystems || actionLoading}
          >
            {loadingSystems ? "Refreshing..." : "Refresh"}
          </button>
          {isSystemLocked && (
            <button
              id="timetable-open-change-workspace"
              type="button"
              className="btn"
              style={{ backgroundColor: "#7c3aed", color: "white" }}
              onClick={() => void handlePreviewChanges()}
              disabled={changeLoading || actionLoading}
            >
              {changeLoading ? "Loading..." : "✏️ Edit Structure"}
            </button>
          )}
        </div>

     {/* Prune Confirmation Modal */}
     {showPruneConfirmation && (
       <div
         className="fixed inset-0 z-[60] flex items-center justify-center"
         style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
       >
         <div
           className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md"
         >
           <h3 className="text-lg font-bold mb-4 text-red-600">⚠️ Confirm Pruning</h3>
           <p className="text-gray-700 mb-2">
             You have enabled booking pruning. This will remove <strong>{pendingPruneBookingCount}</strong> existing booking{pendingPruneBookingCount !== 1 ? "s" : ""} that no longer fit the new slot structure.
           </p>
           <p className="text-gray-600 text-sm mb-4">
             This action cannot be undone. Pruned bookings will be permanently deleted.
           </p>
           <div className="flex gap-3 justify-end">
             <button
               className="btn btn-ghost"
               onClick={() => {
                 setShowPruneConfirmation(false);
                 setPendingPruneBookingCount(0);
               }}
             >
               Cancel (Keep Bookings)
             </button>
             <button
               className="btn btn-error"
               onClick={() => void handleConfirmPrune()}
             >
               Confirm Prune
             </button>
           </div>
         </div>
       </div>
     )}
        {isSystemLocked && (
          <div className="mt-3 p-3 rounded" style={{ backgroundColor: "#fef3cd", border: "1px solid #ffc107" }}>
            <strong>🔒 Locked System:</strong> This slot system has been committed and is locked.
            Direct day/band/block edits are disabled. Use <strong>"Edit Structure"</strong> to make changes through the change workspace.
          </div>
        )}
      </form>
      )}

      {showImportSection && (
      <form
        id="timetable-import-section"
        className="border rounded-lg p-6 mb-8 mx-4 bg-white"
        style={{ order: 4 }}
        onSubmit={handlePreviewImport}
      >
        <div className="card-header">
          <h3>Classroom Allocation Import</h3>
          {previewReport && (
            <span className="badge badge-role">
              {previewReport.status}
            </span>
          )}
        </div>

        {!showStructureSection && (
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="slotSystemSelectImport">Slot system</label>
              <select
                id="slotSystemSelectImport"
                className="input"
                value={selectedSystemId}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedSystemId(value === "" ? "" : Number(value));
                }}
                disabled={loadingSystems || actionLoading || importLoading}
              >
                <option value="">Select a slot system</option>
                {slotSystems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.isLocked ? "🔒 " : ""}
                    {system.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="alert mb-4">
          Single-sheet mode is active: each slot system uses one classroom allocation sheet.
          Uploading a new file replaces older batch context for the selected slot system.
          {selectedSystemId !== "" && (
            <div className="mt-1 text-xs text-muted-foreground">
              {importBatchesLoading
                ? "Checking active sheet context..."
                : `Known sheets for selected slot system: ${importBatches.length}${
                    selectedBatchId !== "" ? ` · Active batch id: ${selectedBatchId}` : ""
                  }`}
            </div>
          )}
          {previewReport && (
            <div className="mt-1 text-xs text-muted-foreground">
              Active sheet: Batch #{previewReport.batchId} · {formatDateDDMMYYYY(previewReport.termStartDate)} to {formatDateDDMMYYYY(previewReport.termEndDate)}
            </div>
          )}
        </div>

        {commitPipelineStep !== "IDLE" && (
          <div className="alert mb-4">
            Commit Pipeline: <strong>{toCommitPipelineLabel(commitPipelineStep)}</strong>
            {(commitPipelineStep === "COMPLETED" ||
              commitPipelineStep === "FAILED" ||
              commitPipelineStep === "CANCELLED") && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: "var(--space-2)" }}
                onClick={() => setCommitPipelineStep("IDLE")}
              >
                Clear Status
              </button>
            )}
          </div>
        )}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="batchSelect">Load existing batch</label>
            <select
              id="batchSelect"
              className="input"
              value={selectedBatchId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedBatchId(value === "" ? "" : Number(value));
              }}
              disabled={importBatchesLoading || importLoading}
            >
              <option value="">Select batch</option>
              {importBatches.map((batch) => (
                <option key={batch.batchId} value={batch.batchId}>
                  #{batch.batchId} · {batch.status}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Batch actions</label>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  if (selectedBatchId !== "") {
                    void handleLoadImportBatch(selectedBatchId);
                  }
                }}
                disabled={selectedBatchId === "" || importLoading}
              >
                {importLoading ? "Loading..." : "Load Selected Batch"}
              </button>
              {selectedSystemId !== "" && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void loadImportBatches(selectedSystemId)}
                  disabled={importBatchesLoading || importLoading}
                >
                  {importBatchesLoading ? "Refreshing..." : "Refresh Batches"}
                </button>
              )}
            </div>
          </div>
        </div>

        {!importBatchesLoading && importBatches.length === 0 && (
          <div className="empty-text mt-2">No imported batches found for the selected slot system yet.</div>
        )}

        {importBatchesError && (
          <div className="alert alert-error mt-4">{importBatchesError}</div>
        )}

        {importError && <div className="alert alert-error mt-4">{importError}</div>}

        {showImportControls && (
        <>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="importTermStart">Term start date</label>
            <DateInput
              id="importTermStart"
              mode="date"
              value={importTermStart}
              onChange={setImportTermStart}
              disabled={
                importLoading ||
                commitLoading ||
                saveDecisionsLoading ||
                reallocateLoading ||
                deleteBatchLoading
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="importTermEnd">Term end date</label>
            <DateInput
              id="importTermEnd"
              mode="date"
              value={importTermEnd}
              onChange={setImportTermEnd}
              disabled={
                importLoading ||
                commitLoading ||
                saveDecisionsLoading ||
                reallocateLoading ||
                deleteBatchLoading
              }
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="importAliases">Building aliases (optional)</label>
            <textarea
              id="importAliases"
              className="input"
              rows={4}
              value={aliasMapText}
              onChange={(e) => setAliasMapText(e.target.value)}
              placeholder={"Alias Name=Canonical Building Name\nECE=Electronics Block"}
              disabled={
                importLoading ||
                commitLoading ||
                saveDecisionsLoading ||
                reallocateLoading ||
                deleteBatchLoading
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="importFile">Allocation file (CSV/XLSX)</label>
            <input
              id="importFile"
              className="input"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setAllocationFile(e.target.files?.[0] ?? null)}
              disabled={
                importLoading ||
                commitLoading ||
                saveDecisionsLoading ||
                reallocateLoading ||
                deleteBatchLoading
              }
            />
          </div>
        </div>

        <div className="btn-group">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              importLoading ||
              commitLoading ||
              saveDecisionsLoading ||
              reallocateLoading ||
              deleteBatchLoading
            }
          >
            {importLoading ? "Previewing..." : "Preview Upload"}
          </button>
          <button
            type="button"
            className="btn btn-warning"
            onClick={() => void handleSaveImportDecisions()}
            disabled={
              !previewReport ||
              saveDecisionsLoading ||
              commitLoading ||
              importLoading ||
              reallocateLoading ||
              deleteBatchLoading
            }
          >
            {saveDecisionsLoading ? "Saving Decisions..." : "Save Decisions For Later"}
          </button>
          <button
            type="button"
            className="btn btn-warning"
            onClick={() => void handleReallocateImport()}
            disabled={
              !previewReport ||
              !isImportBatchCommitted ||
              reallocateLoading ||
              saveDecisionsLoading ||
              commitLoading ||
              importLoading ||
              deleteBatchLoading
            }
          >
            {reallocateLoading ? "Reallocating..." : "Reallocate Committed Batch"}
          </button>
          <button
            type="button"
            className="btn btn-success"
            onClick={() => void handleCommitImport()}
            disabled={
              !previewReport ||
              isImportBatchCommitted ||
              commitLoading ||
              importLoading ||
              saveDecisionsLoading ||
              reallocateLoading ||
              deleteBatchLoading
            }
          >
            {commitLoading ? "Committing..." : "Commit Valid/Resolved Rows"}
          </button>
        </div>

        {importInfo && <div className="alert alert-success mt-4">{importInfo}</div>}

        {previewReport && (
          <div className="mt-4">
            <div className="alert alert-success mb-4">
              Processed {previewReport.processedRows} rows · Valid {previewReport.validRows} · Unresolved {previewReport.unresolvedRows}
              <div className="mt-1 text-xs text-muted-foreground">
                Term: {formatDateDDMMYYYY(previewReport.termStartDate)} - {formatDateDDMMYYYY(previewReport.termEndDate)}
              </div>
            </div>

            {previewReport.warnings.length > 0 && (
              <div className="alert mb-4">
                {previewReport.warnings.join(" | ")}
              </div>
            )}

            {isImportBatchCommitted && (
              <div className="alert mb-4">
                This batch is committed. You can adjust decisions, save, and run reallocation to regenerate its imported bookings.
              </div>
            )}

            <div className="data-list">
              {previewReport.rows.map((row) => {
                const decision = rowDecisions[row.rowId] ?? createDecisionForPreviewRow(row);
                const isAutoAllowed = row.classification === "VALID_AND_AUTOMATABLE";

                const selectedStartBandIndex =
                  decision.createSlotStartBandId === ""
                    ? undefined
                    : bandIndexById.get(decision.createSlotStartBandId);

                const createSlotEndBandOptions =
                  selectedStartBandIndex === undefined
                    ? timeBands
                    : timeBands.filter((band) => {
                        const index = bandIndexById.get(band.id);
                        return index !== undefined && index >= selectedStartBandIndex;
                      });

                return (
                  <div className="data-item" key={row.rowId}>
                    <div className="data-item-content" style={{ width: "100%" }}>
                      <div className="data-item-title">
                        Row {row.rowIndex} · {row.courseCode || "(missing course)"}
                        <span className="badge badge-role" style={{ marginLeft: "var(--space-2)" }}>
                          {row.classification}
                        </span>
                      </div>
                      <div className="data-item-subtitle">
                        Slot: {row.slot || "-"} · Classroom: {row.classroom || "-"}
                      </div>

                      {row.auxiliaryData && Object.keys(row.auxiliaryData).length > 0 && (
                        <div className="data-item-subtitle mt-1">
                          {Object.entries(row.auxiliaryData).map(([key, value], idx) => (
                            <span key={key}>
                              {idx > 0 && " · "}
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      )}

                      {row.reasons.length > 0 && (
                        <div className="empty-text mt-2">
                          Reason: {row.reasons.join(" | ")}
                        </div>
                      )}

                      {row.suggestions.length > 0 && (
                        <div className="loading-text mt-1">
                          Suggestions: {row.suggestions.join(", ")}
                        </div>
                      )}

                      <div className="form-row mt-4">
                        <div className="form-field">
                          <label>Action</label>
                          <select
                            className="input"
                            value={decision.action}
                            onChange={(e) =>
                              updateRowDecision(row.rowId, {
                                action: e.target.value as RowDecisionState["action"],
                              })
                            }
                            disabled={isDecisionEditingLocked}
                          >
                            {isAutoAllowed && (
                              <option value="AUTO">Auto (if valid)</option>
                            )}
                            <option value="IGNORE">Ignore</option>
                            <option value="SKIP">Skip</option>
                            <option value="RESOLVE">Resolve</option>
                          </select>
                          {decision.action === "IGNORE" && (
                            <div className="data-item-subtitle mt-1">
                              Ignore: this row is not relevant for room allocation.
                            </div>
                          )}
                          {decision.action === "SKIP" && (
                            <div className="data-item-subtitle mt-1">
                              Skip: keep this row for later resolution.
                            </div>
                          )}
                        </div>

                        {decision.action === "RESOLVE" && (
                          <>
                              <div className="form-field">
                                <label>Slot Resolution</label>
                                <select
                                  className="input"
                                  value={decision.slotResolutionMode}
                                  onChange={(e) =>
                                    updateRowDecision(row.rowId, {
                                      slotResolutionMode: e.target.value as SlotResolutionMode,
                                    })
                                  }
                                  disabled={isDecisionEditingLocked}
                                >
                                  <option value="SELECT_EXISTING">Select existing slot</option>
                                  <option value="CREATE_SLOT">Create slot in grid</option>
                                </select>
                              </div>
                              <div className="form-field">
                                <label>Room Resolution</label>
                                <select
                                  className="input"
                                  value={decision.roomResolutionMode}
                                  onChange={(e) =>
                                    updateRowDecision(row.rowId, {
                                      roomResolutionMode: e.target.value as RoomResolutionMode,
                                    })
                                  }
                                  disabled={isDecisionEditingLocked}
                                >
                                  <option value="SELECT_EXISTING">Select existing room</option>
                                  <option value="CREATE_ROOM">Create room</option>
                                </select>
                              </div>

                              {decision.slotResolutionMode === "SELECT_EXISTING" ? (
                                <div className="form-field">
                                  <label>Resolved Slot Label</label>
                                  <input
                                    className="input"
                                    type="text"
                                    list={`slot-label-options-${row.rowId}`}
                                    value={decision.resolvedSlotLabel}
                                    onChange={(e) =>
                                      updateRowDecision(row.rowId, {
                                        resolvedSlotLabel: e.target.value,
                                      })
                                    }
                                    placeholder="Exact slot label"
                                    disabled={isDecisionEditingLocked}
                                  />
                                  <datalist id={`slot-label-options-${row.rowId}`}>
                                    {slotLabelOptions.map((label) => (
                                      <option key={label} value={label} />
                                    ))}
                                  </datalist>
                                </div>
                              ) : (
                                <>
                                  <div className="form-field">
                                    <label>New Slot Label</label>
                                    <input
                                      className="input"
                                      type="text"
                                      value={decision.createSlotLabel}
                                      onChange={(e) =>
                                        updateRowDecision(row.rowId, {
                                          createSlotLabel: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. L12"
                                      disabled={isDecisionEditingLocked}
                                    />
                                  </div>
                                  <div className="form-field">
                                    <label>Slot Day</label>
                                    <select
                                      className="input"
                                      value={decision.createSlotDayId}
                                      onChange={(e) =>
                                        updateRowDecision(row.rowId, {
                                          createSlotDayId:
                                            e.target.value === "" ? "" : Number(e.target.value),
                                        })
                                      }
                                      disabled={isDecisionEditingLocked}
                                    >
                                      <option value="">Select day</option>
                                      {days.map((day) => (
                                        <option key={day.id} value={day.id}>
                                          {DAY_LABELS[day.dayOfWeek]} (lanes: {day.laneCount})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="form-field">
                                    <label>Slot Start Band</label>
                                    <select
                                      className="input"
                                      value={decision.createSlotStartBandId}
                                      onChange={(e) => {
                                        const startBandId =
                                          e.target.value === "" ? "" : Number(e.target.value);

                                        updateRowDecision(row.rowId, {
                                          createSlotStartBandId: startBandId,
                                          createSlotEndBandId:
                                            startBandId === "" ? "" : startBandId,
                                        });
                                      }}
                                      disabled={isDecisionEditingLocked}
                                    >
                                      <option value="">Select start band</option>
                                      {timeBands.map((band) => (
                                        <option key={band.id} value={band.id}>
                                          {toTimeLabel(String(band.startTime))} - {toTimeLabel(String(band.endTime))}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="form-field">
                                    <label>Slot End Band</label>
                                    <select
                                      className="input"
                                      value={decision.createSlotEndBandId}
                                      onChange={(e) =>
                                        updateRowDecision(row.rowId, {
                                          createSlotEndBandId:
                                            e.target.value === "" ? "" : Number(e.target.value),
                                        })
                                      }
                                      disabled={isDecisionEditingLocked}
                                    >
                                      <option value="">Select end band</option>
                                      {createSlotEndBandOptions.map((band) => (
                                        <option key={band.id} value={band.id}>
                                          {toTimeLabel(String(band.startTime))} - {toTimeLabel(String(band.endTime))}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="form-field">
                                    <label>Create Slot Now</label>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      onClick={() =>
                                        void handleCreateResolveSlot(
                                          row.rowId,
                                          row.rowIndex,
                                          decision,
                                        )
                                      }
                                      disabled={
                                        isDecisionEditingLocked ||
                                        decision.createSlotDayId === "" ||
                                        decision.createSlotStartBandId === "" ||
                                        decision.createSlotEndBandId === ""
                                      }
                                    >
                                      {creatingResolveSlotRowId === row.rowId
                                        ? "Creating Slot..."
                                        : "Create Slot And Refresh"}
                                    </button>
                                  </div>
                                </>
                              )}

                              {decision.roomResolutionMode === "SELECT_EXISTING" ? (
                                <div className="form-field">
                                  <label>Resolved Room</label>
                                  <select
                                    className="input"
                                    value={decision.resolvedRoomId}
                                    onChange={(e) =>
                                      updateRowDecision(row.rowId, {
                                        resolvedRoomId:
                                          e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                    disabled={isDecisionEditingLocked}
                                  >
                                    <option value="">Select room</option>
                                    {rooms.map((room) => (
                                      <option key={room.id} value={room.id}>
                                        {roomLabelById.get(room.id) ?? "Unknown Room"}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <>
                                  <div className="form-field">
                                    <label>New Room Building</label>
                                    <input
                                      className="input"
                                      type="text"
                                      value={decision.createRoomBuildingName}
                                      onChange={(e) =>
                                        updateRowDecision(row.rowId, {
                                          createRoomBuildingName: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. Civil Block"
                                      disabled={isDecisionEditingLocked}
                                    />
                                  </div>
                                  <div className="form-field">
                                    <label>New Room Name</label>
                                    <input
                                      className="input"
                                      type="text"
                                      value={decision.createRoomName}
                                      onChange={(e) =>
                                        updateRowDecision(row.rowId, {
                                          createRoomName: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. 204"
                                      disabled={isDecisionEditingLocked}
                                    />
                                  </div>
                                </>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {commitReport && (
          <div className="mt-4">
            <div className="alert alert-success">
              Commit {commitReport.status} · Created {commitReport.autoCreatedBookings} · Already Processed {commitReport.alreadyProcessedBookings} · Failed {commitReport.failedOccurrences}
            </div>

            {commitReport.bookingConflictOccurrences > 0 && (
              <div className="alert mt-2">
                Current bookings blocked {commitReport.bookingConflictOccurrences} occurrence(s) across {commitReport.bookingConflictRows} row(s).
              </div>
            )}

            <div className="data-list mt-4">
              {commitReport.rowResults.map((row) => (
                <div className="data-item" key={row.rowId}>
                  <div className="data-item-content">
                    <div className="data-item-title">
                      Row {row.rowIndex} · Action {toRowActionLabel(row.action)}
                    </div>
                    <div className="data-item-subtitle">
                      Created {row.created} · Already Processed {row.alreadyProcessed} · Failed {row.failed} · Unresolved {row.unresolved}
                    </div>

                    {row.bookingConflictReasons.length > 0 && (
                      <div className="alert mt-2">
                        Booking conflicts: {row.bookingConflictReasons.join(" | ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
        )}

        {showProcessedSection && (processedRowsLoading || processedRowsError || processedRowsReport) && (
          <div id="timetable-processed-section" className="mt-4">
            <div className="card-header mb-2">
              <h3>Processed Rows And Booking CRUD</h3>
              {processedRowsReport && (
                <span className="badge badge-role">
                  {processedRowsReport.status}
                </span>
              )}
            </div>

            {processedRowsLoading && (
              <p className="loading-text">Loading processed rows...</p>
            )}

            {processedRowsError && (
              <div className="alert alert-error mb-4">
                {processedRowsError}
              </div>
            )}

            {processedRowsReport && processedRowsReport.warnings.length > 0 && (
              <div className="alert mb-4">
                {processedRowsReport.warnings.join(" | ")}
              </div>
            )}

            {processedRowsReport && processedRowsReport.rows.length === 0 && (
              <p className="empty-text">No processed rows found for this batch yet.</p>
            )}

            {processedRowsReport && processedRowsReport.rows.length > 0 && (
              <div className="data-list">
                {processedRowsReport.rows.map((row) => {
                  const createDraft = newRowBookingDrafts[row.rowId] ?? {
                    roomId: row.resolvedRoomId ?? "",
                    startAt: "",
                    endAt: "",
                  };
                  const resolvedRoomLabel =
                    row.resolvedRoomId === null
                      ? "-"
                      : (roomLabelById.get(row.resolvedRoomId) ?? "Assigned room");

                  return (
                    <div className="data-item" key={`processed-row-${row.rowId}`}>
                      <div className="data-item-content" style={{ width: "100%" }}>
                        <div className="data-item-title">
                          Row {row.rowIndex} · Action {toRowActionLabel(row.action)}
                          <span className="badge badge-role" style={{ marginLeft: "var(--space-2)" }}>
                            {row.classification}
                          </span>
                        </div>
                        <div className="data-item-subtitle">
                          Resolved Slot: {row.resolvedSlotLabel || "-"} · Resolved Room: {resolvedRoomLabel}
                        </div>
                        <div className="empty-text mt-1">
                          Created {row.created} · Already Processed {row.alreadyProcessed} · Failed {row.failed} · Skipped {row.skipped}
                        </div>

                        {row.reasons.length > 0 && (
                          <div className="loading-text mt-1">
                            Reasons: {row.reasons.join(" | ")}
                          </div>
                        )}

                        {row.bookingConflictReasons.length > 0 && (
                          <div className="alert mt-2">
                            Booking conflicts with current schedule: {row.bookingConflictReasons.join(" | ")}
                          </div>
                        )}

                        {row.occurrences.length === 0 && (
                          <p className="empty-text mt-2">
                            No occurrences generated for this row.
                          </p>
                        )}

                        {row.occurrences.map((occurrence) => {
                          const bookingEdit = occurrence.booking
                            ? processedBookingEdits[occurrence.booking.id] ?? {
                                roomId: occurrence.booking.roomId,
                                startAt: toDateInputValue(occurrence.booking.startAt),
                                endAt: toDateInputValue(occurrence.booking.endAt),
                              }
                            : null;

                          return (
                            <div
                              key={`occurrence-${occurrence.occurrenceId}`}
                              className="card mt-4"
                            >
                              <div className="data-item-title">
                                {occurrence.status}
                              </div>
                              <div className="data-item-subtitle">
                                {formatDateDDMMYYYY(occurrence.startAt)} to {formatDateDDMMYYYY(occurrence.endAt)}
                              </div>

                              {occurrence.errorMessage && (
                                <div className="alert alert-error mt-2">
                                  {occurrence.errorMessage}
                                </div>
                              )}

                              {isAdmin && occurrence.booking && (
                                <div className="empty-text mt-2">
                                  Source: {occurrence.booking.source.replace(/_/g, " ")} · Linked Request: {occurrence.booking.requestId ? "Yes" : "No"}
                                </div>
                              )}

                              {occurrence.booking && bookingEdit ? (
                                <div className="form-row mt-4">
                                  <div className="form-field">
                                    <label>Booking Room</label>
                                    <select
                                      className="input"
                                      value={bookingEdit.roomId}
                                      onChange={(e) =>
                                        updateProcessedBookingEdit(occurrence.booking!.id, {
                                          roomId:
                                            e.target.value === "" ? "" : Number(e.target.value),
                                        })
                                      }
                                      disabled={savingBookingId === occurrence.booking.id}
                                    >
                                      <option value="">Select room</option>
                                      {rooms.map((roomOption) => (
                                        <option key={roomOption.id} value={roomOption.id}>
                                          {roomLabelById.get(roomOption.id) ?? "Unknown Room"}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="form-field">
                                    <label>Booking Start</label>
                                    <DateInput
                                      mode="datetime"
                                      value={bookingEdit.startAt}
                                      onChange={(nextValue) =>
                                        updateProcessedBookingEdit(occurrence.booking!.id, {
                                          startAt: nextValue,
                                        })
                                      }
                                      disabled={savingBookingId === occurrence.booking.id}
                                    />
                                  </div>

                                  <div className="form-field">
                                    <label>Booking End</label>
                                    <DateInput
                                      mode="datetime"
                                      value={bookingEdit.endAt}
                                      onChange={(nextValue) =>
                                        updateProcessedBookingEdit(occurrence.booking!.id, {
                                          endAt: nextValue,
                                        })
                                      }
                                      disabled={savingBookingId === occurrence.booking.id}
                                    />
                                  </div>

                                  <div className="form-field">
                                    <label>Actions</label>
                                    <div className="btn-group">
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() =>
                                          void handleSaveProcessedBooking(
                                            processedRowsReport.batchId,
                                            occurrence.booking!.id,
                                          )
                                        }
                                        disabled={savingBookingId === occurrence.booking.id}
                                      >
                                        {savingBookingId === occurrence.booking.id
                                          ? "Saving..."
                                          : "Update Booking"}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() =>
                                          void handleDeleteProcessedBooking(
                                            processedRowsReport.batchId,
                                            occurrence.booking!.id,
                                          )
                                        }
                                        disabled={deletingBookingId === occurrence.booking.id}
                                      >
                                        {deletingBookingId === occurrence.booking.id
                                          ? "Deleting..."
                                          : "Delete Booking"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="empty-text mt-2">
                                  No linked booking for this occurrence.
                                </p>
                              )}
                            </div>
                          );
                        })}

                        <div className="form-row mt-4">
                          <div className="form-field">
                            <label>Create Booking Room</label>
                            <select
                              className="input"
                              value={createDraft.roomId}
                              onChange={(e) =>
                                updateNewRowBookingDraft(row.rowId, {
                                  roomId: e.target.value === "" ? "" : Number(e.target.value),
                                })
                              }
                              disabled={creatingRowId === row.rowId}
                            >
                              <option value="">Select room</option>
                              {rooms.map((roomOption) => (
                                <option key={roomOption.id} value={roomOption.id}>
                                  {roomLabelById.get(roomOption.id) ?? "Unknown Room"}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-field">
                            <label>Create Booking Start</label>
                            <DateInput
                              mode="datetime"
                              value={createDraft.startAt}
                              onChange={(nextValue) =>
                                updateNewRowBookingDraft(row.rowId, {
                                  startAt: nextValue,
                                })
                              }
                              disabled={creatingRowId === row.rowId}
                            />
                          </div>

                          <div className="form-field">
                            <label>Create Booking End</label>
                            <DateInput
                              mode="datetime"
                              value={createDraft.endAt}
                              onChange={(nextValue) =>
                                updateNewRowBookingDraft(row.rowId, {
                                  endAt: nextValue,
                                })
                              }
                              disabled={creatingRowId === row.rowId}
                            />
                          </div>

                          <div className="form-field">
                            <label>Create</label>
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() =>
                                void handleCreateRowBooking(processedRowsReport.batchId, row.rowId)
                              }
                              disabled={creatingRowId === row.rowId}
                            >
                              {creatingRowId === row.rowId ? "Creating..." : "Create Booking"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </form>
      )}

      {showGridSection && (
      <div
        id="timetable-grid-section"
        className="border rounded-lg p-6 mb-8 mx-4 bg-white"
        style={{ order: 2 }}
      >
        <div className="card-header">
          <h3>Grid Editor</h3>
          <span className="badge badge-role">
            {selectedSystem ? selectedSystem.name : "No system selected"}
          </span>
        </div>

        {selectedSystemId !== "" && (
          <>
            <form className="flex gap-4 mb-6 items-end" onSubmit={handleCreateDay}>
              <div className="form-field">
                <label htmlFor="newDayOfWeek">Add day</label>
                <select
                  id="newDayOfWeek"
                  className="input"
                  value={newDayOfWeek}
                  onChange={(e) => setNewDayOfWeek(e.target.value as DayOfWeek)}
                  disabled={actionLoading || isSystemLocked}
                >
                  {DAY_OF_WEEK_OPTIONS.map((dayOfWeek) => (
                    <option key={dayOfWeek} value={dayOfWeek}>
                      {DAY_LABELS[dayOfWeek]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-shrink-0">
                <label className="sr-only" htmlFor="addDayButton">Add day</label>
                <button
                  id="addDayButton"
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading || isSystemLocked}
                >
                  Add Day
                </button>
              </div>
            </form>

            <form className="flex gap-4 mb-6 items-end" onSubmit={handleCreateTimeBand}>
              <div className="form-field">
                <label htmlFor="newBandStart">Band start</label>
                <DateInput
                  id="newBandStart"
                  mode="time"
                  value={newBandStart}
                  onChange={setNewBandStart}
                  disabled={actionLoading || isSystemLocked}
                />
              </div>
              <div className="form-field">
                <label htmlFor="newBandEnd">Band end</label>
                <DateInput
                  id="newBandEnd"
                  mode="time"
                  value={newBandEnd}
                  onChange={setNewBandEnd}
                  disabled={actionLoading || isSystemLocked}
                />
              </div>
              <div className="flex-shrink-0">
                <label className="sr-only" htmlFor="addBandButton">Add time band</label>
                <button
                  id="addBandButton"
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading || isSystemLocked}
                >
                  Add Time Band
                </button>
              </div>
            </form>

            <div className="flex gap-4 mb-6 items-center">
              <div className="form-field">
                <label htmlFor="blockLabelInput">Block label</label>
                <input
                  id="blockLabelInput"
                  className="input"
                  type="text"
                  value={blockLabel}
                  onChange={(e) => setBlockLabel(e.target.value)}
                  placeholder="e.g. L1"
                  disabled={actionLoading || isSystemLocked}
                />
              </div>
              <div className="text-sm text-gray-500">
                <span>
                  Click an empty cell to create a 1-slot block. Drag vertically in a day column to create a merged block.
                </span>
              </div>
            </div>

          </>
        )}

        {error && <div className="alert alert-error mt-4">{error}</div>}

        {selectedSystemId === "" && (
          <p className="empty-text">Create or select a slot system to start editing the grid.</p>
        )}

        {selectedSystemId !== "" && loadingGrid && (
          <p className="loading-text">Loading timetable grid...</p>
        )}

        {selectedSystemId !== "" && !loadingGrid && grid && days.length === 0 && (
          <p className="empty-text">No days yet. Add at least one day to build the grid.</p>
        )}

        {selectedSystemId !== "" && !loadingGrid && grid && days.length > 0 && timeBands.length === 0 && (
          <p className="empty-text">No time bands yet. Add at least one time band to build the grid.</p>
        )}

        {selectedSystemId !== "" && !loadingGrid && grid && days.length > 0 && timeBands.length > 0 && (
          <div className="overflow-x-auto border rounded-lg" onMouseUp={() => void commitSelection()}>
            <table className="w-full border-collapse bg-white" aria-label="Timetable slot grid">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 border text-left text-sm font-semibold bg-gray-100"
                    rowSpan={hasMultipleLanes ? 2 : 1}
                  >
                    Time
                  </th>
                  {days.map((day) => (
                    <th
                      key={day.id}
                      scope="col"
                      className="px-4 py-3 border text-left text-sm font-semibold bg-gray-100"
                      colSpan={hasMultipleLanes ? dayLaneInfo.laneCountByDay.get(day.id) ?? 1 : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{DAY_LABELS[day.dayOfWeek]}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center w-6 h-6 text-sm font-bold bg-blue-500 text-white hover:bg-blue-600 rounded border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => void handleAddLane(day.id)}
                            disabled={actionLoading || isSystemLocked}
                            title="Add lane"
                            aria-label={`Add lane for ${DAY_LABELS[day.dayOfWeek]}`}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center w-6 h-6 text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 rounded border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => void handleRemoveLane(day)}
                            disabled={actionLoading || isSystemLocked || day.laneCount <= 1}
                            title="Remove lane"
                            aria-label={`Remove lane for ${DAY_LABELS[day.dayOfWeek]}`}
                          >
                            -
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center w-6 h-6 text-lg font-bold bg-red-500 text-white hover:bg-red-600 rounded border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => void handleDeleteDay(day)}
                            disabled={actionLoading || isSystemLocked}
                            title="Delete day"
                            aria-label={`Delete ${DAY_LABELS[day.dayOfWeek]}`}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
                {hasMultipleLanes && (
                  <tr>
                    {days.map((day) => {
                      const laneCount = dayLaneInfo.laneCountByDay.get(day.id) ?? 1;
                      return Array.from({ length: laneCount }, (_, laneIndex) => (
                        <th
                          key={`${day.id}-${laneIndex}`}
                          scope="col"
                          className="px-4 py-3 border text-left text-xs font-medium bg-gray-50"
                        >
                          {laneCount > 1 ? `Lane ${laneIndex + 1}` : "Slot"}
                        </th>
                      ));
                    })}
                  </tr>
                )}
              </thead>
              <tbody>
                {timeBands.map((band, bandIndex) => (
                  <tr key={band.id}>
                    <th scope="row" className="px-4 py-3 border text-left text-sm font-semibold bg-gray-100 align-top">
                      {editingBandId === band.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2 items-center">
                            <DateInput
                              className="px-2 py-1 border rounded"
                              mode="time"
                              value={editingBandStart}
                              onChange={setEditingBandStart}
                              disabled={actionLoading}
                            />
                            <span className="text-xs font-medium">to</span>
                            <DateInput
                              className="px-2 py-1 border rounded"
                              mode="time"
                              value={editingBandEnd}
                              onChange={setEditingBandEnd}
                              disabled={actionLoading}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handleUpdateTimeBand(band.id)}
                              disabled={actionLoading || isSystemLocked}
                            >
                              {actionLoading ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={cancelEditingTimeBand}
                              disabled={actionLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-medium">
                            {toTimeLabel(String(band.startTime))} - {toTimeLabel(String(band.endTime))}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center w-6 h-6 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => startEditingTimeBand(band)}
                              disabled={actionLoading || isSystemLocked}
                              title="Edit time band"
                              aria-label={`Edit time band ${toTimeLabel(String(band.startTime))} to ${toTimeLabel(String(band.endTime))}`}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                                <path
                                  d="M4 20h4l10-10-4-4L4 16v4zm12.7-12.3 1.6-1.6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L14 4.9l2.7 2.8z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center w-6 h-6 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => void handleDeleteTimeBand(band.id)}
                              disabled={actionLoading || isSystemLocked}
                              title="Delete time band"
                              aria-label={`Delete time band ${toTimeLabel(String(band.startTime))} to ${toTimeLabel(String(band.endTime))}`}
                            >
                              {deletingBandId === band.id ? (
                                <span aria-hidden="true" className="text-xs">...</span>
                              ) : (
                                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                                  <path
                                    d="M7 4h10l-1 2h4v2h-2l-1 12H7L6 8H4V6h4L7 4zm2 4v10h2V8H9zm4 0v10h2V8h-2z"
                                    fill="currentColor"
                                  />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </th>
                    {days.map((day) => {
                      const laneCount = dayLaneInfo.laneCountByDay.get(day.id) ?? 1;

                      return Array.from({ length: laneCount }, (_, laneIndex) => {
                        const cellKey = toCellKey(day.id, laneIndex, bandIndex);

                        if (blockLayout.coveredCells.has(cellKey)) {
                          return null;
                        }

                        const block = blockLayout.blockStartByCell.get(cellKey);

                        if (block) {
                          const safeRowSpan = Math.min(block.rowSpan, timeBands.length - bandIndex);
                          return (
                            <td
                              key={`${day.id}-${laneIndex}-${band.id}`}
                              rowSpan={safeRowSpan}
                              className="border p-2 bg-blue-50"
                            >
                              <button
                                type="button"
                                className="w-full px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => void handleDeleteBlock(block.id)}
                                disabled={actionLoading || isSystemLocked}
                                title="Delete block"
                              >
                                <span className="block truncate">{block.label}</span>
                                <span className="block text-xs">Delete</span>
                              </button>
                            </td>
                          );
                        }

                        const isSelecting = isCellSelected(day.id, laneIndex, bandIndex);

                        const isCellReadOnly = isSystemLocked;

                        return (
                          <td
                            key={`${day.id}-${laneIndex}-${band.id}`}
                            className={`border p-4 text-center text-xs font-semibold transition-colors ${
                              isCellReadOnly
                                ? "cursor-not-allowed bg-gray-50 text-gray-400"
                                : `cursor-pointer text-gray-500 hover:bg-gray-100 ${isSelecting ? "bg-blue-100 text-blue-700" : "bg-white"}`
                            }`}
                            onMouseDown={() => handleEmptyCellMouseDown(day.id, laneIndex, bandIndex)}
                            onMouseEnter={() => handleEmptyCellMouseEnter(day.id, laneIndex, bandIndex)}
                          >
                            <span>{isCellReadOnly ? "Locked" : isSelecting ? "Merge" : "Add"}</span>
                          </td>
                        );
                      });
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {showStructureSection && (
      <div
        id="timetable-maintenance-section"
        className="border rounded-lg p-6 mb-8 mx-4 bg-white"
        style={{ order: 3 }}
      >
        <div className="card-header">
          <h3>Slot System Maintenance</h3>
          <span className="badge badge-role">
            {selectedSystem ? selectedSystem.name : "No system selected"}
          </span>
        </div>

        <div className="mb-4 inline-flex rounded-md border border-gray-200 bg-gray-100 p-1">
          <button
            type="button"
            className={`px-3 py-1 text-sm rounded ${
              maintenanceTab === "SLOT_SYSTEM" ? "bg-white shadow" : "text-gray-600"
            }`}
            onClick={() => setMaintenanceTab("SLOT_SYSTEM")}
          >
            Slot System
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-sm rounded ${
              maintenanceTab === "DANGER_ZONE" ? "bg-white shadow text-red-700" : "text-red-600"
            }`}
            onClick={() => setMaintenanceTab("DANGER_ZONE")}
          >
            Danger Zone
          </button>
        </div>

        {maintenanceTab === "SLOT_SYSTEM" ? (
          <div className="form-field">
            <label>Selected slot system actions</label>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-warning"
                onClick={() => void handlePruneSelectedSlotSystemBookings()}
                disabled={actionLoading || selectedSystemId === ""}
              >
                Prune Selected Slot System Bookings
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleDeleteSlotSystem()}
                disabled={actionLoading || selectedSystemId === ""}
              >
                Delete Slot System
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded border border-red-300 bg-red-50 p-4">
            <h4 className="text-sm font-semibold text-red-700">Global Danger Zone</h4>
            <p className="text-sm text-red-700 mt-1">
              Prune all bookings removes imported and manual bookings across every slot system.
            </p>
            <button
              type="button"
              className="btn btn-danger mt-3"
              onClick={() => void handlePruneAllBookings()}
              disabled={actionLoading}
            >
              Prune All Bookings
            </button>
          </div>
        )}

        {successMessage && <div className="alert alert-success mt-4">{successMessage}</div>}
      </div>
      )}

      </div>

      {/* Freeze Status Banner */}
      {isCommitFreezeActive && (
        <div
          className="fixed top-0 left-0 right-0 z-40 p-3 text-center text-white"
          style={{ backgroundColor: "#dc3545" }}
        >
          ⚠️ <strong>Booking Freeze Active:</strong> Commit session is currently frozen for final validation.
          New booking operations are blocked until commit completes or is cancelled.
        </div>
      )}

      {/* Conflict Resolution Dialog */}
      {showConflictDialog && conflictReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto"
            id="conflictResolutionDialog"
          >
            <h3 className="text-xl font-bold mb-4">
              ⚠️ {toCommitStageLabel(conflictStage ?? "runtime")} Conflicts ({conflictReport.conflictCount})
            </h3>
            <p className="text-gray-600 mb-4">
              {conflictStage === "runtime"
                ? "Resolve runtime clashes while freeze is active."
                : "Resolve pre-freeze clashes before moving to the next stage."}
            </p>

            {conflictStage !== "runtime" && (
              <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Pre-freeze clashes are grouped by timetable allocation. Any resolution here is applied
                across all linked occurrences in the current timetable system.
              </div>
            )}

            {conflictStage === "runtime" && (
              <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold">Grouped Runtime Conflicts</div>
                {Array.from(
                  conflictReport.conflicts.reduce((map, conflict) => {
                    const key = `Row ${conflict.rowIndex}`;
                    const current = map.get(key) ?? 0;
                    map.set(key, current + 1);
                    return map;
                  }, new Map<string, number>()),
                ).map(([rowLabel, count]) => (
                  <div key={rowLabel}>{rowLabel}: {count} conflict(s)</div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              {conflictReport.conflicts.map((conflict) => {
                const resolution = conflictResolutions[conflict.id];
                const conflictRoomLabel = roomLabelById.get(conflict.roomId) || `Room #${conflict.roomId}`;
                const metadata = conflict.metadata ?? {};
                const conflictingBookingId = readMetadataNumber(metadata, "conflictingBookingId");
                const conflictingStartAt = readMetadataString(metadata, "conflictingStartAt");
                const conflictingEndAt = readMetadataString(metadata, "conflictingEndAt");
                const secondaryRowIndex = readMetadataNumber(metadata, "secondaryRowIndex");
                const affectedOperationCount = readMetadataNumber(metadata, "affectedOperationCount");
                const activeTarget: CommitResolutionTarget = resolution?.target ?? "COMMITTING";
                const roomResolutionMode = resolution?.roomResolutionMode ?? "SELECT_EXISTING";
                const slotStartDraft = resolution?.startAt ?? toDateInputValue(conflict.startAt);
                const slotEndDraft = resolution?.endAt ?? toDateInputValue(conflict.endAt);

                return (
                  <div
                    key={conflict.id}
                    className="border rounded p-4"
                    style={{ borderColor: resolution ? "#28a745" : "#ffc107" }}
                  >
                    <div className="font-medium mb-2">
                      Affected Row: #{conflict.rowIndex} ·
                      {" "}
                      Requested Slot - Room: {conflictRoomLabel},{" "}
                      {new Date(conflict.startAt).toLocaleString()} → {new Date(conflict.endAt).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mb-2">
                      {conflict.reason}
                      {conflictingBookingId !== null ? ` (Booking #${conflictingBookingId})` : ""}
                      {secondaryRowIndex !== null ? ` (Also overlaps with row ${secondaryRowIndex})` : ""}
                    </div>
                    {conflictingStartAt && conflictingEndAt && (
                      <div className="text-xs text-gray-500 mb-3">
                        Existing overlap window: {new Date(conflictingStartAt).toLocaleString()} →{" "}
                        {new Date(conflictingEndAt).toLocaleString()}
                      </div>
                    )}

                    {conflictStage !== "runtime" &&
                      affectedOperationCount !== null &&
                      affectedOperationCount > 0 && (
                        <div className="text-xs text-blue-700 mb-3">
                          Resolution scope: {affectedOperationCount} grouped occurrence(s).
                        </div>
                      )}

                    <div className="space-y-3">
                      {conflictStage !== "runtime" && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Apply To</span>
                          <select
                            className="input"
                            style={{ maxWidth: "220px" }}
                            value={activeTarget}
                            onChange={(e) => {
                              const nextTarget = e.target.value as CommitResolutionTarget;
                              setConflictResolutions((prev) => ({
                                ...prev,
                                [conflict.id]: {
                                  ...(prev[conflict.id] ?? { action: "SKIP" }),
                                  target: nextTarget,
                                },
                              }));
                            }}
                          >
                            <option value="COMMITTING">Committing Allocation</option>
                            <option value="CLASHING">Clashing Allocation</option>
                          </select>
                        </div>
                      )}

                      <div className="flex gap-3 flex-wrap items-center">
                        {conflictStage === "runtime" && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`resolution-${conflict.id}`}
                              checked={resolution?.action === "FORCE_OVERWRITE"}
                              onChange={() =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {}),
                                    action: "FORCE_OVERWRITE",
                                  },
                                }))
                              }
                            />
                            <span className="text-sm font-medium">Force Overwrite</span>
                          </label>
                        )}

                        {conflictStage !== "runtime" && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`resolution-${conflict.id}`}
                              checked={resolution?.action === "CHANGE_ROOM"}
                              onChange={() =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {}),
                                    action: "CHANGE_ROOM",
                                    target: activeTarget,
                                    roomResolutionMode:
                                      prev[conflict.id]?.roomResolutionMode ?? "SELECT_EXISTING",
                                  },
                                }))
                              }
                            />
                            <span className="text-sm font-medium">Change Room</span>
                          </label>
                        )}

                        {conflictStage !== "runtime" && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`resolution-${conflict.id}`}
                              checked={resolution?.action === "CHANGE_SLOT_EXISTING"}
                              onChange={() =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {}),
                                    action: "CHANGE_SLOT_EXISTING",
                                    target: activeTarget,
                                    startAt: prev[conflict.id]?.startAt ?? slotStartDraft,
                                    endAt: prev[conflict.id]?.endAt ?? slotEndDraft,
                                  },
                                }))
                              }
                            />
                            <span className="text-sm font-medium">Change Slot (Existing)</span>
                          </label>
                        )}

                        {conflictStage !== "runtime" && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`resolution-${conflict.id}`}
                              checked={resolution?.action === "CREATE_SLOT_AND_USE"}
                              onChange={() =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {}),
                                    action: "CREATE_SLOT_AND_USE",
                                    target: activeTarget,
                                    startAt: prev[conflict.id]?.startAt ?? slotStartDraft,
                                    endAt: prev[conflict.id]?.endAt ?? slotEndDraft,
                                  },
                                }))
                              }
                            />
                            <span className="text-sm font-medium">Create Slot And Use</span>
                          </label>
                        )}

                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`resolution-${conflict.id}`}
                            checked={resolution?.action === "SKIP"}
                            onChange={() =>
                              setConflictResolutions((prev) => ({
                                ...prev,
                                [conflict.id]: {
                                  ...(prev[conflict.id] ?? {}),
                                  action: "SKIP",
                                  ...(conflictStage !== "runtime" ? { target: activeTarget } : {}),
                                },
                              }))
                            }
                          />
                          <span className="text-sm font-medium">Skip</span>
                        </label>

                        {conflictStage === "runtime" && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`resolution-${conflict.id}`}
                              checked={resolution?.action === "ALTERNATIVE_ROOM"}
                              onChange={() =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {}),
                                    action: "ALTERNATIVE_ROOM",
                                  },
                                }))
                              }
                            />
                            <span className="text-sm font-medium">Alternative Room</span>
                          </label>
                        )}
                      </div>

                      {(resolution?.action === "CHANGE_SLOT_EXISTING" ||
                        resolution?.action === "CREATE_SLOT_AND_USE") && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium mb-1">Slot Start</label>
                            <DateInput
                              mode="datetime"
                              value={slotStartDraft}
                              onChange={(nextValue) =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {
                                      action: resolution?.action ?? "CHANGE_SLOT_EXISTING",
                                    }),
                                    startAt: nextValue,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Slot End</label>
                            <DateInput
                              mode="datetime"
                              value={slotEndDraft}
                              onChange={(nextValue) =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {
                                      action: resolution?.action ?? "CHANGE_SLOT_EXISTING",
                                    }),
                                    endAt: nextValue,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      )}

                      {(resolution?.action === "ALTERNATIVE_ROOM" ||
                        resolution?.action === "CHANGE_ROOM") && (
                        <div className="space-y-2">
                          {conflictStage !== "runtime" && resolution?.action === "CHANGE_ROOM" && (
                            <select
                              className="input"
                              style={{ maxWidth: "260px" }}
                              value={roomResolutionMode}
                              onChange={(e) =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? { action: "CHANGE_ROOM" }),
                                    roomResolutionMode: e.target.value as "SELECT_EXISTING" | "CREATE_ROOM",
                                  },
                                }))
                              }
                            >
                              <option value="SELECT_EXISTING">Select Existing Room</option>
                              <option value="CREATE_ROOM">Create Room</option>
                            </select>
                          )}

                          {(conflictStage === "runtime" || roomResolutionMode === "SELECT_EXISTING") && (
                            <select
                              className="input"
                              style={{ maxWidth: "260px" }}
                              value={resolution?.roomId ?? ""}
                              onChange={(e) =>
                                setConflictResolutions((prev) => ({
                                  ...prev,
                                  [conflict.id]: {
                                    ...(prev[conflict.id] ?? {
                                      action: resolution?.action ?? "CHANGE_ROOM",
                                    }),
                                    roomId: Number(e.target.value) || undefined,
                                  },
                                }))
                              }
                            >
                              <option value="">Select room...</option>
                              {rooms.map((room: Room) => (
                                <option key={room.id} value={room.id}>
                                  {roomLabelById.get(room.id) ?? room.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {conflictStage !== "runtime" &&
                            resolution?.action === "CHANGE_ROOM" &&
                            roomResolutionMode === "CREATE_ROOM" && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                  className="input"
                                  value={resolution?.createRoomBuildingId ?? ""}
                                  onChange={(e) =>
                                    setConflictResolutions((prev) => ({
                                      ...prev,
                                      [conflict.id]: {
                                        ...(prev[conflict.id] ?? { action: "CHANGE_ROOM" }),
                                        createRoomBuildingId:
                                          e.target.value === "" ? "" : Number(e.target.value),
                                      },
                                    }))
                                  }
                                >
                                  <option value="">Select building...</option>
                                  {buildings.map((building) => (
                                    <option key={building.id} value={building.id}>
                                      {building.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="input"
                                  type="text"
                                  value={resolution?.createRoomName ?? ""}
                                  placeholder="New room name"
                                  onChange={(e) =>
                                    setConflictResolutions((prev) => ({
                                      ...prev,
                                      [conflict.id]: {
                                        ...(prev[conflict.id] ?? { action: "CHANGE_ROOM" }),
                                        createRoomName: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button
                className="btn btn-ghost"
                onClick={() => void handleCancelCommit()}
                disabled={conflictLoading}
              >
                Cancel Commit
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleResolveConflicts()}
                disabled={conflictLoading}
              >
                {conflictLoading
                  ? "Applying..."
                  : conflictStage === "runtime"
                    ? "Apply Runtime Resolutions"
                    : "Apply and Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Workspace Panel */}
      {showChangeWorkspace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            id="changeWorkspacePanel"
          >
            <h3 className="text-xl font-bold mb-4">✏️ Slot System Change Workspace</h3>
                       {editSessionStatus !== "VIEW" && (
                         <div className="p-3 rounded mb-4 text-sm" style={{ backgroundColor: "#e3f2fd", color: "#1565c0" }}>
                           <strong>Status:</strong> Edit in progress · {editSessionStatus === "EDITING" ? "Running conflict checks" : "Finalizing changes"}
                         </div>
                       )}
            <p className="text-gray-600 mb-4">
              Preview and apply structural changes to the locked slot system.
              Changes will acquire a booking freeze during application.
            </p>

            {changeError && (
              <div className="p-3 rounded mb-4 text-sm" style={{ backgroundColor: "#f8d7da", color: "#721c24" }}>
                {changeError}
              </div>
            )}

            {changeSuccess && (
              <div className="p-3 rounded mb-4 text-sm" style={{ backgroundColor: "#d4edda", color: "#155724" }}>
                {changeSuccess}
              </div>
            )}

            {changePreview && (
              <div className="border rounded p-4 mb-4">
                <h4 className="font-medium mb-2">Current System Status</h4>
                <p className="text-sm text-gray-600">
                  Lock Status: {changePreview.isLocked ? "Locked" : "Unlocked"}
                </p>
                {changePreview.affectedBatches.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Committed Batches:</p>
                    {changePreview.affectedBatches.map((batch) => (
                      <p key={batch.batchId} className="text-sm text-gray-500">
                        Batch status: {batch.status} ({batch.affectedOccurrences} affected occurrences)
                      </p>
                    ))}
                  </div>
                )}
                {changePreview.warnings.length > 0 && (
                  <div className="mt-2">
                    {changePreview.warnings.map((w, i) => (
                      <p key={i} className="text-sm text-amber-600">⚠️ {w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="text-sm text-gray-500 mb-4">
              Edit mode computes a deterministic diff from the latest committed snapshot, then runs staged conflict checks only for affected rows.
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2" htmlFor="editDraftJson">
                Proposed Snapshot (JSON)
              </label>
              <textarea
                id="editDraftJson"
                className="input"
                rows={10}
                value={editDraftJson}
                onChange={(event) => setEditDraftJson(event.target.value)}
                placeholder="Paste or edit snapshot JSON..."
                disabled={editStartLoading}
              />
            </div>

            <label className="flex items-center gap-2 text-sm mb-4">
              <input
                type="checkbox"
                checked={editPruneBookings}
                onChange={(event) => setEditPruneBookings(event.target.checked)}
                disabled={editStartLoading}
              />
              <span>Prune obsolete bookings for changed rows during finalize</span>
            </label>
            {editPruneBookings && editStartResult && editStartResult.diff.bookingImpact.totalAffectedBookings > 0 && (
              <p className="text-sm text-red-600 mb-4">
                Step 1: {editStartResult.diff.bookingImpact.totalAffectedBookings} bookings will be removed.
              </p>
            )}

            {editStartResult && (
              <div className="border rounded p-4 mb-4 bg-gray-50">
                <h4 className="font-medium mb-2">Last Edit Diff</h4>
                <p className="text-sm text-gray-700">
                  Changed labels: {editStartResult.diff.changedLabels.length} · Affected rows: {editStartResult.diff.affectedRows} · Unchanged rows: {editStartResult.diff.unchangedRows}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {formatEditDiffSummary(editStartResult.diff)}
                </p>
                <p className="text-sm text-blue-600 mt-1 font-medium">
                  {formatBookingImpactMessage(editStartResult.diff.bookingImpact.totalAffectedBookings)}
                </p>
                {editStartResult.diff.operations.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded bg-white p-2">
                    {groupOperationsByGroupId(editStartResult.diff.operations).map((group) => (
                      <details key={group.groupId} className="text-xs py-2 border-b last:border-b-0">
                        <summary className="cursor-pointer font-medium text-gray-700">
                          {group.type} · {group.operations.length} operation(s) · {group.totalBookingsImpacted} booking(s) affected
                        </summary>
                        <div className="ml-3 mt-1">
                          {group.operations.map((operation, idx) => (
                            <div key={`${operation.operationGroupId}-${idx}`} className="text-xs py-1 text-gray-600 border-l border-gray-300 pl-2">
                              <strong>{operation.label}</strong> · {operation.oldDescriptorCount} → {operation.newDescriptorCount} slots
                              {operation.affectedBookings > 0 && (
                                <span className="text-orange-600 ml-1">
                                  ({operation.affectedBookings} booking{operation.affectedBookings !== 1 ? "s" : ""})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                className="btn btn-primary"
                onClick={() => void handleStartEditCommit()}
                disabled={
                  editStartLoading ||
                  changeLoading ||
                  selectedSystemId === "" ||
                  editSessionStatus === "COMMITTING"
                }
              >
                 {editStartLoading ? "Starting..." : !editStartResult ? "Start Edit Commit" : "Proceed to Conflict Check"}
              </button>
              <button
                className="btn btn-ghost"
                 disabled={editSessionStatus === "COMMITTING"}
                onClick={() => {
                  setShowChangeWorkspace(false);
                  setChangePreview(null);
                  setChangeError(null);
                  setChangeSuccess(null);
                  setEditStartResult(null);
                  setEditDraftJson("");
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
