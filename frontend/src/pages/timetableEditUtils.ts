import type { EditCommitSessionStartResponse } from "../lib/api";

export function formatEditDiffSummary(
  diff: EditCommitSessionStartResponse["diff"],
): string {
  return `Add: ${diff.summary.added}, Remove: ${diff.summary.removed}, Slot-change: ${diff.summary.changedSlot}, Venue-change: ${diff.summary.changedVenue}`;
}

export type OperationGroup = {
  groupId: string;
  type: string;
  operations: EditCommitSessionStartResponse["diff"]["operations"];
  totalBookingsImpacted: number;
};

export function groupOperationsByGroupId(
  operations: EditCommitSessionStartResponse["diff"]["operations"],
): OperationGroup[] {
  const grouped = new Map<string, OperationGroup>();

  for (const operation of operations) {
    const existing = grouped.get(operation.operationGroupId);

    if (existing) {
      existing.operations.push(operation);
      existing.totalBookingsImpacted += operation.affectedBookings;
    } else {
      grouped.set(operation.operationGroupId, {
        groupId: operation.operationGroupId,
        type: operation.type,
        operations: [operation],
        totalBookingsImpacted: operation.affectedBookings,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    // Sort by type first, then by booking impact (descending)
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    }
    return b.totalBookingsImpacted - a.totalBookingsImpacted;
  });
}

export function shouldShowPruneConfirmation(input: {
  pruneEnabled: boolean;
  result: EditCommitSessionStartResponse | null;
}): boolean {
  return (
    input.pruneEnabled === true &&
    input.result !== null &&
    input.result.diff.bookingImpact.totalAffectedBookings > 0
  );
}

export function mapEditStartErrorToMessage(message: string): string {
  if (message.includes("Version mismatch") || message.includes("Timetable updated")) {
    return "This timetable was updated by someone else. Please reload.";
  }

  if (message.includes("No changes detected")) {
    return "No changes detected. Edit aborted.";
  }

  return message;
}

export function formatBookingImpactMessage(totalAffectedBookings: number): string {
  return `This change affects ${totalAffectedBookings} booking${totalAffectedBookings === 1 ? "" : "s"}`;
}
