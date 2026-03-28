function toDate(value: string | Date): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateDDMMYYYY(value: string | Date): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }

  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

export function formatDateTimeDDMMYYYY(value: string | Date): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }

  const datePart = formatDateDDMMYYYY(date);
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());

  return `${datePart} ${hours}:${minutes}`;
}