import { Router } from "express";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../../../middleware/auth";
import { requireRole } from "../../../middleware/rbac";
import { validate } from "../../../api/middleware/validation.middleware";
import { idParamSchema } from "../../../shared/validators/schemas/common.schemas";
import {
  createHolidaySchema,
  listHolidaysSchema,
  listTimetableDayOverridesSchema,
  upsertTimetableDayOverrideSchema,
} from "../../../shared/validators/schemas/holiday.schemas";
import { db } from "../../../db";
import { holidays, timetableDayOverrides } from "../../../db/schema";
import { normalizeDateOnlyKey } from "../../../shared/utils/istDateTime";
import {
  listDayOverrideImpactedSlotSystems,
  listHolidays,
  listTimetableDayOverrides,
  pruneTimetableBookingsForHolidayRange,
} from "../service";
import {
  runDayOverrideRecomputeCommit,
  type DayOverrideRecomputeCommitResult,
} from "../../timetable/timetableCommitEngine";

const router = Router();

type DayOverrideSlotSystemReport = DayOverrideRecomputeCommitResult & {
  impactedBatchIds: number[];
};

type DayOverrideRecomputeSummary = {
  targetDate: string;
  impactedSlotSystems: number;
  processedSlotSystems: number;
  noChangeSlotSystems: number;
  createdBookings: number;
  skippedOperations: number;
  deletedConflictingBookings: number;
  autoResolvedExternalConflicts: number;
  autoResolvedInternalConflicts: number;
  autoResolvedRuntimeConflicts: number;
  slotSystems: DayOverrideSlotSystemReport[];
};

async function recomputeTimetableAfterDayOverride(input: {
  targetDate: string;
  userId: number;
}): Promise<DayOverrideRecomputeSummary> {
  const impactedSlotSystems = await listDayOverrideImpactedSlotSystems(input.targetDate);

  if (impactedSlotSystems.length === 0) {
    return {
      targetDate: input.targetDate,
      impactedSlotSystems: 0,
      processedSlotSystems: 0,
      noChangeSlotSystems: 0,
      createdBookings: 0,
      skippedOperations: 0,
      deletedConflictingBookings: 0,
      autoResolvedExternalConflicts: 0,
      autoResolvedInternalConflicts: 0,
      autoResolvedRuntimeConflicts: 0,
      slotSystems: [],
    };
  }

  const slotSystems: DayOverrideSlotSystemReport[] = [];

  for (const impacted of impactedSlotSystems) {
    const result = await runDayOverrideRecomputeCommit({
      slotSystemId: impacted.slotSystemId,
      userId: input.userId,
      userName: `User ${input.userId}`,
    });

    slotSystems.push({
      ...result,
      impactedBatchIds: impacted.batchIds,
    });
  }

  return {
    targetDate: input.targetDate,
    impactedSlotSystems: impactedSlotSystems.length,
    processedSlotSystems: slotSystems.filter((item) => !item.noChanges).length,
    noChangeSlotSystems: slotSystems.filter((item) => item.noChanges).length,
    createdBookings: slotSystems.reduce((sum, item) => sum + item.createdBookings, 0),
    skippedOperations: slotSystems.reduce((sum, item) => sum + item.skippedOperations, 0),
    deletedConflictingBookings: slotSystems.reduce(
      (sum, item) => sum + item.deletedConflictingBookings,
      0,
    ),
    autoResolvedExternalConflicts: slotSystems.reduce(
      (sum, item) => sum + item.autoResolvedExternalConflicts,
      0,
    ),
    autoResolvedInternalConflicts: slotSystems.reduce(
      (sum, item) => sum + item.autoResolvedInternalConflicts,
      0,
    ),
    autoResolvedRuntimeConflicts: slotSystems.reduce(
      (sum, item) => sum + item.autoResolvedRuntimeConflicts,
      0,
    ),
    slotSystems,
  };
}

router.get(
  "/",
  authMiddleware,
  validate({ query: listHolidaysSchema }),
  async (req, res) => {
    const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;

    const filters = {
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
    };

    const rows = await listHolidays(filters);
    return res.json(rows);
  },
);

router.post(
  "/",
  authMiddleware,
  requireRole("ADMIN"),
  validate({ body: createHolidaySchema }),
  async (req, res) => {
    const normalizedStartDate = normalizeDateOnlyKey(String(req.body.startDate));
    const normalizedEndDate = normalizeDateOnlyKey(String(req.body.endDate));

    if (!normalizedStartDate || !normalizedEndDate) {
      return res.status(400).json({ message: "Invalid holiday date range" });
    }

    const response = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(holidays)
        .values({
          name: String(req.body.name).trim(),
          description:
            typeof req.body.description === "string" && req.body.description.trim().length > 0
              ? req.body.description.trim()
              : null,
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          createdBy: req.user?.id ?? null,
        })
        .returning();

      const created = inserted[0];

      if (!created) {
        throw new Error("Failed to create holiday");
      }

      const prunedTimetableBookings = await pruneTimetableBookingsForHolidayRange(
        normalizedStartDate,
        normalizedEndDate,
        tx,
      );

      return {
        holiday: created,
        prunedTimetableBookings,
      };
    });

    return res.status(201).json(response);
  },
);

router.get(
  "/day-overrides",
  authMiddleware,
  validate({ query: listTimetableDayOverridesSchema }),
  async (req, res) => {
    const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;

    const filters = {
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
    };

    const rows = await listTimetableDayOverrides(filters);
    return res.json(rows);
  },
);

router.post(
  "/day-overrides",
  authMiddleware,
  requireRole("ADMIN"),
  validate({ body: upsertTimetableDayOverrideSchema }),
  async (req, res) => {
    const normalizedTargetDate = normalizeDateOnlyKey(String(req.body.targetDate));

    if (!normalizedTargetDate) {
      return res.status(400).json({ message: "Invalid targetDate" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const followsDayOfWeek = String(req.body.followsDayOfWeek).trim().toUpperCase();
    const note =
      typeof req.body.note === "string" && req.body.note.trim().length > 0
        ? req.body.note.trim()
        : null;

    const [saved] = await db
      .insert(timetableDayOverrides)
      .values({
        targetDate: normalizedTargetDate,
        followsDayOfWeek: followsDayOfWeek as (typeof timetableDayOverrides.$inferInsert)["followsDayOfWeek"],
        note,
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: timetableDayOverrides.targetDate,
        set: {
          followsDayOfWeek: followsDayOfWeek as (typeof timetableDayOverrides.$inferInsert)["followsDayOfWeek"],
          note,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!saved) {
      return res.status(500).json({ message: "Failed to save day override" });
    }

    const recompute = await recomputeTimetableAfterDayOverride({
      targetDate: normalizedTargetDate,
      userId,
    });

    return res.json({
      dayOverride: saved,
      recompute,
    });
  },
);

router.delete(
  "/day-overrides/:id",
  authMiddleware,
  requireRole("ADMIN"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const overrideId = Number(req.params.id);

    const deleted = await db
      .delete(timetableDayOverrides)
      .where(eq(timetableDayOverrides.id, overrideId))
      .returning({
        id: timetableDayOverrides.id,
        targetDate: timetableDayOverrides.targetDate,
      });

    const deletedOverride = deleted[0];

    if (!deletedOverride) {
      return res.status(404).json({ message: "Day override not found" });
    }

    const recompute = await recomputeTimetableAfterDayOverride({
      targetDate: deletedOverride.targetDate,
      userId,
    });

    return res.json({
      deletedId: deletedOverride.id,
      targetDate: deletedOverride.targetDate,
      recompute,
    });
  },
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const holidayId = Number(req.params.id);

    const deleted = await db
      .delete(holidays)
      .where(eq(holidays.id, holidayId))
      .returning({ id: holidays.id });

    if (deleted.length === 0) {
      return res.status(404).json({ message: "Holiday not found" });
    }

    return res.status(204).send();
  },
);

export default router;
