import { Check } from "lucide-react";
import type { Building } from "../../lib/api";

type BuildingSelectorProps = {
  buildings: Building[];
  selectedBuildingIds: number[];
  onSelectionChange: (buildingIds: number[]) => void;
};

export function BuildingSelector({
  buildings,
  selectedBuildingIds,
  onSelectionChange,
}: BuildingSelectorProps) {
  const sortedBuildings = [...buildings].sort((a, b) => a.name.localeCompare(b.name));

  const handleSelectAll = () => {
    if (selectedBuildingIds.length === buildings.length) {
      // If all are selected, deselect all
      onSelectionChange([]);
    } else {
      // Select all
      onSelectionChange(buildings.map((b) => b.id));
    }
  };

  const handleToggleBuilding = (buildingId: number) => {
    if (selectedBuildingIds.includes(buildingId)) {
      onSelectionChange(selectedBuildingIds.filter((id) => id !== buildingId));
    } else {
      onSelectionChange([...selectedBuildingIds, buildingId]);
    }
  };

  const isAllSelected = selectedBuildingIds.length === buildings.length && buildings.length > 0;
  const isPartiallySelected = selectedBuildingIds.length > 0 && !isAllSelected;

  return (
    <div className="space-y-3">
      {/* Select All Option */}
      <div className="border border-gray-300 rounded-lg p-3 hover:bg-gray-50 transition-colors">
        <button
          onClick={handleSelectAll}
          className="flex items-center gap-3 w-full text-left"
        >
          <div className="relative w-5 h-5 border-2 border-blue-500 rounded flex items-center justify-center flex-shrink-0">
            {isAllSelected || isPartiallySelected ? (
              <Check size={16} className="text-blue-500" strokeWidth={3} />
            ) : null}
          </div>
          <span className="font-semibold text-gray-900">All Buildings</span>
        </button>
      </div>

      {/* Individual Building Options */}
      <div className="space-y-2">
        {sortedBuildings.map((building) => {
          const isSelected = selectedBuildingIds.includes(building.id);
          return (
            <div
              key={building.id}
              className={`border rounded-lg p-3 transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              <button
                onClick={() => handleToggleBuilding(building.id)}
                className="flex items-center gap-3 w-full text-left"
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-400"
                  }`}
                >
                  {isSelected ? <Check size={16} className="text-white" strokeWidth={3} /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">{building.name}</h4>
                  {building.location && (
                    <p className="text-xs text-gray-500 truncate">{building.location}</p>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected Count */}
      {selectedBuildingIds.length > 0 && (
        <div className="text-sm text-gray-600 pt-2">
          <span className="font-medium">{selectedBuildingIds.length}</span> of{" "}
          <span className="font-medium">{buildings.length}</span> buildings selected
        </div>
      )}
    </div>
  );
}
