import { useQuery } from "@tanstack/react-query";
import {
  getAvailability,
  getBuildings,
  getRoomDayTimeline,
} from "../lib/api";
import { queryConfigs } from "../lib/queryConfig";

export function useAvailability(
  startAt: string,
  endAt: string,
  buildingId?: number,
  enabled = true
) {
  return useQuery({
    queryKey: ["availability", startAt, endAt, buildingId],
    queryFn: () => getAvailability(startAt, endAt, buildingId),
    enabled: enabled && !!startAt && !!endAt,
    ...queryConfigs.availability,
  });
}

export function useRoomDayTimeline(
  roomId: number,
  date: string,
  enabled = true
) {
  return useQuery({
    queryKey: ["roomDayTimeline", roomId, date],
    queryFn: () => getRoomDayTimeline(roomId, date),
    enabled: enabled && !!roomId && !!date,
    retry: (failureCount, error: any) => {
      // Don't retry on 429 (rate limit), let component handle it
      if (error?.response?.status === 429) return false;
      // Retry other errors up to 2 times
      return failureCount < 2;
    },
    ...queryConfigs.availability,
  });
}

export function useBuildings() {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: () => getBuildings(),
    ...queryConfigs.buildings,
  });
}
