import { describe, expect, it } from "vitest";
import {
  computeTimetableDiff,
  type TimetableSnapshotState,
} from "../timetableDiffEngine";

function createBaseSnapshot(): TimetableSnapshotState {
  return {
    slotSystemId: 1,
    days: [
      { id: 10, dayOfWeek: "MON", orderIndex: 0, laneCount: 1 },
      { id: 11, dayOfWeek: "TUE", orderIndex: 1, laneCount: 1 },
    ],
    timeBands: [
      { id: 20, startTime: "09:00", endTime: "10:00", orderIndex: 0 },
      { id: 21, startTime: "10:00", endTime: "11:00", orderIndex: 1 },
    ],
    blocks: [
      { id: 30, dayId: 10, startBandId: 20, laneIndex: 0, rowSpan: 1, label: "L1" },
      { id: 31, dayId: 11, startBandId: 21, laneIndex: 0, rowSpan: 1, label: "L2" },
    ],
  };
}

describe("computeTimetableDiff", () => {
  it("returns empty diff when structure is unchanged", () => {
    const oldSnapshot = createBaseSnapshot();

    const newSnapshot: TimetableSnapshotState = {
      slotSystemId: 1,
      // Intentionally shuffled input order to verify deterministic normalization.
      days: [...oldSnapshot.days].reverse(),
      timeBands: [...oldSnapshot.timeBands].reverse(),
      blocks: [...oldSnapshot.blocks].reverse(),
    };

    const diff = computeTimetableDiff({
      oldSnapshot,
      newState: newSnapshot,
    });

    expect(diff.operations).toHaveLength(0);
    expect(diff.summary.total).toBe(0);
  });

  it("detects add, remove, and slot-time changes", () => {
    const oldSnapshot = createBaseSnapshot();

    const newSnapshot: TimetableSnapshotState = {
      ...oldSnapshot,
      blocks: [
        // L1 moves from 09-10 to 10-11.
        { id: 40, dayId: 10, startBandId: 21, laneIndex: 0, rowSpan: 1, label: "L1" },
        // L2 removed.
        // L3 added.
        { id: 41, dayId: 11, startBandId: 21, laneIndex: 0, rowSpan: 1, label: "L3" },
      ],
    };

    const diff = computeTimetableDiff({
      oldSnapshot,
      newState: newSnapshot,
    });

    const typesByLabel = new Map(diff.operations.map((operation) => [operation.label, operation.type]));

    expect(typesByLabel.get("L1")).toBe("CHANGE_SLOT");
    expect(typesByLabel.get("L2")).toBe("REMOVE_SLOT");
    expect(typesByLabel.get("L3")).toBe("ADD_SLOT");
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.removed).toBe(1);
    expect(diff.summary.changedSlot).toBe(1);
  });

  it("detects venue-only changes when structure is unchanged", () => {
    const oldSnapshot = {
      ...createBaseSnapshot(),
      roomAssignments: {
        l1: 101,
      },
    };

    const newSnapshot: TimetableSnapshotState = {
      ...createBaseSnapshot(),
      roomAssignments: {
        l1: 202,
      },
    };

    const diff = computeTimetableDiff({
      oldSnapshot,
      newState: newSnapshot,
    });

    expect(diff.operations).toHaveLength(1);
    expect(diff.operations[0]?.type).toBe("CHANGE_VENUE");
    expect(diff.summary.changedVenue).toBe(1);
  });
});
