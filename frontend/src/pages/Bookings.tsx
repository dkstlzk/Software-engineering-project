import { useCallback, useMemo, useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useBookings, useCreateBooking, useDeleteBooking, useEditBooking } from "../hooks/useBookings";
import { useBuildings } from "../hooks/useBuildings";
import { useRooms } from "../hooks/useRooms";
import { useManagedUsers } from "../hooks/useUsers";
import { getBookingRequests, type Booking, type BookingRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { DateInput } from "../components/DateInput";
import { formatDateTimeDDMMYYYY } from "../utils/datetime";
import { formatRoomDisplayWithBuildingsArray } from "../utils/room";
import type { BookingRequestPrefill } from "./bookingAvailabilityBridge";
import { EditBookingModal } from "../components/EditBookingModal";
import { useToast } from "../context/ToastContext";
import { formatError } from "../utils/formatError";
import { buildHolidayWarningPrompt, isHolidayWarningError } from "../utils/holidayWarning";

const BOOKING_FILTERS_STORAGE_KEY = "qol.bookings.filters.v1";
const RECENT_BOOKINGS_PAST_DAYS = 14;
const RECENT_BOOKINGS_FUTURE_DAYS = 21;
const RECENT_BOOKINGS_LIMIT = 75;

type PersistedBookingFilters = {
  filterRoomId: number | null;
  filterBuildingId: number | null;
  filterStartAt: string;
  filterEndAt: string;
};

const DEFAULT_PERSISTED_BOOKING_FILTERS: PersistedBookingFilters = {
  filterRoomId: null,
  filterBuildingId: null,
  filterStartAt: "",
  filterEndAt: "",
};

function readPersistedBookingFilters(): PersistedBookingFilters {
  if (typeof window === "undefined") {
    return DEFAULT_PERSISTED_BOOKING_FILTERS;
  }

  try {
    const raw = window.localStorage.getItem(BOOKING_FILTERS_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_PERSISTED_BOOKING_FILTERS;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedBookingFilters>;

    return {
      filterRoomId:
        typeof parsed.filterRoomId === "number" && Number.isFinite(parsed.filterRoomId)
          ? parsed.filterRoomId
          : null,
      filterBuildingId:
        typeof parsed.filterBuildingId === "number" && Number.isFinite(parsed.filterBuildingId)
          ? parsed.filterBuildingId
          : null,
      filterStartAt: typeof parsed.filterStartAt === "string" ? parsed.filterStartAt : "",
      filterEndAt: typeof parsed.filterEndAt === "string" ? parsed.filterEndAt : "",
    };
  } catch {
    return DEFAULT_PERSISTED_BOOKING_FILTERS;
  }
}

function getRecentBookingsWindow(): { startAt: string; endAt: string } {
  const now = new Date();
  const startAt = new Date(now);
  startAt.setDate(startAt.getDate() - RECENT_BOOKINGS_PAST_DAYS);

  const endAt = new Date(now);
  endAt.setDate(endAt.getDate() + RECENT_BOOKINGS_FUTURE_DAYS);

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

export function BookingsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const canManageBookings = user?.role === "ADMIN" || user?.role === "STAFF";

  // Get prefill from location state if available
  const locationPrefill = (location.state as any)?.prefill as BookingRequestPrefill | undefined;

  return (
    <BookingsPageContent
      currentUserId={user?.id ?? null}
      userRole={user?.role ?? null}
      isAdmin={isAdmin}
      canManageBookings={canManageBookings}
      locationPrefill={locationPrefill}
      pushToast={pushToast}
    />
  );
}

type BookingsPageContentProps = {
  currentUserId: number | null;
  userRole: "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "PENDING_ROLE" | null;
  isAdmin: boolean;
  canManageBookings: boolean;
  locationPrefill?: BookingRequestPrefill;
  pushToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
};

function BookingsPageContent({ currentUserId, userRole, isAdmin, canManageBookings, locationPrefill, pushToast }: BookingsPageContentProps) {
  const persistedFilters = readPersistedBookingFilters();
  const [hasRequestedFullData, setHasRequestedFullData] = useState(false);
  const [recentWindow] = useState(() => getRecentBookingsWindow());

  // Filters
  const [filterRoomId, setFilterRoomId] = useState<number | "">(persistedFilters.filterRoomId ?? "");
  const [filterBuildingId, setFilterBuildingId] = useState<number | "">(persistedFilters.filterBuildingId ?? "");
  const [filterStartAt, setFilterStartAt] = useState(persistedFilters.filterStartAt);
  const [filterEndAt, setFilterEndAt] = useState(persistedFilters.filterEndAt);

  // Create form
  const [newRoomId, setNewRoomId] = useState<number | "">(""); 
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<Booking | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [requestStatusesByBookingId, setRequestStatusesByBookingId] = useState<Map<number, BookingStatusInfo>>(new Map());

  type BookingStatusInfo = {
    status: string;
    userId: number | null;
    facultyId: number | null;
  };

  // Build filters object for query
  const filters = useMemo<Record<string, number | string> | undefined>(() => {
    const f: Record<string, number | string> = {};
    if (filterRoomId !== "") f.roomId = filterRoomId;
    if (filterBuildingId !== "") f.buildingId = filterBuildingId;
    if (filterStartAt) f.startAt = filterStartAt;
    if (filterEndAt) f.endAt = filterEndAt;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [filterRoomId, filterBuildingId, filterStartAt, filterEndAt]);

  const hasActiveFilters =
    filterRoomId !== "" ||
    filterBuildingId !== "" ||
    filterStartAt.length > 0 ||
    filterEndAt.length > 0;

  const isRecentPreviewMode =
    !hasRequestedFullData &&
    !hasActiveFilters;

  const bookingQueryFilters = useMemo(() => {
    if (filters) {
      return filters;
    }

    if (isRecentPreviewMode) {
      return {
        startAt: recentWindow.startAt,
        endAt: recentWindow.endAt,
        limit: RECENT_BOOKINGS_LIMIT,
      };
    }

    return undefined;
  }, [filters, isRecentPreviewMode, recentWindow.endAt, recentWindow.startAt]);

  // Queries
  const { data: bookings = [], isLoading, error: bookingsError } = useBookings(bookingQueryFilters, true);
  const { data: rooms = [] } = useRooms(undefined, true);
  const { data: buildings = [] } = useBuildings(true);
  const { data: managedUsersResponse } = useManagedUsers(
    isAdmin ? { page: 1, limit: 100 } : undefined,
    isAdmin,
  );

  // Build admin user name map
  const adminUserNameById = useMemo(() => {
    if (!isAdmin || !managedUsersResponse) return {};
    const map: Record<number, string> = {};
    for (const user of managedUsersResponse.data) {
      map[user.id] = user.displayName ?? user.name;
    }
    return map;
  }, [isAdmin, managedUsersResponse]);

  const roomNameById = useMemo(
    () => new Map(rooms.map((r) => [r.id, formatRoomDisplayWithBuildingsArray(r, buildings)])),
    [rooms, buildings]
  );

  const bookingSourceLabel = useCallback(
    (source: Booking["source"]) => source.replace(/_/g, " "),
    []
  );

  // Mutations
  const createBookingMutation = useCreateBooking();
  const deleteBookingMutation = useDeleteBooking();
  const editBookingMutation = useEditBooking();

  useEffect(() => {
    if (userRole !== "FACULTY" && userRole !== "STUDENT") {
      setRequestStatusesByBookingId(new Map());
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const ownRequests = await getBookingRequests();
        if (cancelled) {
          return;
        }

        const nextMap = new Map<number, BookingStatusInfo>();
        for (const req of ownRequests as Array<BookingRequest & { bookingId?: number | null }>) {
          if (typeof req.bookingId === "number") {
            nextMap.set(req.bookingId, {
              status: req.status,
              userId: req.userId,
              facultyId: req.facultyId,
            });
          }
        }

        setRequestStatusesByBookingId(nextMap);
      } catch {
        if (!cancelled) {
          setRequestStatusesByBookingId(new Map());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userRole]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedBookingFilters = {
      filterRoomId: filterRoomId === "" ? null : filterRoomId,
      filterBuildingId: filterBuildingId === "" ? null : filterBuildingId,
      filterStartAt,
      filterEndAt,
    };

    window.localStorage.setItem(BOOKING_FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [filterRoomId, filterBuildingId, filterStartAt, filterEndAt]);

  // Apply prefill from location state if available
  useEffect(() => {
    if (!locationPrefill) {
      return;
    }

    setNewRoomId(locationPrefill.roomId);
    setNewStartAt(locationPrefill.startAt);
    setNewEndAt(locationPrefill.endAt);
    setCreateError(null);
  }, [locationPrefill]);

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newRoomId === "") { 
      setCreateError("Room is required"); 
      return; 
    }
    if (!newStartAt || !newEndAt) { 
      setCreateError("Start and end times are required"); 
      return; 
    }

    setCreateError(null);
    try {
      const basePayload = {
        roomId: newRoomId,
        startAt: newStartAt,
        endAt: newEndAt,
      };

      try {
        await createBookingMutation.mutateAsync(basePayload);
      } catch (error) {
        if (!isHolidayWarningError(error)) {
          throw error;
        }

        const continueAnyway = window.confirm(buildHolidayWarningPrompt(error));

        if (!continueAnyway) {
          return;
        }

        await createBookingMutation.mutateAsync({
          ...basePayload,
          overrideHolidayWarning: true,
        });
      }

      setNewRoomId("");
      setNewStartAt("");
      setNewEndAt("");
    } catch (e) {
      setCreateError(formatError(e, "Failed to create booking"));
    }
  };

  const mapEditErrorMessage = useCallback((rawMessage: string): string => {
    const upper = rawMessage.toUpperCase();

    if (upper.includes("BOOKING_CONFLICT") || upper.includes("ALREADY BOOKED") || upper.includes("CONFLICT")) {
      return "Slot/room conflict";
    }

    if (upper.includes("FORBIDDEN") || upper.includes("NOT ALLOWED") || upper.includes("CANNOT BE EDITED")) {
      return "Editing not allowed";
    }

    return rawMessage;
  }, []);

  const handleEditSubmit = useCallback(async (payload: { newRoomId?: number; newStartAt?: string; newEndAt?: string }) => {
    if (!editTarget) {
      return;
    }

    setEditError(null);

    try {
      const response = await editBookingMutation.mutateAsync({
        id: editTarget.id,
        data: payload,
      });

      if ("booking" in response) {
        pushToast("success", "Booking updated successfully");
      } else {
        pushToast("success", "Edit request submitted for approval");
      }

      setEditTarget(null);
    } catch (error) {
      const rawMessage = formatError(error, "Failed to edit booking");
      setEditError(mapEditErrorMessage(rawMessage));
    }
  }, [editBookingMutation, editTarget, mapEditErrorMessage, pushToast]);

  const canShowEditButton = useCallback((booking: Booking): boolean => {
    if (userRole === "ADMIN" || userRole === "STAFF") {
      return true;
    }

    if (userRole !== "FACULTY" && userRole !== "STUDENT") {
      return false;
    }

    const linkedRequest = requestStatusesByBookingId.get(booking.id);
    if (!linkedRequest) {
      return false;
    }

    const isOwn =
      (typeof linkedRequest.userId === "number" && currentUserId === linkedRequest.userId) ||
      (typeof linkedRequest.facultyId === "number" && currentUserId === linkedRequest.facultyId);

    if (!isOwn) {
      return false;
    }

    return linkedRequest.status !== "REJECTED" && linkedRequest.status !== "CANCELLED";
  }, [currentUserId, requestStatusesByBookingId, userRole]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setCreateError(null);
    try {
      await deleteBookingMutation.mutateAsync(id);
    } catch (e) {
      setCreateError(formatError(e, "Failed to delete booking"));
    } finally {
      setDeletingId(null);
    }
  };

  const clearFilters = () => {
    setFilterRoomId("");
    setFilterBuildingId("");
    setFilterStartAt("");
    setFilterEndAt("");
  };

  const error = bookingsError || createBookingMutation.error || deleteBookingMutation.error;
  const isSubmitting = createBookingMutation.isPending;
  return (
    <section>
      <div className="page-header">
        <h2>Bookings</h2>
        <p>View and manage confirmed room bookings</p>
      </div>

      {isRecentPreviewMode && (
        <div className="alert">
          Showing recent bookings from the last {RECENT_BOOKINGS_PAST_DAYS} days through the next {RECENT_BOOKINGS_FUTURE_DAYS} days (up to {RECENT_BOOKINGS_LIMIT} rows). Apply filters or load more for full history.
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "var(--space-2)" }}
            onClick={() => setHasRequestedFullData(true)}
          >
            Load More Bookings
          </button>
        </div>
      )}

      {!isRecentPreviewMode &&
        !hasActiveFilters &&
        hasRequestedFullData && (
          <div className="alert">
            Showing full booking history.
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "var(--space-2)" }}
              onClick={() => setHasRequestedFullData(false)}
            >
              Switch To Recent View
            </button>
          </div>
        )}

      {/* Filter */}
      <form className="card section-gap" onSubmit={(e) => { e.preventDefault(); }}>
        <div className="card-header">
          <h3>Filters</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            style={{ marginLeft: "auto" }}
          >
            Clear Filters
          </button>
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
              {buildings?.map((b) => (
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
              {rooms?.map((r) => (
                <option key={r.id} value={r.id}>{formatRoomDisplayWithBuildingsArray(r, buildings)}</option>
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
      </form>

      {/* Create form */}
      {canManageBookings && (
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
                {rooms?.map((r) => (
                  <option key={r.id} value={r.id}>{formatRoomDisplayWithBuildingsArray(r, buildings)}</option>
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

      {(error || createError) && <div className="alert alert-error">{error?.message || createError}</div>}
      {isLoading && <p className="loading-text">Loading bookings…</p>}
      {!isLoading && bookings.length === 0 && <p className="empty-text">No bookings found.</p>}

      {!isLoading && bookings.length > 0 && (
        <div className="data-list">
          {bookings.map((b) => {
            const isDeleting = deletingId === b.id;
            const approvedByLabel =
              b.approvedBy === null
                ? "-"
                : (adminUserNameById[b.approvedBy] ?? "Unknown User");

            return (
              <div className="data-item" key={b.id}>
                <div className="data-item-content">
                  <div className="data-item-title">
                    {roomNameById.get(b.roomId) ?? "Unknown Room"}
                  </div>
                  <div className="data-item-subtitle">
                    {formatDateTimeDDMMYYYY(b.startAt)} – {formatDateTimeDDMMYYYY(b.endAt)}
                  </div>
                  {isAdmin && (
                    <div className="empty-text" style={{ marginTop: "var(--space-1)" }}>
                      Source: {bookingSourceLabel(b.source)} · Linked Request: {b.requestId ? "Yes" : "No"} · Approved By: {approvedByLabel} · Approved At: {b.approvedAt ? formatDateTimeDDMMYYYY(b.approvedAt) : "-"}
                    </div>
                  )}
                </div>
                {(canManageBookings || canShowEditButton(b)) && (
                  <div className="data-item-actions">
                    {canShowEditButton(b) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={editBookingMutation.isPending}
                        onClick={() => {
                          setEditError(null);
                          setEditTarget(b);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {canManageBookings && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={isDeleting}
                        onClick={() => void handleDelete(b.id)}
                      >
                        {isDeleting ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <EditBookingModal
        open={editTarget !== null}
        booking={editTarget}
        rooms={rooms}
        buildings={buildings}
        isSubmitting={editBookingMutation.isPending}
        error={editError}
        onClose={() => {
          if (!editBookingMutation.isPending) {
            setEditTarget(null);
            setEditError(null);
          }
        }}
        onSubmit={handleEditSubmit}
      />
    </section>
  );
}
