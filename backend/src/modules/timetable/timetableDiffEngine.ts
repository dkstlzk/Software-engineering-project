import { DAY_OF_WEEK_VALUES } from "./schema";

export type TimetableDayOfWeek = (typeof DAY_OF_WEEK_VALUES)[number];

export type TimetableSnapshotDay = {
  id: number;
  dayOfWeek: TimetableDayOfWeek;
  orderIndex: number;
  laneCount: number;
};

export type TimetableSnapshotTimeBand = {
  id: number;
  startTime: string;
  endTime: string;
  orderIndex: number;
};

export type TimetableSnapshotBlock = {
  id: number;
  dayId: number;
  startBandId: number;
  laneIndex: number;
  rowSpan: number;
  label: string;
};

export type TimetableSnapshotState = {
  slotSystemId: number;
  days: TimetableSnapshotDay[];
  timeBands: TimetableSnapshotTimeBand[];
  blocks: TimetableSnapshotBlock[];
  roomAssignments?: Record<string, number>;
};

export type TimetableDiffOperationType =
  | "ADD_SLOT"
  | "REMOVE_SLOT"
  | "CHANGE_SLOT"
  | "CHANGE_VENUE";

export type TimetableSlotDescriptor = {
  dayOfWeek: TimetableDayOfWeek;
  startTime: string;
  endTime: string;
  laneIndex: number;
};

export type TimetableDiffOperation = {
  type: TimetableDiffOperationType;
  label: string;
  normalizedLabel: string;
  oldDescriptors: TimetableSlotDescriptor[];
  newDescriptors: TimetableSlotDescriptor[];
  oldRoomId: number | null;
  newRoomId: number | null;
};

export type TimetableDiffSummary = {
  total: number;
  added: number;
  removed: number;
  changedSlot: number;
  changedVenue: number;
};

export type TimetableDiffResult = {
  operations: TimetableDiffOperation[];
  changedLabels: string[];
  summary: TimetableDiffSummary;
  oldSnapshot: TimetableSnapshotState;
  newSnapshot: TimetableSnapshotState;
};

type LabelDescriptorState = {
  label: string;
  normalizedLabel: string;
  descriptors: TimetableSlotDescriptor[];
  signature: string;
  roomId: number | null;
};

function normalizeSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return normalizeSpace(value).toLowerCase();
}

function normalizeTimeValue(value: string): string {
  const trimmed = value.trim();

  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function normalizeRoomAssignments(
  roomAssignments: Record<string, number> | undefined,
): Record<string, number> {
  if (!roomAssignments || typeof roomAssignments !== "object") {
    return {};
  }

  const output: Record<string, number> = {};

  for (const [label, roomId] of Object.entries(roomAssignments)) {
    const normalizedLabel = normalizeKey(label);
    const parsedRoomId = Number(roomId);

    if (!normalizedLabel || !Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
      continue;
    }

    output[normalizedLabel] = parsedRoomId;
  }

  return output;
}

function sortDescriptors(descriptors: TimetableSlotDescriptor[]): TimetableSlotDescriptor[] {
  return [...descriptors].sort((a, b) => {
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
}

export function normalizeSnapshotState(
  input: TimetableSnapshotState,
): TimetableSnapshotState {
  const days = [...(input.days ?? [])]
    .map((day) => ({
      id: Number(day.id),
      dayOfWeek: day.dayOfWeek,
      orderIndex: Number(day.orderIndex),
      laneCount: Math.max(1, Number(day.laneCount) || 1),
    }))
    .filter(
      (day): day is TimetableSnapshotDay =>
        Number.isInteger(day.id) &&
        day.id > 0 &&
        DAY_OF_WEEK_VALUES.includes(day.dayOfWeek) &&
        Number.isInteger(day.orderIndex) &&
        day.orderIndex >= 0,
    )
    .sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) {
        return a.orderIndex - b.orderIndex;
      }

      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek.localeCompare(b.dayOfWeek);
      }

      return a.id - b.id;
    });

  const timeBands = [...(input.timeBands ?? [])]
    .map((timeBand) => ({
      id: Number(timeBand.id),
      startTime: normalizeTimeValue(String(timeBand.startTime ?? "")),
      endTime: normalizeTimeValue(String(timeBand.endTime ?? "")),
      orderIndex: Number(timeBand.orderIndex),
    }))
    .filter(
      (timeBand): timeBand is TimetableSnapshotTimeBand =>
        Number.isInteger(timeBand.id) &&
        timeBand.id > 0 &&
        Number.isInteger(timeBand.orderIndex) &&
        timeBand.orderIndex >= 0 &&
        timeBand.startTime.length > 0 &&
        timeBand.endTime.length > 0,
    )
    .sort((a, b) => {
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

  const blocks = [...(input.blocks ?? [])]
    .map((block) => ({
      id: Number(block.id),
      dayId: Number(block.dayId),
      startBandId: Number(block.startBandId),
      laneIndex: Math.max(0, Number(block.laneIndex) || 0),
      rowSpan: Math.max(1, Number(block.rowSpan) || 1),
      label: normalizeSpace(String(block.label ?? "")),
    }))
    .filter(
      (block): block is TimetableSnapshotBlock =>
        Number.isInteger(block.id) &&
        block.id > 0 &&
        Number.isInteger(block.dayId) &&
        block.dayId > 0 &&
        Number.isInteger(block.startBandId) &&
        block.startBandId > 0 &&
        block.label.length > 0,
    )
    .sort((a, b) => {
      if (a.dayId !== b.dayId) {
        return a.dayId - b.dayId;
      }

      if (a.startBandId !== b.startBandId) {
        return a.startBandId - b.startBandId;
      }

      if (a.laneIndex !== b.laneIndex) {
        return a.laneIndex - b.laneIndex;
      }

      if (a.rowSpan !== b.rowSpan) {
        return a.rowSpan - b.rowSpan;
      }

      if (a.label !== b.label) {
        return a.label.localeCompare(b.label);
      }

      return a.id - b.id;
    });

  return {
    slotSystemId: Number(input.slotSystemId),
    days,
    timeBands,
    blocks,
    roomAssignments: normalizeRoomAssignments(input.roomAssignments),
  };
}

function buildDescriptorStateByLabel(
  snapshot: TimetableSnapshotState,
): Map<string, LabelDescriptorState> {
  const dayById = new Map<number, TimetableSnapshotDay>();
  for (const day of snapshot.days) {
    dayById.set(day.id, day);
  }

  const bandIndexById = new Map<number, number>();
  snapshot.timeBands.forEach((band, index) => {
    bandIndexById.set(band.id, index);
  });

  const statesByLabel = new Map<string, LabelDescriptorState>();

  for (const block of snapshot.blocks) {
    const normalizedLabel = normalizeKey(block.label);

    if (!normalizedLabel) {
      continue;
    }

    const day = dayById.get(block.dayId);
    const startIndex = bandIndexById.get(block.startBandId);

    if (!day || startIndex === undefined) {
      continue;
    }

    const endIndex = startIndex + block.rowSpan - 1;
    const startBand = snapshot.timeBands[startIndex];
    const endBand = snapshot.timeBands[endIndex];

    if (!startBand || !endBand) {
      continue;
    }

    const descriptor: TimetableSlotDescriptor = {
      dayOfWeek: day.dayOfWeek,
      startTime: startBand.startTime,
      endTime: endBand.endTime,
      laneIndex: block.laneIndex,
    };

    const existing = statesByLabel.get(normalizedLabel);

    if (!existing) {
      statesByLabel.set(normalizedLabel, {
        label: block.label,
        normalizedLabel,
        descriptors: [descriptor],
        signature: "",
        roomId: snapshot.roomAssignments?.[normalizedLabel] ?? null,
      });
      continue;
    }

    existing.descriptors.push(descriptor);
  }

  for (const state of statesByLabel.values()) {
    state.descriptors = sortDescriptors(state.descriptors);
    state.signature = state.descriptors
      .map(
        (descriptor) =>
          `${descriptor.dayOfWeek}|${descriptor.startTime}|${descriptor.endTime}|${descriptor.laneIndex}`,
      )
      .join("||");
  }

  return statesByLabel;
}

const DIFF_TYPE_ORDER: Record<TimetableDiffOperationType, number> = {
  ADD_SLOT: 0,
  REMOVE_SLOT: 1,
  CHANGE_SLOT: 2,
  CHANGE_VENUE: 3,
};

export function computeTimetableDiff(input: {
  oldSnapshot: TimetableSnapshotState;
  newState: TimetableSnapshotState;
}): TimetableDiffResult {
  const oldSnapshot = normalizeSnapshotState(input.oldSnapshot);
  const newSnapshot = normalizeSnapshotState(input.newState);

  const oldByLabel = buildDescriptorStateByLabel(oldSnapshot);
  const newByLabel = buildDescriptorStateByLabel(newSnapshot);

  const labelKeys = new Set<string>([...oldByLabel.keys(), ...newByLabel.keys()]);
  const operations: TimetableDiffOperation[] = [];

  for (const key of Array.from(labelKeys).sort((a, b) => a.localeCompare(b))) {
    const previous = oldByLabel.get(key);
    const next = newByLabel.get(key);

    if (!previous && !next) {
      continue;
    }

    if (!previous && next) {
      operations.push({
        type: "ADD_SLOT",
        label: next.label,
        normalizedLabel: key,
        oldDescriptors: [],
        newDescriptors: next.descriptors,
        oldRoomId: null,
        newRoomId: next.roomId,
      });
      continue;
    }

    if (previous && !next) {
      operations.push({
        type: "REMOVE_SLOT",
        label: previous.label,
        normalizedLabel: key,
        oldDescriptors: previous.descriptors,
        newDescriptors: [],
        oldRoomId: previous.roomId,
        newRoomId: null,
      });
      continue;
    }

    if (!previous || !next) {
      continue;
    }

    if (previous.signature !== next.signature) {
      operations.push({
        type: "CHANGE_SLOT",
        label: next.label,
        normalizedLabel: key,
        oldDescriptors: previous.descriptors,
        newDescriptors: next.descriptors,
        oldRoomId: previous.roomId,
        newRoomId: next.roomId,
      });
      continue;
    }

    if ((previous.roomId ?? null) !== (next.roomId ?? null)) {
      operations.push({
        type: "CHANGE_VENUE",
        label: next.label,
        normalizedLabel: key,
        oldDescriptors: previous.descriptors,
        newDescriptors: next.descriptors,
        oldRoomId: previous.roomId,
        newRoomId: next.roomId,
      });
    }
  }

  operations.sort((a, b) => {
    if (a.normalizedLabel !== b.normalizedLabel) {
      return a.normalizedLabel.localeCompare(b.normalizedLabel);
    }

    return DIFF_TYPE_ORDER[a.type] - DIFF_TYPE_ORDER[b.type];
  });

  const summary: TimetableDiffSummary = {
    total: operations.length,
    added: operations.filter((operation) => operation.type === "ADD_SLOT").length,
    removed: operations.filter((operation) => operation.type === "REMOVE_SLOT").length,
    changedSlot: operations.filter((operation) => operation.type === "CHANGE_SLOT").length,
    changedVenue: operations.filter((operation) => operation.type === "CHANGE_VENUE").length,
  };

  return {
    operations,
    changedLabels: operations.map((operation) => operation.normalizedLabel),
    summary,
    oldSnapshot,
    newSnapshot,
  };
}
