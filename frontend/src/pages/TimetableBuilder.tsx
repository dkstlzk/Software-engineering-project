import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addDayLane as apiAddDayLane,
  createBooking as apiCreateBooking,
  commitTimetableImport as apiCommitTimetableImport,
  deleteTimetableImportBatch as apiDeleteTimetableImportBatch,
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
} from "../api/api";
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
} from "../api/api";
import { formatDateDDMMYYYY } from "../utils/datetime";
import { DateInput } from "../components/DateInput";

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

type RowDecisionState = {
  action: "AUTO" | "RESOLVE" | "SKIP";
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

  next.action = savedDecision.action;

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

export function TimetableBuilderPage() {
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
  const [deleteBatchLoading, setDeleteBatchLoading] = useState(false);
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
  const [rowDecisions, setRowDecisions] = useState<Record<number, RowDecisionState>>({});

  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);

  const days: SlotDay[] = grid?.days ?? [];
  const timeBands: SlotTimeBand[] = grid?.timeBands ?? [];
  const blocks: SlotBlock[] = grid?.blocks ?? [];

  const isImportBatchCommitted = previewReport?.status === "COMMITTED";
  const isDecisionEditingLocked =
    commitLoading ||
    importLoading ||
    saveDecisionsLoading ||
    reallocateLoading ||
    deleteBatchLoading;

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
      const buildingLabel = buildingNameById.get(room.buildingId) ?? `Building #${room.buildingId}`;
      map.set(room.id, `${buildingLabel} - ${room.name} (#${room.id})`);
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

        return "";
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
          source: "TIMETABLE_IMPORT",
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

    const selectedLabel = selectedSystem?.name ?? `#${selectedSystemId}`;

    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Prune imported bookings linked to slot system \"${selectedLabel}\"? This keeps manual bookings and cannot be undone.`,
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

    const activeSelection = dragSelection;
    setDragSelection(null);
    await createBlockFromSelection(activeSelection);
  };

  const handleDeleteBlock = async (blockId: number) => {
    if (selectedSystemId === "") {
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

    if (day.laneCount <= 1) {
      setError("At least one lane must remain for a day");
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
    if (actionLoading || loadingGrid || selectedSystemId === "") {
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

  const loadImportBatchForEditing = async (batchId: number) => {
    setImportLoading(true);
    setImportError(null);
    setImportInfo(null);
    setCommitReport(null);

    try {
      const report = await apiGetTimetableImportBatch(batchId);

      hydratePreviewFromBatch(report);

      if (selectedSystemId !== report.slotSystemId) {
        setSelectedSystemId(report.slotSystemId);
      }

      await loadProcessedRows(report.batchId);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to load import batch");
    } finally {
      setImportLoading(false);
    }
  };

  const handleLoadSelectedBatch = async () => {
    if (selectedBatchId === "") {
      setImportError("Choose a batch to load");
      return;
    }

    await loadImportBatchForEditing(selectedBatchId);
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

  const buildImportDecisionsPayload = (): TimetableImportCommitDecision[] => {
    return Object.entries(rowDecisions).reduce<TimetableImportCommitDecision[]>(
      (acc, [rawRowId, decision]) => {
        const rowId = Number(rawRowId);

        if (!Number.isInteger(rowId) || rowId <= 0) {
          return acc;
        }

        if (decision.action === "RESOLVE") {
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
              const laneIndex = Number.isFinite(decision.createSlotLaneIndex)
                ? Math.max(0, Math.trunc(decision.createSlotLaneIndex))
                : 0;

              resolveDecision.createSlot = {
                dayId: decision.createSlotDayId,
                startBandId: decision.createSlotStartBandId,
                endBandId: decision.createSlotEndBandId,
                laneIndex,
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

          acc.push(resolveDecision);

          return acc;
        }

        acc.push({
          rowId,
          action: decision.action,
        });

        return acc;
      },
      [],
    );
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
      setImportInfo(`Saved allocation decisions for batch #${refreshedReport.batchId}.`);

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
      const decisions = buildImportDecisionsPayload();

      const report = await apiReallocateTimetableImport(previewReport.batchId, decisions);
      setCommitReport(report);

      const refreshedReport = await apiGetTimetableImportBatch(previewReport.batchId);
      hydratePreviewFromBatch(refreshedReport);
      setImportInfo(`Reallocated committed batch #${refreshedReport.batchId}.`);

      await loadProcessedRows(previewReport.batchId);
      await loadImportBatches(refreshedReport.slotSystemId);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to reallocate batch");
    } finally {
      setReallocateLoading(false);
    }
  };

  const handleDeleteSelectedBatch = async () => {
    const activeBatchId = selectedBatchId !== "" ? selectedBatchId : previewReport?.batchId;

    if (!activeBatchId) {
      setImportError("Choose or load a batch first");
      return;
    }

    const approved =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete batch #${activeBatchId}? This will remove all linked imported bookings and cannot be undone.`,
          );

    if (!approved) {
      return;
    }

    setDeleteBatchLoading(true);
    setImportError(null);
    setImportInfo(null);

    try {
      const result = await apiDeleteTimetableImportBatch(activeBatchId);

      if (previewReport?.batchId === activeBatchId) {
        setPreviewReport(null);
        setRowDecisions({});
        setCommitReport(null);
        setProcessedRowsReport(null);
        setProcessedRowsError(null);
        setProcessedBookingEdits({});
        setNewRowBookingDrafts({});
      }

      setSelectedBatchId("");
      await loadImportBatches(selectedSystemId);

      const bookingLabel = result.deletedBookings === 1 ? "booking" : "bookings";
      setImportInfo(
        `Deleted batch #${result.batchId} and removed ${result.deletedBookings} linked ${bookingLabel}.`,
      );
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to delete import batch");
    } finally {
      setDeleteBatchLoading(false);
    }
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

    try {
      const decisions = buildImportDecisionsPayload();

      const report = await apiCommitTimetableImport(previewReport.batchId, decisions);
      setCommitReport(report);

      const refreshedReport = await apiGetTimetableImportBatch(previewReport.batchId);
      hydratePreviewFromBatch(refreshedReport);

      await loadProcessedRows(previewReport.batchId);
      await loadImportBatches(refreshedReport.slotSystemId);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to commit import");
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    <section className="timetable-builder-page">
      <div className="page-header">
        <h2>Timetable Builder</h2>
        <p>Build slot systems with day columns, time-band rows, and merged slot blocks</p>
      </div>

      <form className="card section-gap timetable-slot-system-card" onSubmit={handleCreateSlotSystem}>
        <div className="card-header">
          <h3>Slot System Selector</h3>
        </div>

        <div className="form-row">
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
                  {system.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="newSlotSystemName">Create slot system</label>
            <input
              id="newSlotSystemName"
              className="input"
              type="text"
              value={newSystemName}
              onChange={(e) => setNewSystemName(e.target.value)}
              placeholder="e.g. UG Semester Grid"
              disabled={actionLoading}
            />
          </div>
        </div>

        <div className="btn-group">
          <button type="submit" className="btn btn-primary" disabled={actionLoading}>
            {actionLoading ? "Saving..." : "Create Slot System"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void handleDeleteSlotSystem()}
            disabled={actionLoading || selectedSystemId === ""}
          >
            Delete Slot System
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadSlotSystems()}
            disabled={loadingSystems || actionLoading}
          >
            {loadingSystems ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="form-row" style={{ marginTop: "var(--space-4)" }}>
          <div className="form-field">
            <label>Booking prune options</label>
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
                onClick={() => void handlePruneAllBookings()}
                disabled={actionLoading}
              >
                Prune All Bookings
              </button>
            </div>
          </div>
        </div>

        {successMessage && <div className="alert alert-success mt-4">{successMessage}</div>}
      </form>

      <form className="card section-gap timetable-import-card" onSubmit={handlePreviewImport}>
        <div className="card-header">
          <h3>Classroom Allocation Import</h3>
          {previewReport && (
            <span className="badge badge-role">
              Batch #{previewReport.batchId} · {previewReport.status}
            </span>
          )}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="importBatchSelect">Open existing batch</label>
            <select
              id="importBatchSelect"
              className="input"
              value={selectedBatchId}
              onChange={(e) =>
                setSelectedBatchId(e.target.value === "" ? "" : Number(e.target.value))
              }
              disabled={
                selectedSystemId === "" ||
                importLoading ||
                commitLoading ||
                saveDecisionsLoading ||
                importBatchesLoading
              }
            >
              <option value="">Select a batch</option>
              {importBatches.map((batch) => (
                <option key={batch.batchId} value={batch.batchId}>
                  #{batch.batchId} · {batch.status} · {formatDateDDMMYYYY(batch.termStartDate)} to {formatDateDDMMYYYY(batch.termEndDate)} · {batch.fileName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Batch actions</label>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleLoadSelectedBatch()}
                disabled={
                  selectedBatchId === "" ||
                  importLoading ||
                  commitLoading ||
                  saveDecisionsLoading ||
                  reallocateLoading ||
                  deleteBatchLoading
                }
              >
                {importLoading ? "Loading..." : "Load Selected Batch"}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleDeleteSelectedBatch()}
                disabled={
                  (selectedBatchId === "" && !previewReport) ||
                  importLoading ||
                  commitLoading ||
                  saveDecisionsLoading ||
                  reallocateLoading ||
                  deleteBatchLoading
                }
              >
                {deleteBatchLoading ? "Deleting..." : "Delete Batch"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void loadImportBatches(selectedSystemId)}
                disabled={
                  selectedSystemId === "" ||
                  importLoading ||
                  commitLoading ||
                  saveDecisionsLoading ||
                  reallocateLoading ||
                  deleteBatchLoading ||
                  importBatchesLoading
                }
              >
                {importBatchesLoading ? "Refreshing..." : "Refresh List"}
              </button>
            </div>
          </div>
        </div>

        {importBatchesError && (
          <div className="alert alert-error mt-4">{importBatchesError}</div>
        )}

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
        {importError && <div className="alert alert-error mt-4">{importError}</div>}

        {previewReport && (
          <div className="mt-4">
            <div className="alert alert-success" style={{ marginBottom: "var(--space-3)" }}>
              Processed {previewReport.processedRows} rows · Valid {previewReport.validRows} · Unresolved {previewReport.unresolvedRows}
              <div style={{ marginTop: "var(--space-1)", fontSize: "0.8rem", color: "var(--gray-600)" }}>
                Term: {formatDateDDMMYYYY(previewReport.termStartDate)} - {formatDateDDMMYYYY(previewReport.termEndDate)}
              </div>
            </div>

            {previewReport.warnings.length > 0 && (
              <div className="alert" style={{ marginBottom: "var(--space-3)" }}>
                {previewReport.warnings.join(" | ")}
              </div>
            )}

            {isImportBatchCommitted && (
              <div className="alert" style={{ marginBottom: "var(--space-3)" }}>
                This batch is committed. You can adjust decisions, save, and run reallocation to regenerate its imported bookings.
              </div>
            )}

            <div className="data-list">
              {previewReport.rows.map((row) => {
                const decision = rowDecisions[row.rowId] ?? createDecisionForPreviewRow(row);

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

                      {row.reasons.length > 0 && (
                        <div className="empty-text" style={{ marginTop: "var(--space-2)" }}>
                          Reason: {row.reasons.join(" | ")}
                        </div>
                      )}

                      {row.suggestions.length > 0 && (
                        <div className="loading-text" style={{ marginTop: "var(--space-1)" }}>
                          Suggestions: {row.suggestions.join(", ")}
                        </div>
                      )}

                      <div className="form-row" style={{ marginTop: "var(--space-3)" }}>
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
                            {row.classification === "VALID_AND_AUTOMATABLE" && (
                              <option value="AUTO">Auto</option>
                            )}
                            <option value="SKIP">Skip</option>
                            <option value="RESOLVE">Resolve</option>
                          </select>
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
                                    <label>Slot Lane Index</label>
                                    <input
                                      className="input"
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={decision.createSlotLaneIndex}
                                      onChange={(e) =>
                                        updateRowDecision(row.rowId, {
                                          createSlotLaneIndex: Number(e.target.value || "0"),
                                        })
                                      }
                                      disabled={isDecisionEditingLocked}
                                    />
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
                                        {roomLabelById.get(room.id) ?? `Room #${room.id}`}
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
              <div className="alert" style={{ marginTop: "var(--space-2)" }}>
                Current bookings blocked {commitReport.bookingConflictOccurrences} occurrence(s) across {commitReport.bookingConflictRows} row(s).
              </div>
            )}

            <div className="data-list" style={{ marginTop: "var(--space-3)" }}>
              {commitReport.rowResults.map((row) => (
                <div className="data-item" key={row.rowId}>
                  <div className="data-item-content">
                    <div className="data-item-title">
                      Row {row.rowIndex} · Action {row.action}
                    </div>
                    <div className="data-item-subtitle">
                      Created {row.created} · Already Processed {row.alreadyProcessed} · Failed {row.failed} · Unresolved {row.unresolved}
                    </div>

                    {row.bookingConflictReasons.length > 0 && (
                      <div className="alert" style={{ marginTop: "var(--space-2)" }}>
                        Booking conflicts: {row.bookingConflictReasons.join(" | ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(processedRowsLoading || processedRowsError || processedRowsReport) && (
          <div className="mt-4">
            <div className="card-header" style={{ marginBottom: "var(--space-2)" }}>
              <h3>Processed Rows And Booking CRUD</h3>
              {processedRowsReport && (
                <span className="badge badge-role">
                  Batch #{processedRowsReport.batchId} · {processedRowsReport.status}
                </span>
              )}
            </div>

            {processedRowsLoading && (
              <p className="loading-text">Loading processed rows...</p>
            )}

            {processedRowsError && (
              <div className="alert alert-error" style={{ marginBottom: "var(--space-3)" }}>
                {processedRowsError}
              </div>
            )}

            {processedRowsReport && processedRowsReport.warnings.length > 0 && (
              <div className="alert" style={{ marginBottom: "var(--space-3)" }}>
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

                  return (
                    <div className="data-item" key={`processed-row-${row.rowId}`}>
                      <div className="data-item-content" style={{ width: "100%" }}>
                        <div className="data-item-title">
                          Row {row.rowIndex} · Action {row.action}
                          <span className="badge badge-role" style={{ marginLeft: "var(--space-2)" }}>
                            {row.classification}
                          </span>
                        </div>
                        <div className="data-item-subtitle">
                          Resolved Slot: {row.resolvedSlotLabel || "-"} · Resolved Room: {row.resolvedRoomId ?? "-"}
                        </div>
                        <div className="empty-text" style={{ marginTop: "var(--space-1)" }}>
                          Created {row.created} · Already Processed {row.alreadyProcessed} · Failed {row.failed} · Skipped {row.skipped}
                        </div>

                        {row.reasons.length > 0 && (
                          <div className="loading-text" style={{ marginTop: "var(--space-1)" }}>
                            Reasons: {row.reasons.join(" | ")}
                          </div>
                        )}

                        {row.bookingConflictReasons.length > 0 && (
                          <div className="alert" style={{ marginTop: "var(--space-2)" }}>
                            Booking conflicts with current schedule: {row.bookingConflictReasons.join(" | ")}
                          </div>
                        )}

                        {row.occurrences.length === 0 && (
                          <p className="empty-text" style={{ marginTop: "var(--space-2)" }}>
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
                              className="card"
                              style={{ marginTop: "var(--space-3)" }}
                            >
                              <div className="data-item-title">
                                Occurrence #{occurrence.occurrenceId} · {occurrence.status}
                              </div>
                              <div className="data-item-subtitle">
                                {formatDateDDMMYYYY(occurrence.startAt)} to {formatDateDDMMYYYY(occurrence.endAt)} · Room #{occurrence.roomId}
                              </div>

                              {occurrence.errorMessage && (
                                <div className="alert alert-error" style={{ marginTop: "var(--space-2)" }}>
                                  {occurrence.errorMessage}
                                </div>
                              )}

                              {occurrence.booking && bookingEdit ? (
                                <div className="form-row" style={{ marginTop: "var(--space-3)" }}>
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
                                          {roomLabelById.get(roomOption.id) ?? `Room #${roomOption.id}`}
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
                                <p className="empty-text" style={{ marginTop: "var(--space-2)" }}>
                                  No linked booking for this occurrence.
                                </p>
                              )}
                            </div>
                          );
                        })}

                        <div className="form-row" style={{ marginTop: "var(--space-3)" }}>
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
                                  {roomLabelById.get(roomOption.id) ?? `Room #${roomOption.id}`}
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

      <div className="card section-gap timetable-grid-card">
        <div className="card-header">
          <h3>Grid Editor</h3>
          <span className="badge badge-role">
            {selectedSystem ? selectedSystem.name : "No system selected"}
          </span>
        </div>

        {selectedSystemId !== "" && (
          <>
            <form className="form-row timetable-inline-form" onSubmit={handleCreateDay}>
              <div className="form-field">
                <label htmlFor="newDayOfWeek">Add day</label>
                <select
                  id="newDayOfWeek"
                  className="input"
                  value={newDayOfWeek}
                  onChange={(e) => setNewDayOfWeek(e.target.value as DayOfWeek)}
                  disabled={actionLoading}
                >
                  {DAY_OF_WEEK_OPTIONS.map((dayOfWeek) => (
                    <option key={dayOfWeek} value={dayOfWeek}>
                      {DAY_LABELS[dayOfWeek]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field timetable-inline-action">
                <label className="sr-only" htmlFor="addDayButton">Add day</label>
                <button id="addDayButton" type="submit" className="btn btn-primary" disabled={actionLoading}>
                  Add Day
                </button>
              </div>
            </form>

            <form className="form-row timetable-inline-form" onSubmit={handleCreateTimeBand}>
              <div className="form-field">
                <label htmlFor="newBandStart">Band start</label>
                <DateInput
                  id="newBandStart"
                  mode="time"
                  value={newBandStart}
                  onChange={setNewBandStart}
                  disabled={actionLoading}
                />
              </div>
              <div className="form-field">
                <label htmlFor="newBandEnd">Band end</label>
                <DateInput
                  id="newBandEnd"
                  mode="time"
                  value={newBandEnd}
                  onChange={setNewBandEnd}
                  disabled={actionLoading}
                />
              </div>
              <div className="form-field timetable-inline-action">
                <label className="sr-only" htmlFor="addBandButton">Add time band</label>
                <button id="addBandButton" type="submit" className="btn btn-primary" disabled={actionLoading}>
                  Add Time Band
                </button>
              </div>
            </form>

            <div className="form-row timetable-inline-form">
              <div className="form-field">
                <label htmlFor="blockLabelInput">Block label</label>
                <input
                  id="blockLabelInput"
                  className="input"
                  type="text"
                  value={blockLabel}
                  onChange={(e) => setBlockLabel(e.target.value)}
                  placeholder="e.g. L1"
                  disabled={actionLoading}
                />
              </div>
              <div className="form-field timetable-inline-hint">
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
          <div className="timetable-grid-wrapper" onMouseUp={() => void commitSelection()}>
            <table className="timetable-grid" aria-label="Timetable slot grid">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="timetable-time-header"
                    rowSpan={hasMultipleLanes ? 2 : 1}
                  >
                    Time
                  </th>
                  {days.map((day) => (
                    <th
                      key={day.id}
                      scope="col"
                      className="timetable-day-header"
                      colSpan={hasMultipleLanes ? dayLaneInfo.laneCountByDay.get(day.id) ?? 1 : undefined}
                    >
                      <div className="timetable-day-header-content">
                        <span>{DAY_LABELS[day.dayOfWeek]}</span>
                        <div className="timetable-day-header-actions">
                          <button
                            type="button"
                            className="timetable-add-lane"
                            onClick={() => void handleAddLane(day.id)}
                            disabled={actionLoading}
                            title="Add lane"
                            aria-label={`Add lane for ${DAY_LABELS[day.dayOfWeek]}`}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="timetable-remove-lane"
                            onClick={() => void handleRemoveLane(day)}
                            disabled={actionLoading || day.laneCount <= 1}
                            title="Remove lane"
                            aria-label={`Remove lane for ${DAY_LABELS[day.dayOfWeek]}`}
                          >
                            -
                          </button>
                          <button
                            type="button"
                            className="timetable-delete-day"
                            onClick={() => void handleDeleteDay(day)}
                            disabled={actionLoading}
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
                          className="timetable-day-subheader"
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
                    <th scope="row" className="timetable-time-cell">
                      {editingBandId === band.id ? (
                        <div className="timetable-time-band-editor">
                          <div className="timetable-time-band-inputs">
                            <DateInput
                              className="timetable-time-band-input"
                              mode="time"
                              value={editingBandStart}
                              onChange={setEditingBandStart}
                              disabled={actionLoading}
                            />
                            <span className="timetable-time-band-separator">to</span>
                            <DateInput
                              className="timetable-time-band-input"
                              mode="time"
                              value={editingBandEnd}
                              onChange={setEditingBandEnd}
                              disabled={actionLoading}
                            />
                          </div>
                          <div className="timetable-time-band-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handleUpdateTimeBand(band.id)}
                              disabled={actionLoading}
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
                        <div className="timetable-time-band-row">
                          <span className="timetable-time-band-range">
                            {toTimeLabel(String(band.startTime))} - {toTimeLabel(String(band.endTime))}
                          </span>
                          <div className="timetable-time-band-actions">
                            <button
                              type="button"
                              className="timetable-icon-btn timetable-icon-btn-edit"
                              onClick={() => startEditingTimeBand(band)}
                              disabled={actionLoading}
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
                              className="timetable-icon-btn timetable-icon-btn-delete"
                              onClick={() => void handleDeleteTimeBand(band.id)}
                              disabled={actionLoading}
                              title="Delete time band"
                              aria-label={`Delete time band ${toTimeLabel(String(band.startTime))} to ${toTimeLabel(String(band.endTime))}`}
                            >
                              {deletingBandId === band.id ? (
                                <span className="timetable-icon-loading" aria-hidden="true">...</span>
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
                              className="timetable-cell timetable-cell-block"
                            >
                              <button
                                type="button"
                                className="timetable-block"
                                onClick={() => void handleDeleteBlock(block.id)}
                                disabled={actionLoading}
                                title="Delete block"
                              >
                                <span className="timetable-block-label">{block.label}</span>
                                <span className="timetable-block-delete">Delete</span>
                              </button>
                            </td>
                          );
                        }

                        const isSelecting = isCellSelected(day.id, laneIndex, bandIndex);

                        return (
                          <td
                            key={`${day.id}-${laneIndex}-${band.id}`}
                            className={`timetable-cell timetable-cell-empty ${isSelecting ? "is-selecting" : ""}`}
                            onMouseDown={() => handleEmptyCellMouseDown(day.id, laneIndex, bandIndex)}
                            onMouseEnter={() => handleEmptyCellMouseEnter(day.id, laneIndex, bandIndex)}
                          >
                            <span className="timetable-cell-hint">{isSelecting ? "Merge" : "Add"}</span>
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
    </section>
  );
}
