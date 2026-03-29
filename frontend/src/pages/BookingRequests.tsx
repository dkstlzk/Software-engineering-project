import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  approveBookingRequest,
  cancelBookingRequest,
  createBookingRequest,
  forwardBookingRequest,
  getBookingRequests,
  getRooms,
  rejectBookingRequest,
} from "../api/api";
import type { BookingRequest, BookingStatus, Room } from "../api/api";
import { useAuth } from "../auth/AuthContext";
import { DateInput } from "../components/DateInput";
import { formatDateTimeDDMMYYYY } from "../utils/datetime";
import type {
  AvailabilityPrefill,
  BookingRequestPrefill,
} from "./bookingAvailabilityBridge";

type StatusFilter = "ALL" | BookingStatus;

const STATUS_OPTIONS: StatusFilter[] = [
  "ALL",
  "PENDING_FACULTY",
  "PENDING_STAFF",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_FACULTY: "Pending Faculty",
  PENDING_STAFF: "Pending Staff",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

function statusBadgeClass(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    PENDING_FACULTY: "badge-pending-faculty",
    PENDING_STAFF: "badge-pending-staff",
    APPROVED: "badge-approved",
    REJECTED: "badge-rejected",
    CANCELLED: "badge-cancelled",
  };
  return `badge ${map[status]}`;
}

type BookingRequestsPageProps = {
  prefill?: BookingRequestPrefill | null;
  onPrefillApplied?: () => void;
  onOpenAvailability?: (prefill: AvailabilityPrefill) => void;
};

export function BookingRequestsPage({
  prefill,
  onPrefillApplied,
  onOpenAvailability,
}: BookingRequestsPageProps) {
  const { user } = useAuth();
  const currentRole = user?.role ?? null;
  const canCreate = currentRole === "STUDENT" || currentRole === "FACULTY";

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
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);

  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));

  const loadRequests = async (filter: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await getBookingRequests(filter === "ALL" ? undefined : filter));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load booking requests");
    } finally {
      setLoading(false);
    }
  };

  const loadRooms = async () => {
    try { setRooms(await getRooms()); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load rooms"); }
  };

  useEffect(() => {
    void (async () => {
      await loadRooms();
      await loadRequests("ALL");
    })();
  }, []);

  useEffect(() => {
    if (!prefill) {
      return;
    }

    setRoomId(prefill.roomId);
    setStartAt(prefill.startAt);
    setEndAt(prefill.endAt);
    setPurpose(prefill.purpose ?? "");
    setError(null);
    setPrefillMessage("Form prefilled from availability results.");
    onPrefillApplied?.();
  }, [onPrefillApplied, prefill]);

  const handleFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    void loadRequests(value);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (roomId === "") { setError("Room is required"); return; }
    if (!startAt || !endAt) { setError("Start and end times are required"); return; }
    const trimmedPurpose = purpose.trim();
    if (!trimmedPurpose) { setError("Purpose is required"); return; }

    setIsSubmitting(true);
    setError(null);
    try {
      await createBookingRequest({ roomId, startAt, endAt, purpose: trimmedPurpose });
      setRoomId("");
      setStartAt("");
      setEndAt("");
      setPurpose("");
      setPrefillMessage(null);
      await loadRequests(statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckAvailability = () => {
    if (!onOpenAvailability) {
      return;
    }

    if (roomId === "") {
      setError("Room is required to check availability");
      return;
    }

    if (!startAt || !endAt) {
      setError("Start and end times are required to check availability");
      return;
    }

    const parsedStart = new Date(startAt).getTime();
    const parsedEnd = new Date(endAt).getTime();
    if (Number.isNaN(parsedStart) || Number.isNaN(parsedEnd) || parsedStart >= parsedEnd) {
      setError("Start must be earlier than end");
      return;
    }

    const selectedRoom = rooms.find((room) => room.id === roomId);
    onOpenAvailability({
      startAt,
      endAt,
      buildingId: selectedRoom?.buildingId,
      focusRoomId: roomId,
    });
  };

  const runAction = async (id: number, action: () => Promise<void>) => {
    setActingId(id);
    setError(null);
    try {
      await action();
      await loadRequests(statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActingId(null);
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>Booking Requests</h2>
        <p>Submit and manage room booking requests</p>
      </div>

      {/* Filter chips */}
      <div className="filter-bar">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className={`filter-chip ${statusFilter === s ? "active" : ""}`}
            onClick={() => handleFilterChange(s)}
          >
            {s === "ALL" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Create form */}
      {canCreate && (
        <form className="card section-gap" onSubmit={handleCreate}>
          <div className="card-header">
            <h3>New Request</h3>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="newRequestRoomId">Room</label>
              <select
                id="newRequestRoomId"
                className="input"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={isSubmitting}
              >
                <option value="">Select a room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} (#{r.id})</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="newRequestStartAt">Start</label>
              <DateInput
                id="newRequestStartAt"
                mode="datetime"
                value={startAt}
                onChange={setStartAt}
                disabled={isSubmitting}
              />
            </div>
            <div className="form-field">
              <label htmlFor="newRequestEndAt">End</label>
              <DateInput
                id="newRequestEndAt"
                mode="datetime"
                value={endAt}
                onChange={setEndAt}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="newRequestPurpose">Purpose</label>
              <input
                id="newRequestPurpose"
                className="input"
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Why do you need this room?"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="btn-group">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : "Submit Request"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={isSubmitting}
              onClick={handleCheckAvailability}
            >
              Check Availability
            </button>
          </div>
        </form>
      )}

      {prefillMessage && <div className="alert alert-success">{prefillMessage}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="loading-text">Loading requests…</p>}
      {!loading && requests.length === 0 && <p className="empty-text">No booking requests found.</p>}

      {!loading && requests.length > 0 && (
        <div className="data-list">
          {requests.map((req) => {
            const isPendingFaculty = req.status === "PENDING_FACULTY";
            const isPendingStaff = req.status === "PENDING_STAFF";
            const isPending = isPendingFaculty || isPendingStaff;
            const isOwnRequest = user ? req.userId === user.id : false;
            const isActing = actingId === req.id;

            const canForward = currentRole === "FACULTY" && isPendingFaculty;
            const canApprove = currentRole === "STAFF" && isPendingStaff;
            const canReject =
              (currentRole === "FACULTY" && isPendingFaculty) ||
              (currentRole === "STAFF" && isPendingStaff);
            const canCancel = (currentRole === "ADMIN" || isOwnRequest) && isPending;

            const hasActions = canForward || canApprove || canReject || canCancel;

            return (
              <div className="request-card" key={req.id}>
                <div className="request-card-header">
                  <span className="data-item-title">Request #{req.id}</span>
                  <span className={statusBadgeClass(req.status)}>
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>

                <div className="request-card-meta">
                  <span><strong>Room:</strong> {roomNameById.get(req.roomId) ?? `#${req.roomId}`}</span>
                  <span><strong>From:</strong> {formatDateTimeDDMMYYYY(req.startAt)}</span>
                  <span><strong>To:</strong> {formatDateTimeDDMMYYYY(req.endAt)}</span>
                </div>

                {req.purpose && (
                  <div className="request-card-purpose">
                    💬 {req.purpose}
                  </div>
                )}

                {hasActions && (
                  <div className="request-card-actions">
                    {canForward && (
                      <button
                        type="button"
                        className="btn btn-warning btn-sm"
                        disabled={isActing}
                        onClick={() => void runAction(req.id, () => forwardBookingRequest(req.id))}
                      >
                        {isActing ? "Working…" : "Forward to Staff"}
                      </button>
                    )}
                    {canApprove && (
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={isActing}
                        onClick={() => void runAction(req.id, () => approveBookingRequest(req.id))}
                      >
                        {isActing ? "Working…" : "Approve"}
                      </button>
                    )}
                    {canReject && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={isActing}
                        onClick={() => void runAction(req.id, () => rejectBookingRequest(req.id))}
                      >
                        {isActing ? "Working…" : "Reject"}
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={isActing}
                        onClick={() => void runAction(req.id, () => cancelBookingRequest(req.id))}
                      >
                        {isActing ? "Working…" : "Cancel"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}