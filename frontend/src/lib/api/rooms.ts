import { request } from "./client";
import type { Room, RoomType } from "./types";

export async function getRooms(buildingId?: number): Promise<Room[]> {
  const query =
    buildingId === undefined ? "" : `?buildingId=${encodeURIComponent(String(buildingId))}`;
  return request<Room[]>(`/rooms${query}`);
}

export type CreateRoomInput = {
  name: string;
  buildingId: number;
  capacity?: number | null;
  roomType?: RoomType;
  hasProjector?: boolean;
  hasMic?: boolean;
  accessible?: boolean;
  equipmentList?: string | null;
};

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  return request<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateRoomInput = {
  name?: string;
  capacity?: number | null;
  roomType?: RoomType;
  hasProjector?: boolean;
  hasMic?: boolean;
  accessible?: boolean;
  equipmentList?: string | null;
};

export async function updateRoom(id: number, input: UpdateRoomInput): Promise<Room> {
  return request<Room>(`/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteRoom(id: number): Promise<void> {
  await request<{ message: string }>(`/rooms/${id}`, {
    method: "DELETE",
  });
}

export async function getRoomAvailability(
  roomId: number,
  startAt: string,
  endAt: string
): Promise<{ id: number; startAt: string; endAt: string }[]> {
  const params = new URLSearchParams({ startAt, endAt });
  return request(`/rooms/${roomId}/availability?${params.toString()}`);
}
