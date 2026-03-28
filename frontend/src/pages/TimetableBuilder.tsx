import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addDayLane as apiAddDayLane,
  commitTimetableImport as apiCommitTimetableImport,
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
  removeDayLane as apiRemoveDayLane,
  getRooms,
  getSlotSystems,
  previewTimetableImport as apiPreviewTimetableImport,
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
  TimetableImportCommitDecision,
  TimetableImportCommitReport,
  TimetableImportPreviewReport,
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

type RowDecisionState = {
  action: "AUTO" | "RESOLVE" | "SKIP";
  resolvedSlotLabel: string;
  resolvedRoomId: number | "";
};

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
  const [importError, setImportError] = useState<string | null>(null);

  const [previewReport, setPreviewReport] = useState<TimetableImportPreviewReport | null>(null);
  const [commitReport, setCommitReport] = useState<TimetableImportCommitReport | null>(null);
  const [rowDecisions, setRowDecisions] = useState<Record<number, RowDecisionState>>({});

  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);

  const days: SlotDay[] = grid?.days ?? [];
  const timeBands: SlotTimeBand[] = grid?.timeBands ?? [];
  const blocks: SlotBlock[] = grid?.blocks ?? [];

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

  useEffect(() => {
    void loadSlotSystems();
    void loadRoomContext();
  }, []);

  useEffect(() => {
    if (selectedSystemId === "") {
      setGrid(null);
      return;
    }

    void loadGrid(selectedSystemId);
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

    if (selectedSystemId === "") {
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
    setCommitReport(null);

    try {
      const aliasMap = parseAliasMap(aliasMapText);

      const report = await apiPreviewTimetableImport({
        slotSystemId: selectedSystemId,
        termStartDate: importTermStart,
        termEndDate: importTermEnd,
        file: allocationFile,
        aliasMap,
      });

      setPreviewReport(report);

      const initialDecisions: Record<number, RowDecisionState> = {};

      for (const row of report.rows) {
        if (row.classification === "VALID_AND_AUTOMATABLE") {
          continue;
        }

        initialDecisions[row.rowId] = {
          action: "SKIP",
          resolvedSlotLabel: row.resolvedSlotLabel ?? row.slot,
          resolvedRoomId: row.resolvedRoomId ?? "",
        };
      }

      setRowDecisions(initialDecisions);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to preview import");
    } finally {
      setImportLoading(false);
    }
  };

  const updateRowDecision = (rowId: number, patch: Partial<RowDecisionState>) => {
    setRowDecisions((current) => {
      const existing =
        current[rowId] ?? {
          action: "SKIP" as const,
          resolvedSlotLabel: "",
          resolvedRoomId: "" as const,
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

  const handleCommitImport = async () => {
    if (!previewReport) {
      return;
    }

    setCommitLoading(true);
    setImportError(null);

    try {
      const decisions = Object.entries(rowDecisions).reduce<TimetableImportCommitDecision[]>(
        (acc, [rawRowId, decision]) => {
          const rowId = Number(rawRowId);

          if (!Number.isInteger(rowId) || rowId <= 0) {
            return acc;
          }

          if (decision.action === "RESOLVE") {
            acc.push({
              rowId,
              action: "RESOLVE",
              resolvedSlotLabel: decision.resolvedSlotLabel,
              ...(decision.resolvedRoomId !== ""
                ? { resolvedRoomId: decision.resolvedRoomId }
                : {}),
            });

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

      const report = await apiCommitTimetableImport(previewReport.batchId, decisions);
      setCommitReport(report);
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
            <span className="badge badge-role">Batch #{previewReport.batchId}</span>
          )}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="importTermStart">Term start date</label>
            <DateInput
              id="importTermStart"
              mode="date"
              value={importTermStart}
              onChange={setImportTermStart}
              disabled={importLoading || commitLoading}
            />
          </div>
          <div className="form-field">
            <label htmlFor="importTermEnd">Term end date</label>
            <DateInput
              id="importTermEnd"
              mode="date"
              value={importTermEnd}
              onChange={setImportTermEnd}
              disabled={importLoading || commitLoading}
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
              disabled={importLoading || commitLoading}
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
              disabled={importLoading || commitLoading}
            />
          </div>
        </div>

        <div className="btn-group">
          <button type="submit" className="btn btn-primary" disabled={importLoading || commitLoading}>
            {importLoading ? "Previewing..." : "Preview Upload"}
          </button>
          <button
            type="button"
            className="btn btn-success"
            onClick={() => void handleCommitImport()}
            disabled={!previewReport || commitLoading || importLoading}
          >
            {commitLoading ? "Committing..." : "Commit Valid/Resolved Rows"}
          </button>
        </div>

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

            <div className="data-list">
              {previewReport.rows.map((row) => {
                const decision = rowDecisions[row.rowId] ?? {
                  action: "SKIP" as const,
                  resolvedSlotLabel: row.resolvedSlotLabel ?? row.slot,
                  resolvedRoomId: row.resolvedRoomId ?? "",
                };

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

                      {row.classification !== "VALID_AND_AUTOMATABLE" && (
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
                              disabled={commitLoading || importLoading}
                            >
                              <option value="SKIP">Skip</option>
                              <option value="RESOLVE">Resolve</option>
                            </select>
                          </div>

                          {decision.action === "RESOLVE" && (
                            <>
                              <div className="form-field">
                                <label>Resolved Slot</label>
                                <input
                                  className="input"
                                  type="text"
                                  value={decision.resolvedSlotLabel}
                                  onChange={(e) =>
                                    updateRowDecision(row.rowId, {
                                      resolvedSlotLabel: e.target.value,
                                    })
                                  }
                                  placeholder="Exact slot label"
                                  disabled={commitLoading || importLoading}
                                />
                              </div>
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
                                  disabled={commitLoading || importLoading}
                                >
                                  <option value="">Select room</option>
                                  {rooms.map((room) => (
                                    <option key={room.id} value={room.id}>
                                      {roomLabelById.get(room.id) ?? `Room #${room.id}`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}
                        </div>
                      )}
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
                  </div>
                </div>
              ))}
            </div>
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
