import { ChevronRight } from "lucide-react";

type RoomAvailabilityCardRoom = {
  id: number;
  name: string;
  capacity?: number | null;
  roomType?: string | null;
};

type RoomAvailabilityCardProps = {
  room: RoomAvailabilityCardRoom;
  buildingName: string;
  isFullyAvailable: boolean;
  availableFrom: string;
  availableTo: string;
  onClick: () => void;
};

export function RoomAvailabilityCard({
  room,
  buildingName,
  isFullyAvailable,
  availableFrom,
  availableTo,
  onClick,
}: RoomAvailabilityCardProps) {
  const bgColor = isFullyAvailable ? "bg-emerald-50" : "bg-red-50";
  const borderColor = isFullyAvailable ? "border-emerald-200" : "border-red-200";
  const badgeColor = isFullyAvailable
    ? "bg-emerald-100 text-emerald-800"
    : "bg-red-100 text-red-800";
  const statusText = isFullyAvailable ? "Available" : "Not Available";

  return (
    <button
      onClick={onClick}
      className={`${bgColor} ${borderColor} border rounded-lg p-4 text-left transition-all hover:shadow-md hover:scale-105 w-full h-full flex flex-col justify-between min-h-[180px]`}
    >
      {/* Header with building name */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{buildingName}</p>
        <h3 className="text-sm font-bold text-gray-900 mt-1 line-clamp-2">{room.name}</h3>
      </div>

      {/* Room details */}
      <div className="mb-3 space-y-1 text-xs">
        {room.capacity && (
          <div className="text-gray-600">
            <span className="font-medium">Capacity:</span> {room.capacity} seats
          </div>
        )}
        {room.roomType && (
          <div className="text-gray-600">
            <span className="font-medium">Type:</span> {room.roomType.replace(/_/g, " ")}
          </div>
        )}
      </div>

      {/* Status and time availability */}
      <div className="space-y-2">
        <div className={`${badgeColor} px-2 py-1 rounded-full text-xs font-semibold w-fit`}>
          {statusText}
        </div>
        {isFullyAvailable && (
          <div className="text-xs text-gray-600">
            {availableFrom} – {availableTo}
          </div>
        )}
      </div>

      {/* Action indicator */}
      <div className="flex items-center justify-end mt-3 text-blue-600">
        <ChevronRight size={16} />
      </div>
    </button>
  );
}
