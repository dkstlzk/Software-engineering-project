/**
 * Booking Freeze Service
 *
 * Manages in-memory locking of booking operations during timetable import commits.
 * When frozen, booking approvals and mutations are blocked with a reason message.
 * Booking requests (submissions) remain allowed.
 */

import logger from "../../../shared/utils/logger";

// ============================================================================
// Types
// ============================================================================

export type BookingFreezeInfo = {
  batchId: number;
  userId: number;
  userName: string;
  startedAt: Date;
};

export type BookingFreezeState = {
  isFrozen: boolean;
  frozenBy: BookingFreezeInfo | null;
  reason: string | null;
};

export type BookingFreezeResult =
  | { ok: true; state: BookingFreezeState }
  | { ok: false; code: string; message: string };

// ============================================================================
// In-Memory State
// ============================================================================

let freezeState: BookingFreezeState = {
  isFrozen: false,
  frozenBy: null,
  reason: null,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current freeze state
 */
export function getBookingFreezeState(): BookingFreezeState {
  return { ...freezeState };
}

/**
 * Check if bookings are currently frozen
 */
export function isBookingFrozen(): boolean {
  return freezeState.isFrozen;
}

/**
 * Freeze booking operations for timetable import commit.
 * Only one batch can hold the freeze at a time.
 *
 * @param batchId - The batch ID that is committing
 * @param userId - The user ID who initiated the commit
 * @param userName - The user name for display purposes
 * @returns Result indicating success or failure with reason
 */
export function freezeBookings(
  batchId: number,
  userId: number,
  userName: string
): BookingFreezeResult {
  if (freezeState.isFrozen) {
    const existingInfo = freezeState.frozenBy;
    const existingBatchId = existingInfo?.batchId ?? "unknown";
    const existingUser = existingInfo?.userName ?? "unknown";
    const startedAt = existingInfo?.startedAt?.toISOString() ?? "unknown";

    logger.warn("Booking freeze requested but already frozen by another batch", {
      requestedBatchId: batchId,
      requestedUserId: userId,
      existingBatchId,
      existingUserId: existingInfo?.userId,
      startedAt,
    });

    return {
      ok: false,
      code: "ALREADY_FROZEN",
      message: `Booking operations are already frozen by ${existingUser} for batch ${existingBatchId} (started at ${startedAt}). Please wait for that commit to complete or be cancelled.`,
    };
  }

  freezeState = {
    isFrozen: true,
    frozenBy: {
      batchId,
      userId,
      userName,
      startedAt: new Date(),
    },
    reason: `Timetable allocation in progress for batch ${batchId}. Booking approvals and modifications are temporarily disabled.`,
  };

  logger.info("Booking operations frozen for timetable import commit", {
    batchId,
    userId,
    userName,
    startedAt: freezeState.frozenBy!.startedAt.toISOString(),
  });

  return { ok: true, state: getBookingFreezeState() };
}

/**
 * Unfreeze booking operations.
 * Can only be unfrozen by the same batch that froze it (or forced).
 *
 * @param batchId - The batch ID requesting unfreeze
 * @param force - If true, unfreeze regardless of which batch froze it
 * @returns Result indicating success or failure with reason
 */
export function unfreezeBookings(
  batchId: number,
  force = false
): BookingFreezeResult {
  if (!freezeState.isFrozen) {
    logger.debug("Unfreeze requested but bookings are not frozen", { batchId });
    return { ok: true, state: getBookingFreezeState() };
  }

  const existingBatchId = freezeState.frozenBy?.batchId;

  if (!force && existingBatchId !== batchId) {
    logger.warn("Unfreeze requested by different batch than the one that froze", {
      requestedBatchId: batchId,
      existingBatchId,
      existingUserId: freezeState.frozenBy?.userId,
    });

    return {
      ok: false,
      code: "WRONG_BATCH",
      message: `Cannot unfreeze: bookings were frozen by batch ${existingBatchId}, not batch ${batchId}`,
    };
  }

  const previousState = { ...freezeState };

  freezeState = {
    isFrozen: false,
    frozenBy: null,
    reason: null,
  };

  logger.info("Booking operations unfrozen", {
    batchId,
    previousBatchId: previousState.frozenBy?.batchId,
    previousUserId: previousState.frozenBy?.userId,
    duration: previousState.frozenBy?.startedAt
      ? Date.now() - previousState.frozenBy.startedAt.getTime()
      : null,
    forced: force,
  });

  return { ok: true, state: getBookingFreezeState() };
}

/**
 * Check if an operation should be blocked due to freeze.
 * Returns null if allowed, or an error object if blocked.
 */
export function checkFreezeBlock(): {
  blocked: true;
  status: number;
  code: string;
  message: string;
  freezeInfo: BookingFreezeInfo;
} | null {
  if (!freezeState.isFrozen || !freezeState.frozenBy) {
    return null;
  }

  return {
    blocked: true,
    status: 423, // HTTP 423 Locked
    code: "BOOKINGS_FROZEN",
    message:
      freezeState.reason ??
      "Booking operations are temporarily frozen for timetable allocation",
    freezeInfo: { ...freezeState.frozenBy },
  };
}

/**
 * Force unfreeze (admin emergency use).
 * Logs a warning since this bypasses normal ownership checks.
 */
export function forceUnfreeze(adminUserId: number): BookingFreezeResult {
  if (!freezeState.isFrozen) {
    return { ok: true, state: getBookingFreezeState() };
  }

  logger.warn("Force unfreeze initiated by admin", {
    adminUserId,
    frozenByBatchId: freezeState.frozenBy?.batchId,
    frozenByUserId: freezeState.frozenBy?.userId,
    frozenSince: freezeState.frozenBy?.startedAt?.toISOString(),
  });

  freezeState = {
    isFrozen: false,
    frozenBy: null,
    reason: null,
  };

  logger.info("Booking operations force unfrozen by admin", { adminUserId });

  return { ok: true, state: getBookingFreezeState() };
}

/**
 * Get freeze duration in milliseconds (0 if not frozen)
 */
export function getFreezeDuration(): number {
  if (!freezeState.isFrozen || !freezeState.frozenBy?.startedAt) {
    return 0;
  }
  return Date.now() - freezeState.frozenBy.startedAt.getTime();
}

// ============================================================================
// Testing Helpers (only for use in tests)
// ============================================================================

/**
 * Reset freeze state (for testing only)
 */
export function _resetFreezeState(): void {
  freezeState = {
    isFrozen: false,
    frozenBy: null,
    reason: null,
  };
}
