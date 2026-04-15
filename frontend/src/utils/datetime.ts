const IST_OFFSET_MINUTES = 5 * 60 + 30;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

const IST_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const IST_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function toDate(value: string | Date): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toISTShiftedDate(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

export function getCurrentISTDateInputValue(): string {
  const shifted = toISTShiftedDate(new Date());
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());

  return `${year}-${month}-${day}`;
}

export function formatDateDDMMYYYY(value: string | Date): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }

  const shifted = toISTShiftedDate(date);

  const day = pad2(shifted.getUTCDate());
  const month = pad2(shifted.getUTCMonth() + 1);
  const year = String(shifted.getUTCFullYear());

  return `${day}/${month}/${year}`;
}

export function formatTimeHHMMIST(value: string | Date): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }

  const shifted = toISTShiftedDate(date);
  const hours = pad2(shifted.getUTCHours());
  const minutes = pad2(shifted.getUTCMinutes());

  return `${hours}:${minutes}`;
}

export function formatTimeHHMMSSIST(value: string | Date): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }

  const shifted = toISTShiftedDate(date);
  const hours = pad2(shifted.getUTCHours());
  const minutes = pad2(shifted.getUTCMinutes());
  const seconds = pad2(shifted.getUTCSeconds());

  return `${hours}:${minutes}:${seconds}`;
}

export function formatDateTimeDDMMYYYY(value: string | Date): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }

  return `${formatDateDDMMYYYY(date)} ${formatTimeHHMMIST(date)}`;
}

export function formatDateLabelIST(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00+05:30`);

  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }

  const shifted = toISTShiftedDate(parsed);
  const weekday = IST_WEEKDAY_SHORT[shifted.getUTCDay()] ?? "";
  const month = IST_MONTH_SHORT[shifted.getUTCMonth()] ?? "";
  const day = shifted.getUTCDate();

  return `${day} ${month}, ${weekday}`;
}

export function getMinutesFromISTDayStart(isoString: string, dayDate: string): number {
  const segmentDate = toDate(isoString);
  const dayStart = new Date(`${dayDate}T00:00:00+05:30`);

  if (!segmentDate || Number.isNaN(dayStart.getTime())) {
    return 0;
  }

  const diffMs = segmentDate.getTime() - dayStart.getTime();
  return Math.round(diffMs / (1000 * 60));
}