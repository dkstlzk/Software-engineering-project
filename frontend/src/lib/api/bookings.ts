import { request } from "./client";
import type { Booking, BookingSource, BookingPruneResult } from "./types";

export async function getBookings(filters?: {
  roomId?: number;
  buildingId?: number;
  startAt?: string;
  endAt?: string;
}): Promise<Booking[]> {
  const params = new URLSearchParams();
  if (filters?.roomId !== undefined) params.set("roomId", String(filters.roomId));
  if (filters?.buildingId !== undefined) params.set("buildingId", String(filters.buildingId));
  if (filters?.startAt) params.set("startAt", filters.startAt);
  if (filters?.endAt) params.set("endAt", filters.endAt);
  const qs = params.toString();
  const bookings = await request<Booking[]>(`/bookings${qs ? `?${qs}` : ""}`);

  return [...bookings].sort((a, b) => {
    const aTime = Date.parse(a.startAt);
    const bTime = Date.parse(b.startAt);

    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && bTime !== aTime) {
      return bTime - aTime;
    }

    return b.id - a.id;
  });
}

export async function createBooking(input: {
  roomId: number;
  startAt: string;
  endAt: string;
  overrideHolidayWarning?: boolean;
  metadata?: {
    source?: BookingSource;
    sourceRef?: string;
    approvedBy?: number;
    approvedAt?: string;
  };
}): Promise<Booking> {
  return request<Booking>("/bookings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBooking(
  id: number,
  input: {
    roomId?: number;
    startAt?: string;
    endAt?: string;
  }
): Promise<Booking> {
  return request<Booking>(`/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteBooking(id: number): Promise<void> {
  await request<void>(`/bookings/${id}`, {
    method: "DELETE",
  });
}

export async function pruneAllBookings(): Promise<BookingPruneResult> {
  return request<BookingPruneResult>("/bookings/prune?scope=all", {
    method: "DELETE",
  });
}

export async function pruneBookingsBySlotSystem(slotSystemId: number): Promise<BookingPruneResult> {
  if (!Number.isInteger(slotSystemId) || slotSystemId <= 0) {
    throw new Error("Invalid slotSystemId");
  }

  const params = new URLSearchParams({
    scope: "slot-system",
    slotSystemId: String(slotSystemId),
  });

  return request<BookingPruneResult>(`/bookings/prune?${params.toString()}`, {
    method: "DELETE",
  });
}
