import { request } from "./client";
import type { AvailabilityBuilding, RoomDayTimeline } from "./types";

export async function getAvailability(
  startAt: string,
  endAt: string,
  buildingId?: number
): Promise<AvailabilityBuilding[]> {
  const params = new URLSearchParams({ startAt, endAt });
  if (buildingId !== undefined) params.set("buildingId", String(buildingId));
  return request<AvailabilityBuilding[]>(`/availability?${params.toString()}`);
}

export async function getRoomDayTimeline(
  roomId: number,
  date: string
): Promise<RoomDayTimeline> {
  const params = new URLSearchParams({ date });
  return request<RoomDayTimeline>(`/rooms/${roomId}/availability/day/timeline?${params.toString()}`);
}
