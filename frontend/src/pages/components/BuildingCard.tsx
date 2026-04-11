import { useState } from "react";
import { Trash2, Edit2, MoreVertical, MapPin, Check } from "lucide-react";
import type { Building, UserRole } from "../../lib/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useDeleteBuilding } from "../../hooks/useBuildings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

interface BuildingCardProps {
  building: Building;
  roomCount: number;
  onClick: () => void;
  onEdit: () => void;
  userRole?: UserRole;
  canEdit?: boolean;
  canDelete?: boolean;
  isAssigned?: boolean;
}

export function BuildingCard({
  building,
  roomCount,
  onClick,
  onEdit,
  canEdit = false,
  canDelete = false,
  isAssigned = false,
}: BuildingCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteBuilding = useDeleteBuilding();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete building "${building.name}"?`)) {
      return;
    }
    try {
      setIsDeleting(true);
      await deleteBuilding.mutateAsync(building.id);
    } catch {
      alert("Failed to delete building");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:shadow-lg hover:border-blue-500 transition-all duration-200"
    >
      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
        <div className="flex-1">
          <CardTitle className="text-lg">{building.name}</CardTitle>
          {isAssigned && (
            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded w-fit">
              <Check className="h-3 w-3" />
              Assigned to you
            </div>
          )}
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {building.location && (
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{building.location}</span>
          </div>
        )}
        <div className="text-sm text-gray-600">
          <p className="font-semibold text-gray-900">{roomCount}</p>
          <p className="text-gray-600">
            {roomCount === 1 ? "room" : "rooms"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
