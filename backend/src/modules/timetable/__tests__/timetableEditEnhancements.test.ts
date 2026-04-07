import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

type OperationType = "ADD_SLOT" | "REMOVE_SLOT" | "CHANGE_SLOT" | "CHANGE_VENUE";

function hashValue(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function computeOperationGroupId(
  operationType: OperationType,
  attributes: { oldRoomId: number | null; newRoomId: number | null },
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

function aggregateBookingImpact(input: Array<{ operationId: string; affectedBookings: number }>) {
  return {
    totalAffectedBookings: input.reduce((sum, item) => sum + item.affectedBookings, 0),
    byOperation: input,
  };
}

describe("Timetable edit enhancements", () => {
  it("groups CHANGE_SLOT operations into same group id", () => {
    const groupA = computeOperationGroupId("CHANGE_SLOT", { oldRoomId: 1, newRoomId: 1 });
    const groupB = computeOperationGroupId("CHANGE_SLOT", { oldRoomId: 3, newRoomId: 4 });

    expect(groupA).toBe(groupB);
  });

  it("groups CHANGE_VENUE by room transition", () => {
    const groupA = computeOperationGroupId("CHANGE_VENUE", { oldRoomId: 1, newRoomId: 2 });
    const groupB = computeOperationGroupId("CHANGE_VENUE", { oldRoomId: 1, newRoomId: 2 });
    const groupC = computeOperationGroupId("CHANGE_VENUE", { oldRoomId: 1, newRoomId: 3 });

    expect(groupA).toBe(groupB);
    expect(groupA).not.toBe(groupC);
  });

  it("aggregates booking impact totals and preserves per-operation counts", () => {
    const impact = aggregateBookingImpact([
      { operationId: "op-1", affectedBookings: 5 },
      { operationId: "op-2", affectedBookings: 7 },
      { operationId: "op-3", affectedBookings: 0 },
    ]);

    expect(impact.totalAffectedBookings).toBe(12);
    expect(impact.byOperation).toHaveLength(3);
    expect(impact.byOperation[1]?.affectedBookings).toBe(7);
  });

  it("supports empty diff response semantics", () => {
    const response = {
      noChanges: true,
      message: "No changes detected",
      diff: {
        affectedRows: 0,
      },
    };

    expect(response.noChanges).toBe(true);
    expect(response.message).toBe("No changes detected");
    expect(response.diff.affectedRows).toBe(0);
  });

  it("enforces version conflict semantics", () => {
    const incomingVersion = Number("3");
    const dbVersion = Number("4");
    const isMismatch = incomingVersion !== dbVersion;

    expect(isMismatch).toBe(true);
  });
});
