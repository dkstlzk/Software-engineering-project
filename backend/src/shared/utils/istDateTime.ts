const IST_OFFSET_MINUTES = 5 * 60 + 30;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toValidDate(value: Date | string): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toISTShiftedDate(value: Date): Date {
  return new Date(value.getTime() + IST_OFFSET_MS);
}

function parseDateOnlyKey(dateKey: string): { year: number; month: number; day: number } | null {
  const trimmed = dateKey.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > 31) {
    return null;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function normalizeDateOnlyKey(value: string): string | null {
  const parsed = parseDateOnlyKey(value);

  if (!parsed) {
    return null;
  }

  return `${parsed.year}-${pad2(parsed.month)}-${pad2(parsed.day)}`;
}

export function toISTDateKey(value: Date | string): string | null {
  const parsed = toValidDate(value);

  if (!parsed) {
    return null;
  }

  const shifted = toISTShiftedDate(parsed);

  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function formatISTDateTime(value: Date | string): string {
  const parsed = toValidDate(value);

  if (!parsed) {
    return "-";
  }

  const shifted = toISTShiftedDate(parsed);

  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  const hour = pad2(shifted.getUTCHours());
  const minute = pad2(shifted.getUTCMinutes());

  return `${year}-${month}-${day} ${hour}:${minute} IST`;
}

export function toISTTimeKey(value: Date | string): string | null {
  const parsed = toValidDate(value);

  if (!parsed) {
    return null;
  }

  const shifted = toISTShiftedDate(parsed);

  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

export function toISTDateRangeBounds(
  startDateKey: string,
  endDateKey: string,
): { startAt: Date; endAtExclusive: Date } | null {
  const start = parseDateOnlyKey(startDateKey);
  const end = parseDateOnlyKey(endDateKey);

  if (!start || !end) {
    return null;
  }

  const startAt = new Date(Date.UTC(start.year, start.month - 1, start.day, 0, -IST_OFFSET_MINUTES, 0, 0));
  const endAtExclusive = new Date(
    Date.UTC(end.year, end.month - 1, end.day + 1, 0, -IST_OFFSET_MINUTES, 0, 0),
  );

  return { startAt, endAtExclusive };
}

export function getISTInclusiveDateRangeForInterval(
  startAt: Date | string,
  endAt: Date | string,
): { startDateKey: string; endDateKey: string } | null {
  const parsedStart = toValidDate(startAt);
  const parsedEnd = toValidDate(endAt);

  if (!parsedStart || !parsedEnd) {
    return null;
  }

  if (parsedStart >= parsedEnd) {
    return null;
  }

  const startDateKey = toISTDateKey(parsedStart);

  // Treat interval as [startAt, endAt), so exact-midnight end should not include next day.
  const inclusiveEndInstant = new Date(parsedEnd.getTime() - 1);
  const endDateKey = toISTDateKey(inclusiveEndInstant);

  if (!startDateKey || !endDateKey) {
    return null;
  }

  return {
    startDateKey,
    endDateKey,
  };
}
