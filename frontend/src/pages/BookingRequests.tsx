import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  approveBookingRequest,
  approveEditRequest,
  cancelBookingRequest,
  createBookingRequest,
  forwardBookingRequest,
  getFacultyUsers,
  getManagedUsers,
  getBookingRequests,
  getBookings,
  getEditRequests,
  getRooms,
  getBuildings,
  rejectEditRequest,
  rejectBookingRequest,
} from "../lib/api";
import type {
  Booking,
  BookingEditRequest,
  BookingEventType,
  BookingRequest,
  BookingStatus,
  FacultyUser,
  Room,
  Building,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../context/ToastContext";
import { DateInput } from "../components/DateInput";
import { formatDateTimeDDMMYYYY } from "../utils/datetime";
import { formatError } from "../utils/formatError";
import { formatRoomDisplayWithBuildingsArray } from "../utils/room";
import type {
  AvailabilityPrefill,
  BookingRequestPrefill,
} from "./bookingAvailabilityBridge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

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

const EVENT_TYPE_OPTIONS: BookingEventType[] = [
  "QUIZ",
  "SEMINAR",
  "SPEAKER_SESSION",
  "MEETING",
  "CULTURAL_EVENT",
  "WORKSHOP",
  "CLASS",
  "OTHER",
];

function statusBadgeVariant(status: BookingStatus): "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" {
  const map: Record<BookingStatus, "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"> = {
    PENDING_FACULTY: "outline",
    PENDING_STAFF: "secondary",
    APPROVED: "default",
    REJECTED: "destructive",
    CANCELLED: "outline",
  };
  return map[status];
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
  const { pushToast } = useToast();
  const location = useLocation();
  const currentRole = user?.role ?? null;
  const isAdmin = currentRole === "ADMIN";
  const isStudent = currentRole === "STUDENT";
  const canCreate = currentRole === "STUDENT" || currentRole === "FACULTY";

  // Get prefill from location state if available
  const locationPrefill = (location.state as any)?.prefill as BookingRequestPrefill | undefined;

  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [facultyUsers, setFacultyUsers] = useState<FacultyUser[]>([]);
  const [editRequests, setEditRequests] = useState<BookingEditRequest[]>([]);
  const [bookingsById, setBookingsById] = useState<Record<number, Booking>>({});
  const [adminUserNameById, setAdminUserNameById] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roomId, setRoomId] = useState<number | "">(""); 
  const [facultyId, setFacultyId] = useState<number | "">("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [eventType, setEventType] = useState<BookingEventType>("OTHER");
  const [purpose, setPurpose] = useState("");
  const [participantCount, setParticipantCount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);

  const roomNameById = new Map(rooms.map((r) => [r.id, formatRoomDisplayWithBuildingsArray(r, buildings)]));

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

  const loadRequests = async (filter: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await getBookingRequests(filter === "ALL" ? undefined : filter));
    } catch (e) {
      setError(formatError(e, "Failed to load booking requests"));
    } finally {
      setLoading(false);
    }
  };

  const loadEditRequests = async () => {
    try {
      const [editRows, bookingRows] = await Promise.all([
        getEditRequests(),
        getBookings(),
      ]);

      setEditRequests(editRows);
      const bookingMap: Record<number, Booking> = {};
      for (const booking of bookingRows) {
        bookingMap[booking.id] = booking;
      }
      setBookingsById(bookingMap);
    } catch (e) {
      setError(formatError(e, "Failed to load edit requests"));
    }
  };

  const loadRooms = async () => {
    try { setRooms(await getRooms()); }
    catch (e) { setError(formatError(e, "Failed to load rooms")); }
  };

  const loadBuildings = async () => {
    try { setBuildings(await getBuildings()); }
    catch (e) { setError(formatError(e, "Failed to load buildings")); }
  };

  const loadFacultyUsers = async () => {
    try {
      setFacultyUsers(await getFacultyUsers());
    } catch (e) {
      setError(formatError(e, "Failed to load faculty users"));
    }
  };

  useEffect(() => {
    void (async () => {
      await loadRooms();
      await loadBuildings();
      await loadRequests("ALL");
      await loadEditRequests();

      if (isStudent) {
        await loadFacultyUsers();
      } else {
        setFacultyUsers([]);
        setFacultyId("");
      }
    })();
  }, [isStudent]);

  useEffect(() => {
    void loadAdminUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    // Use locationPrefill if available, otherwise use prop prefill
    const effectivePrefill = locationPrefill || prefill;
    
    if (!effectivePrefill) {
      return;
    }

    setRoomId(effectivePrefill.roomId);
    setStartAt(effectivePrefill.startAt);
    setEndAt(effectivePrefill.endAt);
    setPurpose(effectivePrefill.purpose ?? "");
    setError(null);
    setPrefillMessage("Form prefilled from availability results.");
    onPrefillApplied?.();
  }, [onPrefillApplied, prefill, locationPrefill]);

  const handleFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    void loadRequests(value);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (roomId === "") { setError("Room is required"); return; }
    if (isStudent && facultyId === "") { setError("Faculty selection is required"); return; }
    if (!startAt || !endAt) { setError("Start and end times are required"); return; }
    const trimmedPurpose = purpose.trim();
    if (!trimmedPurpose) { setError("Purpose is required"); return; }

    const trimmedParticipantCount = participantCount.trim();
    const parsedParticipantCount =
      trimmedParticipantCount.length > 0 ? Number(trimmedParticipantCount) : undefined;

    if (
      parsedParticipantCount !== undefined &&
      (!Number.isInteger(parsedParticipantCount) || parsedParticipantCount <= 0)
    ) {
      setError("Participant count must be a positive integer");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload: {
        roomId: number;
        startAt: string;
        endAt: string;
        eventType: BookingEventType;
        purpose: string;
        participantCount?: number;
        facultyId?: number;
      } = {
        roomId,
        startAt,
        endAt,
        eventType,
        purpose: trimmedPurpose,
      };

      if (parsedParticipantCount !== undefined) {
        payload.participantCount = parsedParticipantCount;
      }

      if (isStudent) {
        payload.facultyId = Number(facultyId);
      }

      await createBookingRequest(payload);
      setRoomId("");
      setFacultyId("");
      setStartAt("");
      setEndAt("");
      setEventType("OTHER");
      setPurpose("");
      setParticipantCount("");
      setPrefillMessage(null);
      await loadRequests(statusFilter);
    } catch (e) {
      setError(formatError(e, "Failed to create request"));
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
      await loadEditRequests();
    } catch (e) {
      setError(formatError(e, "Action failed"));
    } finally {
      setActingId(null);
    }
  };

  const runEditRequestAction = async (
    id: number,
    action: () => Promise<void>,
  ) => {
    setActingId(id);
    setError(null);

    try {
      await action();
      await loadEditRequests();
      await loadRequests(statusFilter);
    } catch (e) {
      setError(formatError(e, "Action failed"));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Booking Requests</h1>
        <p className="text-gray-600 mt-2">
          Submit and manage room booking requests
        </p>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <Button
            key={s}
            type="button"
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => handleFilterChange(s)}
          >
            {s === "ALL" ? "All" : STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      {/* Create Form */}
      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>New Request</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {/* First Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newRequestRoomId">Room *</Label>
                  <Select
                    value={String(roomId)}
                    onValueChange={(value) =>
                      setRoomId(value === "" ? "" : Number(value))
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="newRequestRoomId">
                      <SelectValue placeholder="Select a room" />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {formatRoomDisplayWithBuildingsArray(r, buildings)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newRequestStartAt">Start *</Label>
                  <DateInput
                    id="newRequestStartAt"
                    mode="datetime"
                    value={startAt}
                    onChange={setStartAt}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newRequestEndAt">End *</Label>
                  <DateInput
                    id="newRequestEndAt"
                    mode="datetime"
                    value={endAt}
                    onChange={setEndAt}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Second Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isStudent && (
                  <div className="space-y-2">
                    <Label htmlFor="newRequestFacultyId">
                      Faculty Approver *
                    </Label>
                    <Select
                      value={String(facultyId)}
                      onValueChange={(value) =>
                        setFacultyId(value === "" ? "" : Number(value))
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="newRequestFacultyId">
                        <SelectValue placeholder="Select a faculty member" />
                      </SelectTrigger>
                      <SelectContent>
                        {facultyUsers.map((faculty) => (
                          <SelectItem key={faculty.id} value={String(faculty.id)}>
                            {faculty.name}
                            {faculty.department ? ` (${faculty.department})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {facultyUsers.length === 0 && (
                      <p className="text-sm text-gray-500">
                        No faculty accounts available. Contact admin to
                        provision faculty access.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="newRequestEventType">Event Type *</Label>
                  <Select
                    value={eventType}
                    onValueChange={(value) =>
                      setEventType(value as BookingEventType)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="newRequestEventType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Third Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newRequestPurpose">Purpose *</Label>
                  <Input
                    id="newRequestPurpose"
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Why do you need this room?"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newRequestParticipantCount">
                    Participant Count (optional)
                  </Label>
                  <Input
                    id="newRequestParticipantCount"
                    type="number"
                    min={1}
                    step={1}
                    value={participantCount}
                    onChange={(e) => setParticipantCount(e.target.value)}
                    placeholder="e.g. 40"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={
                    isSubmitting || (isStudent && facultyUsers.length === 0)
                  }
                >
                  {isSubmitting ? "Submitting…" : "Submit Request"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={handleCheckAvailability}
                >
                  Check Availability
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {prefillMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
          {prefillMessage}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Loading and Empty States */}
      {loading && (
        <p className="text-gray-600 text-center py-8">Loading requests…</p>
      )}
      {!loading && requests.length === 0 && (
        <p className="text-gray-600 text-center py-8">No booking requests found.</p>
      )}

      {/* Requests List */}
      {!loading && requests.length > 0 && (
        <div className="space-y-4">
          {requests.map((req) => {
            const isPendingFaculty = req.status === "PENDING_FACULTY";
            const isPendingStaff = req.status === "PENDING_STAFF";
            const isApproved = req.status === "APPROVED";
            const isCancellableStatus = isPendingFaculty || isPendingStaff || isApproved;
            const isOwnRequest = user ? req.userId === user.id : false;
            const isFacultyApprover = user ? req.facultyId === user.id : false;
            const isActing = actingId === req.id;

            const canForward = currentRole === "FACULTY" && isPendingFaculty;
            const canApprove = currentRole === "STAFF" && isPendingStaff;
            const canReject =
              (currentRole === "FACULTY" && isPendingFaculty) ||
              (currentRole === "STAFF" && isPendingStaff);
            const canCancel =
              (currentRole === "ADMIN" || isOwnRequest || isFacultyApprover) &&
              isCancellableStatus;

            const hasActions = canForward || canApprove || canReject || canCancel;
            const requestedByLabel =
              req.userId === null
                ? "-"
                : (adminUserNameById[req.userId] ?? "Unknown User");
            const facultyApproverLabel =
              req.facultyId === null
                ? "Unassigned"
                : (adminUserNameById[req.facultyId] ?? "Unknown User");

            return (
              <Card key={req.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">
                      Room Booking Request
                    </CardTitle>
                    <Badge variant={statusBadgeVariant(req.status)}>
                      {STATUS_LABELS[req.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Request Details */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="font-semibold">Room:</span>{" "}
                      <span>{roomNameById.get(req.roomId) ?? "Unknown Room"}</span>
                    </div>
                    <div>
                      <span className="font-semibold">From:</span>{" "}
                      <span>{formatDateTimeDDMMYYYY(req.startAt)}</span>
                    </div>
                    <div>
                      <span className="font-semibold">To:</span>{" "}
                      <span>{formatDateTimeDDMMYYYY(req.endAt)}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Type:</span>{" "}
                      <span>{req.eventType.replace(/_/g, " ")}</span>
                    </div>
                    {req.participantCount !== null && (
                      <div>
                        <span className="font-semibold">Participants:</span>{" "}
                        <span>{req.participantCount}</span>
                      </div>
                    )}
                    {isAdmin && (
                      <>
                        <div>
                          <span className="font-semibold">Requested By:</span>{" "}
                          <span>{requestedByLabel}</span>
                        </div>
                        <div>
                          <span className="font-semibold">Faculty Approver:</span>{" "}
                          <span>{facultyApproverLabel}</span>
                        </div>
                        <div>
                          <span className="font-semibold">Created:</span>{" "}
                          <span>{formatDateTimeDDMMYYYY(req.createdAt)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Purpose */}
                  {req.purpose && (
                    <div className="border-t pt-3 text-sm">
                      <span className="font-semibold">Purpose:</span>{" "}
                      <p className="mt-1">💬 {req.purpose}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {hasActions && (
                    <div className="border-t pt-4 flex flex-wrap gap-2">
                      {canForward && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={isActing}
                          onClick={() =>
                            void runAction(req.id, () =>
                              forwardBookingRequest(req.id)
                            )
                          }
                        >
                          {isActing ? "Working…" : "Forward to Staff"}
                        </Button>
                      )}
                      {canApprove && (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          disabled={isActing}
                          onClick={() =>
                            void runAction(req.id, () =>
                              approveBookingRequest(req.id)
                            )
                          }
                        >
                          {isActing ? "Working…" : "Approve"}
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isActing}
                          onClick={() =>
                            void runAction(req.id, () =>
                              rejectBookingRequest(req.id)
                            )
                          }
                        >
                          {isActing ? "Working…" : "Reject"}
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isActing}
                          onClick={() =>
                            void runAction(req.id, () =>
                              cancelBookingRequest(req.id)
                            )
                          }
                        >
                          {isActing ? "Working…" : "Cancel"}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Edit Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {editRequests.length === 0 ? (
            <p className="text-gray-600">No edit requests found.</p>
          ) : (
            editRequests.map((editRequest) => {
              const isPending = editRequest.status === "PENDING";
              const isReviewer = currentRole === "ADMIN" || currentRole === "STAFF";
              const canReview = isReviewer && isPending;
              const originalBooking = bookingsById[editRequest.bookingId];
              const originalRoomLabel =
                originalBooking
                  ? roomNameById.get(originalBooking.roomId) ?? `Room #${originalBooking.roomId}`
                  : `Booking #${editRequest.bookingId}`;
              const proposedRoomLabel =
                editRequest.proposedRoomId === null
                  ? originalRoomLabel
                  : roomNameById.get(editRequest.proposedRoomId) ?? `Room #${editRequest.proposedRoomId}`;

              const originalStart = originalBooking?.startAt
                ? formatDateTimeDDMMYYYY(originalBooking.startAt)
                : "-";
              const originalEnd = originalBooking?.endAt
                ? formatDateTimeDDMMYYYY(originalBooking.endAt)
                : "-";
              const proposedStart = editRequest.proposedStartAt
                ? formatDateTimeDDMMYYYY(editRequest.proposedStartAt)
                : originalStart;
              const proposedEnd = editRequest.proposedEndAt
                ? formatDateTimeDDMMYYYY(editRequest.proposedEndAt)
                : originalEnd;
              const isActing = actingId === editRequest.id;

              return (
                <div key={editRequest.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Edit Request #{editRequest.id}</p>
                      <p className="text-sm text-gray-600">Booking #{editRequest.bookingId}</p>
                    </div>
                    <Badge variant={editRequest.status === "APPROVED" ? "default" : editRequest.status === "REJECTED" ? "destructive" : "secondary"}>
                      {editRequest.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md border p-3 bg-gray-50">
                      <p className="font-semibold mb-1">Original</p>
                      <p>Room: {originalRoomLabel}</p>
                      <p>From: {originalStart}</p>
                      <p>To: {originalEnd}</p>
                    </div>
                    <div className="rounded-md border p-3 bg-blue-50">
                      <p className="font-semibold mb-1">Proposed</p>
                      <p>Room: {proposedRoomLabel}</p>
                      <p>From: {proposedStart}</p>
                      <p>To: {proposedEnd}</p>
                    </div>
                  </div>

                  {canReview && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isActing}
                        onClick={() =>
                          void runEditRequestAction(editRequest.id, async () => {
                            await approveEditRequest(editRequest.id);
                            pushToast("success", "Edit request approved");
                          })
                        }
                      >
                        {isActing ? "Working…" : "Approve"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isActing}
                        onClick={() =>
                          void runEditRequestAction(editRequest.id, async () => {
                            await rejectEditRequest(editRequest.id);
                            pushToast("info", "Edit request rejected");
                          })
                        }
                      >
                        {isActing ? "Working…" : "Reject"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}