import { request } from "./client";
import type {
  BookingEventType,
  BookingRequest,
  BookingRequestChangeResponse,
  BookingStatus,
} from "./types";

export async function getBookingRequests(status?: BookingStatus): Promise<BookingRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const requests = await request<BookingRequest[]>(`/booking-requests${query}`);

  return [...requests].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);

    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && bTime !== aTime) {
      return bTime - aTime;
    }

    return b.id - a.id;
  });
}

export async function createBookingRequest(input: {
  roomId: number;
  startAt: string;
  endAt: string;
  eventType: BookingEventType;
  purpose: string;
  participantCount?: number;
  facultyId?: number;
  overrideHolidayWarning?: boolean;
}): Promise<BookingRequest> {
  return request<BookingRequest>("/booking-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function changeBookingRequest(input: {
  sourceRequestId?: number;
  sourceBookingId?: number;
  roomId?: number;
  startAt?: string;
  endAt?: string;
  eventType?: BookingEventType;
  purpose?: string;
  participantCount?: number;
  facultyId?: number;
  overrideHolidayWarning?: boolean;
}): Promise<BookingRequestChangeResponse> {
  return request<BookingRequestChangeResponse>("/booking-requests/change", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveBookingRequest(
  id: number,
  input?: { overrideHolidayWarning?: boolean },
): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function forwardBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/forward`, {
    method: "POST",
  });
}

export async function rejectBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/reject`, {
    method: "POST",
  });
}

export async function cancelBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/cancel`, {
    method: "POST",
  });
}
