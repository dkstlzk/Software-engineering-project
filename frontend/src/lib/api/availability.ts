import { request } from "./client";
import type {
  AvailabilityBuilding,
  BuildingMatrixAvailability,
  RoomDayTimeline,
} from "./types";

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

export async function getBuildingMatrixAvailability(
  buildingId: number,
  date: string,
  startTime: string,
  endTime: string,
  slotDuration = 15,
): Promise<BuildingMatrixAvailability> {
  const startAt = `${date}T${startTime}:00`;
  const endAt = `${date}T${endTime}:00`;

  const params = new URLSearchParams({
    startAt,
    endAt,
    buildingId: String(buildingId),
    format: "matrix",
    slotDuration: String(slotDuration),
  });

  return request<BuildingMatrixAvailability>(`/availability?${params.toString()}`);
}
