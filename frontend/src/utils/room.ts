import type { Room, Building } from "../lib/api/types";

/**
 * Formats a room name with building information
 * @param room The room object
 * @param building The building object (optional)
 * @returns Formatted string like "BuildingName - RoomName" or just "RoomName" if building not provided
 */
export function formatRoomDisplay(room: Room, building?: Building | null): string {
  if (!building) {
    return room.name;
  }
  return `${building.name} - ${room.name}`;
}

/**
 * Formats a room by looking up its building from a buildings array
 * @param room The room object
 * @param buildings Array of buildings to search
 * @returns Formatted string like "BuildingName - RoomName"
 */
export function formatRoomDisplayWithBuildingsArray(
  room: Room,
  buildings: Building[]
): string {
  const building = buildings.find((b) => b.id === room.buildingId);
  return formatRoomDisplay(room, building);
}
