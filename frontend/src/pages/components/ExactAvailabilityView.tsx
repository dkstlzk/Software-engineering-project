import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader } from "lucide-react";
import { BuildingSelector } from "./BuildingSelector";
import { RoomAvailabilityCard } from "./RoomAvailabilityCard";
import { useBuildings } from "../../hooks/useBuildings";
import { useAvailability } from "../../hooks/useAvailability";
import { useAuth } from "../../auth/AuthContext";
import { getUserBuildingAssignments } from "../../lib/api";
import type { AvailabilityRoom } from "../../lib/api";
import type { BookingRequestPrefill } from "../bookingAvailabilityBridge";

type ExactAvailabilityViewProps = {
  selectedDates: string[];
  timeRangeStart: string;
  timeRangeEnd: string;
};

interface RoomWithBuilding extends AvailabilityRoom {
  buildingId: number;
  buildingName: string;
}

export function ExactAvailabilityView({
  selectedDates,
  timeRangeStart,
  timeRangeEnd,
}: ExactAvailabilityViewProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStaff = user?.role === "STAFF";
  const isAdmin = user?.role === "ADMIN";
  const canViewBookingsPage = isStaff || isAdmin;

  const [selectedBuildingIds, setSelectedBuildingIds] = useState<number[]>([]);
  const [staffBuildingIds, setStaffBuildingIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const { data: buildings = [] } = useBuildings();

  // Build the start and end datetime for the availability API
  const selectedDate = selectedDates[0] || "";
  const startAt = selectedDate && timeRangeStart ? `${selectedDate}T${timeRangeStart}:00` : "";
  const endAt = selectedDate && timeRangeEnd ? `${selectedDate}T${timeRangeEnd}:00` : "";

  // Use the availability API - it returns buildings with rooms and their availability status
  const { 
    data: availabilityData = [], 
    isLoading, 
    isError 
  } = useAvailability(startAt, endAt, undefined, hasSearched && !!startAt && !!endAt);

  // Load staff's assigned buildings
  useEffect(() => {
    if (!isStaff || !user) return;

    const loadStaffBuildings = async () => {
      try {
        const response = await getUserBuildingAssignments(user.id);
        setStaffBuildingIds(response.buildingIds);
      } catch (error) {
        console.error("Failed to load staff building assignments:", error);
        setStaffBuildingIds([]);
      }
    };

    void loadStaffBuildings();
  }, [isStaff, user]);

  // Filter buildings based on user role
  const visibleBuildings = isStaff
    ? buildings.filter((b) => staffBuildingIds.includes(b.id))
    : buildings;

  // Filter availability data to selected buildings and transform rooms
  const selectedRooms: RoomWithBuilding[] = useMemo(() => {
    if (!hasSearched || selectedBuildingIds.length === 0) return [];

    return availabilityData
      .filter((building) => selectedBuildingIds.includes(building.buildingId))
      .flatMap((building) =>
        building.rooms.map((room) => ({
          ...room,
          buildingId: building.buildingId,
          buildingName: building.buildingName,
        }))
      )
      .sort((a, b) => {
        // Sort by building name, then room name
        const buildingCompare = a.buildingName.localeCompare(b.buildingName);
        return buildingCompare === 0 ? a.name.localeCompare(b.name) : buildingCompare;
      });
  }, [availabilityData, selectedBuildingIds, hasSearched]);

  // Set error when API fails
  useEffect(() => {
    if (isError) {
      setError("Failed to load room availability. Please try again.");
    } else {
      setError(null);
    }
  }, [isError]);

  const handleRoomClick = (room: RoomWithBuilding) => {
    const startTime = `${selectedDates[0]}T${timeRangeStart}:00`;
    const endTime = `${selectedDates[0]}T${timeRangeEnd}:00`;

    const prefill: BookingRequestPrefill = {
      roomId: room.id,
      startAt: startTime,
      endAt: endTime,
      buildingId: room.buildingId,
    };

    if (canViewBookingsPage) {
      // Staff and Admin go to Bookings page
      navigate("/bookings", { state: { prefill } });
    } else {
      // Student and Faculty go to Booking Requests page
      navigate("/requests", { state: { prefill } });
    }
  };

  const handleProceedSearch = () => {
    if (selectedDates.length === 0) {
      setError("Please select a date");
      return;
    }
    if (selectedBuildingIds.length === 0) {
      setError("Please select at least one building");
      return;
    }
    setHasSearched(true);
  };

  // Group rooms by building
  const groupedRooms = selectedRooms.reduce(
    (acc, room) => {
      if (!acc[room.buildingName]) {
        acc[room.buildingName] = [];
      }
      acc[room.buildingName].push(room);
      return acc;
    },
    {} as Record<string, RoomWithBuilding[]>
  );

  return (
    <div className="space-y-6">
      {/* Building Selector Card */}
      <div className="card">
        <div className="card-header">
          <h3>Select Buildings</h3>
          <p className="text-sm text-gray-600 mt-1">
            Choose buildings to see room availability
          </p>
        </div>
        <div className="p-6 space-y-4">
          <BuildingSelector
            buildings={visibleBuildings}
            selectedBuildingIds={selectedBuildingIds}
            onSelectionChange={setSelectedBuildingIds}
          />
          
          {/* Proceed Button */}
          <button
            onClick={handleProceedSearch}
            disabled={selectedBuildingIds.length === 0 || selectedDates.length === 0}
            className="w-full mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Search Availability
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-medium text-red-900">Error</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && hasSearched && (
        <div className="flex items-center justify-center py-12">
          <Loader className="animate-spin text-blue-500 mr-3" size={24} />
          <span className="text-gray-600">Loading room availability...</span>
        </div>
      )}

      {/* Rooms by Building - Only show after search */}
      {hasSearched && !isLoading && selectedBuildingIds.length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedRooms).map(([buildingName, rooms]) => (
            <div key={buildingName}>
              <h3 className="text-lg font-bold text-gray-900 mb-4">{buildingName}</h3>
              {rooms.length === 0 ? (
                <p className="text-gray-500 text-sm">No rooms in this building</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rooms.map((room) => (
                    <RoomAvailabilityCard
                      key={room.id}
                      room={room}
                      buildingName={buildingName}
                      isFullyAvailable={room.isAvailable}
                      availableFrom={timeRangeStart}
                      availableTo={timeRangeEnd}
                      onClick={() => handleRoomClick(room)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
