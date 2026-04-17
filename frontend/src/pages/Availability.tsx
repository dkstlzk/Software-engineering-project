import { useState, useEffect, useMemo } from "react";
import { X, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRoomDayTimeline } from "../hooks/useAvailability";
import { useBuildings } from "../hooks/useBuildings";
import { useRooms } from "../hooks/useRooms";
import { useAuth } from "../auth/AuthContext";
import { getUserBuildingAssignments } from "../lib/api";
import { ExactAvailabilityView } from "./components/ExactAvailabilityView";
import type { Room } from "../lib/api";
import {
  formatDateLabelIST,
  formatTimeHHMMIST,
  getCurrentISTDateInputValue,
  getMinutesFromISTDayStart,
} from "../utils/datetime";
import type { BookingRequestPrefill } from "./bookingAvailabilityBridge";

type AvailabilityPageProps = {
  canRequestBooking?: boolean;
  prefill?: any;
  onPrefillApplied?: () => void;
  onRequestBooking?: (prefill: any) => void;
};

const AVAILABILITY_PREFERENCES_KEY = "qol.availability.preferences.v1";

type AvailabilityPreferences = {
  viewMode: "time" | "room" | "exact";
  selectedBuildingId: number | null;
  selectedRoomId: number | null;
  selectedDate: string;
  timeRangeStart: string;
  timeRangeEnd: string;
  selectedBuildingIdForRoomView: number | null;
};

function isValidDateInputValue(value: string): boolean {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const parsed = new Date(`${trimmed}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function parseTimeInputToMinutes(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function readAvailabilityPreferences(): AvailabilityPreferences {
  const defaults: AvailabilityPreferences = {
    viewMode: "time",
    selectedBuildingId: null,
    selectedRoomId: null,
    selectedDate: getCurrentISTDateInputValue(),
    timeRangeStart: "00:00",
    timeRangeEnd: "23:59",
    selectedBuildingIdForRoomView: null,
  };

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(AVAILABILITY_PREFERENCES_KEY);

    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Partial<AvailabilityPreferences>;

    return {
      viewMode:
        parsed.viewMode === "time" || parsed.viewMode === "room" || parsed.viewMode === "exact"
          ? parsed.viewMode
          : defaults.viewMode,
      selectedBuildingId:
        typeof parsed.selectedBuildingId === "number" && Number.isFinite(parsed.selectedBuildingId)
          ? parsed.selectedBuildingId
          : null,
      selectedRoomId:
        typeof parsed.selectedRoomId === "number" && Number.isFinite(parsed.selectedRoomId)
          ? parsed.selectedRoomId
          : null,
      selectedDate:
        typeof parsed.selectedDate === "string" && isValidDateInputValue(parsed.selectedDate)
          ? parsed.selectedDate
          : defaults.selectedDate,
      timeRangeStart:
        typeof parsed.timeRangeStart === "string" && parsed.timeRangeStart.length > 0
          ? parsed.timeRangeStart
          : defaults.timeRangeStart,
      timeRangeEnd:
        typeof parsed.timeRangeEnd === "string" && parsed.timeRangeEnd.length > 0
          ? parsed.timeRangeEnd
          : defaults.timeRangeEnd,
      selectedBuildingIdForRoomView:
        typeof parsed.selectedBuildingIdForRoomView === "number" && Number.isFinite(parsed.selectedBuildingIdForRoomView)
          ? parsed.selectedBuildingIdForRoomView
          : null,
    };
  } catch {
    return defaults;
  }
}

export function AvailabilityPage({
  canRequestBooking: _canRequestBooking,
  prefill: _prefill,
  onPrefillApplied: _onPrefillApplied,
  onRequestBooking: _onRequestBooking,
}: AvailabilityPageProps) {
  const [initialPreferences] = useState<AvailabilityPreferences>(() =>
    readAvailabilityPreferences(),
  );
  const initialDateSelection =
    initialPreferences.selectedDate && isValidDateInputValue(initialPreferences.selectedDate)
      ? initialPreferences.selectedDate
      : getCurrentISTDateInputValue();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStaff = user?.role === "STAFF";
  const isAdmin = user?.role === "ADMIN";
  const canViewBookingsPage = isStaff || isAdmin;

  const [viewMode, setViewMode] = useState<"time" | "room" | "exact">(initialPreferences.viewMode);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(initialPreferences.selectedBuildingId);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(initialPreferences.selectedRoomId);
  const [selectedDate, setSelectedDate] = useState(initialDateSelection);
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([initialDateSelection]);
  const [staffBuildingIds, setStaffBuildingIds] = useState<number[]>([]);
  const [timeRangeStart, setTimeRangeStart] = useState(initialPreferences.timeRangeStart);
  const [timeRangeEnd, setTimeRangeEnd] = useState(initialPreferences.timeRangeEnd);
  const [showRoomGrid, setShowRoomGrid] = useState(false);
  const [selectedBuildingIdForRoomView, setSelectedBuildingIdForRoomView] = useState<number | null>(initialPreferences.selectedBuildingIdForRoomView);
  const [selectedRoomIdForRoomView, setSelectedRoomIdForRoomView] = useState<number | null>(null);

  const { data: buildings = [] } = useBuildings(true);
  const { data: allRooms = [] } = useRooms(undefined, true);

  // When building changes, reset room selection
  useEffect(() => {
    setSelectedRoomId(null);
    setSelectedDates([selectedDate]);
  }, [selectedBuildingId]);

  const parsedTimeRangeStart = parseTimeInputToMinutes(timeRangeStart);
  const parsedTimeRangeEnd = parseTimeInputToMinutes(timeRangeEnd);

  const timeRangeError = useMemo(() => {
    if (parsedTimeRangeStart === null || parsedTimeRangeEnd === null) {
      return "Please enter valid Time From and Time To values.";
    }

    if (parsedTimeRangeStart >= parsedTimeRangeEnd) {
      return "Time From must be earlier than Time To.";
    }

    return null;
  }, [parsedTimeRangeEnd, parsedTimeRangeStart]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: AvailabilityPreferences = {
      viewMode,
      selectedBuildingId,
      selectedRoomId,
      selectedDate,
      timeRangeStart,
      timeRangeEnd,
      selectedBuildingIdForRoomView,
    };

    window.localStorage.setItem(AVAILABILITY_PREFERENCES_KEY, JSON.stringify(payload));
  }, [
    viewMode,
    selectedBuildingId,
    selectedRoomId,
    selectedDate,
    timeRangeStart,
    timeRangeEnd,
    selectedBuildingIdForRoomView,
  ]);

  const resetViewPreferences = () => {
    setViewMode("time");
    setSelectedBuildingId(null);
    setSelectedRoomId(null);
    const resetDate = getCurrentISTDateInputValue();
    setSelectedDate(resetDate);
    setSelectedRoomIds([]);
    setSelectedDates([resetDate]);
    setTimeRangeStart("00:00");
    setTimeRangeEnd("23:59");
    setShowRoomGrid(false);
    setSelectedBuildingIdForRoomView(null);
    setSelectedRoomIdForRoomView(null);
  };

  // Get selected room with building info
  const selectedRoom: (Room & { buildingName?: string }) | null = selectedRoomId
    ? (() => {
        const room = allRooms.find((r) => r.id === selectedRoomId);
        if (!room) return null;
        const building = buildings.find((b) => b.id === room.buildingId);
        return {
          ...room,
          buildingName: building?.name,
        };
      })()
    : null;

  const handleRemoveDate = (index: number) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter((_, i) => i !== index));
    }
  };

  // Handle clicking on an available slot and navigate with prefill
  const handleSlotClick = (roomId: number, buildingId: number, startTime: string, endTime: string) => {
    const prefill: BookingRequestPrefill = {
      roomId,
      startAt: startTime,
      endAt: endTime,
      buildingId,
    };

    if (canViewBookingsPage) {
      // Staff and Admin go to Bookings page
      navigate("/bookings", { state: { prefill } });
    } else {
      // Student and Faculty go to Booking Requests page
      navigate("/requests", { state: { prefill } });
    }
  };

  // Filter buildings and rooms based on user role
  const visibleBuildings = isStaff
    ? buildings.filter((b) => staffBuildingIds.includes(b.id))
    : buildings;

  const buildingRooms = selectedBuildingId
    ? allRooms.filter((r) => r.buildingId === selectedBuildingId)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Room Availability</h1>
          <p className="text-gray-600 mt-1">View and manage room availability</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("time")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === "time"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Browse by Time
          </button>
          <button
            onClick={() => setViewMode("room")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === "room"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Browse by Room
          </button>
          <button
            onClick={() => setViewMode("exact")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === "exact"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Exact Availability
          </button>
          <button
            onClick={resetViewPreferences}
            className="px-4 py-2 rounded-lg font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Reset View
          </button>
        </div>
      </div>

      {/* Browse by Time View */}
      {viewMode === "time" && (
      <div className="card">
        {/* Building and Room Selection Section */}
        <div className="card-header">
          <h3>Select Building and Room</h3>
        </div>
        <div className="p-6 space-y-4 border-b border-gray-200">
          <div className="flex gap-4">
            {/* Building Dropdown */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Building
              </label>
              <select
                value={selectedBuildingId || ""}
                onChange={(e) => setSelectedBuildingId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Select a building --</option>
                {visibleBuildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Room Dropdown */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room
              </label>
              <select
                value={selectedRoomId || ""}
                onChange={(e) => setSelectedRoomId(e.target.value ? Number(e.target.value) : null)}
                disabled={!selectedBuildingId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">-- Select a room --</option>
                {buildingRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Time Range Selection */}
          {selectedRoomId && selectedRoom && (
            <div className="flex gap-4 pt-2 border-t border-gray-200 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Range From
                </label>
                <input
                  type="time"
                  value={timeRangeStart}
                  onChange={(e) => setTimeRangeStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Range To
                </label>
                <input
                  type="time"
                  value={timeRangeEnd}
                  onChange={(e) => setTimeRangeEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {selectedRoomId && selectedRoom && timeRangeError && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {timeRangeError}
            </div>
          )}
        </div>

        {/* Timeline Grid View Section */}
        {selectedRoomId && selectedRoom && !timeRangeError && (
          <>
            {/* Grid: Dates (rows) x Time (columns) */}
            <div className="overflow-x-auto">
              <AvailabilityGrid
                roomId={selectedRoomId}
                dates={selectedDates}
                onRemoveDate={handleRemoveDate}
                onSelectDate={(date) => {
                  if (!selectedDates.includes(date)) {
                    setSelectedDates([...selectedDates, date]);
                  }
                }}
                timeRangeStart={timeRangeStart}
                timeRangeEnd={timeRangeEnd}
                onSlotClick={handleSlotClick}
                buildingId={selectedBuildingId}
              />
            </div>

            {/* Legend */}
            <div className="flex gap-6 text-sm p-6 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span>Booked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-900 rounded"></div>
                <span>Restricted</span>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* Browse by Room View */}
      {viewMode === "room" && (
      <div className="card">
        {/* Date Selection Section */}
        <div className="card-header">
          <h3>Select Date and Rooms</h3>
        </div>
        <div className="p-6 space-y-4 border-b border-gray-200">
          <div className="flex gap-4 items-end">
            {/* Date Picker */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Time Range From */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Range From
              </label>
              <input
                type="time"
                value={timeRangeStart}
                onChange={(e) => setTimeRangeStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Time Range To */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Range To
              </label>
              <input
                type="time"
                value={timeRangeEnd}
                onChange={(e) => setTimeRangeEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={() => {
                if (timeRangeError) {
                  setShowRoomGrid(false);
                  return;
                }

                setShowRoomGrid(true);
              }}
              className="btn btn-primary btn-sm"
              title="Load grid"
            >
              Load Grid
            </button>
          </div>

          {timeRangeError && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {timeRangeError}
            </div>
          )}
        </div>

        {/* Add Room Section */}
        <div className="p-6 space-y-4 border-b border-gray-200">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Building
              </label>
              <select
                value={selectedBuildingIdForRoomView || ""}
                onChange={(e) => {
                  setSelectedBuildingIdForRoomView(e.target.value ? Number(e.target.value) : null);
                  setSelectedRoomIdForRoomView(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Select building --</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room
              </label>
              <select
                value={selectedRoomIdForRoomView || ""}
                onChange={(e) => setSelectedRoomIdForRoomView(e.target.value ? Number(e.target.value) : null)}
                disabled={!selectedBuildingIdForRoomView}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">-- Select room --</option>
                {allRooms
                  .filter((r) => r.buildingId === selectedBuildingIdForRoomView && !selectedRoomIds.includes(r.id))
                  .map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (selectedRoomIdForRoomView && !selectedRoomIds.includes(selectedRoomIdForRoomView)) {
                  setSelectedRoomIds((prev) => [...prev, selectedRoomIdForRoomView]);
                  setSelectedRoomIdForRoomView(null);
                }
              }}
              disabled={!selectedRoomIdForRoomView}
              className="btn btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Room
            </button>
          </div>
        </div>

        {/* Rooms Grid */}
        {selectedRoomIds.length > 0 && showRoomGrid && !timeRangeError && (
          <>
            <div className="overflow-x-auto">
              <RoomAvailabilityGrid
                date={selectedDate}
                rooms={allRooms.filter((r) => selectedRoomIds.includes(r.id))}
                selectedRoomIds={selectedRoomIds}
                onToggleRoom={(roomId) => {
                  setSelectedRoomIds((prev) =>
                    prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
                  );
                }}
                timeRangeStart={timeRangeStart}
                timeRangeEnd={timeRangeEnd}
                onSlotClick={handleSlotClick}
              />
            </div>

            {/* Legend */}
            <div className="flex gap-6 text-sm p-6 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span>Booked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-900 rounded"></div>
                <span>Restricted</span>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* Exact Availability View */}
      {viewMode === "exact" && (
        <div className="space-y-6">
          {/* Date and Time Selection for Exact View */}
          <div className="card">
            <div className="card-header">
              <h3>Select Date and Time</h3>
              <p className="text-sm text-gray-600 mt-1">Choose a date to check exact room availability</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Date Selection - Single date only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Date
                  </label>
                  <input
                    type="date"
                    value={selectedDates[0] || initialDateSelection}
                    onChange={(e) => {
                      setSelectedDates([e.target.value]);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Time Range From */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time From
                  </label>
                  <input
                    type="time"
                    value={timeRangeStart}
                    onChange={(e) => setTimeRangeStart(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Time Range To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time To
                  </label>
                  <input
                    type="time"
                    value={timeRangeEnd}
                    onChange={(e) => setTimeRangeEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {timeRangeError && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {timeRangeError}
              </div>
            )}
          </div>

          {/* Exact Availability View Component - always show so user can select buildings */}
          <ExactAvailabilityView
            selectedDates={selectedDates}
            timeRangeStart={timeRangeStart}
            timeRangeEnd={timeRangeEnd}
            buildings={buildings}
            timeRangeValidationError={timeRangeError}
          />
        </div>
      )}
    </div>
  );
}

// Room Availability Grid Component
function RoomAvailabilityGrid({
  date,
  rooms,
  selectedRoomIds,
  onToggleRoom,
  timeRangeStart,
  timeRangeEnd,
  onSlotClick,
}: {
  date: string;
  rooms: Room[];
  selectedRoomIds: number[];
  onToggleRoom: (roomId: number) => void;
  timeRangeStart: string;
  timeRangeEnd: string;
  onSlotClick?: (roomId: number, buildingId: number, startTime: string, endTime: string) => void;
}) {

  // Convert time range to minutes for calculations
  const [startHour, startMin] = timeRangeStart.split(':').map(Number);
  const [endHour, endMin] = timeRangeEnd.split(':').map(Number);
  const rangeStartMinutes = startHour * 60 + startMin;
  const rangeEndMinutes = endHour * 60 + endMin;

  // Generate time labels with position info
  const generateTimeLabels = () => {
    const labels = [];
    const totalMinutes = rangeEndMinutes - rangeStartMinutes || 1440;
    
    for (let i = 0; i < 5; i++) {
      const fraction = i / 4;
      const minutes = rangeStartMinutes + (fraction * totalMinutes);
      const h = Math.floor(minutes / 60) % 24;
      const m = Math.floor(minutes % 60);
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      labels.push({
        time: timeStr,
        percentage: fraction * 100,
      });
    }
    return labels;
  };

  const timeLabels = generateTimeLabels();

  return (
    <div className="w-full">
      {/* Header with time labels using Grid */}
      <div className="grid border-b border-gray-300" style={{
        gridTemplateColumns: '200px 1fr',
      }}>
        {/* Room Column Header */}
        <div className="bg-gray-200 p-3 font-semibold text-sm text-gray-700 border-r border-gray-300 whitespace-nowrap overflow-hidden">
          Room
        </div>
        {/* Timeline Column Header */}
        <div className="relative h-16 bg-gray-100 border-b border-gray-300">
          {/* Time labels with absolute positioning */}
          {timeLabels.map((label, idx) => {
            let transform = 'translateX(-50%)';
            let left = label.percentage;
            
            if (idx === 0) {
              transform = 'translateX(0)';
              left = 0;
            } else if (idx === timeLabels.length - 1) {
              transform = 'translateX(-100%)';
              left = 100;
            }
            
            return (
              <div
                key={idx}
                className="absolute text-xs text-gray-600 font-semibold pointer-events-none whitespace-nowrap"
                style={{
                  left: `${left}%`,
                  top: '4px',
                  transform,
                }}
              >
                {label.time}
              </div>
            );
          })}
        </div>
      </div>

      {/* Room rows */}
      {rooms.map((room, idx) => (
        <RoomRow
          key={room.id}
          room={room}
          date={date}
          roomIndex={idx}
          isSelected={selectedRoomIds.includes(room.id)}
          onToggle={() => onToggleRoom(room.id)}
          timeRangeStart={timeRangeStart}
          timeRangeEnd={timeRangeEnd}
          onSlotClick={onSlotClick}
        />
      ))}

    </div>
  );
}

// Room Row Component
function RoomRow({
  room,
  date,
  roomIndex,
  isSelected,
  onToggle,
  timeRangeStart,
  timeRangeEnd,
  onSlotClick,
}: {
  room: Room;
  date: string;
  roomIndex: number;
  isSelected: boolean;
  onToggle: () => void;
  timeRangeStart: string;
  timeRangeEnd: string;
  onSlotClick?: (roomId: number, buildingId: number, startTime: string, endTime: string) => void;
}) {
  const { data: timelineData, isLoading, error } = useRoomDayTimeline(room.id, date, true);

  // Convert time range to minutes
  const [startHour, startMin] = timeRangeStart.split(':').map(Number);
  const [endHour, endMin] = timeRangeEnd.split(':').map(Number);
  const rangeStartMinutes = startHour * 60 + startMin;
  const rangeEndMinutes = endHour * 60 + endMin;

  // Step 1: Normalize time
  const getMinutesFromDayStart = (isoString: string, dayDate: string): number =>
    getMinutesFromISTDayStart(isoString, dayDate);

  // Step 2: Compute layout metrics
  const getSegmentWidth = (startMin: number, endMin: number): number => {
    const totalDuration = rangeEndMinutes - rangeStartMinutes || 1440;
    const clampedStart = Math.max(startMin, rangeStartMinutes);
    const clampedEnd = Math.min(endMin, rangeEndMinutes);
    
    if (clampedStart >= clampedEnd) return 0;
    
    const duration = clampedEnd - clampedStart;
    return (duration / totalDuration) * 100;
  };

  const getSegmentLeft = (startMin: number): number => {
    const totalDuration = rangeEndMinutes - rangeStartMinutes || 1440;
    const positionInRange = Math.max(0, startMin - rangeStartMinutes);
    return (positionInRange / totalDuration) * 100;
  };

  const formatTime = (isoString: string): string => formatTimeHHMMIST(isoString);

  const renderSegments = () => {
    if (error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <AlertCircle className="w-4 h-4 text-red-500" />
        </div>
      );
    }

    if (!timelineData?.segments || timelineData.segments.length === 0) {
      return null;
    }

    return timelineData.segments.map((segment, idx) => {
      const startMin = getMinutesFromDayStart(segment.start, date);
      const endMin = getMinutesFromDayStart(segment.end, date);
      const width = getSegmentWidth(startMin, endMin);
      const left = getSegmentLeft(startMin);

      if (width === 0 || startMin >= rangeEndMinutes || endMin <= rangeStartMinutes) {
        return null;
      }

      const isAvailable = segment.status === 'free';
      const bgColor = isAvailable ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600';
      const cursor = isAvailable ? 'cursor-pointer' : 'cursor-default';

      return (
        <div
          key={`segment-${idx}`}
          className={`absolute transition-colors ${bgColor} ${cursor} overflow-hidden flex items-center justify-center`}
          style={{
            left: `${left}%`,
            width: `${width}%`,
            minWidth: '2px',
            top: '8px',
            bottom: '8px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}
          title={
            isAvailable
              ? `Available: ${formatTime(segment.start)} - ${formatTime(segment.end)}`
              : `Booked: ${formatTime(segment.start)} - ${formatTime(segment.end)}`
          }
          onClick={() => {
            if (isAvailable && onSlotClick) {
              onSlotClick(room.id, room.buildingId, segment.start, segment.end);
            }
          }}
        />
      );
    });
  };

  if (isLoading) {
    return (
      <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: '200px 1fr' }}>
        <div className="bg-gray-100 border-r border-gray-300 p-3 animate-pulse" style={{ height: '80px' }}></div>
        <div className="bg-gray-50 animate-pulse" style={{ height: '80px' }}></div>
      </div>
    );
  }

  return (
    <div
      className="grid border-b border-gray-200 cursor-pointer hover:bg-blue-50"
      style={{
        gridTemplateColumns: '200px 1fr',
        backgroundColor: isSelected ? '#eff6ff' : roomIndex % 2 === 0 ? 'white' : '#f9fafb',
      }}
      onClick={onToggle}
    >
      {/* Room Column */}
      <div className="p-3 font-medium text-sm text-gray-700 border-r border-gray-300 flex items-center gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 text-blue-500 rounded"
        />
        <span className="truncate">{room.name}</span>
      </div>

      {/* Timeline Column */}
      <div className="relative h-20 bg-gray-50 border-l border-gray-200 overflow-x-auto" style={{ height: '80px', minHeight: '80px' }}>
        {renderSegments()}
      </div>
    </div>
  );
}

// Availability Grid Component
function AvailabilityGrid({
  roomId,
  dates,
  onRemoveDate,
  onSelectDate,
  timeRangeStart,
  timeRangeEnd,
  onSlotClick,
  buildingId,
}: {
  roomId: number;
  dates: string[];
  onRemoveDate: (index: number) => void;
  onSelectDate: (date: string) => void;
  timeRangeStart: string;
  timeRangeEnd: string;
  onSlotClick?: (roomId: number, buildingId: number, startTime: string, endTime: string) => void;
  buildingId?: number | null;
}) {
  // Convert time range to minutes for calculations
  const [startHour, startMin] = timeRangeStart.split(':').map(Number);
  const [endHour, endMin] = timeRangeEnd.split(':').map(Number);
  const rangeStartMinutes = startHour * 60 + startMin;
  const rangeEndMinutes = endHour * 60 + endMin;
  
  // Generate time labels with position info
  const generateTimeLabels = () => {
    const labels = [];
    const totalMinutes = rangeEndMinutes - rangeStartMinutes || 1440;
    
    for (let i = 0; i < 5; i++) {
      // Distribute labels evenly across the range (0, 0.25, 0.5, 0.75, 1.0)
      const fraction = i / 4;
      const minutes = rangeStartMinutes + (fraction * totalMinutes);
      const h = Math.floor(minutes / 60) % 24;
      const m = Math.floor(minutes % 60);
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      labels.push({
        time: timeStr,
        percentage: fraction * 100,
      });
    }
    return labels;
  };

  const timeLabels = generateTimeLabels();

  return (
    <div className="w-full">
      {/* Header with time labels using Grid */}
      <div className="grid border-b border-gray-300" style={{
        gridTemplateColumns: '120px 1fr',
      }}>
        {/* Date Column Header */}
        <div className="bg-gray-200 p-3 font-semibold text-sm text-gray-700 border-r border-gray-300 whitespace-nowrap overflow-hidden">
          Date
        </div>
        {/* Timeline Column Header */}
        <div className="relative h-16 bg-gray-100 border-b border-gray-300">
          {/* Time labels with absolute positioning */}
          {timeLabels.map((label, idx) => {
            // Clamp position to keep labels within bounds
            let transform = 'translateX(-50%)';
            let left = label.percentage;
            
            // If at the start (0%), align left instead of center
            if (idx === 0) {
              transform = 'translateX(0)';
              left = 0;
            }
            // If at the end (100%), align right instead of center
            else if (idx === timeLabels.length - 1) {
              transform = 'translateX(-100%)';
              left = 100;
            }
            
            return (
              <div
                key={idx}
                className="absolute text-xs text-gray-600 font-semibold pointer-events-none whitespace-nowrap"
                style={{
                  left: `${left}%`,
                  top: '4px',
                  transform,
                }}
              >
                {label.time}
              </div>
            );
          })}
        </div>
      </div>

      {/* Date rows using Grid */}
      {dates.map((date, dateIdx) => (
        <DateRow
          key={date}
          date={date}
          dateIndex={dateIdx}
          roomId={roomId}
          canRemove={dates.length > 1}
          onRemove={() => onRemoveDate(dateIdx)}
          timeRangeStart={timeRangeStart}
          timeRangeEnd={timeRangeEnd}
          onSlotClick={onSlotClick}
          buildingId={buildingId}
        />
      ))}

      {/* Date Picker Row at Bottom */}
      <div
        className="grid border-t border-gray-300"
        style={{
          gridTemplateColumns: '120px 1fr',
          backgroundColor: '#ffffff',
        }}
      >
        {/* Date Column (Fixed) */}
        <div className="p-3 border-r border-gray-300 flex items-center">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Select Date</label>
        </div>
        {/* Date Picker */}
        <div className="p-3 flex items-center">
          <input
            type="date"
            value={dates[dates.length - 1] || getCurrentISTDateInputValue()}
            onChange={(e) => {
              onSelectDate(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// Date Row Component
function DateRow({
  date,
  dateIndex,
  roomId,
  canRemove,
  onRemove,
  timeRangeStart,
  timeRangeEnd,
  onSlotClick,
  buildingId,
}: {
  date: string;
  dateIndex: number;
  roomId: number;
  canRemove: boolean;
  onRemove: () => void;
  timeRangeStart: string;
  timeRangeEnd: string;
  onSlotClick?: (roomId: number, buildingId: number, startTime: string, endTime: string) => void;
  buildingId?: number | null;
}) {
  const { data: timelineData, isLoading, error } = useRoomDayTimeline(roomId, date, true);

  // Convert time range to minutes
  const [startHour, startMin] = timeRangeStart.split(':').map(Number);
  const [endHour, endMin] = timeRangeEnd.split(':').map(Number);
  const rangeStartMinutes = startHour * 60 + startMin;
  const rangeEndMinutes = endHour * 60 + endMin;

  const formatDate = (dateStr: string) => formatDateLabelIST(dateStr);

  // Get error status code
  const errorStatus = (error as any)?.response?.status;
  const isRateLimited = errorStatus === 429;
  const errorMessage = isRateLimited 
    ? 'Rate limited. Please wait and refresh.'
    : error 
    ? 'Failed to load data'
    : null;

  // Step 1: Normalize time - Convert ISO timestamp to minutes from day start
  const getMinutesFromDayStart = (isoString: string, dayDate: string): number =>
    getMinutesFromISTDayStart(isoString, dayDate);

  // Step 2: Compute layout metrics - Convert duration to percentage based on time range
  const getSegmentWidth = (startMin: number, endMin: number): number => {
    const totalDuration = rangeEndMinutes - rangeStartMinutes || 1440;
    // Clamp segment to visible range
    const clampedStart = Math.max(startMin, rangeStartMinutes);
    const clampedEnd = Math.min(endMin, rangeEndMinutes);
    
    if (clampedStart >= clampedEnd) return 0; // Outside range
    
    const duration = clampedEnd - clampedStart;
    return (duration / totalDuration) * 100;
  };

  // Get segment left position relative to time range
  const getSegmentLeft = (startMin: number): number => {
    const totalDuration = rangeEndMinutes - rangeStartMinutes || 1440;
    const positionInRange = Math.max(0, startMin - rangeStartMinutes);
    return (positionInRange / totalDuration) * 100;
  };

  // Helper function to format time for tooltips
  const formatTime = (isoString: string): string => formatTimeHHMMIST(isoString);

  // Step 4: Render segments with absolute positioning and percentage coordinates
  const renderSegments = () => {
    if (error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-600">{errorMessage}</span>
          </div>
        </div>
      );
    }

    if (!timelineData?.segments || timelineData.segments.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          No data
        </div>
      );
    }

    return timelineData.segments.map((segment, idx) => {
      const startMin = getMinutesFromDayStart(segment.start, date);
      const endMin = getMinutesFromDayStart(segment.end, date);
      const width = getSegmentWidth(startMin, endMin);
      const left = getSegmentLeft(startMin);

      // Don't render segments outside the time range
      if (width === 0 || startMin >= rangeEndMinutes || endMin <= rangeStartMinutes) {
        return null;
      }

      // Step 3: Determine styling based on status
      const isAvailable = segment.status === 'free';
      const bgColor = isAvailable ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600';
      const cursor = isAvailable ? 'cursor-pointer' : 'cursor-default';


      return (
        <div
          key={`segment-${idx}`}
          className={`absolute transition-colors ${bgColor} ${cursor} overflow-hidden flex items-center justify-center`}
          style={{
            left: `${left}%`,
            width: `${width}%`,
            minWidth: '2px',
            top: '8px',
            bottom: '8px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}
          title={
            isAvailable
              ? `Available: ${formatTime(segment.start)} - ${formatTime(segment.end)}`
              : `Booked: ${formatTime(segment.start)} - ${formatTime(segment.end)}`
          }
          onClick={() => {
            if (isAvailable && onSlotClick && buildingId) {
              onSlotClick(roomId, buildingId, segment.start, segment.end);
            }
          }}
        >
          {width > 5 && (
            <span className="text-xs text-white font-semibold px-1 truncate">
              {isAvailable ? 'Free' : 'Booked'}
            </span>
          )}
        </div>
      );
    });
  };

  if (isLoading) {
    return (
      <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: '120px 1fr' }}>
        <div className="w-32 bg-gray-100 border-r border-gray-300 p-3 animate-pulse" style={{ height: '80px' }}></div>
        <div className="bg-gray-50 animate-pulse" style={{ height: '80px' }}></div>
      </div>
    );
  }

  return (
    <div
      className="grid border-b border-gray-200"
      style={{
        gridTemplateColumns: '120px 1fr',
        backgroundColor: dateIndex % 2 === 0 ? 'white' : '#f9fafb',
      }}
    >
      {/* Date Column (Fixed) */}
      <div 
        className="p-3 font-medium text-sm text-gray-700 border-r border-gray-300 flex items-center justify-between gap-2 whitespace-nowrap overflow-hidden"
        title={`${formatDate(date)} (${date})`}
      >
        <span className="truncate">{formatDate(date)}</span>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
            title="Remove date"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Timeline Column (Flexible, with absolute positioned segments) */}
      <div className="relative bg-gray-50 border-l border-gray-200 overflow-x-auto" style={{ height: '80px', minHeight: '80px' }}>
        {renderSegments()}
      </div>
    </div>
  );
}
