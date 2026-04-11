import { describe, expect, it } from "vitest";
import {
  formatBookingImpactMessage,
  formatEditDiffSummary,
  groupOperationsByGroupId,
  mapEditStartErrorToMessage,
  shouldShowPruneConfirmation,
} from "../timetableEditUtils";
import type { EditCommitSessionStartResponse } from "../../lib/api";

describe("formatEditDiffSummary", () => {
  it("formats all diff counters in a stable order", () => {
    const text = formatEditDiffSummary({
      summary: {
        total: 5,
        added: 1,
        removed: 2,
        changedSlot: 1,
        changedVenue: 1,
      },
      changedLabels: ["l1", "l2"],
      operations: [],
      affectedRows: 4,
      unchangedRows: 9,
      expectedVersion: 3,
      currentVersion: 3,
      bookingImpact: {
        totalAffectedBookings: 0,
        byOperation: [],
      },
    });

    expect(text).toBe("Add: 1, Remove: 2, Slot-change: 1, Venue-change: 1");
  });
});

describe("groupOperationsByGroupId", () => {
  it("should group operations by groupId", () => {
    const operations = [
      {
        type: "CHANGE_SLOT",
        label: "Slot A",
        oldDescriptorCount: 2,
        newDescriptorCount: 2,
        oldRoomId: 1,
        newRoomId: 1,
        operationGroupId: "group1",
        affectedBookings: 3,
      },
      {
        type: "CHANGE_SLOT",
        label: "Slot B",
        oldDescriptorCount: 1,
        newDescriptorCount: 1,
        oldRoomId: 2,
        newRoomId: 2,
        operationGroupId: "group1",
        affectedBookings: 2,
      },
      {
        type: "CHANGE_VENUE",
        label: "Room Change",
        oldDescriptorCount: 1,
        newDescriptorCount: 1,
        oldRoomId: 3,
        newRoomId: 4,
        operationGroupId: "group2",
        affectedBookings: 1,
      },
    ] as EditCommitSessionStartResponse["diff"]["operations"];

    const grouped = groupOperationsByGroupId(operations);

    expect(grouped).toHaveLength(2);
    const group1 = grouped.find((group) => group.groupId === "group1");
    expect(group1?.operations).toHaveLength(2);
    expect(group1?.totalBookingsImpacted).toBe(5);
  });

  it("should handle empty operations list", () => {
    const grouped = groupOperationsByGroupId([]);
    expect(grouped).toHaveLength(0);
  });

  it("should correctly aggregate booking impacts", () => {
    const operations = [
      {
        type: "CHANGE_SLOT",
        label: "A",
        oldDescriptorCount: 1,
        newDescriptorCount: 1,
        oldRoomId: 1,
        newRoomId: 1,
        operationGroupId: "group1",
        affectedBookings: 5,
      },
      {
        type: "CHANGE_SLOT",
        label: "B",
        oldDescriptorCount: 1,
        newDescriptorCount: 1,
        oldRoomId: 1,
        newRoomId: 1,
        operationGroupId: "group1",
        affectedBookings: 3,
      },
    ] as EditCommitSessionStartResponse["diff"]["operations"];

    const grouped = groupOperationsByGroupId(operations);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].totalBookingsImpacted).toBe(8);
  });
});

describe("prune confirmation flow", () => {
  it("returns true when prune is enabled and bookings are affected", () => {
    const result = {
      session: {
        commitSessionId: 1,
        batchId: 1,
        slotSystemId: 1,
        status: "STARTED",
        payloadSnapshot: "[]",
        isFrozen: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      diff: {
        summary: {
          total: 1,
          added: 1,
          removed: 0,
          changedSlot: 0,
          changedVenue: 0,
        },
        changedLabels: ["A"],
        operations: [],
        affectedRows: 1,
        unchangedRows: 0,
        expectedVersion: 1,
        currentVersion: 1,
        bookingImpact: {
          totalAffectedBookings: 12,
          byOperation: [],
        },
      },
    } as EditCommitSessionStartResponse;

    expect(shouldShowPruneConfirmation({ pruneEnabled: true, result })).toBe(true);
  });

  it("returns false when no affected bookings", () => {
    const result = {
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
        expectedVersion: 1,
        currentVersion: 1,
        bookingImpact: {
          totalAffectedBookings: 0,
          byOperation: [],
        },
      },
    } as EditCommitSessionStartResponse;

    expect(shouldShowPruneConfirmation({ pruneEnabled: true, result })).toBe(false);
  });
});

describe("version conflict UI", () => {
  it("maps version mismatch to user-safe reload message", () => {
    const msg = mapEditStartErrorToMessage("Version mismatch. Expected 5, found 6");
    expect(msg).toBe("This timetable was updated by someone else. Please reload.");
  });
});

describe("no-change UI", () => {
  it("maps no-change backend response to no-change UI text", () => {
    const msg = mapEditStartErrorToMessage("No changes detected");
    expect(msg).toBe("No changes detected. Edit aborted.");
  });
});

describe("booking impact display", () => {
  it("formats booking impact summary text", () => {
    expect(formatBookingImpactMessage(12)).toBe("This change affects 12 bookings");
  });

  it("formats singular booking impact summary text", () => {
    expect(formatBookingImpactMessage(1)).toBe("This change affects 1 booking");
  });
});
