import { Request, Response } from "express";
import {
  addDayLane,
  removeDayLane,
  createBlock,
  createDay,
  createSlotSystem,
  duplicateSlotSystem,
  createTimeBand,
  deleteDay,
  deleteSlotSystem,
  deleteTimeBand,
  deleteBlock,
  getDays,
  getFullGrid,
  getSlotSystems,
  getTimeBands,
  isTimetableServiceError,
  updateTimeBand,
} from "./service";
import {
  commitTimetableImport,
  deleteTimetableImportBatch,
  getTimetableImportBatch,
  getTimetableImportProcessedRows,
  listTimetableImportBatches,
  previewTimetableImport,
  reallocateTimetableImport,
  saveTimetableImportDecisions,
  transferTimetableImportRow,
  detectCommitConflicts,
  commitWithResolutions,
  cancelCommit,
  getCommitFreezeStatus,
} from "./importService";
import {
  previewSlotSystemChanges,
  applySlotSystemChanges,
} from "./changeService";
import {
  cancelCommitSession,
  finalizeCommitSession,
  getCommitSessionStatus,
  resolveExternalConflicts,
  resolveInternalConflicts,
  resolveRuntimeConflicts,
  runExternalCheck,
  runInternalCheck,
  runRuntimeCheck,
  startCommitSession,
  startEditCommitSession,
  startFrozenApply,
} from "./timetableCommitEngine";
import logger from "../../shared/utils/logger";

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function sendError(res: Response, error: unknown, fallbackMessage: string) {
  if (isTimetableServiceError(error)) {
    return res.status(error.status).json({ error: error.message });
  }

  const statusMaybe = (error as { status?: unknown } | null)?.status;
  if (error instanceof Error && typeof statusMaybe === "number") {
    const status = Number(statusMaybe);
    return res.status(status).json({ error: error.message });
  }

  logger.error(error);
  return res.status(500).json({ error: fallbackMessage });
}

export async function handleCreateSlotSystem(req: Request, res: Response) {
  try {
    const name = req.body?.name?.trim();

    if (typeof name !== "string" || !name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const system = await createSlotSystem(name);

    return res.status(201).json(system);
  } catch (error) {
    return sendError(res, error, "Failed to create slot system");
  }
}

export async function handleGetSlotSystems(_req: Request, res: Response) {
  try {
    const systems = await getSlotSystems();
    return res.json(systems);
  } catch (error) {
    return sendError(res, error, "Failed to fetch slot systems");
  }
}

export async function handleDeleteSlotSystem(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.params.id);

    if (!slotSystemId) {
      return res.status(400).json({ error: "Invalid slot system id" });
    }

    await deleteSlotSystem(slotSystemId);
    return res.status(204).send();
  } catch (error) {
    return sendError(res, error, "Failed to delete slot system");
  }
}

export async function handleDuplicateSlotSystem(req: Request, res: Response) {
  try {
    const sourceSlotSystemId = parsePositiveInteger(req.params.id);

    if (!sourceSlotSystemId) {
      return res.status(400).json({ error: "Invalid slot system id" });
    }

    const rawName = req.body?.name;

    if (rawName !== undefined && typeof rawName !== "string") {
      return res.status(400).json({ error: "name must be a string" });
    }

    const duplicated = await duplicateSlotSystem({
      sourceSlotSystemId,
      ...(typeof rawName === "string" ? { name: rawName } : {}),
    });

    return res.status(201).json(duplicated);
  } catch (error) {
    return sendError(res, error, "Failed to duplicate slot system");
  }
}

export async function handleCreateDay(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.body?.slotSystemId);
    const dayOfWeek = req.body?.dayOfWeek;
    const orderIndexRaw = req.body?.orderIndex;

    if (!slotSystemId) {
      return res.status(400).json({ error: "Invalid slotSystemId" });
    }

    if (typeof dayOfWeek !== "string" || !dayOfWeek.trim()) {
      return res.status(400).json({ error: "dayOfWeek is required" });
    }

    const orderIndex =
      orderIndexRaw === undefined ? undefined : Number(orderIndexRaw);

    const createDayInput: {
      slotSystemId: number;
      dayOfWeek: string;
      orderIndex?: number;
    } = {
      slotSystemId,
      dayOfWeek: dayOfWeek.trim().toUpperCase(),
    };

    if (orderIndex !== undefined) {
      createDayInput.orderIndex = orderIndex;
    }

    const day = await createDay(createDayInput);

    return res.status(201).json(day);
  } catch (error) {
    return sendError(res, error, "Failed to create day");
  }
}

export async function handleGetDays(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.query.slotSystemId);

    if (!slotSystemId) {
      return res.status(400).json({ error: "slotSystemId is required" });
    }

    const days = await getDays(slotSystemId);
    return res.json(days);
  } catch (error) {
    return sendError(res, error, "Failed to fetch days");
  }
}

export async function handleDeleteDay(req: Request, res: Response) {
  try {
    const dayId = parsePositiveInteger(req.params.id);

    if (!dayId) {
      return res.status(400).json({ error: "Invalid day id" });
    }

    await deleteDay(dayId);
    return res.status(204).send();
  } catch (error) {
    return sendError(res, error, "Failed to delete day");
  }
}

export async function handleCreateTimeBand(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.body?.slotSystemId);
    const startTime = req.body?.startTime;
    const endTime = req.body?.endTime;
    const orderIndexRaw = req.body?.orderIndex;

    if (!slotSystemId) {
      return res.status(400).json({ error: "Invalid slotSystemId" });
    }

    if (typeof startTime !== "string" || typeof endTime !== "string") {
      return res.status(400).json({ error: "startTime and endTime are required" });
    }

    const orderIndex =
      orderIndexRaw === undefined ? undefined : Number(orderIndexRaw);

    const createBandInput: {
      slotSystemId: number;
      startTime: string;
      endTime: string;
      orderIndex?: number;
    } = {
      slotSystemId,
      startTime,
      endTime,
    };

    if (orderIndex !== undefined) {
      createBandInput.orderIndex = orderIndex;
    }

    const band = await createTimeBand(createBandInput);

    return res.status(201).json(band);
  } catch (error) {
    return sendError(res, error, "Failed to create time band");
  }
}

export async function handleGetTimeBands(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.query.slotSystemId);

    if (!slotSystemId) {
      return res.status(400).json({ error: "slotSystemId is required" });
    }

    const bands = await getTimeBands(slotSystemId);
    return res.json(bands);
  } catch (error) {
    return sendError(res, error, "Failed to fetch time bands");
  }
}

export async function handleUpdateTimeBand(req: Request, res: Response) {
  try {
    const timeBandId = parsePositiveInteger(req.params.id);

    if (!timeBandId) {
      return res.status(400).json({ error: "Invalid time band id" });
    }

    const startTimeRaw = req.body?.startTime;
    const endTimeRaw = req.body?.endTime;
    const orderIndexRaw = req.body?.orderIndex;

    const startTime =
      typeof startTimeRaw === "string" ? startTimeRaw.trim() : undefined;
    const endTime =
      typeof endTimeRaw === "string" ? endTimeRaw.trim() : undefined;
    const orderIndex =
      orderIndexRaw === undefined ? undefined : Number(orderIndexRaw);

    const updateInput: {
      timeBandId: number;
      startTime?: string;
      endTime?: string;
      orderIndex?: number;
    } = {
      timeBandId,
    };

    if (startTime !== undefined) {
      updateInput.startTime = startTime;
    }

    if (endTime !== undefined) {
      updateInput.endTime = endTime;
    }

    if (orderIndex !== undefined) {
      updateInput.orderIndex = orderIndex;
    }

    const updated = await updateTimeBand(updateInput);

    return res.json(updated);
  } catch (error) {
    return sendError(res, error, "Failed to update time band");
  }
}

export async function handleDeleteTimeBand(req: Request, res: Response) {
  try {
    const timeBandId = parsePositiveInteger(req.params.id);

    if (!timeBandId) {
      return res.status(400).json({ error: "Invalid time band id" });
    }

    await deleteTimeBand(timeBandId);
    return res.status(204).send();
  } catch (error) {
    return sendError(res, error, "Failed to delete time band");
  }
}

export async function handleCreateBlock(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.body?.slotSystemId);
    const dayId = parsePositiveInteger(req.body?.dayId);
    const startBandId = parsePositiveInteger(req.body?.startBandId);
    const laneIndex = Number(req.body?.laneIndex ?? 0);
    const rowSpan = Number(req.body?.rowSpan ?? 1);
    const labelRaw = req.body?.label;

    if (!slotSystemId) {
      return res.status(400).json({ error: "Invalid slotSystemId" });
    }

    if (!dayId) {
      return res.status(400).json({ error: "Invalid dayId" });
    }

    if (!startBandId) {
      return res.status(400).json({ error: "Invalid startBandId" });
    }

    if (!Number.isInteger(laneIndex) || laneIndex < 0) {
      return res.status(400).json({ error: "Invalid laneIndex" });
    }

    if (typeof labelRaw !== "string" || !labelRaw.trim()) {
      return res.status(400).json({ error: "label is required" });
    }

    const block = await createBlock({
      slotSystemId,
      dayId,
      startBandId,
      laneIndex,
      rowSpan,
      label: labelRaw,
    });

    return res.status(201).json(block);
  } catch (error) {
    return sendError(res, error, "Failed to create block");
  }
}

export async function handleDeleteBlock(req: Request, res: Response) {
  try {
    const blockId = parsePositiveInteger(req.params.id);

    if (!blockId) {
      return res.status(400).json({ error: "Invalid block id" });
    }

    await deleteBlock(blockId);
    return res.status(204).send();
  } catch (error) {
    return sendError(res, error, "Failed to delete block");
  }
}

export async function handleAddDayLane(req: Request, res: Response) {
  try {
    const dayId = parsePositiveInteger(req.params.id);

    if (!dayId) {
      return res.status(400).json({ error: "Invalid day id" });
    }

    const day = await addDayLane(dayId);
    return res.json(day);
  } catch (error) {
    return sendError(res, error, "Failed to add lane");
  }
}

export async function handleRemoveDayLane(req: Request, res: Response) {
  try {
    const dayId = parsePositiveInteger(req.params.id);

    if (!dayId) {
      return res.status(400).json({ error: "Invalid day id" });
    }

    const day = await removeDayLane(dayId);
    return res.json(day);
  } catch (error) {
    return sendError(res, error, "Failed to remove lane");
  }
}

export async function handleGetFullGrid(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.params.id);

    if (!slotSystemId) {
      return res.status(400).json({ error: "Invalid slot system id" });
    }

    const fullGrid = await getFullGrid(slotSystemId);
    return res.json(fullGrid);
  } catch (error) {
    return sendError(res, error, "Failed to fetch full grid");
  }
}

export async function handlePreviewImport(req: Request, res: Response) {
  try {
    const file = req.file;

    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ error: "Upload file is required" });
    }

    const slotSystemId = Number(req.body?.slotSystemId);
    const termStartDate = String(req.body?.termStartDate ?? "").trim();
    const termEndDate = String(req.body?.termEndDate ?? "").trim();

    if (!Number.isInteger(slotSystemId) || slotSystemId <= 0) {
      return res.status(400).json({ error: "Invalid slotSystemId" });
    }

    if (!termStartDate || !termEndDate) {
      return res.status(400).json({
        error: "termStartDate and termEndDate are required",
      });
    }

    const previewInput = {
      slotSystemId,
      termStartDate,
      termEndDate,
      aliasMap: req.body?.aliasMap,
      fileName: file.originalname || "allocation-upload",
      fileBuffer: file.buffer,
      ...(req.user?.id !== undefined ? { createdBy: req.user.id } : {}),
    };

    const report = await previewTimetableImport(previewInput);

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to preview timetable import");
  }
}

export async function handleListImportBatches(req: Request, res: Response) {
  try {
    const slotSystemIdRaw = req.query.slotSystemId;
    const limitRaw = req.query.limit;

    let slotSystemId: number | undefined;

    if (slotSystemIdRaw !== undefined) {
      const parsedSlotSystemId = parsePositiveInteger(slotSystemIdRaw);

      if (!parsedSlotSystemId) {
        return res.status(400).json({ error: "Invalid slotSystemId" });
      }

      slotSystemId = parsedSlotSystemId;
    }

    const parsedLimit =
      limitRaw === undefined ? undefined : Number(limitRaw);

    if (
      parsedLimit !== undefined &&
      (!Number.isInteger(parsedLimit) || parsedLimit <= 0)
    ) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    const batches = await listTimetableImportBatches({
      ...(slotSystemId !== undefined ? { slotSystemId } : {}),
      ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
    });

    return res.json({
      data: batches,
    });
  } catch (error) {
    return sendError(res, error, "Failed to list import batches");
  }
}

export async function handleGetImportBatch(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const report = await getTimetableImportBatch(batchId);

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to fetch import batch");
  }
}

export async function handleSaveImportDecisions(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const report = await saveTimetableImportDecisions({
      batchId,
      decisions: req.body?.decisions,
    });

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to save import decisions");
  }
}

export async function handleTransferImportRow(req: Request, res: Response) {
  try {
    const sourceBatchId = parsePositiveInteger(req.params.id);
    const rowId = parsePositiveInteger(req.params.rowId);
    const targetSlotSystemId = parsePositiveInteger(req.body?.targetSlotSystemId);

    if (!sourceBatchId) {
      return res.status(400).json({ error: "Invalid source batch id" });
    }

    if (!rowId) {
      return res.status(400).json({ error: "Invalid row id" });
    }

    if (!targetSlotSystemId) {
      return res.status(400).json({ error: "Invalid targetSlotSystemId" });
    }

    const report = await transferTimetableImportRow({
      sourceBatchId,
      rowId,
      targetSlotSystemId,
      ...(req.user?.id !== undefined ? { createdBy: req.user.id } : {}),
    });

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to transfer import row");
  }
}

export async function handleReallocateImport(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const report = await reallocateTimetableImport({
      batchId,
      decisions: req.body?.decisions,
    });

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to reallocate committed import");
  }
}

export async function handleDeleteImportBatch(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const report = await deleteTimetableImportBatch({ batchId });

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to delete import batch");
  }
}

export async function handleCommitImport(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const report = await commitTimetableImport({
      batchId,
      decisions: req.body?.decisions,
    });

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to commit timetable import");
  }
}

export async function handleGetProcessedImportRows(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const report = await getTimetableImportProcessedRows(batchId);

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to fetch processed rows");
  }
}

// ============================================================================
// Conflict Detection and Resolution Handlers
// ============================================================================

/**
 * Detect conflicts before committing.
 * This freezes booking operations and returns any conflicts found.
 */
export async function handleDetectCommitConflicts(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Use a simple identifier for the freeze info
    const userName = `User ${userId}`;

    logger.info("Handling detect commit conflicts request", { batchId, userId });

    const report = await detectCommitConflicts(
      { batchId, decisions: req.body?.decisions },
      userId,
      userName
    );

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to detect commit conflicts");
  }
}

/**
 * Commit with conflict resolutions.
 * Applies resolution decisions and creates/deletes bookings accordingly.
 */
export async function handleCommitWithResolutions(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const resolutions = req.body?.resolutions;

    if (!Array.isArray(resolutions)) {
      return res.status(400).json({ error: "resolutions must be an array" });
    }

    logger.info("Handling commit with resolutions request", {
      batchId,
      userId,
      resolutionCount: resolutions.length,
    });

    const report = await commitWithResolutions({ batchId, resolutions }, userId);

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to commit with resolutions");
  }
}

/**
 * Cancel a commit in progress.
 * Unfreezes booking operations without making changes.
 */
export async function handleCancelCommit(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    logger.info("Handling cancel commit request", { batchId });

    const result = await cancelCommit(batchId);

    return res.json(result);
  } catch (error) {
    return sendError(res, error, "Failed to cancel commit");
  }
}

/**
 * Get freeze status for a batch.
 */
export async function handleGetFreezeStatus(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.params.id);

    if (!batchId) {
      return res.status(400).json({ error: "Invalid batch id" });
    }

    const status = getCommitFreezeStatus(batchId);

    return res.json(status);
  } catch (error) {
    return sendError(res, error, "Failed to get freeze status");
  }
}

// ============================================================================
// New 3-Stage Commit Session Handlers
// ============================================================================

export async function handleStartCommitSession(req: Request, res: Response) {
  try {
    const batchId = parsePositiveInteger(req.body?.batchId);
    const allowCommittedBatch = req.body?.allowCommittedBatch === true;
    const targetRowIds = Array.isArray(req.body?.targetRowIds)
      ? req.body.targetRowIds
          .map((value: unknown) => Number(value))
          .filter((rowId: number) => Number.isInteger(rowId) && rowId > 0)
      : [];

    if (!batchId) {
      return res.status(400).json({ error: "batchId is required" });
    }

    if (allowCommittedBatch && targetRowIds.length === 0) {
      return res.status(400).json({ error: "targetRowIds is required for committed-batch reallocation" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const session = await startCommitSession({
      batchId,
      userId,
      decisions: req.body?.decisions,
      allowCommittedBatch,
      ...(allowCommittedBatch && targetRowIds.length > 0 ? { targetRowIds } : {}),
    });

    return res.status(201).json(session);
  } catch (error) {
    return sendError(res, error, "Failed to start commit session");
  }
}

export async function handleStartEditCommitSession(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.body?.slotSystemId);
    const expectedVersion = Number(req.body?.expectedVersion);

    if (!slotSystemId) {
      return res.status(400).json({ error: "slotSystemId is required" });
    }

    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      return res.status(400).json({ error: "expectedVersion must be a positive integer" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    try {
      const result = await startEditCommitSession({
        slotSystemId,
        expectedVersion,
        newState: req.body?.newState,
        pruneBookings: req.body?.pruneBookings === true,
        userId,
      });

      if (result.noChanges === true) {
        return res.status(200).json(result);
      }

      return res.status(201).json(result);
    } catch (startEditError) {
      // Handle specific error codes
      if (startEditError instanceof Error) {
        if (
          startEditError.message.includes("Version mismatch") ||
          startEditError.message.includes("Expected")
        ) {
          return res.status(409).json({
            code: "VERSION_CONFLICT",
            error: "Timetable updated by another user. Please reload.",
            message: startEditError.message,
          });
        }

        if (startEditError.message.includes("No changes detected")) {
          return res.status(200).json({
            code: "NO_CHANGES",
            error: "No changes detected",
            message: startEditError.message,
          });
        }
      }

      return sendError(res, startEditError, "Failed to start edit commit session");
    }
  } catch (error) {
    return sendError(res, error, "Failed to start edit commit session");
  }
}

export async function handleExternalCommitCheck(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const report = await runExternalCheck(commitSessionId);

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to run external conflict check");
  }
}

export async function handleExternalCommitResolve(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const resolutions = req.body?.resolutions;

    if (!Array.isArray(resolutions)) {
      return res.status(400).json({ error: "resolutions must be an array" });
    }

    const session = await resolveExternalConflicts({
      commitSessionId,
      resolutions,
    });

    return res.json(session);
  } catch (error) {
    return sendError(res, error, "Failed to resolve external conflicts");
  }
}

export async function handleInternalCommitCheck(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const report = await runInternalCheck(commitSessionId);

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to run internal conflict check");
  }
}

export async function handleInternalCommitResolve(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const resolutions = req.body?.resolutions;

    if (!Array.isArray(resolutions)) {
      return res.status(400).json({ error: "resolutions must be an array" });
    }

    const session = await resolveInternalConflicts({
      commitSessionId,
      resolutions,
    });

    return res.json(session);
  } catch (error) {
    return sendError(res, error, "Failed to resolve internal conflicts");
  }
}

export async function handleStartCommitFreeze(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userName = `User ${userId}`;

    const session = await startFrozenApply({
      commitSessionId,
      userId,
      userName,
    });

    return res.json(session);
  } catch (error) {
    return sendError(res, error, "Failed to acquire booking freeze");
  }
}

export async function handleRuntimeCommitCheck(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const report = await runRuntimeCheck(commitSessionId);

    return res.json(report);
  } catch (error) {
    return sendError(res, error, "Failed to run runtime conflict check");
  }
}

export async function handleRuntimeCommitResolve(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const resolutions = req.body?.resolutions;

    if (!Array.isArray(resolutions)) {
      return res.status(400).json({ error: "resolutions must be an array" });
    }

    const session = await resolveRuntimeConflicts({
      commitSessionId,
      resolutions,
    });

    return res.json(session);
  } catch (error) {
    return sendError(res, error, "Failed to resolve runtime conflicts");
  }
}

export async function handleFinalizeCommitSession(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const result = await finalizeCommitSession({
      commitSessionId,
      userId,
    });

    return res.json(result);
  } catch (error) {
    return sendError(res, error, "Failed to finalize commit session");
  }
}

export async function handleCancelCommitSession(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.body?.commitSessionId);

    if (!commitSessionId) {
      return res.status(400).json({ error: "commitSessionId is required" });
    }

    const result = await cancelCommitSession(commitSessionId);

    return res.json(result);
  } catch (error) {
    return sendError(res, error, "Failed to cancel commit session");
  }
}

export async function handleGetCommitSessionStatus(req: Request, res: Response) {
  try {
    const commitSessionId = parsePositiveInteger(req.params.id);

    if (!commitSessionId) {
      return res.status(400).json({ error: "Invalid commit session id" });
    }

    const session = await getCommitSessionStatus(commitSessionId);

    return res.json(session);
  } catch (error) {
    return sendError(res, error, "Failed to fetch commit session status");
  }
}

/**
 * Preview structural changes to a slot system.
 */
export async function handlePreviewSlotSystemChanges(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.params.id);

    if (!slotSystemId) {
      return res.status(400).json({ error: "Invalid slot system id" });
    }

    const changes = req.body?.changes;

    if (!changes || typeof changes !== "object") {
      return res.status(400).json({ error: "changes object is required" });
    }

    const result = await previewSlotSystemChanges({ slotSystemId, changes });

    return res.json(result);
  } catch (error) {
    return sendError(res, error, "Failed to preview slot system changes");
  }
}

/**
 * Apply structural changes to a slot system.
 */
export async function handleApplySlotSystemChanges(req: Request, res: Response) {
  try {
    const slotSystemId = parsePositiveInteger(req.params.id);

    if (!slotSystemId) {
      return res.status(400).json({ error: "Invalid slot system id" });
    }

    const userId = (req as Request & { user?: { id: number } }).user?.id;
    const userName = (req as Request & { user?: { name: string } }).user?.name ?? "Admin";

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const changes = req.body?.changes;

    if (!changes || typeof changes !== "object") {
      return res.status(400).json({ error: "changes object is required" });
    }

    logger.info("Handling apply slot system changes request", {
      slotSystemId,
      userId,
    });

    const result = await applySlotSystemChanges({ slotSystemId, changes }, userId, userName);

    return res.json(result);
  } catch (error) {
    return sendError(res, error, "Failed to apply slot system changes");
  }
}