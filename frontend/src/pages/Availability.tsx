import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  getAvailability,
  getBuildings,
  getRoomAvailability,
  getRooms,
} from "../api/api";
import type { AvailabilityBuilding, Building, Room } from "../api/api";
import { DateInput } from "../components/DateInput";
import {
  formatDateDDMMYYYY,
  formatDateTimeDDMMYYYY,
} from "../utils/datetime";
import type {
  AvailabilityPrefill,
  BookingRequestPrefill,
} from "./bookingAvailabilityBridge";

type SearchMode = "TIME" | "BUILDING_ROOM";

type RoomTimeBand = {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
};

type AvailabilityPageProps = {
  canRequestBooking?: boolean;
  prefill?: AvailabilityPrefill | null;
  onPrefillApplied?: () => void;
  onRequestBooking?: (prefill: BookingRequestPrefill) => void;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function toLocalDateTimeValue(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function toTimeLabel(dateTimeValue: string): string {
  const date = new Date(dateTimeValue);
  if (Number.isNaN(date.getTime())) {
    const fromString = dateTimeValue.slice(11, 16);
    return fromString.length === 5 ? fromString : dateTimeValue;
  }

  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function buildLocalDateTime(date: string, totalMinutes: number): string {
  return `${date}T${minutesToTime(totalMinutes)}`;
}

function buildContinuousBands(
  windowStartAt: string,
  windowEndAt: string,
  bookings: Array<{ startAt: string; endAt: string }>,
): RoomTimeBand[] {
  const windowStartMs = new Date(windowStartAt).getTime();
  const windowEndMs = new Date(windowEndAt).getTime();

  if (
    Number.isNaN(windowStartMs) ||
    Number.isNaN(windowEndMs) ||
    windowStartMs >= windowEndMs
  ) {
    return [];
  }

  const bookingIntervals: Array<{ startMs: number; endMs: number }> = [];
  const boundaries = new Set<number>([windowStartMs, windowEndMs]);

  for (const booking of bookings) {
    const startMs = new Date(booking.startAt).getTime();
    const endMs = new Date(booking.endAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
      continue;
    }

    const clippedStartMs = Math.max(startMs, windowStartMs);
    const clippedEndMs = Math.min(endMs, windowEndMs);
    if (clippedStartMs >= clippedEndMs) {
      continue;
    }

    bookingIntervals.push({
      startMs: clippedStartMs,
      endMs: clippedEndMs,
    });
    boundaries.add(clippedStartMs);
    boundaries.add(clippedEndMs);
  }

  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
  if (sortedBoundaries.length < 2) {
    return [];
  }

  const merged: Array<{ startMs: number; endMs: number; isAvailable: boolean }> = [];

  for (let i = 0; i < sortedBoundaries.length - 1; i += 1) {
    const segmentStartMs = sortedBoundaries[i];
    const segmentEndMs = sortedBoundaries[i + 1];
    if (segmentStartMs >= segmentEndMs) {
      continue;
    }

    const isBooked = bookingIntervals.some(
      (booking) => segmentStartMs < booking.endMs && segmentEndMs > booking.startMs,
    );

    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.isAvailable === !isBooked &&
      previous.endMs === segmentStartMs
    ) {
      previous.endMs = segmentEndMs;
      continue;
    }

    merged.push({
      startMs: segmentStartMs,
      endMs: segmentEndMs,
      isAvailable: !isBooked,
    });
  }

  return merged.map((segment) => ({
    startAt: toLocalDateTimeValue(segment.startMs),
    endAt: toLocalDateTimeValue(segment.endMs),
    isAvailable: segment.isAvailable,
  }));
}

export function AvailabilityPage({
  canRequestBooking = false,
  prefill,
  onPrefillApplied,
  onRequestBooking,
}: AvailabilityPageProps) {
  const [mode, setMode] = useState<SearchMode>("TIME");

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showOnlyAvailableRooms, setShowOnlyAvailableRooms] = useState(false);

  const [timeResults, setTimeResults] = useState<AvailabilityBuilding[] | null>(null);
  const [roomTimeBands, setRoomTimeBands] = useState<RoomTimeBand[] | null>(null);
  const [roomSearchMeta, setRoomSearchMeta] = useState<{
    buildingName: string;
    roomName: string;
    date: string;
    startAt: string;
    endAt: string;
  } | null>(null);

  const [timeStartAt, setTimeStartAt] = useState("");
  const [timeEndAt, setTimeEndAt] = useState("");
  const [timeBuildingId, setTimeBuildingId] = useState<number | "">("");

  const [roomDate, setRoomDate] = useState("");
  const [roomStartTime, setRoomStartTime] = useState("09:00");
  const [roomEndTime, setRoomEndTime] = useState("18:00");
  const [roomBuildingId, setRoomBuildingId] = useState<number | "">("");
  const [roomId, setRoomId] = useState<number | "">("");

  const [focusedRoomId, setFocusedRoomId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const data = await getBuildings();
        if (!isMounted) {
          return;
        }
        setBuildings(data);
      } catch {
        if (!isMounted) {
          return;
        }
        setBuildings([]);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (roomBuildingId === "") {
      setRooms([]);
      setRoomId("");
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const nextRooms = await getRooms(roomBuildingId);
        if (!isMounted) {
          return;
        }

        setRooms(nextRooms);
        setRoomId((previousRoomId) => {
          if (
            typeof previousRoomId === "number" &&
            nextRooms.some((room) => room.id === previousRoomId)
          ) {
            return previousRoomId;
          }

          return nextRooms[0]?.id ?? "";
        });
      } catch {
        if (!isMounted) {
          return;
        }
        setRooms([]);
        setRoomId("");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [roomBuildingId]);

  const groupedTimeResults = useMemo(() => {
    if (timeResults === null) {
      return null;
    }

    return timeResults
      .map((group) => ({
        ...group,
        rooms: showOnlyAvailableRooms
          ? group.rooms.filter((room) => room.isAvailable)
          : group.rooms,
      }))
      .filter((group) => group.rooms.length > 0);
  }, [timeResults, showOnlyAvailableRooms]);

  const roomCards = useMemo(() => {
    if (groupedTimeResults === null) {
      return [];
    }

    return groupedTimeResults.flatMap((group) => (
      group.rooms.map((room) => ({
        isAvailable: room.isAvailable,
      }))
    ));
  }, [groupedTimeResults]);

  const runTimeSearch = useCallback(
    async ({
      startAt,
      endAt,
      buildingId,
    }: {
      startAt: string;
      endAt: string;
      buildingId?: number;
    }) => {
      setLoading(true);
      setError(null);

      try {
        const data = await getAvailability(startAt, endAt, buildingId);

        setTimeResults(data);
        setRoomTimeBands(null);
        setRoomSearchMeta(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to check availability");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!prefill) {
      return;
    }

    const parsedStart = new Date(prefill.startAt).getTime();
    const parsedEnd = new Date(prefill.endAt).getTime();

    if (Number.isNaN(parsedStart) || Number.isNaN(parsedEnd) || parsedStart >= parsedEnd) {
      setError("Invalid prefilled time range");
      onPrefillApplied?.();
      return;
    }

    setMode("TIME");
    setTimeStartAt(prefill.startAt);
    setTimeEndAt(prefill.endAt);
    setTimeBuildingId(prefill.buildingId ?? "");
    setShowOnlyAvailableRooms(false);
    setFocusedRoomId(prefill.focusRoomId ?? null);

    void runTimeSearch({
      startAt: prefill.startAt,
      endAt: prefill.endAt,
      buildingId: prefill.buildingId,
    });

    onPrefillApplied?.();
  }, [onPrefillApplied, prefill, runTimeSearch]);

  const handleTimeSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!timeStartAt || !timeEndAt) {
      setError("Start and end times are required");
      return;
    }

    const parsedStart = new Date(timeStartAt).getTime();
    const parsedEnd = new Date(timeEndAt).getTime();
    if (Number.isNaN(parsedStart) || Number.isNaN(parsedEnd) || parsedStart >= parsedEnd) {
      setError("Start must be earlier than end");
      return;
    }

    setFocusedRoomId(null);

    await runTimeSearch({
      startAt: timeStartAt,
      endAt: timeEndAt,
      buildingId: timeBuildingId === "" ? undefined : timeBuildingId,
    });
  };

  const handleRoomSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!roomDate || !roomStartTime || !roomEndTime) {
      setError("Date, start time, and end time are required");
      return;
    }

    if (roomBuildingId === "" || roomId === "") {
      setError("Building and room are required");
      return;
    }

    const startMinutes = parseTimeToMinutes(roomStartTime);
    const endMinutes = parseTimeToMinutes(roomEndTime);
    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      setError("Start time must be earlier than end time");
      return;
    }

    const windowStart = buildLocalDateTime(roomDate, startMinutes);
    const windowEnd = buildLocalDateTime(roomDate, endMinutes);

    setLoading(true);
    setError(null);

    try {
      const bookings = await getRoomAvailability(roomId, windowStart, windowEnd);
      const nextTimeBands = buildContinuousBands(windowStart, windowEnd, bookings);

      const selectedBuilding = buildings.find((building) => building.id === roomBuildingId);
      const selectedRoom = rooms.find((room) => room.id === roomId);

      setRoomTimeBands(nextTimeBands);
      setRoomSearchMeta({
        buildingName: selectedBuilding?.name ?? "Selected building",
        roomName: selectedRoom?.name ?? "Selected room",
        date: roomDate,
        startAt: windowStart,
        endAt: windowEnd,
      });
      setTimeResults(null);
      setFocusedRoomId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check room availability");
    } finally {
      setLoading(false);
    }
  };

  const availableRooms = roomCards.filter((card) => card.isAvailable).length;
  const bookedRooms = roomCards.length - availableRooms;

  const availableTimeBands = roomTimeBands?.filter((band) => band.isAvailable).length ?? 0;
  const bookedTimeBands = (roomTimeBands?.length ?? 0) - availableTimeBands;

  const selectedRoomId = typeof roomId === "number" ? roomId : null;
  const selectedBuildingId = typeof roomBuildingId === "number" ? roomBuildingId : undefined;
  const canRequestFromTimeResults = canRequestBooking && Boolean(onRequestBooking);
  const canRequestFromBands =
    canRequestBooking &&
    Boolean(onRequestBooking) &&
    selectedRoomId !== null;

  return (
    <section>
      <div className="page-header">
        <h2>Availability</h2>
        <p>Search by time or by building/room with fast visual status chips</p>
      </div>

      <form
        className="card section-gap availability-search-card"
        onSubmit={mode === "TIME" ? handleTimeSearch : handleRoomSearch}
      >
        <div className="card-header">
          <h3>Search</h3>
        </div>

        <div className="availability-mode-switch" role="tablist" aria-label="Availability search mode">
          <button
            type="button"
            className={`availability-mode-btn ${mode === "TIME" ? "active" : ""}`}
            onClick={() => {
              setMode("TIME");
              setError(null);
              setFocusedRoomId(null);
            }}
          >
            By Time
          </button>
          <button
            type="button"
            className={`availability-mode-btn ${mode === "BUILDING_ROOM" ? "active" : ""}`}
            onClick={() => {
              setMode("BUILDING_ROOM");
              setError(null);
              setFocusedRoomId(null);
            }}
          >
            By Building/Room
          </button>
        </div>

        {mode === "TIME" ? (
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="availStartAt">Start</label>
              <DateInput
                id="availStartAt"
                mode="datetime"
                value={timeStartAt}
                onChange={setTimeStartAt}
              />
            </div>
            <div className="form-field">
              <label htmlFor="availEndAt">End</label>
              <DateInput
                id="availEndAt"
                mode="datetime"
                value={timeEndAt}
                onChange={setTimeEndAt}
              />
            </div>
            <div className="form-field">
              <label htmlFor="availBuilding">Building (optional)</label>
              <select
                id="availBuilding"
                className="input"
                value={timeBuildingId}
                onChange={(e) => setTimeBuildingId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">All Buildings</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.name}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="availRoomDate">Date</label>
              <DateInput
                id="availRoomDate"
                mode="date"
                value={roomDate}
                onChange={setRoomDate}
              />
            </div>
            <div className="form-field">
              <label htmlFor="availRoomStart">Start Time</label>
              <DateInput
                id="availRoomStart"
                mode="time"
                value={roomStartTime}
                onChange={setRoomStartTime}
              />
            </div>
            <div className="form-field">
              <label htmlFor="availRoomEnd">End Time</label>
              <DateInput
                id="availRoomEnd"
                mode="time"
                value={roomEndTime}
                onChange={setRoomEndTime}
              />
            </div>
            <div className="form-field">
              <label htmlFor="availRoomBuilding">Building</label>
              <select
                id="availRoomBuilding"
                className="input"
                value={roomBuildingId}
                onChange={(e) => setRoomBuildingId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Select building</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="availRoomId">Room</label>
              <select
                id="availRoomId"
                className="input"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={roomBuildingId === "" || rooms.length === 0}
              >
                <option value="">{roomBuildingId === "" ? "Select building first" : "Select room"}</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="availability-submit-row">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Searching..." : mode === "TIME" ? "Search Rooms" : "Search Time Slots"}
          </button>
          {mode === "TIME" && (
            <label className="availability-filter-toggle" htmlFor="onlyAvailableRooms">
              <input
                id="onlyAvailableRooms"
                type="checkbox"
                checked={showOnlyAvailableRooms}
                onChange={(event) => setShowOnlyAvailableRooms(event.target.checked)}
              />
              <span>Only available rooms</span>
            </label>
          )}
        </div>
      </form>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="loading-text">Searching...</p>}

      {mode === "TIME" && timeResults !== null && !loading && (
        <>
          {roomCards.length === 0 ? (
            <p className="empty-text">
              {showOnlyAvailableRooms
                ? "No available rooms found for this time range."
                : "No rooms found for the selected time range."}
            </p>
          ) : (
            <div className="card section-gap availability-result-card">
              <div className="availability-result-summary">
                <div>
                  <h3>Building-Room Status</h3>
                  <p className="availability-window">
                    {formatDateTimeDDMMYYYY(timeStartAt)} - {formatDateTimeDDMMYYYY(timeEndAt)}
                  </p>
                </div>
                <div className="availability-counts">
                  <span className="badge badge-available">{availableRooms} available</span>
                  <span className="badge badge-occupied">{bookedRooms} booked</span>
                </div>
              </div>

              <div className="availability-legend">
                <span className="availability-legend-item is-available">Available</span>
                <span className="availability-legend-item is-booked">Booked</span>
              </div>

              <div className="availability-building-groups">
                {groupedTimeResults?.map((buildingGroup) => (
                  <div key={buildingGroup.buildingId} className="availability-building-group">
                    <div className="availability-building-title">{buildingGroup.buildingName}</div>
                    <div className="availability-chip-row">
                      {buildingGroup.rooms.map((room) => (
                        <div
                          key={`${buildingGroup.buildingId}-${room.id}`}
                          className={`availability-chip ${room.isAvailable ? "is-available" : "is-booked"}${focusedRoomId === room.id ? " is-focused" : ""}`}
                        >
                          <span className="availability-chip-title">{room.name}</span>
                          <span className="availability-chip-status">
                            {room.isAvailable ? "Available" : "Booked"}
                          </span>
                          {canRequestFromTimeResults && room.isAvailable && (
                            <button
                              type="button"
                              className="availability-chip-action"
                              onClick={() => {
                                onRequestBooking?.({
                                  roomId: room.id,
                                  buildingId: buildingGroup.buildingId,
                                  startAt: timeStartAt,
                                  endAt: timeEndAt,
                                });
                              }}
                            >
                              Request
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {mode === "BUILDING_ROOM" && roomTimeBands !== null && !loading && (
        <>
          {roomTimeBands.length === 0 ? (
            <p className="empty-text">No time slots in the selected window.</p>
          ) : (
            <div className="card section-gap availability-result-card">
              <div className="availability-result-summary">
                <div>
                  <h3>Time Slot Status</h3>
                  {roomSearchMeta && (
                    <p className="availability-window">
                      {roomSearchMeta.buildingName} - {roomSearchMeta.roomName} | {formatDateDDMMYYYY(roomSearchMeta.date)}
                    </p>
                  )}
                  {roomSearchMeta && (
                    <p className="availability-window">
                      {formatDateTimeDDMMYYYY(roomSearchMeta.startAt)} - {formatDateTimeDDMMYYYY(roomSearchMeta.endAt)}
                    </p>
                  )}
                </div>
                <div className="availability-counts">
                  <span className="badge badge-available">{availableTimeBands} available bands</span>
                  <span className="badge badge-occupied">{bookedTimeBands} booked bands</span>
                </div>
              </div>

              <div className="availability-legend">
                <span className="availability-legend-item is-available">Available</span>
                <span className="availability-legend-item is-booked">Booked</span>
              </div>

              <div className="availability-chip-row availability-time-row">
                {roomTimeBands.map((band) => (
                  <div
                    key={`${band.startAt}-${band.endAt}`}
                    className={`availability-chip availability-chip-time ${band.isAvailable ? "is-available" : "is-booked"}`}
                  >
                    <span className="availability-chip-title">
                      {toTimeLabel(band.startAt)} - {toTimeLabel(band.endAt)}
                    </span>
                    <span className="availability-chip-status">
                      {band.isAvailable ? "Available" : "Booked"}
                    </span>
                    {canRequestFromBands && band.isAvailable && (
                      <button
                        type="button"
                        className="availability-chip-action"
                        onClick={() => {
                          onRequestBooking?.({
                            roomId: selectedRoomId,
                            buildingId: selectedBuildingId,
                            startAt: band.startAt,
                            endAt: band.endAt,
                          });
                        }}
                      >
                        Request
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
