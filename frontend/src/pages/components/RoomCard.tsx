import { useState } from "react";
import { MoreVertical, Users, Projector, Mic, CheckCircle2, XCircle } from "lucide-react";
import type { Room, UserRole, RoomType } from "../../lib/api/types";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useDeleteRoom } from "../../hooks/useRooms";

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  LECTURE_HALL: "Lecture Hall",
  CLASSROOM: "Classroom",
  SEMINAR_ROOM: "Seminar Room",
  COMPUTER_LAB: "Computer Lab",
  CONFERENCE_ROOM: "Conference Room",
  AUDITORIUM: "Auditorium",
  WORKSHOP: "Workshop",
  OTHER: "Other",
};

interface RoomCardProps {
  room: Room;
  onEditClick: () => void;
  userRole?: UserRole;
  canEdit?: boolean;
}

export function RoomCard({ room, onEditClick, userRole, canEdit: canEditProp }: RoomCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteRoom = useDeleteRoom();
  const canEdit = canEditProp !== undefined ? canEditProp : (userRole === "ADMIN" || userRole === "STAFF");

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete room "${room.name}"?`)) {
      return;
    }
    try {
      setIsDeleting(true);
      await deleteRoom.mutateAsync(room.id);
    } catch {
      alert("Failed to delete room");
    } finally {
      setIsDeleting(false);
    }
  };

  const roomTypeLabel = room.roomType ? ROOM_TYPE_LABELS[room.roomType] : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">{room.name}</CardTitle>
            {roomTypeLabel && (
              <span className="text-xs text-gray-500">{roomTypeLabel}</span>
            )}
          </div>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2 -mt-1">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditClick}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} disabled={isDeleting} className="text-red-600">
                  {isDeleting ? "Deleting..." : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 text-sm">
        {/* Capacity */}
        {room.capacity && (
          <div className="flex items-center gap-2 text-gray-600">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span>Capacity: {room.capacity}</span>
          </div>
        )}

        {/* Features row */}
        <div className="flex items-center gap-3 text-gray-600">
          <span className={room.hasProjector ? "text-green-600" : "text-gray-400"}>
            <Projector className="h-4 w-4 inline mr-1" />
            {room.hasProjector ? "✓" : "✗"}
          </span>
          <span className={room.hasMic ? "text-green-600" : "text-gray-400"}>
            <Mic className="h-4 w-4 inline mr-1" />
            {room.hasMic ? "✓" : "✗"}
          </span>
        </div>

        {/* Availability */}
        <Badge 
          variant="outline" 
          className={`w-full justify-center py-1.5 ${
            room.accessible 
              ? 'border-green-300 bg-green-50 text-green-700' 
              : 'border-amber-300 bg-amber-50 text-amber-700'
          }`}
        >
          {room.accessible ? (
            <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Bookings Open</>
          ) : (
            <><XCircle className="h-3.5 w-3.5 mr-1.5" />Bookings Closed</>
          )}
        </Badge>

        {/* Equipment */}
        {room.equipmentList && (
          <div className="text-xs text-gray-500 border-t pt-2">
            <span className="font-medium">Equipment:</span> {room.equipmentList}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
