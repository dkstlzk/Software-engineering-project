import { db } from "../../db";
import { and, asc, eq, gt, gte, lt, lte, sql } from "drizzle-orm";
import {
  DAY_OF_WEEK_VALUES,
  slotBlocks,
  slotDays,
  slotSystems,
  slotTimeBands,
} from "./schema";
import { assertNoBlockOverlap } from "./utils/overlap";

type TimetableServiceError = Error & { status: number };

const DAY_SET = new Set<string>(DAY_OF_WEEK_VALUES);
const ORDER_SHIFT_OFFSET = 1_000_000;
const DEFAULT_DAY_COLUMNS: (typeof DAY_OF_WEEK_VALUES)[number][] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
];

const DEFAULT_TIME_BANDS: Array<{ startTime: string; endTime: string }> = [
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:00" },
  { startTime: "11:00", endTime: "12:00" },
  { startTime: "12:00", endTime: "13:00" },
  { startTime: "13:00", endTime: "14:00" },
  { startTime: "14:00", endTime: "15:00" },
  { startTime: "15:00", endTime: "16:00" },
  { startTime: "16:00", endTime: "17:00" },
];

export function createServiceError(status: number, message: string): TimetableServiceError {
  const error = new Error(message) as TimetableServiceError;
  error.status = status;
  return error;
}

export function isTimetableServiceError(error: unknown): error is TimetableServiceError {
  return (
    error instanceof Error &&
    typeof (error as Partial<TimetableServiceError>).status === "number"
  );
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseClockTimeToSeconds(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

async function ensureSlotSystemExists(slotSystemId: number) {
  const [slotSystem] = await db
    .select()
    .from(slotSystems)
    .where(eq(slotSystems.id, slotSystemId))
    .limit(1);

  if (!slotSystem) {
    throw createServiceError(404, "Slot system not found");
  }

  return slotSystem;
}

async function ensureSlotSystemUnlocked(slotSystemId: number) {
  const system = await ensureSlotSystemExists(slotSystemId);

  if (system.isLocked) {
    throw createServiceError(
      403,
      "Slot system is locked. Use the change workspace to modify a locked system.",
    );
  }

  return system;
}

export async function lockSlotSystem(slotSystemId: number) {
  const parsedId = toPositiveInteger(slotSystemId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid slot system id");
  }

  const [updated] = await db
    .update(slotSystems)
    .set({ isLocked: true })
    .where(eq(slotSystems.id, parsedId))
    .returning();

  if (!updated) {
    throw createServiceError(404, "Slot system not found");
  }

  return updated;
}

export async function getSlotSystemLockStatus(slotSystemId: number) {
  const system = await ensureSlotSystemExists(slotSystemId);

  return {
    slotSystemId: system.id,
    isLocked: system.isLocked,
  };
}

async function getNextDayOrderIndex(slotSystemId: number) {
  const [row] = await db
    .select({
      maxOrder: sql<number>`coalesce(max(${slotDays.orderIndex}), -1)`,
    })
    .from(slotDays)
    .where(eq(slotDays.slotSystemId, slotSystemId));

  return Number(row?.maxOrder ?? -1) + 1;
}

async function getNextTimeBandOrderIndex(slotSystemId: number) {
  const [row] = await db
    .select({
      maxOrder: sql<number>`coalesce(max(${slotTimeBands.orderIndex}), -1)`,
    })
    .from(slotTimeBands)
    .where(eq(slotTimeBands.slotSystemId, slotSystemId));

  return Number(row?.maxOrder ?? -1) + 1;
}

function validateTimeBandWindow(startTime: string, endTime: string) {
  const startSeconds = parseClockTimeToSeconds(startTime);
  const endSeconds = parseClockTimeToSeconds(endTime);

  if (startSeconds === null || endSeconds === null) {
    throw createServiceError(400, "Invalid time format. Use HH:MM or HH:MM:SS");
  }

  if (startSeconds >= endSeconds) {
    throw createServiceError(400, "startTime must be earlier than endTime");
  }

  return { startSeconds, endSeconds };
}

async function assertNoTimeBandRangeOverlap(input: {
  slotSystemId: number;
  startTime: string;
  endTime: string;
  excludeBandId?: number;
}) {
  const { startSeconds, endSeconds } = validateTimeBandWindow(
    input.startTime,
    input.endTime,
  );

  const existingBands = await db
    .select({
      id: slotTimeBands.id,
      startTime: slotTimeBands.startTime,
      endTime: slotTimeBands.endTime,
    })
    .from(slotTimeBands)
    .where(eq(slotTimeBands.slotSystemId, input.slotSystemId));

  for (const band of existingBands) {
    if (input.excludeBandId !== undefined && band.id === input.excludeBandId) {
      continue;
    }

    const existingStart = parseClockTimeToSeconds(String(band.startTime));
    const existingEnd = parseClockTimeToSeconds(String(band.endTime));

    if (existingStart === null || existingEnd === null) {
      continue;
    }

    if (startSeconds < existingEnd && endSeconds > existingStart) {
      throw createServiceError(409, "Time band overlaps with an existing time band");
    }
  }
}

async function hasAnyBlocksInSlotSystem(slotSystemId: number) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(slotBlocks)
    .where(eq(slotBlocks.slotSystemId, slotSystemId));

  return Number(row?.count ?? 0) > 0;
}

export async function createSlotSystem(name: string) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw createServiceError(400, "Name is required");
  }

  const system = await db.transaction(async (tx) => {
    const [createdSystem] = await tx
      .insert(slotSystems)
      .values({ name: trimmedName })
      .returning();

    if (!createdSystem) {
      throw createServiceError(500, "Failed to create slot system");
    }

    await tx.insert(slotDays).values(
      DEFAULT_DAY_COLUMNS.map((dayOfWeek, orderIndex) => ({
        slotSystemId: createdSystem.id,
        dayOfWeek,
        orderIndex,
      }))
    );

    await tx.insert(slotTimeBands).values(
      DEFAULT_TIME_BANDS.map((band, orderIndex) => ({
        slotSystemId: createdSystem.id,
        startTime: band.startTime,
        endTime: band.endTime,
        orderIndex,
      }))
    );

    return createdSystem;
  });

  return system;
}

export async function getSlotSystems() {
  return db.select().from(slotSystems).orderBy(asc(slotSystems.createdAt));
}

export async function deleteSlotSystem(slotSystemId: number) {
  const parsedId = toPositiveInteger(slotSystemId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid slot system id");
  }

  const [deleted] = await db
    .delete(slotSystems)
    .where(eq(slotSystems.id, parsedId))
    .returning();

  if (!deleted) {
    throw createServiceError(404, "Slot system not found");
  }
}

export async function createDay(input: {
  slotSystemId: number;
  dayOfWeek: string;
  orderIndex?: number;
  bypassLock?: boolean;
}) {
  const slotSystemId = toPositiveInteger(input.slotSystemId);

  if (!slotSystemId) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  if (!DAY_SET.has(input.dayOfWeek)) {
    throw createServiceError(400, "Invalid dayOfWeek");
  }

  const orderIndex =
    input.orderIndex === undefined
      ? await getNextDayOrderIndex(slotSystemId)
      : Number(input.orderIndex);

  if (!Number.isInteger(orderIndex) || orderIndex < 0) {
    throw createServiceError(400, "Invalid orderIndex");
  }

  if (input.bypassLock) {
    await ensureSlotSystemExists(slotSystemId);
  } else {
    await ensureSlotSystemUnlocked(slotSystemId);
  }

  try {
    const [day] = await db
      .insert(slotDays)
      .values({
        slotSystemId,
        dayOfWeek: input.dayOfWeek as (typeof DAY_OF_WEEK_VALUES)[number],
        orderIndex,
      })
      .returning();

    return day;
  } catch (error: unknown) {
    const pgError = (error as { cause?: { code?: string } }).cause;
    if (pgError?.code === "23505") {
      throw createServiceError(
        409,
        "Day already exists for this slot system or orderIndex is in use"
      );
    }
    throw error;
  }
}

export async function getDays(slotSystemId: number) {
  const parsedId = toPositiveInteger(slotSystemId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  await ensureSlotSystemExists(parsedId);

  return db
    .select()
    .from(slotDays)
    .where(eq(slotDays.slotSystemId, parsedId))
    .orderBy(asc(slotDays.orderIndex));
}

export async function deleteDay(dayId: number, bypassLock = false) {
  const parsedId = toPositiveInteger(dayId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid day id");
  }

  const [existingDay] = await db
    .select({
      id: slotDays.id,
      slotSystemId: slotDays.slotSystemId,
      orderIndex: slotDays.orderIndex,
    })
    .from(slotDays)
    .where(eq(slotDays.id, parsedId))
    .limit(1);

  if (!existingDay) {
    throw createServiceError(404, "Day not found");
  }

  if (!bypassLock) {
    await ensureSlotSystemUnlocked(existingDay.slotSystemId);
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(slotBlocks)
    .where(eq(slotBlocks.dayId, existingDay.id));

  if (Number(row?.count ?? 0) > 0) {
    throw createServiceError(
      409,
      "Cannot delete day while slot blocks exist for this day. Delete blocks first"
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(slotDays).where(eq(slotDays.id, existingDay.id));

    await tx
      .update(slotDays)
      .set({
        orderIndex: sql`${slotDays.orderIndex} + ${ORDER_SHIFT_OFFSET}`,
      })
      .where(
        and(
          eq(slotDays.slotSystemId, existingDay.slotSystemId),
          gt(slotDays.orderIndex, existingDay.orderIndex)
        )
      );

    await tx
      .update(slotDays)
      .set({
        orderIndex: sql`${slotDays.orderIndex} - ${ORDER_SHIFT_OFFSET + 1}`,
      })
      .where(
        and(
          eq(slotDays.slotSystemId, existingDay.slotSystemId),
          gte(slotDays.orderIndex, ORDER_SHIFT_OFFSET)
        )
      );
  });
}

export async function createTimeBand(input: {
  slotSystemId: number;
  startTime: string;
  endTime: string;
  orderIndex?: number;
  bypassLock?: boolean;
}) {
  const slotSystemId = toPositiveInteger(input.slotSystemId);

  if (!slotSystemId) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  const startTime = input.startTime?.trim();
  const endTime = input.endTime?.trim();

  if (!startTime || !endTime) {
    throw createServiceError(400, "startTime and endTime are required");
  }

  validateTimeBandWindow(startTime, endTime);

  if (input.bypassLock) {
    await ensureSlotSystemExists(slotSystemId);
  } else {
    await ensureSlotSystemUnlocked(slotSystemId);
  }
  await assertNoTimeBandRangeOverlap({
    slotSystemId,
    startTime,
    endTime,
  });

  const nextOrderIndex = await getNextTimeBandOrderIndex(slotSystemId);
  const orderIndex =
    input.orderIndex === undefined ? nextOrderIndex : Number(input.orderIndex);

  if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > nextOrderIndex) {
    throw createServiceError(400, "Invalid orderIndex");
  }

  const hasBlocks = await hasAnyBlocksInSlotSystem(slotSystemId);

  if (hasBlocks && orderIndex !== nextOrderIndex) {
    throw createServiceError(
      409,
      "Insert in the middle is blocked while slot blocks exist. Add at the end or clear blocks first"
    );
  }

  try {
    const band = await db.transaction(async (tx) => {
      if (orderIndex < nextOrderIndex) {
        await tx
          .update(slotTimeBands)
          .set({
            orderIndex: sql`${slotTimeBands.orderIndex} + ${ORDER_SHIFT_OFFSET}`,
          })
          .where(
            and(
              eq(slotTimeBands.slotSystemId, slotSystemId),
              gte(slotTimeBands.orderIndex, orderIndex)
            )
          );

        await tx
          .update(slotTimeBands)
          .set({
            orderIndex: sql`${slotTimeBands.orderIndex} - ${ORDER_SHIFT_OFFSET - 1}`,
          })
          .where(
            and(
              eq(slotTimeBands.slotSystemId, slotSystemId),
              gte(slotTimeBands.orderIndex, ORDER_SHIFT_OFFSET)
            )
          );
      }

      const [inserted] = await tx
        .insert(slotTimeBands)
        .values({
          slotSystemId,
          startTime,
          endTime,
          orderIndex,
        })
        .returning();

      if (!inserted) {
        throw createServiceError(500, "Failed to create time band");
      }

      return inserted;
    });

    return band;
  } catch (error: unknown) {
    const pgError = (error as { cause?: { code?: string } }).cause;
    if (pgError?.code === "23505") {
      throw createServiceError(409, "orderIndex already exists for this slot system");
    }
    throw error;
  }
}

export async function getTimeBands(slotSystemId: number) {
  const parsedId = toPositiveInteger(slotSystemId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  await ensureSlotSystemExists(parsedId);

  return db
    .select()
    .from(slotTimeBands)
    .where(eq(slotTimeBands.slotSystemId, parsedId))
    .orderBy(
      asc(slotTimeBands.startTime),
      asc(slotTimeBands.endTime),
      asc(slotTimeBands.id)
    );
}

export async function updateTimeBand(input: {
  timeBandId: number;
  startTime?: string;
  endTime?: string;
  orderIndex?: number;
  bypassLock?: boolean;
}) {
  const timeBandId = toPositiveInteger(input.timeBandId);

  if (!timeBandId) {
    throw createServiceError(400, "Invalid time band id");
  }

  const [existingBand] = await db
    .select()
    .from(slotTimeBands)
    .where(eq(slotTimeBands.id, timeBandId))
    .limit(1);

  if (!existingBand) {
    throw createServiceError(404, "Time band not found");
  }

  if (!input.bypassLock) {
    await ensureSlotSystemUnlocked(existingBand.slotSystemId);
  }

  const hasTimePatch = input.startTime !== undefined || input.endTime !== undefined;
  const hasOrderPatch = input.orderIndex !== undefined;

  if (!hasTimePatch && !hasOrderPatch) {
    throw createServiceError(400, "Provide at least one field to update");
  }

  const startTime = (input.startTime ?? String(existingBand.startTime)).trim();
  const endTime = (input.endTime ?? String(existingBand.endTime)).trim();

  validateTimeBandWindow(startTime, endTime);
  await assertNoTimeBandRangeOverlap({
    slotSystemId: existingBand.slotSystemId,
    startTime,
    endTime,
    excludeBandId: existingBand.id,
  });

  const totalBands = await getNextTimeBandOrderIndex(existingBand.slotSystemId);
  const orderIndex =
    input.orderIndex === undefined ? existingBand.orderIndex : Number(input.orderIndex);

  if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex >= totalBands) {
    throw createServiceError(400, "Invalid orderIndex");
  }

  const hasBlocks = await hasAnyBlocksInSlotSystem(existingBand.slotSystemId);

  if (hasBlocks && orderIndex !== existingBand.orderIndex) {
    throw createServiceError(
      409,
      "Reordering is blocked while slot blocks exist. Delete blocks first"
    );
  }

  try {
    const updatedBand = await db.transaction(async (tx) => {
      if (orderIndex > existingBand.orderIndex) {
        await tx
          .update(slotTimeBands)
          .set({
            orderIndex: sql`${slotTimeBands.orderIndex} + ${ORDER_SHIFT_OFFSET}`,
          })
          .where(
            and(
              eq(slotTimeBands.slotSystemId, existingBand.slotSystemId),
              gt(slotTimeBands.orderIndex, existingBand.orderIndex),
              lte(slotTimeBands.orderIndex, orderIndex)
            )
          );

        await tx
          .update(slotTimeBands)
          .set({
            orderIndex: sql`${slotTimeBands.orderIndex} - ${ORDER_SHIFT_OFFSET + 1}`,
          })
          .where(
            and(
              eq(slotTimeBands.slotSystemId, existingBand.slotSystemId),
              gte(slotTimeBands.orderIndex, ORDER_SHIFT_OFFSET)
            )
          );
      } else if (orderIndex < existingBand.orderIndex) {
        await tx
          .update(slotTimeBands)
          .set({
            orderIndex: sql`${slotTimeBands.orderIndex} + ${ORDER_SHIFT_OFFSET}`,
          })
          .where(
            and(
              eq(slotTimeBands.slotSystemId, existingBand.slotSystemId),
              gte(slotTimeBands.orderIndex, orderIndex),
              lt(slotTimeBands.orderIndex, existingBand.orderIndex)
            )
          );

        await tx
          .update(slotTimeBands)
          .set({
            orderIndex: sql`${slotTimeBands.orderIndex} - ${ORDER_SHIFT_OFFSET - 1}`,
          })
          .where(
            and(
              eq(slotTimeBands.slotSystemId, existingBand.slotSystemId),
              gte(slotTimeBands.orderIndex, ORDER_SHIFT_OFFSET)
            )
          );
      }

      const [updated] = await tx
        .update(slotTimeBands)
        .set({
          startTime,
          endTime,
          orderIndex,
        })
        .where(eq(slotTimeBands.id, existingBand.id))
        .returning();

      if (!updated) {
        throw createServiceError(500, "Failed to update time band");
      }

      return updated;
    });

    return updatedBand;
  } catch (error: unknown) {
    const pgError = (error as { cause?: { code?: string } }).cause;
    if (pgError?.code === "23505") {
      throw createServiceError(409, "orderIndex already exists for this slot system");
    }
    throw error;
  }
}

export async function deleteTimeBand(timeBandId: number, bypassLock = false) {
  const parsedId = toPositiveInteger(timeBandId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid time band id");
  }

  const [existingBand] = await db
    .select({
      id: slotTimeBands.id,
      slotSystemId: slotTimeBands.slotSystemId,
      orderIndex: slotTimeBands.orderIndex,
    })
    .from(slotTimeBands)
    .where(eq(slotTimeBands.id, parsedId))
    .limit(1);

  if (!existingBand) {
    throw createServiceError(404, "Time band not found");
  }

  if (!bypassLock) {
    await ensureSlotSystemUnlocked(existingBand.slotSystemId);
  }

  const hasBlocks = await hasAnyBlocksInSlotSystem(existingBand.slotSystemId);

  if (hasBlocks) {
    throw createServiceError(
      409,
      "Cannot delete time band while slot blocks exist. Delete blocks first"
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(slotTimeBands).where(eq(slotTimeBands.id, existingBand.id));

    await tx
      .update(slotTimeBands)
      .set({
        orderIndex: sql`${slotTimeBands.orderIndex} + ${ORDER_SHIFT_OFFSET}`,
      })
      .where(
        and(
          eq(slotTimeBands.slotSystemId, existingBand.slotSystemId),
          gt(slotTimeBands.orderIndex, existingBand.orderIndex)
        )
      );

    await tx
      .update(slotTimeBands)
      .set({
        orderIndex: sql`${slotTimeBands.orderIndex} - ${ORDER_SHIFT_OFFSET + 1}`,
      })
      .where(
        and(
          eq(slotTimeBands.slotSystemId, existingBand.slotSystemId),
          gte(slotTimeBands.orderIndex, ORDER_SHIFT_OFFSET)
        )
      );
  });
}

export async function createBlock(input: {
  slotSystemId: number;
  dayId: number;
  startBandId: number;
  laneIndex: number;
  rowSpan: number;
  label: string;
  bypassLock?: boolean;
}) {
  const slotSystemId = toPositiveInteger(input.slotSystemId);
  const dayId = toPositiveInteger(input.dayId);
  const startBandId = toPositiveInteger(input.startBandId);
  const laneIndex = Number(input.laneIndex);
  const rowSpan = Number(input.rowSpan);
  const label = input.label?.trim();

  if (!slotSystemId) {
    throw createServiceError(400, "Invalid slotSystemId");
  }

  if (!dayId) {
    throw createServiceError(400, "Invalid dayId");
  }

  if (!startBandId) {
    throw createServiceError(400, "Invalid startBandId");
  }

  if (!Number.isInteger(laneIndex) || laneIndex < 0) {
    throw createServiceError(400, "laneIndex must be a non-negative integer");
  }

  if (!Number.isInteger(rowSpan) || rowSpan <= 0) {
    throw createServiceError(400, "rowSpan must be a positive integer");
  }

  if (!label) {
    throw createServiceError(400, "label is required");
  }

  if (input.bypassLock) {
    await ensureSlotSystemExists(slotSystemId);
  } else {
    await ensureSlotSystemUnlocked(slotSystemId);
  }

  const [day] = await db
    .select({ id: slotDays.id, laneCount: slotDays.laneCount })
    .from(slotDays)
    .where(and(eq(slotDays.id, dayId), eq(slotDays.slotSystemId, slotSystemId)))
    .limit(1);

  if (!day) {
    throw createServiceError(400, "dayId does not belong to the slot system");
  }

  if (laneIndex >= day.laneCount) {
    throw createServiceError(409, "Selected lane does not exist for this day");
  }

  await assertNoBlockOverlap({
    slotSystemId,
    dayId,
    startBandId,
    laneIndex,
    rowSpan,
    blockLabel: label,
  });

  try {
    const [block] = await db
      .insert(slotBlocks)
      .values({
        slotSystemId,
        dayId,
        startBandId,
        laneIndex,
        rowSpan,
        label,
      })
      .returning();

    return block;
  } catch (error: unknown) {
    const pgError = (error as { cause?: { code?: string } }).cause;

    if (pgError?.code === "23503") {
      throw createServiceError(400, "Invalid dayId or startBandId");
    }

    throw error;
  }
}

export async function deleteBlock(blockId: number, bypassLock = false) {
  const parsedId = toPositiveInteger(blockId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid block id");
  }

  const [existing] = await db
    .select({ id: slotBlocks.id, slotSystemId: slotBlocks.slotSystemId })
    .from(slotBlocks)
    .where(eq(slotBlocks.id, parsedId))
    .limit(1);

  if (!existing) {
    throw createServiceError(404, "Block not found");
  }

  if (!bypassLock) {
    await ensureSlotSystemUnlocked(existing.slotSystemId);
  }

  await db.delete(slotBlocks).where(eq(slotBlocks.id, parsedId));
}

export async function addDayLane(dayId: number, bypassLock = false) {
  const parsedId = toPositiveInteger(dayId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid day id");
  }

  const [existingDay] = await db
    .select({ id: slotDays.id, slotSystemId: slotDays.slotSystemId })
    .from(slotDays)
    .where(eq(slotDays.id, parsedId))
    .limit(1);

  if (!existingDay) {
    throw createServiceError(404, "Day not found");
  }

  if (!bypassLock) {
    await ensureSlotSystemUnlocked(existingDay.slotSystemId);
  }

  const [updated] = await db
    .update(slotDays)
    .set({ laneCount: sql`${slotDays.laneCount} + 1` })
    .where(eq(slotDays.id, parsedId))
    .returning();

  if (!updated) {
    throw createServiceError(404, "Day not found");
  }

  return updated;
}

async function getPeakLaneUsageForDay(dayId: number, slotSystemId: number) {
  const [bands, blocks] = await Promise.all([
    db
      .select({
        id: slotTimeBands.id,
      })
      .from(slotTimeBands)
      .where(eq(slotTimeBands.slotSystemId, slotSystemId))
      .orderBy(
        asc(slotTimeBands.startTime),
        asc(slotTimeBands.endTime),
        asc(slotTimeBands.id),
      ),
    db
      .select({
        startBandId: slotBlocks.startBandId,
        rowSpan: slotBlocks.rowSpan,
      })
      .from(slotBlocks)
      .where(eq(slotBlocks.dayId, dayId)),
  ]);

  if (bands.length === 0 || blocks.length === 0) {
    return 0;
  }

  const bandIndexById = new Map<number, number>();
  bands.forEach((band, index) => {
    bandIndexById.set(band.id, index);
  });

  const usage = new Array<number>(bands.length).fill(0);

  for (const block of blocks) {
    const startIndex = bandIndexById.get(block.startBandId);
    if (startIndex === undefined) {
      continue;
    }

    const safeRowSpan = Math.max(1, Math.min(block.rowSpan, bands.length - startIndex));
    const endIndex = startIndex + safeRowSpan;

    for (let cursor = startIndex; cursor < endIndex; cursor += 1) {
      usage[cursor] = (usage[cursor] ?? 0) + 1;
    }
  }

  return Math.max(...usage);
}

async function repackDayBlocksWithinLaneLimit(input: {
  dayId: number;
  slotSystemId: number;
  laneLimit: number;
}) {
  if (!Number.isInteger(input.laneLimit) || input.laneLimit <= 0) {
    throw createServiceError(400, "laneLimit must be a positive integer");
  }

  const [bands, blocks] = await Promise.all([
    db
      .select({ id: slotTimeBands.id })
      .from(slotTimeBands)
      .where(eq(slotTimeBands.slotSystemId, input.slotSystemId))
      .orderBy(
        asc(slotTimeBands.startTime),
        asc(slotTimeBands.endTime),
        asc(slotTimeBands.id),
      ),
    db
      .select({
        id: slotBlocks.id,
        startBandId: slotBlocks.startBandId,
        rowSpan: slotBlocks.rowSpan,
        laneIndex: slotBlocks.laneIndex,
      })
      .from(slotBlocks)
      .where(eq(slotBlocks.dayId, input.dayId)),
  ]);

  if (bands.length === 0 || blocks.length === 0) {
    return;
  }

  const bandIndexById = new Map<number, number>();
  bands.forEach((band, index) => {
    bandIndexById.set(band.id, index);
  });

  const prepared = blocks
    .map((block) => {
      const startIndex = bandIndexById.get(block.startBandId);
      if (startIndex === undefined) {
        return null;
      }

      const safeRowSpan = Math.max(1, Math.min(block.rowSpan, bands.length - startIndex));
      const endIndex = startIndex + safeRowSpan;

      return {
        id: block.id,
        startIndex,
        endIndex,
        laneIndex: block.laneIndex,
      };
    })
    .filter(
      (
        value,
      ): value is {
        id: number;
        startIndex: number;
        endIndex: number;
        laneIndex: number;
      } => value !== null,
    )
    .sort((a, b) => {
      if (a.startIndex !== b.startIndex) {
        return a.startIndex - b.startIndex;
      }

      if (a.endIndex !== b.endIndex) {
        return a.endIndex - b.endIndex;
      }

      return a.id - b.id;
    });

  const laneEndIndices = new Array<number>(input.laneLimit).fill(-1);
  const updates: Array<{ id: number; laneIndex: number }> = [];

  for (const block of prepared) {
    const preferredLane =
      block.laneIndex >= 0 && block.laneIndex < input.laneLimit ? block.laneIndex : 0;

    let assignedLane = -1;

    if (block.startIndex >= (laneEndIndices[preferredLane] ?? -1)) {
      assignedLane = preferredLane;
    } else {
      assignedLane = laneEndIndices.findIndex(
        (laneEndIndex) => block.startIndex >= (laneEndIndex ?? -1),
      );
    }

    if (assignedLane === -1) {
      throw createServiceError(
        409,
        "Cannot remove lane while overlapping blocks require current lane capacity",
      );
    }

    laneEndIndices[assignedLane] = block.endIndex;

    if (assignedLane !== block.laneIndex) {
      updates.push({ id: block.id, laneIndex: assignedLane });
    }
  }

  for (const update of updates) {
    await db
      .update(slotBlocks)
      .set({ laneIndex: update.laneIndex })
      .where(eq(slotBlocks.id, update.id));
  }
}

export async function removeDayLane(dayId: number, bypassLock = false) {
  const parsedId = toPositiveInteger(dayId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid day id");
  }

  const [day] = await db
    .select({
      id: slotDays.id,
      slotSystemId: slotDays.slotSystemId,
      laneCount: slotDays.laneCount,
    })
    .from(slotDays)
    .where(eq(slotDays.id, parsedId))
    .limit(1);

  if (!day) {
    throw createServiceError(404, "Day not found");
  }

  if (!bypassLock) {
    await ensureSlotSystemUnlocked(day.slotSystemId);
  }

  if (day.laneCount <= 1) {
    throw createServiceError(409, "At least one lane must remain for a day");
  }

  const peakLaneUsage = await getPeakLaneUsageForDay(day.id, day.slotSystemId);
  const nextLaneCount = day.laneCount - 1;

  if (peakLaneUsage > nextLaneCount) {
    throw createServiceError(
      409,
      "Cannot remove lane while overlapping blocks require current lane capacity",
    );
  }

  await repackDayBlocksWithinLaneLimit({
    dayId: day.id,
    slotSystemId: day.slotSystemId,
    laneLimit: nextLaneCount,
  });

  const [updated] = await db
    .update(slotDays)
    .set({ laneCount: nextLaneCount })
    .where(eq(slotDays.id, day.id))
    .returning();

  if (!updated) {
    throw createServiceError(500, "Failed to remove lane");
  }

  return updated;
}

export async function getFullGrid(slotSystemId: number) {
  const parsedId = toPositiveInteger(slotSystemId);

  if (!parsedId) {
    throw createServiceError(400, "Invalid slot system id");
  }

  const slotSystem = await ensureSlotSystemExists(parsedId);

  const [days, timeBands, blocks] = await Promise.all([
    db
      .select()
      .from(slotDays)
      .where(eq(slotDays.slotSystemId, parsedId))
      .orderBy(asc(slotDays.orderIndex)),
    db
      .select()
      .from(slotTimeBands)
      .where(eq(slotTimeBands.slotSystemId, parsedId))
      .orderBy(
        asc(slotTimeBands.startTime),
        asc(slotTimeBands.endTime),
        asc(slotTimeBands.id)
      ),
    db
      .select()
      .from(slotBlocks)
      .where(eq(slotBlocks.slotSystemId, parsedId)),
  ]);

  return {
    slotSystem,
    days,
    timeBands,
    blocks,
  };
}