import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useBuildings } from "../../hooks/useBuildings";
import { useUserBuildingAssignments, useUpdateUserBuildingAssignments } from "../../hooks/useUsers";
import type { ManagedUser } from "../../lib/api/types";
import { formatError } from "../../utils/formatError";
import { BuildingSelector } from "./BuildingSelector";

type BuildingAssignmentDialogProps = {
  user: ManagedUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function BuildingAssignmentDialog({ user, open, onOpenChange, onSuccess }: BuildingAssignmentDialogProps) {
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: buildings = [], isLoading: loadingBuildings } = useBuildings();
  const { data: currentAssignments, isLoading: loadingAssignments } = useUserBuildingAssignments(user?.id || 0);
  const updateAssignments = useUpdateUserBuildingAssignments();

  useEffect(() => {
    if (currentAssignments?.buildingIds) {
      setSelectedBuildingIds(currentAssignments.buildingIds);
    } else {
      setSelectedBuildingIds([]);
    }
    setError(null);
  }, [currentAssignments, user?.id]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      await updateAssignments.mutateAsync({
        userId: user.id,
        buildingIds: selectedBuildingIds,
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
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  Keep selection focused for tighter routing permissions.
                </div>
                <BuildingSelector
                  buildings={buildings}
                  selectedBuildingIds={selectedBuildingIds}
                  onSelectionChange={setSelectedBuildingIds}
                />
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
