import { useState } from "react";
import { useRoomDayTimeline } from "@/hooks/useAvailability";
import { RoomAvailabilityTimeline } from "@/components/features/availability";
import type { TimelineSegment } from "@/lib/api/types";

export function RoomDetailsPage({ roomId }: { roomId: number }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: timeline, isLoading, error } = useRoomDayTimeline(roomId, date);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-lg text-gray-600">Loading timeline...</div>
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div className="p-6">
        <div className="text-lg text-red-600">
          Error loading timeline data
        </div>
      </div>
    );
  }

  const handleFreeSlotClick = (startTime: string, endTime: string) => {
    void startTime;
    void endTime;
  };

  const handleSegmentClick = (segment: TimelineSegment) => {
    void segment;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{timeline.room.name}</h1>
        <p className="text-gray-600">{timeline.room.buildingName}</p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <label htmlFor="date" className="font-semibold text-gray-700">
          Date:
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">
          Availability for {date}
        </h2>
        <RoomAvailabilityTimeline
          segments={timeline.segments}
          dayStart="08:00"
          dayEnd="20:00"
          onFreeSlotClick={handleFreeSlotClick}
          onSegmentClick={handleSegmentClick}
        />
      </div>
    </div>
  );
}
