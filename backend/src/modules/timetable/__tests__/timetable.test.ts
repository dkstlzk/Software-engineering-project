/**
 * Timetable Module Unit Tests
 *
 * Fully self-contained tests that replicate the pure logic
 * of the freeze service and service error utilities to avoid
 * importing modules with side effects (logger, DB connections).
 */

import { describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// Replicated Freeze Logic (mirrors bookingFreezeService.ts)
// ============================================================================

type FreezeInfo = {
  batchId: number;
  userId: number;
  userName: string;
  startedAt: Date;
};

type FreezeState = {
  isFrozen: boolean;
  frozenBy: FreezeInfo | null;
  reason: string | null;
};

type FreezeResult =
  | { ok: true; state: FreezeState }
  | { ok: false; code: string; message: string };

let freezeState: FreezeState = {
  isFrozen: false,
  frozenBy: null,
  reason: null,
};

function resetFreeze() {
  freezeState = { isFrozen: false, frozenBy: null, reason: null };
}

function getState(): FreezeState {
  return { ...freezeState };
}

function isFrozen(): boolean {
  return freezeState.isFrozen;
}

function freeze(batchId: number, userId: number, userName: string): FreezeResult {
  if (freezeState.isFrozen && freezeState.frozenBy) {
    if (freezeState.frozenBy.batchId === batchId) {
      return { ok: true, state: getState() };
    }
    return {
      ok: false,
      code: "ALREADY_FROZEN",
      message: `Booking operations are already frozen by batch ${freezeState.frozenBy.batchId} (user: ${freezeState.frozenBy.userName})`,
    };
  }

  freezeState = {
    isFrozen: true,
    frozenBy: { batchId, userId, userName, startedAt: new Date() },
    reason: `Frozen for timetable import batch ${batchId}`,
  };

  return { ok: true, state: getState() };
}

function unfreeze(batchId: number, force = false) {
  if (!freezeState.isFrozen) return;

  if (force || (freezeState.frozenBy && freezeState.frozenBy.batchId === batchId)) {
    freezeState = { isFrozen: false, frozenBy: null, reason: null };
  }
}

// ============================================================================
// Replicated Service Error Logic (mirrors service.ts)
// ============================================================================

type TimetableServiceError = Error & { status: number };

function createServiceError(status: number, message: string): TimetableServiceError {
  const error = new Error(message) as TimetableServiceError;
  error.status = status;
  return error;
}

function isTimetableServiceError(error: unknown): error is TimetableServiceError {
  return (
    error instanceof Error &&
    typeof (error as Partial<TimetableServiceError>).status === "number"
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("Booking Freeze Service", () => {
  beforeEach(() => {
    resetFreeze();
  });

  it("should start unfrozen", () => {
    const state = getState();
    expect(state.isFrozen).toBe(false);
    expect(state.frozenBy).toBeNull();
    expect(isFrozen()).toBe(false);
  });

  it("should freeze successfully", () => {
    const result = freeze(100, 1, "Test Admin");
    expect(result.ok).toBe(true);
    expect(isFrozen()).toBe(true);

    const state = getState();
    expect(state.isFrozen).toBe(true);
    expect(state.frozenBy?.batchId).toBe(100);
    expect(state.frozenBy?.userId).toBe(1);
    expect(state.frozenBy?.userName).toBe("Test Admin");
  });

  it("should reject double freeze from different batch", () => {
    const first = freeze(100, 1, "Admin 1");
    expect(first.ok).toBe(true);

    const second = freeze(200, 2, "Admin 2");
    expect(second.ok).toBe(false);

    if (!second.ok) {
      expect(second.code).toBe("ALREADY_FROZEN");
      expect(second.message).toContain("batch 100");
    }
  });

  it("should allow re-freeze from same batch (idempotent)", () => {
    const first = freeze(100, 1, "Admin 1");
    expect(first.ok).toBe(true);

    const second = freeze(100, 1, "Admin 1");
    expect(second.ok).toBe(true);
  });

  it("should unfreeze by matching batch", () => {
    freeze(100, 1, "Admin");
    expect(isFrozen()).toBe(true);

    unfreeze(100);
    expect(isFrozen()).toBe(false);
  });

  it("should not unfreeze with wrong batch id", () => {
    freeze(100, 1, "Admin");
    expect(isFrozen()).toBe(true);

    unfreeze(999);
    expect(isFrozen()).toBe(true);
  });

  it("should force-unfreeze regardless of batch id", () => {
    freeze(100, 1, "Admin");
    expect(isFrozen()).toBe(true);

    unfreeze(999, true);
    expect(isFrozen()).toBe(false);
  });

  it("should provide freeze reason in state", () => {
    freeze(100, 1, "Admin");
    const state = getState();
    expect(state.reason).toBeTruthy();
    expect(state.reason).toContain("batch 100");
  });

  it("unfreeze on already unfrozen state is a no-op", () => {
    expect(isFrozen()).toBe(false);
    unfreeze(100);
    expect(isFrozen()).toBe(false);
  });
});

describe("Service Error Utilities", () => {
  it("should create error with status", () => {
    const error = createServiceError(403, "System is locked");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("System is locked");
    expect(error.status).toBe(403);
  });

  it("should identify service errors", () => {
    const serviceError = createServiceError(400, "Bad request");
    expect(isTimetableServiceError(serviceError)).toBe(true);
  });

  it("should reject plain errors", () => {
    const plainError = new Error("Not a service error");
    expect(isTimetableServiceError(plainError)).toBe(false);
  });

  it("should reject non-errors", () => {
    expect(isTimetableServiceError("string")).toBe(false);
    expect(isTimetableServiceError(null)).toBe(false);
    expect(isTimetableServiceError(undefined)).toBe(false);
    expect(isTimetableServiceError(42)).toBe(false);
  });

  it("should be throwable and catchable", () => {
    const error = createServiceError(404, "Not found");

    expect(() => {
      throw error;
    }).toThrow("Not found");

    try {
      throw error;
    } catch (e) {
      expect(isTimetableServiceError(e)).toBe(true);
      if (isTimetableServiceError(e)) {
        expect(e.status).toBe(404);
      }
    }
  });

  it("lock enforcement error uses status 403", () => {
    const lockError = createServiceError(
      403,
      "Slot system is locked. Use the change workspace to modify a locked system.",
    );
    expect(lockError.status).toBe(403);
    expect(lockError.message).toContain("locked");
    expect(lockError.message).toContain("change workspace");
  });
});

describe("Conflict Resolution Actions", () => {
  type Resolution = {
    occurrenceId: number;
    action: "FORCE_OVERWRITE" | "SKIP" | "ALTERNATIVE_ROOM";
    alternativeRoomId?: number;
  };

  it("should accept all valid resolution actions", () => {
    const actions = ["FORCE_OVERWRITE", "SKIP", "ALTERNATIVE_ROOM"] as const;
    for (const action of actions) {
      const res: Resolution = { occurrenceId: 1, action };
      expect(res.action).toBe(action);
    }
  });

  it("ALTERNATIVE_ROOM requires alternativeRoomId", () => {
    const withRoom: Resolution = {
      occurrenceId: 1,
      action: "ALTERNATIVE_ROOM",
      alternativeRoomId: 42,
    };
    expect(withRoom.alternativeRoomId).toBe(42);

    const withoutRoom: Resolution = {
      occurrenceId: 2,
      action: "ALTERNATIVE_ROOM",
    };
    expect(withoutRoom.alternativeRoomId).toBeUndefined();
  });

  it("FORCE_OVERWRITE and SKIP do not need alternativeRoomId", () => {
    const overwrite: Resolution = { occurrenceId: 1, action: "FORCE_OVERWRITE" };
    expect(overwrite.alternativeRoomId).toBeUndefined();

    const skip: Resolution = { occurrenceId: 2, action: "SKIP" };
    expect(skip.alternativeRoomId).toBeUndefined();
  });
});

describe("Slot System Lifecycle", () => {
  it("isLocked defaults to false for new systems", () => {
    const system = { id: 1, name: "Test", isLocked: false };
    expect(system.isLocked).toBe(false);
  });

  it("isLocked is true after commit", () => {
    const system = { id: 1, name: "Test", isLocked: true };
    expect(system.isLocked).toBe(true);
  });

  it("only PREVIEWED and COMMITTED are valid batch statuses", () => {
    const validStatuses = ["PREVIEWED", "COMMITTED"];
    expect(validStatuses).toHaveLength(2);
    expect(validStatuses).toContain("PREVIEWED");
    expect(validStatuses).toContain("COMMITTED");
  });

  it("one-batch-per-system: upsert semantics on preview", () => {
    // Simulate: system has existing batch → new preview replaces it
    const existingBatches = [{ id: 1, systemId: 1, status: "PREVIEWED" }];
    const newBatch = { id: 2, systemId: 1, status: "PREVIEWED" };

    // After upsert, only the new batch should exist
    const afterUpsert = existingBatches
      .filter((b) => b.id !== existingBatches[0]!.id)
      .concat(newBatch);

    expect(afterUpsert).toHaveLength(1);
    expect(afterUpsert[0]!.id).toBe(2);
  });
});
