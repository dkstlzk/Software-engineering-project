import { and, asc, eq, gt, gte, lt, lte } from "drizzle-orm";
import { db } from "../../db";
import {
  bookings,
  holidays,
  timetableDayOverrides,
  timetableImportBatches,
} from "../../db/schema";
import {
  getISTInclusiveDateRangeForInterval,
  normalizeDateOnlyKey,
  toISTDateRangeBounds,
} from "../../shared/utils/istDateTime";

export type HolidayRecord = typeof holidays.$inferSelect;
export type TimetableDayOverrideRecord = typeof timetableDayOverrides.$inferSelect;

export type HolidaySummary = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
};

export type DayOverrideImpactedSlotSystem = {
  slotSystemId: number;
  batchIds: number[];
};

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export function isHolidayOverrideAccepted(value: unknown): boolean {
  return value === true;
}

export function toHolidaySummary(holiday: HolidayRecord): HolidaySummary {
  return {
    id: holiday.id,
    name: holiday.name,
    startDate: holiday.startDate,
    endDate: holiday.endDate,
  };
}

export function buildHolidayWarningPayload(holidayRows: HolidayRecord[]): {
  code: "HOLIDAY_WARNING_REQUIRED";
  message: string;
  holidays: HolidaySummary[];
} {
  const summaries = holidayRows.map(toHolidaySummary);

  const message =
    summaries.length === 1
      ? `Selected time overlaps holiday '${summaries[0]?.name ?? "Holiday"}'. Confirm to continue.`
      : "Selected time overlaps one or more holidays. Confirm to continue.";

  return {
    code: "HOLIDAY_WARNING_REQUIRED",
    message,
    holidays: summaries,
  };
}

export async function listHolidays(input?: {
  fromDate?: string;
  toDate?: string;
}, executor: DbExecutor = db): Promise<HolidayRecord[]> {
  const fromDate = input?.fromDate ? normalizeDateOnlyKey(input.fromDate) : null;
  const toDate = input?.toDate ? normalizeDateOnlyKey(input.toDate) : null;

  if (fromDate && toDate) {
    return executor
      .select()
      .from(holidays)
      .where(
        and(
          lte(holidays.startDate, toDate),
          gte(holidays.endDate, fromDate),
        ),
      )
      .orderBy(asc(holidays.startDate), asc(holidays.id));
  }

  if (fromDate) {
    return executor
      .select()
      .from(holidays)
      .where(gte(holidays.endDate, fromDate))
      .orderBy(asc(holidays.startDate), asc(holidays.id));
  }

  if (toDate) {
    return executor
      .select()
      .from(holidays)
      .where(lte(holidays.startDate, toDate))
      .orderBy(asc(holidays.startDate), asc(holidays.id));
  }

  return executor
    .select()
    .from(holidays)
    .orderBy(asc(holidays.startDate), asc(holidays.id));
}

export async function listTimetableDayOverrides(input?: {
  fromDate?: string;
  toDate?: string;
}, executor: DbExecutor = db): Promise<TimetableDayOverrideRecord[]> {
  const fromDate = input?.fromDate ? normalizeDateOnlyKey(input.fromDate) : null;
  const toDate = input?.toDate ? normalizeDateOnlyKey(input.toDate) : null;

  if (fromDate && toDate) {
    return executor
      .select()
      .from(timetableDayOverrides)
      .where(
        and(
          gte(timetableDayOverrides.targetDate, fromDate),
          lte(timetableDayOverrides.targetDate, toDate),
        ),
      )
      .orderBy(asc(timetableDayOverrides.targetDate), asc(timetableDayOverrides.id));
  }

  if (fromDate) {
    return executor
      .select()
      .from(timetableDayOverrides)
      .where(gte(timetableDayOverrides.targetDate, fromDate))
      .orderBy(asc(timetableDayOverrides.targetDate), asc(timetableDayOverrides.id));
  }

  if (toDate) {
    return executor
      .select()
      .from(timetableDayOverrides)
      .where(lte(timetableDayOverrides.targetDate, toDate))
      .orderBy(asc(timetableDayOverrides.targetDate), asc(timetableDayOverrides.id));
  }

  return executor
    .select()
    .from(timetableDayOverrides)
    .orderBy(asc(timetableDayOverrides.targetDate), asc(timetableDayOverrides.id));
}

export async function listDayOverrideImpactedSlotSystems(
  targetDate: string,
  executor: DbExecutor = db,
): Promise<DayOverrideImpactedSlotSystem[]> {
  const normalizedTargetDate = normalizeDateOnlyKey(targetDate);

  if (!normalizedTargetDate) {
    return [];
  }

  const targetDateBounds = toISTDateRangeBounds(
    normalizedTargetDate,
    normalizedTargetDate,
  );

  if (!targetDateBounds) {
    return [];
  }

  const rows = await executor
    .select({
      batchId: timetableImportBatches.id,
      slotSystemId: timetableImportBatches.slotSystemId,
    })
    .from(timetableImportBatches)
    .where(
      and(
        eq(timetableImportBatches.status, "COMMITTED"),
        lte(timetableImportBatches.termStartDate, targetDateBounds.endAtExclusive),
        gte(timetableImportBatches.termEndDate, targetDateBounds.startAt),
      ),
    )
    .orderBy(asc(timetableImportBatches.slotSystemId), asc(timetableImportBatches.id));

  const grouped = new Map<number, Set<number>>();

  for (const row of rows) {
    const existing = grouped.get(row.slotSystemId) ?? new Set<number>();
    existing.add(row.batchId);
    grouped.set(row.slotSystemId, existing);
  }

  return Array.from(grouped.entries()).map(([slotSystemId, batchIds]) => ({
    slotSystemId,
    batchIds: Array.from(batchIds).sort((a, b) => a - b),
  }));
}

export async function getOverlappingHolidaysForInterval(
  startAt: Date,
  endAt: Date,
  executor: DbExecutor = db,
): Promise<HolidayRecord[]> {
  const dateRange = getISTInclusiveDateRangeForInterval(startAt, endAt);

  if (!dateRange) {
    return [];
  }

  return executor
    .select()
    .from(holidays)
    .where(
      and(
        lte(holidays.startDate, dateRange.endDateKey),
        gte(holidays.endDate, dateRange.startDateKey),
      ),
    );
}

export function findFirstHolidayOverlap(
  holidayRows: HolidayRecord[],
  startAt: Date,
  endAt: Date,
): HolidayRecord | null {
  const dateRange = getISTInclusiveDateRangeForInterval(startAt, endAt);

  if (!dateRange) {
    return null;
  }

  return (
    holidayRows.find(
      (holiday) =>
        holiday.startDate <= dateRange.endDateKey &&
        holiday.endDate >= dateRange.startDateKey,
    ) ?? null
  );
}

export async function pruneTimetableBookingsForHolidayRange(
  startDate: string,
  endDate: string,
  executor: DbExecutor = db,
): Promise<number> {
  const normalizedStartDate = normalizeDateOnlyKey(startDate);
  const normalizedEndDate = normalizeDateOnlyKey(endDate);

  if (!normalizedStartDate || !normalizedEndDate) {
    return 0;
  }

  const bounds = toISTDateRangeBounds(normalizedStartDate, normalizedEndDate);

  if (!bounds) {
    return 0;
  }

  const deleted = await executor
    .delete(bookings)
    .where(
      and(
        eq(bookings.source, "TIMETABLE_ALLOCATION"),
        lt(bookings.startAt, bounds.endAtExclusive),
        gt(bookings.endAt, bounds.startAt),
      ),
    )
    .returning({ id: bookings.id });

  return deleted.length;
}
