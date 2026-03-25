const API_BASE_URL = "http://localhost:5000";

export type Building = {
  id: number;
  name: string;
};

export type Room = {
  id: number;
  name: string;
  buildingId: number;
};

export type BookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type BookingRequest = {
  id: number;
  roomId: number;
  startAt: string;
  endAt: string;
  purpose: string;
  status: BookingStatus;
  createdAt: string;
};

type BuildingsListResponse = {
  data: Building[];
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const apiPayload = payload as ApiErrorPayload | null;
    const message =
      apiPayload?.error ??
      apiPayload?.message ??
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function getBuildings(): Promise<Building[]> {
  const response = await request<BuildingsListResponse>("/buildings");
  return response.data;
}

export async function createBuilding(name: string): Promise<Building> {
  const response = await request<{ data: Building }>("/buildings", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  return response.data;
}

export async function updateBuilding(id: number, name: string): Promise<Building> {
  const response = await request<{ data: Building }>(`/buildings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

  return response.data;
}

export async function deleteBuilding(id: number): Promise<void> {
  await request<{ message: string }>(`/buildings/${id}`, {
    method: "DELETE",
  });
}

export async function getRooms(buildingId?: number): Promise<Room[]> {
  const query =
    buildingId === undefined ? "" : `?buildingId=${encodeURIComponent(String(buildingId))}`;
  return request<Room[]>(`/rooms${query}`);
}

export async function createRoom(name: string, buildingId: number): Promise<Room> {
  return request<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify({ name, buildingId }),
  });
}

export async function updateRoom(id: number, name: string): Promise<Room> {
  const response = await request<{ data: Room }>(`/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

  return response.data;
}

export async function deleteRoom(id: number): Promise<void> {
  await request<{ message: string }>(`/rooms/${id}`, {
    method: "DELETE",
  });
}

export async function getBookingRequests(status?: BookingStatus): Promise<BookingRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<BookingRequest[]>(`/booking-requests${query}`);
}

export async function createBookingRequest(input: {
  roomId: number;
  startAt: string;
  endAt: string;
  purpose: string;
}): Promise<BookingRequest> {
  return request<BookingRequest>("/booking-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/reject`, {
    method: "POST",
  });
}