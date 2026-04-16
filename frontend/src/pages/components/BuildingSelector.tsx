import { useState } from "react";
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
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const sortedBuildings = [...buildings].sort((a, b) => a.name.localeCompare(b.name));
  const normalizedSearch = search.trim().toLowerCase();

  const visibleBuildings = normalizedSearch
    ? sortedBuildings.filter((building) =>
        `${building.name} ${building.location ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : sortedBuildings;

  const selectedSet = new Set(selectedBuildingIds);
  const isAllSelected = selectedBuildingIds.length === buildings.length && buildings.length > 0;
  const denseVisibleLimit = normalizedSearch ? visibleBuildings.length : 12;
  const hasMoreThanDenseLimit = visibleBuildings.length > denseVisibleLimit;
  const displayBuildings =
    expanded || !hasMoreThanDenseLimit
      ? visibleBuildings
      : visibleBuildings.slice(0, denseVisibleLimit);

  const selectedLabels = sortedBuildings
    .filter((building) => selectedSet.has(building.id))
    .map((building) => building.name);

  const selectedSummary =
    selectedLabels.length === 0
      ? "No buildings selected"
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels[0]}, ${selectedLabels[1]} +${selectedLabels.length - 2} more`;

  const handleSelectAll = () => {
    if (isAllSelected) {
      onSelectionChange([]);
      return;
    }

    onSelectionChange(buildings.map((building) => building.id));
  };

  const handleClearSelection = () => {
    onSelectionChange([]);
  };

  const handleToggleBuilding = (buildingId: number) => {
    if (selectedSet.has(buildingId)) {
      onSelectionChange(selectedBuildingIds.filter((id) => id !== buildingId));
      return;
    }

    onSelectionChange([...selectedBuildingIds, buildingId]);
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span className="truncate" title={selectedSummary}>
          {selectedBuildingIds.length}/{buildings.length} selected · {selectedSummary}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSelectAll}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {isAllSelected ? "Deselect all" : "Select all"}
          </button>
          {selectedBuildingIds.length > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {buildings.length > 8 && (
        <input
          type="text"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            if (expanded) {
              setExpanded(false);
            }
          }}
          placeholder="Search buildings"
          className="h-8 w-full rounded border border-slate-300 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      )}

      <div className="max-h-40 overflow-y-auto pr-1">
        <div className="flex flex-wrap gap-1.5">
          {displayBuildings.map((building) => {
            const isSelected = selectedSet.has(building.id);
            const chipTitle = building.location
              ? `${building.name} - ${building.location}`
              : building.name;

            return (
              <button
                type="button"
                key={building.id}
                onClick={() => handleToggleBuilding(building.id)}
                title={chipTitle}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                  isSelected
                    ? "border-slate-500 bg-slate-100 text-slate-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {isSelected ? <Check size={12} strokeWidth={3} className="shrink-0" /> : null}
                <span className="truncate">{building.name}</span>
              </button>
            );
          })}

          {displayBuildings.length === 0 && (
            <div className="text-xs text-slate-500">No buildings match your search.</div>
          )}
        </div>
      </div>

      {hasMoreThanDenseLimit && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {expanded
            ? "Show less"
            : `Show ${visibleBuildings.length - denseVisibleLimit} more`}
        </button>
      )}

      {normalizedSearch && selectedBuildingIds.length > 0 && (
        <div className="text-xs text-slate-500">Selected items remain active even when filtered.</div>
      )}
    </div>
  );
}
