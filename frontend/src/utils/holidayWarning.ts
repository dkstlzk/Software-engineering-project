type HolidayWarningHoliday = {
  id?: number;
  name?: string;
  startDate?: string;
  endDate?: string;
};

type HolidayWarningPayload = {
  code?: string;
  message?: string;
  holidays?: HolidayWarningHoliday[];
};

type ApiErrorLike = {
  code?: string;
  message?: string;
  payload?: unknown;
  response?: {
    data?: unknown;
  };
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readPayload(error: unknown): HolidayWarningPayload | null {
  const apiError = error as ApiErrorLike;

  const candidates: unknown[] = [apiError.payload, apiError.response?.data, error];

  for (const candidate of candidates) {
    const obj = asObject(candidate);

    if (!obj) {
      continue;
    }

    const code = typeof obj.code === "string" ? obj.code : undefined;
    const message = typeof obj.message === "string" ? obj.message : undefined;
    const holidays = Array.isArray(obj.holidays)
      ? (obj.holidays as HolidayWarningHoliday[])
      : undefined;

    if (code || message || holidays) {
      return {
        code,
        message,
        holidays,
      };
    }
  }

  return null;
}

export function isHolidayWarningError(error: unknown): boolean {
  const apiError = error as ApiErrorLike;

  if (apiError?.code === "HOLIDAY_WARNING_REQUIRED") {
    return true;
  }

  const payload = readPayload(error);
  return payload?.code === "HOLIDAY_WARNING_REQUIRED";
}

export function buildHolidayWarningPrompt(error: unknown): string {
  const payload = readPayload(error);

  const holidays = payload?.holidays ?? [];

  if (holidays.length === 0) {
    return "Selected time overlaps a holiday. Do you want to continue anyway?";
  }

  const holidayLines = holidays
    .map((holiday) => {
      const name = holiday.name?.trim() || "Holiday";
      const startDate = holiday.startDate ?? "";
      const endDate = holiday.endDate ?? "";
      const range = startDate && endDate ? `${startDate} to ${endDate}` : startDate || endDate;

      return range ? `- ${name} (${range})` : `- ${name}`;
    })
    .join("\n");

  return `${payload?.message ?? "Selected time overlaps holiday(s)."}\n\n${holidayLines}\n\nContinue anyway?`;
}
