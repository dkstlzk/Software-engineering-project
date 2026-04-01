import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createBooking,
  deleteBooking,
  getBookings,
  getBuildings,
  getManagedUsers,
  getRooms,
} from "../api/api";
import type { Booking, Building, Room } from "../api/api";
import { useAuth } from "../auth/AuthContext";
import { DateInput } from "../components/DateInput";
import { formatDateTimeDDMMYYYY } from "../utils/datetime";

export function BookingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canMutate = user?.role === "ADMIN" || user?.role === "STAFF";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [adminUserNameById, setAdminUserNameById] = useState<Record<number, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterRoomId, setFilterRoomId] = useState<number | "">("");
  const [filterBuildingId, setFilterBuildingId] = useState<number | "">("");
  const [filterStartAt, setFilterStartAt] = useState("");
  const [filterEndAt, setFilterEndAt] = useState("");

  // Create form
  const [newRoomId, setNewRoomId] = useState<number | "">(""); 
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));

  const bookingSourceLabel = (source: Booking["source"]) => source.replace(/_/g, " ");

  const loadAdminUsers = async () => {
    if (!isAdmin) {
      setAdminUserNameById({});
      return;
    }

    try {
      const response = await getManagedUsers({ page: 1, limit: 100 });
      const nextNameMap: Record<number, string> = {};

      for (const managedUser of response.data) {
        nextNameMap[managedUser.id] = managedUser.displayName ?? managedUser.name;
      }

      setAdminUserNameById(nextNameMap);
    } catch {
      setAdminUserNameById({});
    }
  };

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: {
        roomId?: number;
        buildingId?: number;
        startAt?: string;
        endAt?: string;
      } = {};
      if (filterRoomId !== "") filters.roomId = filterRoomId;
      if (filterBuildingId !== "") filters.buildingId = filterBuildingId;
      if (filterStartAt) filters.startAt = filterStartAt;
      if (filterEndAt) filters.endAt = filterEndAt;
      setBookings(await getBookings(Object.keys(filters).length > 0 ? filters : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try { setBuildings(await getBuildings()); } catch { /* ignored */ }
      try { setRooms(await getRooms()); } catch { /* ignored */ }
      await loadBookings();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAdminUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleFilter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void loadBookings();
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newRoomId === "") { setError("Room is required"); return; }
    if (!newStartAt || !newEndAt) { setError("Start and end times are required"); return; }

    setIsSubmitting(true);
    setError(null);
    try {
      await createBooking({ roomId: newRoomId, startAt: newStartAt, endAt: newEndAt });
      setNewRoomId("");
      setNewStartAt("");
      setNewEndAt("");
      await loadBookings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteBooking(id);
      await loadBookings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete booking");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>Bookings</h2>
        <p>View and manage confirmed room bookings</p>
      </div>

      {/* Filter */}
      <form className="card section-gap" onSubmit={handleFilter}>
        <div className="card-header">
          <h3>Filters</h3>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="filterBuilding">Building</label>
            <select
              id="filterBuilding"
              className="input"
              value={filterBuildingId}
              onChange={(e) => setFilterBuildingId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">All Buildings</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="filterRoom">Room</label>
            <select
              id="filterRoom"
              className="input"
              value={filterRoomId}
              onChange={(e) => setFilterRoomId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">All Rooms</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="filterStartAt">From</label>
            <DateInput
              id="filterStartAt"
              mode="datetime"
              value={filterStartAt}
              onChange={setFilterStartAt}
            />
          </div>
          <div className="form-field">
            <label htmlFor="filterEndAt">To</label>
            <DateInput
              id="filterEndAt"
              mode="datetime"
              value={filterEndAt}
              onChange={setFilterEndAt}
            />
          </div>
        </div>
        <div>
          <button type="submit" className="btn btn-primary btn-sm">Apply Filters</button>
        </div>
      </form>

      {/* Create form */}
      {canMutate && (
        <form className="card section-gap" onSubmit={handleCreate}>
          <div className="card-header">
            <h3>Create Booking</h3>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="newBookingRoom">Room</label>
              <select
                id="newBookingRoom"
                className="input"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={isSubmitting}
              >
                <option value="">Select a room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} (#{r.id})</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="newBookingStartAt">Start</label>
              <DateInput
                id="newBookingStartAt"
                mode="datetime"
                value={newStartAt}
                onChange={setNewStartAt}
                disabled={isSubmitting}
              />
            </div>
            <div className="form-field">
              <label htmlFor="newBookingEndAt">End</label>
              <DateInput
                id="newBookingEndAt"
                mode="datetime"
                value={newEndAt}
                onChange={setNewEndAt}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create Booking"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="loading-text">Loading bookings…</p>}
      {!loading && bookings.length === 0 && <p className="empty-text">No bookings found.</p>}

      {!loading && bookings.length > 0 && (
        <div className="data-list">
          {bookings.map((b) => {
            const isDeleting = deletingId === b.id;
            const approvedByLabel =
              b.approvedBy === null
                ? "-"
                : (adminUserNameById[b.approvedBy] ?? `User ${b.approvedBy}`);
            const requestLabel = b.requestId === null ? "-" : String(b.requestId);

            return (
              <div className="data-item" key={b.id}>
                <div className="data-item-content">
                  <div className="data-item-title">
                    Booking #{b.id}
                    {b.requestId ? ` · Request #${b.requestId}` : ""}
                  </div>
                  <div className="data-item-subtitle">
                    {roomNameById.get(b.roomId) ?? `Room #${b.roomId}`} · {formatDateTimeDDMMYYYY(b.startAt)} – {formatDateTimeDDMMYYYY(b.endAt)}
                  </div>
                  {isAdmin && (
                    <div className="empty-text" style={{ marginTop: "var(--space-1)" }}>
                      Source: {bookingSourceLabel(b.source)} · Source Ref: {b.sourceRef ?? "-"} · Request Link: {requestLabel} · Approved By: {approvedByLabel} · Approved At: {b.approvedAt ? formatDateTimeDDMMYYYY(b.approvedAt) : "-"}
                    </div>
                  )}
                </div>
                {canMutate && (
                  <div className="data-item-actions">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={isDeleting}
                      onClick={() => void handleDelete(b.id)}
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </button>
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
