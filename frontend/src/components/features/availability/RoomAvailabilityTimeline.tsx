import React, { useState, useRef } from "react";
import type { TimelineSegment } from "@/lib/api/types";

interface RoomAvailabilityTimelineProps {
  segments: TimelineSegment[];
  dayStart?: string;
  dayEnd?: string;
  onSegmentClick?: (segment: TimelineSegment) => void;
  onFreeSlotClick?: (startTime: string, endTime: string) => void;
}

function getMinutesFromMidnight(isoString: string): number {
  const date = new Date(isoString);
  return date.getHours() * 60 + date.getMinutes();
}

function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function getSegmentDimensions(
  segment: TimelineSegment,
  dayStartMin: number,
  dayDurationMin: number
): { left: number; width: number } {
  const segStartMin = getMinutesFromMidnight(segment.start);
  const segEndMin = getMinutesFromMidnight(segment.end);
  const left = ((segStartMin - dayStartMin) / dayDurationMin) * 100;
  const width = ((segEndMin - segStartMin) / dayDurationMin) * 100;
  return { left: Math.max(0, left), width: Math.max(0, width) };
}

function formatTime(isoString: string, format: "HH:MM" | "HH:MM:SS"): string {
  const date = new Date(isoString);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  return format === "HH:MM" ? `${h}:${m}` : `${h}:${m}:${s}`;
}

interface TimelineSegmentComponentProps {
  segment: TimelineSegment;
  position: { left: number; width: number };
  isHovered: boolean;
  onClick: () => void;
  onHover: (segment: TimelineSegment | null) => void;
}

function TimelineSegmentComponent({
  segment,
  position,
  isHovered,
  onClick,
  onHover,
}: TimelineSegmentComponentProps) {
  const bgColor =
    segment.status === "free"
      ? "bg-emerald-500"
      : segment.isRestricted
        ? "bg-red-900"
        : "bg-red-500";

  const cursor =
    segment.status === "free"
      ? "cursor-pointer"
      : segment.booking
        ? "cursor-pointer"
        : "cursor-default";

  return (
    <div
      className={`absolute top-0 bottom-0 ${bgColor} ${cursor} transition-opacity ${
        isHovered ? "opacity-100" : "opacity-90"
      } hover:opacity-100 rounded-sm border border-gray-300`}
      style={{
        left: `${position.left}%`,
        width: `${position.width}%`,
      }}
      onClick={onClick}
      onMouseEnter={() => onHover(segment)}
      onMouseLeave={() => onHover(null)}
      title={
        segment.status === "free"
          ? `Free: ${formatTime(segment.start, "HH:MM")} - ${formatTime(segment.end, "HH:MM")}`
          : segment.isRestricted
            ? "Booked (Details restricted)"
            : `Booked: ${segment.booking?.title || "Booking"}`
      }
    >
      {position.width > 10 && (
        <div className="text-xs text-white text-center py-1 px-2 truncate">
          {formatTime(segment.start, "HH:MM")}
        </div>
      )}
    </div>
  );
}

interface TimelineTooltipProps {
  segment: TimelineSegment | null;
  visible: boolean;
  x: number;
  y: number;
}

function TimelineTooltip({
  segment,
  visible,
  x,
  y,
}: TimelineTooltipProps) {
  if (!visible || !segment) return null;

  return (
    <div
      className="fixed bg-gray-900 text-white text-sm rounded shadow-lg p-3 z-50 max-w-xs pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {segment.status === "free" ? (
        <>
          <div className="font-semibold">Free</div>
          <div className="text-gray-300">
            {formatTime(segment.start, "HH:MM")} -{" "}
            {formatTime(segment.end, "HH:MM")}
          </div>
          <div className="text-xs text-green-400 mt-1">Click to book</div>
        </>
      ) : segment.isRestricted ? (
        <>
          <div className="font-semibold">Booked</div>
          <div className="text-gray-300">
            {formatTime(segment.start, "HH:MM")} -{" "}
            {formatTime(segment.end, "HH:MM")}
          </div>
          <div className="text-xs text-red-400 mt-1">Details not available</div>
        </>
      ) : (
        <>
          <div className="font-semibold">
            {segment.booking?.title || "Booked"}
          </div>
          <div className="text-gray-300">
            {formatTime(segment.start, "HH:MM")} -{" "}
            {formatTime(segment.end, "HH:MM")}
          </div>
          {segment.booking?.bookedBy && (
            <div className="text-gray-400">By: {segment.booking.bookedBy}</div>
          )}
          {segment.booking?.purpose && (
            <div className="text-gray-400">
              Purpose: {segment.booking.purpose}
            </div>
          )}
          {segment.booking?.contactInfo && (
            <div className="text-gray-400">
              Contact: {segment.booking.contactInfo}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RoomAvailabilityTimeline({
  segments,
  dayStart = "00:00",
  dayEnd = "24:00",
  onSegmentClick,
  onFreeSlotClick,
}: RoomAvailabilityTimelineProps) {
  const [hoveredSegment, setHoveredSegment] = useState<TimelineSegment | null>(
    null
  );
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const timelineRef = useRef<HTMLDivElement>(null);

  const dayStartMin =
    parseInt(dayStart.split(":")[0]) * 60 + parseInt(dayStart.split(":")[1]);
  const dayEndMin =
    parseInt(dayEnd.split(":")[0]) * 60 + parseInt(dayEnd.split(":")[1]);
  const dayDurationMin = dayEndMin - dayStartMin;

  const timeLabels = [];
  for (let min = dayStartMin; min <= dayEndMin; min += 60) {
    timeLabels.push(minutesToTimeString(min));
  }

  const handleSegmentHover = (
    segment: TimelineSegment | null,
    e?: React.MouseEvent
  ) => {
    setHoveredSegment(segment);
    if (e && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 40,
      });
    }
  };

  const handleSegmentClick = (segment: TimelineSegment) => {
    if (segment.status === "free" && onFreeSlotClick) {
      onFreeSlotClick(segment.start, segment.end);
    } else if (segment.booking && onSegmentClick) {
      onSegmentClick(segment);
    }
  };

  return (
    <div className="w-full">
      {/* Time labels */}
      <div className="flex px-4 mb-1">
        {timeLabels.map((time) => (
          <div
            key={time}
            className="flex-1 text-xs text-gray-500 font-semibold"
          >
            {time}
          </div>
        ))}
      </div>

      {/* Timeline bar */}
      <div
        ref={timelineRef}
        className="relative w-full bg-gray-100 rounded-lg h-12 border border-gray-300 overflow-hidden"
        onMouseLeave={() => handleSegmentHover(null)}
      >
        {segments.map((segment, idx) => {
          const pos = getSegmentDimensions(segment, dayStartMin, dayDurationMin);
          return (
            <TimelineSegmentComponent
              key={idx}
              segment={segment}
              position={pos}
              isHovered={hoveredSegment === segment}
              onClick={() => handleSegmentClick(segment)}
              onHover={(seg) => handleSegmentHover(seg)}
            />
          );
        })}

        {/* Tooltip */}
        <TimelineTooltip
          segment={hoveredSegment}
          visible={!!hoveredSegment}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      </div>

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-sm">
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
    </div>
  );
}
