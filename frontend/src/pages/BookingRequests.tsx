import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  approveBookingRequest,
  createBookingRequest,
  getBookingRequests,
  getRooms,
  rejectBookingRequest,
} from "../api/api";
import type { BookingRequest, BookingStatus, Room } from "../api/api";

type StatusFilter = "ALL" | BookingStatus;

const STATUS_OPTIONS: StatusFilter[] = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

export function BookingRequestsPage() {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roomId, setRoomId] = useState<number | "">("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);

  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));

  const loadRequests = async (filter: StatusFilter) => {
    setLoading(true);
    setError(null);

    try {
      const result = await getBookingRequests(filter === "ALL" ? undefined : filter);
      setRequests(result);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load booking requests";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadRooms = async () => {
    try {
      const result = await getRooms();
      setRooms(result);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load rooms";
      setError(message);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadRooms();
      await loadRequests("ALL");
    })();
  }, []);

  const handleFilterChange = async (value: StatusFilter) => {
    setStatusFilter(value);
    await loadRequests(value);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (roomId === "") {
      setError("Room is required");
      return;
    }

    if (!startAt || !endAt) {
      setError("startAt and endAt are required");
      return;
    }

    const trimmedPurpose = purpose.trim();
    if (!trimmedPurpose) {
      setError("Purpose is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createBookingRequest({ roomId, startAt, endAt, purpose: trimmedPurpose });
      setRoomId("");
      setStartAt("");
      setEndAt("");
      setPurpose("");
      await loadRequests(statusFilter);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to create booking request";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (id: number) => {
    setActingId(id);
    setError(null);

    try {
      await approveBookingRequest(id);
      await loadRequests(statusFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Approval failed";
      setError(message);
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: number) => {
    setActingId(id);
    setError(null);

    try {
      await rejectBookingRequest(id);
      await loadRequests(statusFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Reject failed";
      setError(message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <section>
      <h2>Booking Requests</h2>

      <div className="panel">
        <h3>Filter Requests</h3>
        <label htmlFor="requestStatusFilter">Status</label>
        <select
          id="requestStatusFilter"
          value={statusFilter}
          onChange={(event) => void handleFilterChange(event.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <form className="panel" onSubmit={handleCreate}>
        <h3>Create Booking Request</h3>

        <label htmlFor="newRequestRoomId">Room</label>
        <select
          id="newRequestRoomId"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value === "" ? "" : Number(event.target.value))}
          disabled={isSubmitting}
        >
          <option value="">Select a room</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              #{room.id} - {room.name}
            </option>
          ))}
        </select>

        <label htmlFor="newRequestStartAt">startAt</label>
        <input
          id="newRequestStartAt"
          type="datetime-local"
          value={startAt}
          onChange={(event) => setStartAt(event.target.value)}
          disabled={isSubmitting}
        />

        <label htmlFor="newRequestEndAt">endAt</label>
        <input
          id="newRequestEndAt"
          type="datetime-local"
          value={endAt}
          onChange={(event) => setEndAt(event.target.value)}
          disabled={isSubmitting}
        />

        <label htmlFor="newRequestPurpose">Purpose</label>
        <input
          id="newRequestPurpose"
          type="text"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="Why do you need this room?"
          disabled={isSubmitting}
        />

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>

      {error ? <p className="error">Error: {error}</p> : null}
      {loading ? <p>Loading booking requests...</p> : null}

      {!loading && requests.length === 0 ? <p>No booking requests found.</p> : null}

      {!loading && requests.length > 0 ? (
        <ul className="list panel">
          {requests.map((request) => {
            const isPending = request.status === "PENDING";
            const isActing = actingId === request.id;

            return (
              <li key={request.id}>
                <span>
                  #{request.id} | roomId: {request.roomId}
                  {roomNameById.get(request.roomId) ? ` (${roomNameById.get(request.roomId)})` : ""}
                  {" | "}startAt: {new Date(request.startAt).toLocaleString()}
                  {" | "}endAt: {new Date(request.endAt).toLocaleString()}
                  {" | "}status: {request.status}
                </span>

                <button
                  type="button"
                  disabled={!isPending || isActing}
                  onClick={() => void handleApprove(request.id)}
                >
                  {isActing ? "Working..." : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={!isPending || isActing}
                  onClick={() => void handleReject(request.id)}
                >
                  {isActing ? "Working..." : "Reject"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}