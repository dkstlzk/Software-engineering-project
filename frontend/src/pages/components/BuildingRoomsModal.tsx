import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import type { Building, Room, UserRole } from "../../lib/api/types";
import { RoomsCardGrid } from "./RoomsCardGrid";

interface BuildingRoomsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building: Building | null;
  rooms: Room[];
  onRoomEdit: (room: Room) => void;
  onAddRoom: (buildingId: number) => void;
  isLoading?: boolean;
  userRole?: UserRole;
  canEdit?: boolean;
}

export function BuildingRoomsModal({
  open,
  onOpenChange,
  building,
  rooms,
  onRoomEdit,
  onAddRoom,
  isLoading = false,
  userRole,
  canEdit = false,
}: BuildingRoomsModalProps) {
  if (!building) return null;

  const canModify = userRole === "ADMIN" || canEdit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-4 sm:py-5">
          <DialogTitle className="text-2xl">{building.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              {building.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4" />
                  <span>{building.location}</span>
                </div>
              )}
              <p>
                {canModify
                  ? "Manage rooms in this building"
                  : "View rooms in this building"}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <RoomsCardGrid
            rooms={rooms}
            buildingId={building.id}
            onEditClick={onRoomEdit}
            onAddClick={() => onAddRoom(building.id)}
            isLoading={isLoading}
            userRole={userRole}
            canEdit={canModify}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
