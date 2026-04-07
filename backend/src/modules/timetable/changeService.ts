/**
 * Slot System Change Workspace Service
 *
 * Manages structural modifications to locked slot systems through a
 * preview → apply workflow. Acquires a booking freeze during apply,
 * mutates days/bands/blocks, recomputes affected allocations, and
 * releases the freeze on completion or error.
 */

import { db } from "../../db";
import { eq, and, inArray } from "drizzle-orm";
import {
  timetableImportBatches,
  timetableImportOccurrences,
  timetableImportRowResolutions,
  timetableImportRows,
} from "../../db/schema";
import {
  freezeBookings,
  unfreezeBookings,
} from "./services/bookingFreezeService";
import logger from "../../shared/utils/logger";
import { slotBlocks, slotDays, slotSystems, slotTimeBands } from "./schema";
import { recomputeCommittedBatchRows } from "./importService";
import {
  createServiceError,
  isTimetableServiceError,
  createDay,
  deleteDay,
  createTimeBand,
  updateTimeBand,
  deleteTimeBand,
  createBlock,
  deleteBlock,
  addDayLane,
  removeDayLane,
} from "./service";

// ============================================================================
// Types
// ============================================================================

export type SlotSystemChangeInput = {
  slotSystemId: number;
  changes: {
    addDays?: Array<{ dayOfWeek: string; orderIndex?: number }>;
    removeDayIds?: number[];
    addTimeBands?: Array<{ startTime: string; endTime: string; orderIndex?: number }>;
    removeTimeBandIds?: number[];
    updateTimeBands?: Array<{
      timeBandId: number;
      startTime?: string;
      endTime?: string;
      orderIndex?: number;
    }>;
    addBlocks?: Array<{
      dayId: number;
      startBandId: number;
      laneIndex: number;
      rowSpan: number;
      label: string;
    }>;
    removeBlockIds?: number[];
    addLaneDayIds?: number[];
    removeLaneDayIds?: number[];
  };
};

export type ChangePreviewResult = {
  slotSystemId: number;
  isLocked: boolean;
  summary: {
    daysToAdd: number;
    daysToRemove: number;
    timeBandsToAdd: number;
    timeBandsToRemove: number;
    timeBandsToUpdate: number;
    blocksToAdd: number;
    blocksToRemove: number;
    lanesToAdd: number;
    lanesToRemove: number;
  };
  affectedBatches: Array<{
    batchId: number;
    status: string;
    affectedOccurrences: number;
  }>;
  warnings: string[];
};

export type ChangeApplyResult = {
  slotSystemId: number;
  applied: {
    daysAdded: number;
    daysRemoved: number;
    timeBandsAdded: number;
    timeBandsRemoved: number;
    timeBandsUpdated: number;
    blocksAdded: number;
    blocksRemoved: number;
    lanesAdded: number;
    lanesRemoved: number;
  };
  recomputation: {
    affectedOccurrences: number;
    deletedBookings: number;
    warnings: string[];
  };
};

type SlotLabelSignatureMap = Map<string, string>;

function normalizeSlotLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function buildSlotLabelSignatureMap(
  slotSystemId: number,
): Promise<SlotLabelSignatureMap> {
  const [days, timeBands, blocks] = await Promise.all([
    db
      .select({ id: slotDays.id, dayOfWeek: slotDays.dayOfWeek })
      .from(slotDays)
      .where(eq(slotDays.slotSystemId, slotSystemId)),
    db
      .select({
        id: slotTimeBands.id,
        startTime: slotTimeBands.startTime,
        endTime: slotTimeBands.endTime,
      })
      .from(slotTimeBands)
      .where(eq(slotTimeBands.slotSystemId, slotSystemId)),
    db
      .select({
        label: slotBlocks.label,
        dayId: slotBlocks.dayId,
        startBandId: slotBlocks.startBandId,
        rowSpan: slotBlocks.rowSpan,
      })
      .from(slotBlocks)
      .where(eq(slotBlocks.slotSystemId, slotSystemId)),
  ]);

  const dayById = new Map(days.map((day) => [day.id, day.dayOfWeek]));
  const sortedTimeBands = [...timeBands].sort((a, b) => {
    const startCompare = String(a.startTime).localeCompare(String(b.startTime));
    if (startCompare !== 0) {
      return startCompare;
    }

    const endCompare = String(a.endTime).localeCompare(String(b.endTime));
    if (endCompare !== 0) {
      return endCompare;
    }

    return a.id - b.id;
  });

  const timeBandIndexById = new Map<number, number>();
  sortedTimeBands.forEach((band, index) => {
    timeBandIndexById.set(band.id, index);
  });

  const partsByLabel = new Map<string, Set<string>>();

  for (const block of blocks) {
    const labelKey = normalizeSlotLabel(block.label ?? "");
    if (!labelKey) {
      continue;
    }

    const dayOfWeek = dayById.get(block.dayId);
    const startBandIndex = timeBandIndexById.get(block.startBandId);

    if (!dayOfWeek || startBandIndex === undefined) {
      continue;
    }

    const endBandIndex = startBandIndex + block.rowSpan - 1;
    const startBand = sortedTimeBands[startBandIndex];
    const endBand = sortedTimeBands[endBandIndex];

    if (!startBand || !endBand) {
      continue;
    }

    const part = `${dayOfWeek}|${String(startBand.startTime)}|${String(endBand.endTime)}`;
    const existing = partsByLabel.get(labelKey) ?? new Set<string>();
    existing.add(part);
    partsByLabel.set(labelKey, existing);
  }

  const signatures: SlotLabelSignatureMap = new Map();

  for (const [labelKey, parts] of partsByLabel.entries()) {
    signatures.set(labelKey, Array.from(parts).sort().join("||"));
  }

  return signatures;
}

function getChangedSlotLabels(
  before: SlotLabelSignatureMap,
  after: SlotLabelSignatureMap,
): Set<string> {
  const changed = new Set<string>();
  const keys = new Set<string>([...before.keys(), ...after.keys()]);

  for (const key of keys) {
    if ((before.get(key) ?? "") !== (after.get(key) ?? "")) {
      changed.add(key);
    }
  }

  return changed;
}

async function getAffectedRowIdsForChangedLabels(
  batchId: number,
  changedLabels: Set<string>,
): Promise<number[]> {
  if (changedLabels.size === 0) {
    return [];
  }

  const rows = await db
    .select({
      rowId: timetableImportRows.id,
      rawSlot: timetableImportRows.rawSlot,
      rowResolvedSlotLabel: timetableImportRows.resolvedSlotLabel,
      resolutionAction: timetableImportRowResolutions.action,
      resolutionSlotLabel: timetableImportRowResolutions.resolvedSlotLabel,
    })
    .from(timetableImportRows)
    .leftJoin(
      timetableImportRowResolutions,
      and(
        eq(timetableImportRowResolutions.batchId, batchId),
        eq(timetableImportRowResolutions.rowId, timetableImportRows.id),
      ),
    )
    .where(eq(timetableImportRows.batchId, batchId));

  const rowIds: number[] = [];

  for (const row of rows) {
    if (row.resolutionAction === "SKIP") {
      continue;
    }

    const effectiveLabel =
      row.resolutionSlotLabel ?? row.rowResolvedSlotLabel ?? row.rawSlot ?? "";
    const normalizedLabel = normalizeSlotLabel(effectiveLabel);

    if (!normalizedLabel) {
      continue;
    }

    if (changedLabels.has(normalizedLabel)) {
      rowIds.push(row.rowId);
    }
  }

  return Array.from(new Set(rowIds));
}

// ============================================================================
// Preview Changes
// ============================================================================

/**
 * Preview the impact of proposed changes to a slot system without applying them.
 */
export async function previewSlotSystemChanges(
  input: SlotSystemChangeInput,
): Promise<ChangePreviewResult> {
  const { slotSystemId, changes } = input;

  const [system] = await db
    .select()
    .from(slotSystems)
    .where(eq(slotSystems.id, slotSystemId))
    .limit(1);

  if (!system) {
    throw createServiceError(404, "Slot system not found");
  }

  const warnings: string[] = [];

  const summary = {
    daysToAdd: changes.addDays?.length ?? 0,
    daysToRemove: changes.removeDayIds?.length ?? 0,
    timeBandsToAdd: changes.addTimeBands?.length ?? 0,
    timeBandsToRemove: changes.removeTimeBandIds?.length ?? 0,
    timeBandsToUpdate: changes.updateTimeBands?.length ?? 0,
    blocksToAdd: changes.addBlocks?.length ?? 0,
    blocksToRemove: changes.removeBlockIds?.length ?? 0,
    lanesToAdd: changes.addLaneDayIds?.length ?? 0,
    lanesToRemove: changes.removeLaneDayIds?.length ?? 0,
  };

  // Check affected committed batches
  const committedBatches = await db
    .select({
      id: timetableImportBatches.id,
      status: timetableImportBatches.status,
    })
    .from(timetableImportBatches)
    .where(
      and(
        eq(timetableImportBatches.slotSystemId, slotSystemId),
        eq(timetableImportBatches.status, "COMMITTED"),
      ),
    );

  const affectedBatches: ChangePreviewResult["affectedBatches"] = [];

  for (const batch of committedBatches) {
    // Count occurrences that reference blocks being removed
    let affectedOccurrences = 0;

    if (changes.removeBlockIds && changes.removeBlockIds.length > 0) {
      // Count rows in this batch that reference blocks being removed
      const blockLabels = await db
        .select({ label: slotBlocks.label })
        .from(slotBlocks)
        .where(inArray(slotBlocks.id, changes.removeBlockIds));

      if (blockLabels.length > 0) {
        const [countResult] = await db
          .select({
            count: db.$count(timetableImportOccurrences),
          })
          .from(timetableImportOccurrences)
          .where(
            and(
              eq(timetableImportOccurrences.batchId, batch.id),
              eq(timetableImportOccurrences.status, "CREATED"),
            ),
          );

        affectedOccurrences = countResult?.count ?? 0;
      }
    }

    affectedBatches.push({
      batchId: batch.id,
      status: batch.status,
      affectedOccurrences,
    });
  }

  if (changes.removeBlockIds && changes.removeBlockIds.length > 0) {
    warnings.push(
      `Removing ${changes.removeBlockIds.length} block(s) may invalidate existing allocations`,
    );
  }

  if (changes.removeTimeBandIds && changes.removeTimeBandIds.length > 0) {
    warnings.push(
      `Removing ${changes.removeTimeBandIds.length} time band(s) will cascade-delete associated blocks`,
    );
  }

  if (changes.removeDayIds && changes.removeDayIds.length > 0) {
    warnings.push(
      `Removing ${changes.removeDayIds.length} day(s) will cascade-delete associated blocks`,
    );
  }

  return {
    slotSystemId,
    isLocked: system.isLocked,
    summary,
    affectedBatches,
    warnings,
  };
}

// ============================================================================
// Apply Changes
// ============================================================================

/**
 * Apply structural changes to a locked slot system.
 * Acquires booking freeze, applies mutations, cleans up stale bookings, releases freeze.
 */
export async function applySlotSystemChanges(
  input: SlotSystemChangeInput,
  userId: number,
  userName: string,
): Promise<ChangeApplyResult> {
  const { slotSystemId, changes } = input;

  const [system] = await db
    .select()
    .from(slotSystems)
    .where(eq(slotSystems.id, slotSystemId))
    .limit(1);

  if (!system) {
    throw createServiceError(404, "Slot system not found");
  }

  // Use a virtual batchId for freeze (negative to avoid conflicts with real batches)
  const freezeBatchId = -(slotSystemId * 1000 + Date.now() % 1000);

  const freezeResult = freezeBookings(freezeBatchId, userId, userName);
  if (!freezeResult.ok) {
    throw createServiceError(
      409,
      `Cannot apply changes: ${freezeResult.message}`,
    );
  }

  logger.info("Booking operations frozen for slot system change", {
    slotSystemId,
    userId,
    freezeBatchId,
  });

  const result: ChangeApplyResult = {
    slotSystemId,
    applied: {
      daysAdded: 0,
      daysRemoved: 0,
      timeBandsAdded: 0,
      timeBandsRemoved: 0,
      timeBandsUpdated: 0,
      blocksAdded: 0,
      blocksRemoved: 0,
      lanesAdded: 0,
      lanesRemoved: 0,
    },
    recomputation: {
      affectedOccurrences: 0,
      deletedBookings: 0,
      warnings: [],
    },
  };

  const beforeLabelSignatures = await buildSlotLabelSignatureMap(slotSystemId);

  try {
    // 1. Remove blocks first (so time band / day deletion cascades cleanly)
    if (changes.removeBlockIds) {
      for (const blockId of changes.removeBlockIds) {
        try {
          await deleteBlock(blockId, true); // bypassLock = true
          result.applied.blocksRemoved++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to remove block ${blockId}: ${msg}`,
          );
        }
      }
    }

    // 2. Remove time bands
    if (changes.removeTimeBandIds) {
      for (const timeBandId of changes.removeTimeBandIds) {
        try {
          await deleteTimeBand(timeBandId, true);
          result.applied.timeBandsRemoved++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to remove time band ${timeBandId}: ${msg}`,
          );
        }
      }
    }

    // 3. Remove days
    if (changes.removeDayIds) {
      for (const dayId of changes.removeDayIds) {
        try {
          await deleteDay(dayId, true);
          result.applied.daysRemoved++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to remove day ${dayId}: ${msg}`,
          );
        }
      }
    }

    // 4. Add new days
    if (changes.addDays) {
      for (const dayInput of changes.addDays) {
        try {
          await createDay({
            slotSystemId,
            dayOfWeek: dayInput.dayOfWeek,
            ...(dayInput.orderIndex !== undefined ? { orderIndex: dayInput.orderIndex } : {}),
            bypassLock: true,
          });
          result.applied.daysAdded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to add day ${dayInput.dayOfWeek}: ${msg}`,
          );
        }
      }
    }

    // 5. Add new time bands
    if (changes.addTimeBands) {
      for (const bandInput of changes.addTimeBands) {
        try {
          await createTimeBand({
            slotSystemId,
            startTime: bandInput.startTime,
            endTime: bandInput.endTime,
            ...(bandInput.orderIndex !== undefined ? { orderIndex: bandInput.orderIndex } : {}),
            bypassLock: true,
          });
          result.applied.timeBandsAdded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to add time band ${bandInput.startTime}-${bandInput.endTime}: ${msg}`,
          );
        }
      }
    }

    // 6. Update time bands
    if (changes.updateTimeBands) {
      for (const update of changes.updateTimeBands) {
        try {
          await updateTimeBand({
            timeBandId: update.timeBandId,
            ...(update.startTime !== undefined ? { startTime: update.startTime } : {}),
            ...(update.endTime !== undefined ? { endTime: update.endTime } : {}),
            ...(update.orderIndex !== undefined ? { orderIndex: update.orderIndex } : {}),
            bypassLock: true,
          });
          result.applied.timeBandsUpdated++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to update time band ${update.timeBandId}: ${msg}`,
          );
        }
      }
    }

    // 7. Add new blocks
    if (changes.addBlocks) {
      for (const blockInput of changes.addBlocks) {
        try {
          await createBlock({
            slotSystemId,
            dayId: blockInput.dayId,
            startBandId: blockInput.startBandId,
            laneIndex: blockInput.laneIndex,
            rowSpan: blockInput.rowSpan,
            label: blockInput.label,
            bypassLock: true,
          });
          result.applied.blocksAdded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to add block ${blockInput.label}: ${msg}`,
          );
        }
      }
    }

    // 8. Lane modifications
    if (changes.addLaneDayIds) {
      for (const dayId of changes.addLaneDayIds) {
        try {
          await addDayLane(dayId, true);
          result.applied.lanesAdded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to add lane to day ${dayId}: ${msg}`,
          );
        }
      }
    }

    if (changes.removeLaneDayIds) {
      for (const dayId of changes.removeLaneDayIds) {
        try {
          await removeDayLane(dayId, true);
          result.applied.lanesRemoved++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.recomputation.warnings.push(
            `Failed to remove lane from day ${dayId}: ${msg}`,
          );
        }
      }
    }

    // 9. Recompute only rows affected by structural slot-label changes.
    const afterLabelSignatures = await buildSlotLabelSignatureMap(slotSystemId);
    const changedLabels = getChangedSlotLabels(beforeLabelSignatures, afterLabelSignatures);

    const committedBatches = await db
      .select({ id: timetableImportBatches.id })
      .from(timetableImportBatches)
      .where(
        and(
          eq(timetableImportBatches.slotSystemId, slotSystemId),
          eq(timetableImportBatches.status, "COMMITTED"),
        ),
      );

    if (committedBatches.length > 0 && changedLabels.size > 0) {
      for (const batch of committedBatches) {
        const affectedRowIds = await getAffectedRowIdsForChangedLabels(
          batch.id,
          changedLabels,
        );

        if (affectedRowIds.length === 0) {
          continue;
        }

        const recomputeResult = await recomputeCommittedBatchRows({
          batchId: batch.id,
          rowIds: affectedRowIds,
        });

        result.recomputation.affectedOccurrences += recomputeResult.targetRows;
        result.recomputation.deletedBookings += recomputeResult.deletedBookings;

        if (recomputeResult.warnings.length > 0) {
          for (const warning of recomputeResult.warnings) {
            result.recomputation.warnings.push(`Batch ${batch.id}: ${warning}`);
          }
        }
      }
    }

    logger.info("Slot system changes applied", {
      slotSystemId,
      userId,
      applied: result.applied,
      recomputation: result.recomputation,
    });
  } catch (error) {
    logger.error("Error during slot system change, unfreezing", {
      slotSystemId,
      userId,
      error,
    });
    throw error;
  } finally {
    unfreezeBookings(freezeBatchId, true); // force unfreeze
  }

  return result;
}
