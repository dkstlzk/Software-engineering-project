import { request } from "./client";
import type {
  BookingEditRequest,
  EditBookingPayload,
  EditBookingResponse,
} from "./types";

export async function editBooking(id: number, payload: EditBookingPayload): Promise<EditBookingResponse> {
  return request<EditBookingResponse>(`/bookings/${id}/edit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getEditRequests(): Promise<BookingEditRequest[]> {
  return request<BookingEditRequest[]>("/booking-edit-requests");
}

export async function approveEditRequest(id: number): Promise<{
  booking: unknown;
  editRequest: BookingEditRequest;
}> {
  return request<{ booking: unknown; editRequest: BookingEditRequest }>(`/booking-edit-requests/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectEditRequest(id: number): Promise<BookingEditRequest> {
  return request<BookingEditRequest>(`/booking-edit-requests/${id}/reject`, {
    method: "POST",
  });
}
