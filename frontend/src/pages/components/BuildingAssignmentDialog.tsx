import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useBuildings } from "../../hooks/useBuildings";
import { useUserBuildingAssignments, useUpdateUserBuildingAssignments } from "../../hooks/useUsers";
import type { ManagedUser } from "../../lib/api/types";
import { formatError } from "../../utils/formatError";

type BuildingAssignmentDialogProps = {
  user: ManagedUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function BuildingAssignmentDialog({ user, open, onOpenChange, onSuccess }: BuildingAssignmentDialogProps) {
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: buildings = [], isLoading: loadingBuildings } = useBuildings();
  const { data: currentAssignments, isLoading: loadingAssignments } = useUserBuildingAssignments(user?.id || 0);
  const updateAssignments = useUpdateUserBuildingAssignments();

  useEffect(() => {
    if (currentAssignments?.buildingIds) {
      setSelectedBuildingIds(new Set(currentAssignments.buildingIds));
    } else {
      setSelectedBuildingIds(new Set());
    }
    setError(null);
  }, [currentAssignments, user?.id]);

  const toggleBuilding = (buildingId: number) => {
    const newSet = new Set(selectedBuildingIds);
    if (newSet.has(buildingId)) {
      newSet.delete(buildingId);
    } else {
      newSet.add(buildingId);
    }
    setSelectedBuildingIds(newSet);
  };

  const toggleAll = () => {
    if (selectedBuildingIds.size === buildings.length) {
      setSelectedBuildingIds(new Set());
    } else {
      setSelectedBuildingIds(new Set(buildings.map(b => b.id)));
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      await updateAssignments.mutateAsync({
        userId: user.id,
        buildingIds: Array.from(selectedBuildingIds),
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(formatError(err, "Failed to update building assignments"));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      onOpenChange(false);
    }
  };

  const isLoading = loadingBuildings || loadingAssignments;
  const isStaffUser = user?.role === "STAFF";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Building Assignments</DialogTitle>
          <DialogDescription>
            Select buildings that {user?.name || user?.email} can manage
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-800 p-3 rounded text-sm">
            {error}
          </div>
        )}

        {!isStaffUser ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded text-sm">
            Building assignments are only available for STAFF users. The selected user has role: <strong>{user?.role}</strong>
          </div>
        ) : (
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading buildings...
              </div>
            ) : buildings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No buildings available
              </div>
            ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-sm font-medium">
                  {selectedBuildingIds.size} of {buildings.length} selected
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleAll}
                  disabled={saving}
                >
                  {selectedBuildingIds.size === buildings.length ? "Deselect All" : "Select All"}
                </Button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 border rounded p-3">
                {buildings.map((building) => (
                  <label
                    key={building.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBuildingIds.has(building.id)}
                      onChange={() => toggleBuilding(building.id)}
                      disabled={saving}
                      className="rounded w-4 h-4"
                    />
                    <span className="text-sm flex-1">{building.name}</span>
                  </label>
                ))}
              </div>
            </div>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || isLoading || !isStaffUser}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
