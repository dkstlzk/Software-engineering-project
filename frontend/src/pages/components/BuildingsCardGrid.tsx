import { useMemo, useState } from "react";
import { useBuildings } from "../../hooks/useBuildings";
import { useRooms } from "../../hooks/useRooms";
import { BuildingCard } from "./BuildingCard";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { Building, Room, UserRole } from "../../lib/api/types";

interface BuildingsCardGridProps {
  onBuildingClick: (building: Building) => void;
  onBuildingEdit: (building: Building) => void;
  onAddClick: () => void;
  userRole?: UserRole;
  buildings?: Building[];
  rooms?: Room[];
  dataEnabled?: boolean;
  staffBuildingIds?: number[];
}

export function BuildingsCardGrid({
  onBuildingClick,
  onBuildingEdit,
  onAddClick,
  userRole,
  buildings: propBuildings,
  rooms: propRooms,
  dataEnabled = true,
  staffBuildingIds = [],
}: BuildingsCardGridProps) {
  const [search, setSearch] = useState("");
  
  // Use provided buildings (from parent for scoped view) or fetch all
  const shouldFetchBuildings = dataEnabled && propBuildings === undefined;
  const { data: fetchedBuildings = [], isLoading, error, refetch } = useBuildings(shouldFetchBuildings);
  const buildings = propBuildings || fetchedBuildings;

  const shouldFetchRooms = dataEnabled && propRooms === undefined;
  const { data: fetchedRooms = [] } = useRooms(undefined, shouldFetchRooms);
  const allRooms = propRooms || fetchedRooms;

  const isAdmin = userRole === "ADMIN";
  const isStaff = userRole === "STAFF";
  const canAddBuilding = isAdmin;

  const filteredBuildings = useMemo(() => {
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.location && b.location.toLowerCase().includes(search.toLowerCase()))
    );
  }, [buildings, search]);

  const getRoomCount = (buildingId: number) => {
    const rooms = Array.isArray(allRooms) ? allRooms : [];
    return rooms.filter((r) => r.buildingId === buildingId).length;
  };

  // Determine if user can edit a specific building
  const canEditBuilding = (buildingId: number) => {
    if (isAdmin) return true;
    if (isStaff && staffBuildingIds.includes(buildingId)) return true;
    return false;
  };

  // Only admins can delete buildings
  const canDeleteBuilding = isAdmin;

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-red-500">Failed to load buildings</div>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <Input
          placeholder="Search buildings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {canAddBuilding && <Button onClick={onAddClick}>+ Add Building</Button>}
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading buildings...</div>
      ) : filteredBuildings.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {buildings.length === 0
            ? "No buildings yet. Create one to get started!"
            : "No buildings match your search"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBuildings.map((building) => (
            <BuildingCard
              key={building.id}
              building={building}
              roomCount={getRoomCount(building.id)}
              onClick={() => onBuildingClick(building)}
              onEdit={() => onBuildingEdit(building)}
              userRole={userRole}
              canEdit={canEditBuilding(building.id)}
              canDelete={canDeleteBuilding}
              isAssigned={isStaff && staffBuildingIds.includes(building.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
