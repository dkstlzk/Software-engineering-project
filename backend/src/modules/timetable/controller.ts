import { Request, Response } from "express";
import {
  addDayLane,
  removeDayLane,
  createBlock,
  createDay,
  createSlotSystem,
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
import { commitTimetableImport, previewTimetableImport } from "./importService";

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

  console.error(error);
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