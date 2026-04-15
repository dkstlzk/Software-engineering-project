import { request } from "./client";
import type {
  DayOfWeek,
  Holiday,
  HolidayCreateResponse,
  TimetableDayOverride,
  TimetableDayOverrideDeleteResponse,
  TimetableDayOverrideSaveResponse,
} from "./types";

export async function getHolidays(filters?: {
  fromDate?: string;
  toDate?: string;
}): Promise<Holiday[]> {
  const params = new URLSearchParams();

  if (filters?.fromDate) {
    params.set("fromDate", filters.fromDate);
  }

  if (filters?.toDate) {
    params.set("toDate", filters.toDate);
  }

  const query = params.toString();
  return request<Holiday[]>(`/holidays${query ? `?${query}` : ""}`);
}

export async function createHoliday(input: {
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
}): Promise<HolidayCreateResponse> {
  return request<HolidayCreateResponse>("/holidays", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteHoliday(id: number): Promise<void> {
  await request<void>(`/holidays/${id}`, {
    method: "DELETE",
  });
}

export async function getTimetableDayOverrides(filters?: {
  fromDate?: string;
  toDate?: string;
}): Promise<TimetableDayOverride[]> {
  const params = new URLSearchParams();

  if (filters?.fromDate) {
    params.set("fromDate", filters.fromDate);
  }

  if (filters?.toDate) {
    params.set("toDate", filters.toDate);
  }

  const query = params.toString();
  return request<TimetableDayOverride[]>(
    `/holidays/day-overrides${query ? `?${query}` : ""}`,
  );
}

export async function saveTimetableDayOverride(input: {
  targetDate: string;
  followsDayOfWeek: DayOfWeek;
  note?: string;
}): Promise<TimetableDayOverrideSaveResponse> {
  return request<TimetableDayOverrideSaveResponse>("/holidays/day-overrides", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteTimetableDayOverride(
  id: number,
): Promise<TimetableDayOverrideDeleteResponse> {
  return request<TimetableDayOverrideDeleteResponse>(`/holidays/day-overrides/${id}`, {
    method: "DELETE",
  });
}
