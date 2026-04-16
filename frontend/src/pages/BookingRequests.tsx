import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  approveBookingRequest,
  approveEditRequest,
  cancelBookingRequest,
  changeBookingRequest,
  createBookingRequest,
  forwardBookingRequest,
  getFacultyUsers,
  getBuildingMatrixAvailability,
  getManagedUsers,
  getBookingRequests,
  getBookings,
  getEditRequests,
  getRooms,
  getBuildings,
  getUserBuildingAssignments,
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
import { formatDateTimeDDMMYYYY, getCurrentISTDateInputValue } from "../utils/datetime";
import { formatError } from "../utils/formatError";
import { buildHolidayWarningPrompt, isHolidayWarningError } from "../utils/holidayWarning";
import { formatRoomDisplayWithBuildingsArray } from "../utils/room";
import { BuildingSelector } from "./components/BuildingSelector";
import { RoomAvailabilityCard } from "./components/RoomAvailabilityCard";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
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

const BOOKING_REQUESTS_PREFERENCES_KEY = "qol.bookingRequests.preferences.v1";
const RECENT_REQUESTS_LIMIT = 75;

type BookingRequestPreferences = {
  statusFilter: StatusFilter;
  roomId: number | null;
  facultyId: number | null;
  startAt: string;
  endAt: string;
  eventType: BookingEventType;
  purpose: string;
  participantCount: string;
};

const DEFAULT_BOOKING_REQUEST_PREFERENCES: BookingRequestPreferences = {
  statusFilter: "ALL",
  roomId: null,
  facultyId: null,
  startAt: "",
  endAt: "",
  eventType: "OTHER",
  purpose: "",
  participantCount: "",
};

const BAND_FINDER_SLOT_GRANULARITY_MINUTES = 15;

type BandFinderOption = {
  roomId: number;
  roomName: string;
  buildingId: number;
  buildingName: string;
  capacity: number | null;
  roomType: string | null;
  startAt: string;
  endAt: string;
};

type DayWindowRange = {
  date: string;
  startTime: string;
  endTime: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatLocalTimeKey(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatLocalDateTimeKey(date: Date): string {
  return `${formatLocalDateKey(date)}T${formatLocalTimeKey(date)}`;
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMinutesToLocalDateTime(value: string, minutes: number): string {
  const base = parseLocalDateTime(value);

  if (!base) {
    return value;
  }

  base.setMinutes(base.getMinutes() + minutes);

  return formatLocalDateTimeKey(base);
}

function getDefaultFinderWindow(): { fromAt: string; toAt: string } {
  const date = getCurrentISTDateInputValue();

  return {
    fromAt: `${date}T16:00`,
    toAt: `${date}T20:00`,
  };
}

function buildDayWindowRanges(startAt: Date, endAt: Date): DayWindowRange[] {
  const ranges: DayWindowRange[] = [];
  const cursor = new Date(startAt);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < endAt.getTime()) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const rangeStart =
      startAt.getTime() > dayStart.getTime() ? startAt : dayStart;
    const rangeEnd = endAt.getTime() < dayEnd.getTime() ? endAt : dayEnd;

    if (rangeStart.getTime() < rangeEnd.getTime()) {
      const isFullDaySlice = rangeEnd.getTime() === dayEnd.getTime();

      ranges.push({
        date: formatLocalDateKey(dayStart),
        startTime: formatLocalTimeKey(rangeStart),
        endTime: isFullDaySlice ? "23:59" : formatLocalTimeKey(rangeEnd),
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return ranges;
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return typeof value === "string" && (STATUS_OPTIONS as string[]).includes(value);
}

function isBookingEventType(value: unknown): value is BookingEventType {
  return typeof value === "string" && (EVENT_TYPE_OPTIONS as string[]).includes(value);
}

function readBookingRequestPreferences(): BookingRequestPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_BOOKING_REQUEST_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(BOOKING_REQUESTS_PREFERENCES_KEY);

    if (!raw) {
      return DEFAULT_BOOKING_REQUEST_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<BookingRequestPreferences>;

    return {
      statusFilter: isStatusFilter(parsed.statusFilter)
        ? parsed.statusFilter
        : "ALL",
      roomId:
        typeof parsed.roomId === "number" && Number.isFinite(parsed.roomId)
          ? parsed.roomId
          : null,
      facultyId:
        typeof parsed.facultyId === "number" && Number.isFinite(parsed.facultyId)
          ? parsed.facultyId
          : null,
      startAt: typeof parsed.startAt === "string" ? parsed.startAt : "",
      endAt: typeof parsed.endAt === "string" ? parsed.endAt : "",
      eventType: isBookingEventType(parsed.eventType)
        ? parsed.eventType
        : "OTHER",
      purpose: typeof parsed.purpose === "string" ? parsed.purpose : "",
      participantCount:
        typeof parsed.participantCount === "string" ? parsed.participantCount : "",
    };
  } catch {
    return DEFAULT_BOOKING_REQUEST_PREFERENCES;
  }
}

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

type ConflictGroup = {
  id: string;
  roomId: number;
  requests: BookingRequest[];
  windowStartAt: string;
  windowEndAt: string;
};

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareRequestsByStartThenCreated(a: BookingRequest, b: BookingRequest): number {
  const byStart = toTimestamp(a.startAt) - toTimestamp(b.startAt);
  if (byStart !== 0) {
    return byStart;
  }

  const byEnd = toTimestamp(a.endAt) - toTimestamp(b.endAt);
  if (byEnd !== 0) {
    return byEnd;
  }

  const byCreated = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
  if (byCreated !== 0) {
    return byCreated;
  }

  return a.id - b.id;
}

function buildConflictGroupsForReview(requests: BookingRequest[]): ConflictGroup[] {
  const reviewableRequests = requests.filter(
    (requestItem) => requestItem.status === "PENDING_STAFF",
  );

  const requestsByRoom = new Map<number, BookingRequest[]>();

  for (const requestItem of reviewableRequests) {
    const existing = requestsByRoom.get(requestItem.roomId) ?? [];
    existing.push(requestItem);
    requestsByRoom.set(requestItem.roomId, existing);
  }

  const groups: ConflictGroup[] = [];

  for (const [roomId, roomRequests] of requestsByRoom.entries()) {
    const sorted = [...roomRequests].sort(compareRequestsByStartThenCreated);
    let localGroupCounter = 1;

    let cluster: BookingRequest[] = [];
    let clusterEndTimestamp = -Infinity;

    const flushCluster = () => {
      if (cluster.length <= 1) {
        cluster = [];
        clusterEndTimestamp = -Infinity;
        return;
      }

      const sortedCluster = [...cluster].sort(compareRequestsByStartThenCreated);
      let windowEndRequest = sortedCluster[0];
      let maxEnd = toTimestamp(windowEndRequest.endAt);

      for (const requestItem of sortedCluster) {
        const endTs = toTimestamp(requestItem.endAt);
        if (endTs > maxEnd) {
          maxEnd = endTs;
          windowEndRequest = requestItem;
        }
      }

      groups.push({
        id: `${roomId}-${localGroupCounter}`,
        roomId,
        requests: sortedCluster,
        windowStartAt: sortedCluster[0].startAt,
        windowEndAt: windowEndRequest.endAt,
      });

      localGroupCounter += 1;
      cluster = [];
      clusterEndTimestamp = -Infinity;
    };

    for (const requestItem of sorted) {
      const startTs = toTimestamp(requestItem.startAt);
      const endTs = Math.max(toTimestamp(requestItem.endAt), startTs + 1);

      if (cluster.length === 0) {
        cluster = [requestItem];
        clusterEndTimestamp = endTs;
        continue;
      }

      if (startTs < clusterEndTimestamp) {
        cluster.push(requestItem);
        clusterEndTimestamp = Math.max(clusterEndTimestamp, endTs);
        continue;
      }

      flushCluster();
      cluster = [requestItem];
      clusterEndTimestamp = endTs;
    }

    flushCluster();
  }

  return groups.sort((a, b) => {
    const byStart = toTimestamp(a.windowStartAt) - toTimestamp(b.windowStartAt);
    if (byStart !== 0) {
      return byStart;
    }

    const bySize = b.requests.length - a.requests.length;
    if (bySize !== 0) {
      return bySize;
    }

    return a.roomId - b.roomId;
  });
}

type BookingRequestsPageProps = {
  prefill?: BookingRequestPrefill | null;
  onPrefillApplied?: () => void;
  onOpenAvailability?: (prefill: AvailabilityPrefill) => void;
};

type BookingRequestsSection =
  | "requests"
  | "finder"
  | "new-request"
  | "edit-requests";

export function BookingRequestsPage({
  prefill,
  onPrefillApplied,
  onOpenAvailability,
}: BookingRequestsPageProps) {
  const [initialPreferences] = useState<BookingRequestPreferences>(() =>
    readBookingRequestPreferences(),
  );
  const [hasRequestedFullRequests, setHasRequestedFullRequests] = useState(false);
  const { user } = useAuth();
  const { pushToast } = useToast();
  const location = useLocation();
  const currentRole = user?.role ?? null;
  const isAdmin = currentRole === "ADMIN";
  const isStaff = currentRole === "STAFF";
  const isStudent = currentRole === "STUDENT";
  const canDirectReviewQueue = isAdmin || isStaff;
  const canCreate =
    currentRole === "STUDENT" || currentRole === "FACULTY" || currentRole === "STAFF";

  // Get prefill from location state if available
  const locationPrefill = (location.state as any)?.prefill as BookingRequestPrefill | undefined;

  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [facultyUsers, setFacultyUsers] = useState<FacultyUser[]>([]);
  const [editRequests, setEditRequests] = useState<BookingEditRequest[]>([]);
  const [reviewQueueRequests, setReviewQueueRequests] = useState<BookingRequest[]>([]);
  const [bookingsById, setBookingsById] = useState<Record<number, Booking>>({});
  const [adminUserNameById, setAdminUserNameById] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialPreferences.statusFilter);

  const isRecentRequestsMode =
    !canDirectReviewQueue &&
    !hasRequestedFullRequests &&
    statusFilter === "ALL";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSourceRequestId, setEditingSourceRequestId] = useState<number | null>(null);

  const [roomId, setRoomId] = useState<number | "">(initialPreferences.roomId ?? "");
  const [facultyId, setFacultyId] = useState<number | "">(initialPreferences.facultyId ?? "");
  const [startAt, setStartAt] = useState(initialPreferences.startAt);
  const [endAt, setEndAt] = useState(initialPreferences.endAt);
  const [eventType, setEventType] = useState<BookingEventType>(initialPreferences.eventType);
  const [purpose, setPurpose] = useState(initialPreferences.purpose);
  const [participantCount, setParticipantCount] = useState(initialPreferences.participantCount);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);

  const [staffBuildingIds, setStaffBuildingIds] = useState<number[]>([]);

  const [finderWindowDefaults] = useState(() => getDefaultFinderWindow());
  const [finderFromAt, setFinderFromAt] = useState(finderWindowDefaults.fromAt);
  const [finderToAt, setFinderToAt] = useState(finderWindowDefaults.toAt);
  const [finderBandMinutes, setFinderBandMinutes] = useState<number>(60);
  const [finderRequiredBandMinutes, setFinderRequiredBandMinutes] = useState<number>(60);
  const [finderMinCapacity, setFinderMinCapacity] = useState("");
  const [finderBuildingIds, setFinderBuildingIds] = useState<number[]>([]);
  const [finderBuildingsInitialized, setFinderBuildingsInitialized] = useState(false);
  const [finderOptions, setFinderOptions] = useState<BandFinderOption[]>([]);
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderError, setFinderError] = useState<string | null>(null);
  const [finderNotice, setFinderNotice] = useState<string | null>(null);
  const [finderSelectedBand, setFinderSelectedBand] = useState<BandFinderOption | null>(null);
  const [finderSelectedStartAt, setFinderSelectedStartAt] = useState("");
  const [finderSelectedEndAt, setFinderSelectedEndAt] = useState("");
  const [finderSelectedError, setFinderSelectedError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<BookingRequestsSection>("requests");
  const [showConflictOnly, setShowConflictOnly] = useState(false);
  const [focusedConflictGroupId, setFocusedConflictGroupId] = useState<string | null>(null);

  const conflictGroups = useMemo(
    () => (canDirectReviewQueue ? buildConflictGroupsForReview(reviewQueueRequests) : []),
    [canDirectReviewQueue, reviewQueueRequests],
  );

  const conflictGroupById = useMemo(
    () => new Map(conflictGroups.map((group) => [group.id, group])),
    [conflictGroups],
  );

  const conflictGroupOrdinalById = useMemo(() => {
    const ordinalMap = new Map<string, number>();
    conflictGroups.forEach((group, index) => {
      ordinalMap.set(group.id, index + 1);
    });
    return ordinalMap;
  }, [conflictGroups]);

  const requestConflictGroupById = useMemo(() => {
    const mapping = new Map<number, string>();

    for (const group of conflictGroups) {
      for (const requestItem of group.requests) {
        mapping.set(requestItem.id, group.id);
      }
    }

    return mapping;
  }, [conflictGroups]);

  const reviewablePendingCount = reviewQueueRequests.length;

  const conflictRequestIdSet = useMemo(
    () => new Set(requestConflictGroupById.keys()),
    [requestConflictGroupById],
  );

  const nonConflictingPendingCount = Math.max(
    reviewablePendingCount - conflictRequestIdSet.size,
    0,
  );

  const requestsForDisplay = useMemo(() => {
    let filtered = requests;

    if (focusedConflictGroupId) {
      const focusedGroup = conflictGroupById.get(focusedConflictGroupId);

      if (!focusedGroup) {
        return [];
      }

      const focusedIds = new Set(focusedGroup.requests.map((requestItem) => requestItem.id));
      filtered = filtered.filter((requestItem) => focusedIds.has(requestItem.id));
    } else if (showConflictOnly && canDirectReviewQueue) {
      filtered = filtered.filter((requestItem) =>
        conflictRequestIdSet.has(requestItem.id),
      );
    }

    return [...filtered].sort((a, b) => {
      const groupIdA = requestConflictGroupById.get(a.id) ?? null;
      const groupIdB = requestConflictGroupById.get(b.id) ?? null;

      if (groupIdA && groupIdB) {
        if (groupIdA !== groupIdB) {
          const groupA = conflictGroupById.get(groupIdA);
          const groupB = conflictGroupById.get(groupIdB);

          if (groupA && groupB) {
            const byWindow = toTimestamp(groupA.windowStartAt) - toTimestamp(groupB.windowStartAt);
            if (byWindow !== 0) {
              return byWindow;
            }

            const byGroupSize = groupB.requests.length - groupA.requests.length;
            if (byGroupSize !== 0) {
              return byGroupSize;
            }
          }

          return groupIdA.localeCompare(groupIdB);
        }

        return compareRequestsByStartThenCreated(a, b);
      }

      if (groupIdA && !groupIdB) {
        return -1;
      }

      if (!groupIdA && groupIdB) {
        return 1;
      }

      const byCreated = toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
      if (byCreated !== 0) {
        return byCreated;
      }

      return b.id - a.id;
    });
  }, [
    canDirectReviewQueue,
    conflictGroupById,
    conflictRequestIdSet,
    focusedConflictGroupId,
    requestConflictGroupById,
    requests,
    showConflictOnly,
  ]);

  const firstVisibleRequestIdByGroup = useMemo(() => {
    const firstByGroup = new Map<string, number>();

    for (const requestItem of requestsForDisplay) {
      const groupId = requestConflictGroupById.get(requestItem.id);

      if (groupId && !firstByGroup.has(groupId)) {
        firstByGroup.set(groupId, requestItem.id);
      }
    }

    return firstByGroup;
  }, [requestConflictGroupById, requestsForDisplay]);

  useEffect(() => {
    if (
      !canCreate &&
      (activeSection === "finder" || activeSection === "new-request")
    ) {
      setActiveSection("requests");
    }
  }, [activeSection, canCreate]);

  useEffect(() => {
    if (!canDirectReviewQueue) {
      setShowConflictOnly(false);
      setFocusedConflictGroupId(null);
      return;
    }

    if (focusedConflictGroupId && !conflictGroupById.has(focusedConflictGroupId)) {
      setFocusedConflictGroupId(null);
    }
  }, [canDirectReviewQueue, conflictGroupById, focusedConflictGroupId]);

  useEffect(() => {
    if (!canDirectReviewQueue) {
      return;
    }

    if ((showConflictOnly || focusedConflictGroupId) && statusFilter !== "PENDING_STAFF") {
      setStatusFilter("PENDING_STAFF");
    }

    if (showConflictOnly || focusedConflictGroupId) {
      setHasRequestedFullRequests(true);
    }
  }, [
    canDirectReviewQueue,
    focusedConflictGroupId,
    showConflictOnly,
    statusFilter,
  ]);

  const roomNameById = new Map(rooms.map((r) => [r.id, formatRoomDisplayWithBuildingsArray(r, buildings)]));
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
  const visibleFinderBuildings = useMemo(
    () =>
      isStaff
        ? buildings.filter((building) => staffBuildingIds.includes(building.id))
        : buildings,
    [buildings, isStaff, staffBuildingIds],
  );

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
      const [rows, pendingStaffRows] = await Promise.all([
        filter === "ALL"
          ? getBookingRequests()
          : getBookingRequests(filter),
        canDirectReviewQueue
          ? getBookingRequests("PENDING_STAFF")
          : Promise.resolve([] as BookingRequest[]),
      ]);

      setRequests(
        filter === "ALL" && isRecentRequestsMode
          ? rows.slice(0, RECENT_REQUESTS_LIMIT)
          : rows,
      );
      setReviewQueueRequests(pendingStaffRows);
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

      if (isStudent) {
        await loadFacultyUsers();
      } else {
        setFacultyUsers([]);
        setFacultyId("");
      }
    })();
  }, [isStudent]);

  useEffect(() => {
    if (activeSection !== "edit-requests") {
      return;
    }

    void loadEditRequests();
  }, [activeSection]);

  useEffect(() => {
    void loadRequests(statusFilter);
  }, [canDirectReviewQueue, statusFilter, isRecentRequestsMode]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminUserNameById({});
      return;
    }

    void loadAdminUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!isStaff || !user) {
      setStaffBuildingIds([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await getUserBuildingAssignments(user.id);
        if (!cancelled) {
          setStaffBuildingIds(response.buildingIds);
        }
      } catch {
        if (!cancelled) {
          setStaffBuildingIds([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isStaff, user]);

  useEffect(() => {
    const visibleBuildingIdSet = new Set(visibleFinderBuildings.map((building) => building.id));
    setFinderBuildingIds((prev) => prev.filter((id) => visibleBuildingIdSet.has(id)));
  }, [visibleFinderBuildings]);

  useEffect(() => {
    if (finderBuildingsInitialized || visibleFinderBuildings.length === 0) {
      return;
    }

    setFinderBuildingIds(visibleFinderBuildings.map((building) => building.id));
    setFinderBuildingsInitialized(true);
  }, [finderBuildingsInitialized, visibleFinderBuildings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: BookingRequestPreferences = {
      statusFilter,
      roomId: roomId === "" ? null : roomId,
      facultyId: facultyId === "" ? null : facultyId,
      startAt,
      endAt,
      eventType,
      purpose,
      participantCount,
    };

    window.localStorage.setItem(
      BOOKING_REQUESTS_PREFERENCES_KEY,
      JSON.stringify(payload),
    );
  }, [statusFilter, roomId, facultyId, startAt, endAt, eventType, purpose, participantCount]);

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
    setEditingSourceRequestId(null);
    setError(null);
    setPrefillMessage("Form prefilled from availability results.");
    onPrefillApplied?.();
  }, [onPrefillApplied, prefill, locationPrefill]);

  const handleFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
  };

  const clearRequestForm = () => {
    setRoomId("");
    setFacultyId("");
    setStartAt("");
    setEndAt("");
    setEventType("OTHER");
    setPurpose("");
    setParticipantCount("");
    setEditingSourceRequestId(null);
    setPrefillMessage(null);
  };

  const beginEditRequest = (requestToEdit: BookingRequest) => {
    setRoomId(requestToEdit.roomId);
    setFacultyId(requestToEdit.facultyId ?? "");
    setStartAt(requestToEdit.startAt);
    setEndAt(requestToEdit.endAt);
    setEventType(requestToEdit.eventType);
    setPurpose(requestToEdit.purpose);
    setParticipantCount(
      requestToEdit.participantCount === null ? "" : String(requestToEdit.participantCount),
    );
    setEditingSourceRequestId(requestToEdit.id);
    setError(null);
    setPrefillMessage(
      `Editing request #${requestToEdit.id}. Save changes to update directly when allowed, otherwise submit for re-approval.`,
    );
    setActiveSection("new-request");
  };

  const handleOpenFinderSelection = (option: BandFinderOption) => {
    const suggestedEnd = addMinutesToLocalDateTime(option.startAt, finderRequiredBandMinutes);
    const suggestedEndDate = parseLocalDateTime(suggestedEnd);
    const bandEndDate = parseLocalDateTime(option.endAt);

    setFinderSelectedBand(option);
    setFinderSelectedStartAt(option.startAt);
    setFinderSelectedEndAt(
      suggestedEndDate && bandEndDate && suggestedEndDate.getTime() > bandEndDate.getTime()
        ? option.endAt
        : suggestedEnd,
    );
    setFinderSelectedError(null);
  };

  const closeFinderSelection = () => {
    setFinderSelectedBand(null);
    setFinderSelectedStartAt("");
    setFinderSelectedEndAt("");
    setFinderSelectedError(null);
  };

  const handleApplyFinderSelection = () => {
    if (!finderSelectedBand) {
      return;
    }

    const selectedStart = parseLocalDateTime(finderSelectedStartAt);
    const selectedEnd = parseLocalDateTime(finderSelectedEndAt);
    const bandStart = parseLocalDateTime(finderSelectedBand.startAt);
    const bandEnd = parseLocalDateTime(finderSelectedBand.endAt);

    if (!selectedStart || !selectedEnd || !bandStart || !bandEnd) {
      setFinderSelectedError("Select valid start and end date-time values.");
      return;
    }

    if (selectedStart.getTime() >= selectedEnd.getTime()) {
      setFinderSelectedError("To must be after From.");
      return;
    }

    if (
      selectedStart.getTime() < bandStart.getTime() ||
      selectedEnd.getTime() > bandEnd.getTime()
    ) {
      setFinderSelectedError("Selected range must stay inside the available contiguous band.");
      return;
    }

    const selectedDurationMinutes = Math.floor(
      (selectedEnd.getTime() - selectedStart.getTime()) / (1000 * 60),
    );

    if (selectedDurationMinutes < finderRequiredBandMinutes) {
      setFinderSelectedError(
        `Selected range must be at least ${finderRequiredBandMinutes} minutes.`,
      );
      return;
    }

    setRoomId(finderSelectedBand.roomId);
    setStartAt(finderSelectedStartAt);
    setEndAt(finderSelectedEndAt);
    setFinderOptions([]);
    setFinderNotice(null);
    setFinderError(null);
    setError(null);
    setPrefillMessage(
      `Form prefilled from time-band finder: ${finderSelectedBand.buildingName} - ${finderSelectedBand.roomName} (${formatDateTimeDDMMYYYY(finderSelectedStartAt)} to ${formatDateTimeDDMMYYYY(finderSelectedEndAt)}).`,
    );
    closeFinderSelection();
  };

  const resetBandFinder = () => {
    const defaults = getDefaultFinderWindow();
    setFinderFromAt(defaults.fromAt);
    setFinderToAt(defaults.toAt);
    setFinderBandMinutes(60);
    setFinderRequiredBandMinutes(60);
    setFinderMinCapacity("");
    setFinderOptions([]);
    setFinderError(null);
    setFinderNotice(null);
    setFinderBuildingIds(visibleFinderBuildings.map((building) => building.id));
    closeFinderSelection();
  };

  const handleBandFinderSearch = async () => {
    setFinderError(null);
    setFinderNotice(null);
    setFinderOptions([]);
    closeFinderSelection();

    if (!finderFromAt || !finderToAt) {
      setFinderError("From and To date-time values are required.");
      return;
    }

    if (finderBuildingIds.length === 0) {
      setFinderError("Select at least one building.");
      return;
    }

    const windowStart = parseLocalDateTime(finderFromAt);
    const windowEnd = parseLocalDateTime(finderToAt);

    if (!windowStart || !windowEnd || windowStart.getTime() >= windowEnd.getTime()) {
      setFinderError("Time range is invalid. To must be after From.");
      return;
    }

    const requestedBandMinutes = Number(finderBandMinutes);
    if (
      !Number.isInteger(requestedBandMinutes) ||
      requestedBandMinutes < 1
    ) {
      setFinderError("Band duration must be at least 1 minute.");
      return;
    }

    const windowDurationMinutes = Math.floor(
      (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60),
    );

    if (requestedBandMinutes > windowDurationMinutes) {
      setFinderError("Band duration exceeds the selected time range.");
      return;
    }

    const parsedMinCapacity =
      finderMinCapacity.trim().length > 0 ? Number(finderMinCapacity) : null;

    if (
      parsedMinCapacity !== null &&
      (!Number.isInteger(parsedMinCapacity) || parsedMinCapacity <= 0)
    ) {
      setFinderError("Minimum capacity must be a positive integer.");
      return;
    }

    setFinderLoading(true);
    setFinderRequiredBandMinutes(requestedBandMinutes);

    try {
      const dayRanges = buildDayWindowRanges(windowStart, windowEnd);

      if (dayRanges.length === 0) {
        setFinderError("No valid day ranges found for the selected window.");
        return;
      }

      const matrixResults = await Promise.all(
        finderBuildingIds.flatMap((buildingId) =>
          dayRanges.map(async (range) => {
            try {
              const matrixReport = await getBuildingMatrixAvailability(
                buildingId,
                range.date,
                range.startTime,
                range.endTime,
                BAND_FINDER_SLOT_GRANULARITY_MINUTES,
              );

              return {
                buildingId,
                matrixReport,
                failed: false as const,
              };
            } catch {
              return {
                buildingId,
                matrixReport: null,
                failed: true as const,
              };
            }
          }),
        ),
      );

      const failedBuildingIds = new Set<number>();
      const timelineByRoom = new Map<
        string,
        {
          roomId: number;
          roomName: string;
          buildingId: number;
          buildingName: string;
          capacity: number | null;
          roomType: string | null;
          slotStatusByStartAt: Map<string, "available" | "booked">;
        }
      >();

      for (const result of matrixResults) {
        if (result.failed || !result.matrixReport) {
          failedBuildingIds.add(result.buildingId);
          continue;
        }

        const matrixReport = result.matrixReport;

        for (const matrixRoom of matrixReport.matrix) {
          const roomMeta = roomById.get(matrixRoom.roomId);

          if (parsedMinCapacity !== null) {
            const roomCapacity = roomMeta?.capacity;
            if (
              roomCapacity === null ||
              roomCapacity === undefined ||
              roomCapacity < parsedMinCapacity
            ) {
              continue;
            }
          }

          const roomKey = `${matrixReport.buildingId}-${matrixRoom.roomId}`;
          let roomTimeline = timelineByRoom.get(roomKey);

          if (!roomTimeline) {
            roomTimeline = {
              roomId: matrixRoom.roomId,
              roomName: matrixRoom.roomName,
              buildingId: matrixReport.buildingId,
              buildingName: matrixReport.buildingName,
              capacity: roomMeta?.capacity ?? null,
              roomType: roomMeta?.roomType ?? null,
              slotStatusByStartAt: new Map(),
            };

            timelineByRoom.set(roomKey, roomTimeline);
          }

          for (const slot of matrixRoom.slots) {
            const slotStartAt = `${matrixReport.date}T${slot.time}`;
            const existingStatus = roomTimeline.slotStatusByStartAt.get(slotStartAt);

            if (!existingStatus || slot.status === "booked") {
              roomTimeline.slotStatusByStartAt.set(slotStartAt, slot.status);
            }
          }
        }
      }

      const rawOptions: BandFinderOption[] = [];

      for (const timeline of timelineByRoom.values()) {
        const sortedSlots = Array.from(timeline.slotStatusByStartAt.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        );

        let currentRunStart: Date | null = null;
        let previousAvailableSlotStart: Date | null = null;

        const pushCurrentRunIfEligible = () => {
          if (!currentRunStart || !previousAvailableSlotStart) {
            currentRunStart = null;
            previousAvailableSlotStart = null;
            return;
          }

          const runEnd = new Date(previousAvailableSlotStart);
          runEnd.setMinutes(runEnd.getMinutes() + BAND_FINDER_SLOT_GRANULARITY_MINUTES);

          const runDurationMinutes = Math.floor(
            (runEnd.getTime() - currentRunStart.getTime()) / (1000 * 60),
          );

          if (runDurationMinutes >= requestedBandMinutes) {
            rawOptions.push({
              roomId: timeline.roomId,
              roomName: timeline.roomName,
              buildingId: timeline.buildingId,
              buildingName: timeline.buildingName,
              capacity: timeline.capacity,
              roomType: timeline.roomType,
              startAt: formatLocalDateTimeKey(currentRunStart),
              endAt: formatLocalDateTimeKey(runEnd),
            });
          }

          currentRunStart = null;
          previousAvailableSlotStart = null;
        };

        for (const [slotStartAt, status] of sortedSlots) {
          const slotStart = parseLocalDateTime(slotStartAt);

          if (!slotStart) {
            continue;
          }

          if (status !== "available") {
            pushCurrentRunIfEligible();
            continue;
          }

          if (!currentRunStart || !previousAvailableSlotStart) {
            currentRunStart = slotStart;
            previousAvailableSlotStart = slotStart;
            continue;
          }

          const gapMinutes = Math.floor(
            (slotStart.getTime() - previousAvailableSlotStart.getTime()) / (1000 * 60),
          );

          if (gapMinutes === BAND_FINDER_SLOT_GRANULARITY_MINUTES) {
            previousAvailableSlotStart = slotStart;
            continue;
          }

          pushCurrentRunIfEligible();
          currentRunStart = slotStart;
          previousAvailableSlotStart = slotStart;
        }

        pushCurrentRunIfEligible();
      }

      const dedupedOptions = Array.from(
        rawOptions.reduce((map, option) => {
          const key = `${option.roomId}-${option.startAt}-${option.endAt}`;
          if (!map.has(key)) {
            map.set(key, option);
          }
          return map;
        }, new Map<string, BandFinderOption>()),
      )
        .map(([, option]) => option)
        .sort((a, b) => {
          const byStart = a.startAt.localeCompare(b.startAt);
          if (byStart !== 0) return byStart;

          const byBuilding = a.buildingName.localeCompare(b.buildingName);
          if (byBuilding !== 0) return byBuilding;

          return a.roomName.localeCompare(b.roomName);
        });

      setFinderOptions(dedupedOptions);

      if (dedupedOptions.length === 0) {
        setFinderNotice(
          "No contiguous bands found for the selected constraints.",
        );
      } else if (failedBuildingIds.size > 0) {
        setFinderNotice(
          `Found ${dedupedOptions.length} option(s). Data for ${failedBuildingIds.size} selected building(s) could not be loaded completely.`,
        );
      } else {
        setFinderNotice(`Found ${dedupedOptions.length} option(s).`);
      }
    } catch (searchError) {
      setFinderError(formatError(searchError, "Failed to search band options"));
    } finally {
      setFinderLoading(false);
    }
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

      if (editingSourceRequestId !== null) {
        const applyRequestChange = async (overrideHolidayWarning?: boolean) =>
          changeBookingRequest({
            sourceRequestId: editingSourceRequestId,
            ...payload,
            ...(overrideHolidayWarning ? { overrideHolidayWarning: true } : {}),
          });

        let changeResult;

        try {
          changeResult = await applyRequestChange();
        } catch (error) {
          if (!isHolidayWarningError(error)) {
            throw error;
          }

          const continueAnyway = window.confirm(buildHolidayWarningPrompt(error));

          if (!continueAnyway) {
            return;
          }

          changeResult = await applyRequestChange(true);
        }

        if (changeResult.mode === "UPDATED_EXISTING_REQUEST") {
          pushToast("success", "Request updated successfully");
        } else {
          pushToast("info", "Request changes submitted for re-approval");
        }
      } else {
        try {
          await createBookingRequest(payload);
        } catch (error) {
          if (!isHolidayWarningError(error)) {
            throw error;
          }

          const continueAnyway = window.confirm(buildHolidayWarningPrompt(error));

          if (!continueAnyway) {
            return;
          }

          await createBookingRequest({
            ...payload,
            overrideHolidayWarning: true,
          });
        }
      }

      clearRequestForm();
      await loadRequests(statusFilter);
      setActiveSection("requests");
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
      if (activeSection === "edit-requests") {
        await loadEditRequests();
      }
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

  const handleApproveRequest = async (requestId: number) => {
    setActingId(requestId);
    setError(null);

    try {
      try {
        await approveBookingRequest(requestId);
      } catch (error) {
        if (!isHolidayWarningError(error)) {
          throw error;
        }

        const continueAnyway = window.confirm(buildHolidayWarningPrompt(error));

        if (!continueAnyway) {
          return;
        }

        await approveBookingRequest(requestId, {
          overrideHolidayWarning: true,
        });
      }

      await loadRequests(statusFilter);
      if (activeSection === "edit-requests") {
        await loadEditRequests();
      }
    } catch (error) {
      setError(formatError(error, "Action failed"));
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

      {isRecentRequestsMode && (
        <div className="alert">
          Showing recent booking requests (up to {RECENT_REQUESTS_LIMIT} rows). Use filters for targeted views, or load more when needed.
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "var(--space-2)" }}
            onClick={() => setHasRequestedFullRequests(true)}
          >
            Load More Requests
          </button>
        </div>
      )}

      {!isRecentRequestsMode &&
        statusFilter === "ALL" &&
        hasRequestedFullRequests && (
          <div className="alert">
            Showing full booking request history.
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "var(--space-2)" }}
              onClick={() => setHasRequestedFullRequests(false)}
            >
              Switch To Recent View
            </button>
          </div>
        )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activeSection === "requests" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveSection("requests")}
        >
          Requests
        </Button>
        {canCreate && (
          <>
            <Button
              type="button"
              variant={activeSection === "finder" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveSection("finder")}
            >
              Time-Band Finder
            </Button>
            <Button
              type="button"
              variant={activeSection === "new-request" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveSection("new-request")}
            >
              New Request
            </Button>
          </>
        )}
        <Button
          type="button"
          variant={activeSection === "edit-requests" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveSection("edit-requests")}
        >
          Edit Requests
        </Button>
      </div>

      {/* Filter Chips */}
      {activeSection === "requests" && (
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={statusFilter === "ALL"}
            onClick={() => setStatusFilter("ALL")}
          >
            Reset Filter
          </Button>
        </div>
      )}

      {activeSection === "requests" && canDirectReviewQueue && (
        <Card>
          <CardHeader>
            <CardTitle>Conflict Review Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                Pending Staff Review: {reviewablePendingCount}
              </Badge>
              <Badge variant={conflictGroups.length > 0 ? "destructive" : "outline"}>
                Conflict Groups: {conflictGroups.length}
              </Badge>
              <Badge variant={conflictRequestIdSet.size > 0 ? "destructive" : "outline"}>
                Conflicting Requests: {conflictRequestIdSet.size}
              </Badge>
              <Badge variant="outline">
                Non-Conflicting Pending: {nonConflictingPendingCount}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={showConflictOnly ? "default" : "outline"}
                onClick={() => {
                  if (!showConflictOnly) {
                    setStatusFilter("PENDING_STAFF");
                    setHasRequestedFullRequests(true);
                  }
                  setFocusedConflictGroupId(null);
                  setShowConflictOnly((current) => !current);
                }}
              >
                {showConflictOnly ? "Show All Requests" : "Show Conflicts Only"}
              </Button>

              <Button
                type="button"
                size="sm"
                variant={statusFilter === "PENDING_STAFF" ? "default" : "outline"}
                onClick={() => {
                  setShowConflictOnly(false);
                  setFocusedConflictGroupId(null);
                  setHasRequestedFullRequests(true);
                  setStatusFilter("PENDING_STAFF");
                }}
              >
                Pending Staff Only
              </Button>

              {statusFilter !== "ALL" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowConflictOnly(false);
                    setFocusedConflictGroupId(null);
                    setStatusFilter("ALL");
                  }}
                >
                  Reset To All Statuses
                </Button>
              )}

              {focusedConflictGroupId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFocusedConflictGroupId(null)}
                >
                  Clear Group Focus
                </Button>
              )}
            </div>

            {conflictGroups.length === 0 ? (
              <p className="text-sm text-gray-600">
                No overlapping pending requests right now.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {conflictGroups.map((group) => {
                  const ordinal = conflictGroupOrdinalById.get(group.id) ?? 0;
                  const roomLabel =
                    roomNameById.get(group.roomId) ?? `Room #${group.roomId}`;

                  return (
                    <Button
                      key={group.id}
                      type="button"
                      size="sm"
                      variant={focusedConflictGroupId === group.id ? "default" : "outline"}
                      onClick={() => {
                        setStatusFilter("PENDING_STAFF");
                        setHasRequestedFullRequests(true);
                        setShowConflictOnly(false);
                        setFocusedConflictGroupId((current) =>
                          current === group.id ? null : group.id,
                        );
                      }}
                    >
                      Group {ordinal}: {roomLabel} ({group.requests.length})
                    </Button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Time-Band Finder */}
      {canCreate && activeSection === "finder" && (
        <Card>
          <CardHeader>
            <CardTitle>Find Available Time Bands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="finderFromAt">From</Label>
                <DateInput
                  id="finderFromAt"
                  mode="datetime"
                  value={finderFromAt}
                  onChange={setFinderFromAt}
                  disabled={finderLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="finderToAt">To</Label>
                <DateInput
                  id="finderToAt"
                  mode="datetime"
                  value={finderToAt}
                  onChange={setFinderToAt}
                  disabled={finderLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="finderBandMinutes">Band Duration (minutes)</Label>
                <Input
                  id="finderBandMinutes"
                  type="number"
                  min={1}
                  step={1}
                  value={finderBandMinutes}
                  onChange={(event) => setFinderBandMinutes(Number(event.target.value || 0))}
                  disabled={finderLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="finderMinCapacity">Minimum Capacity</Label>
                <Input
                  id="finderMinCapacity"
                  type="number"
                  min={1}
                  step={1}
                  value={finderMinCapacity}
                  onChange={(event) => setFinderMinCapacity(event.target.value)}
                  placeholder="Optional"
                  disabled={finderLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">Allowed Buildings</p>
              <p className="text-xs text-gray-500">Select one or more buildings to search room options.</p>
              {visibleFinderBuildings.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No buildings available for this account.
                </p>
              ) : (
                <BuildingSelector
                  buildings={visibleFinderBuildings}
                  selectedBuildingIds={finderBuildingIds}
                  onSelectionChange={setFinderBuildingIds}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleBandFinderSearch()}
                disabled={finderLoading || visibleFinderBuildings.length === 0}
              >
                {finderLoading ? "Searching..." : "Search Options"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetBandFinder}
                disabled={finderLoading}
              >
                Reset Finder
              </Button>
            </div>

            {finderError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
                {finderError}
              </div>
            )}

            {finderNotice && !finderError && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-md">
                {finderNotice}
              </div>
            )}

            {finderOptions.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Click a card to choose exact From and To date-times before prefilling the request form.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {finderOptions.map((option) => (
                    <RoomAvailabilityCard
                      key={`${option.roomId}-${option.startAt}-${option.endAt}`}
                      room={{
                        id: option.roomId,
                        name: option.roomName,
                        capacity: option.capacity,
                        roomType: option.roomType,
                      }}
                      buildingName={option.buildingName}
                      isFullyAvailable={true}
                      availableFrom={formatDateTimeDDMMYYYY(option.startAt)}
                      availableTo={formatDateTimeDDMMYYYY(option.endAt)}
                      onClick={() => handleOpenFinderSelection(option)}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={Boolean(finderSelectedBand)}
        onOpenChange={(open) => {
          if (!open) {
            closeFinderSelection();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Select Request Time Range</DialogTitle>
            <DialogDescription>
              Choose a start and end date-time inside the selected contiguous availability band.
            </DialogDescription>
          </DialogHeader>

          {finderSelectedBand && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {finderSelectedBand.buildingName} - {finderSelectedBand.roomName}
                </p>
                <p className="text-slate-600 mt-1">
                  Available window: {formatDateTimeDDMMYYYY(finderSelectedBand.startAt)} to {formatDateTimeDDMMYYYY(finderSelectedBand.endAt)}
                </p>
                <p className="text-slate-600 mt-1">
                  Required minimum duration: {finderRequiredBandMinutes} minutes
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="finderSelectedStartAt">From</Label>
                  <DateInput
                    id="finderSelectedStartAt"
                    mode="datetime"
                    value={finderSelectedStartAt}
                    onChange={setFinderSelectedStartAt}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="finderSelectedEndAt">To</Label>
                  <DateInput
                    id="finderSelectedEndAt"
                    mode="datetime"
                    value={finderSelectedEndAt}
                    onChange={setFinderSelectedEndAt}
                  />
                </div>
              </div>

              {finderSelectedError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
                  {finderSelectedError}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeFinderSelection}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApplyFinderSelection}>
              Proceed with Prefill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Form */}
      {canCreate && activeSection === "new-request" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingSourceRequestId === null
                ? "New Request"
                : `Edit Request #${editingSourceRequestId}`}
            </CardTitle>
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
                  {isSubmitting
                    ? "Submitting..."
                    : editingSourceRequestId === null
                      ? "Submit Request"
                      : "Save Request Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={handleCheckAvailability}
                >
                  Check Availability
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={clearRequestForm}
                >
                  {editingSourceRequestId === null ? "Clear Form" : "Cancel Edit"}
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
      {activeSection === "requests" && loading && (
        <p className="text-gray-600 text-center py-8">Loading requests...</p>
      )}
      {activeSection === "requests" && !loading && requestsForDisplay.length === 0 && (
        <p className="text-gray-600 text-center py-8">
          {focusedConflictGroupId || showConflictOnly
            ? "No booking requests match the current conflict review filters."
            : "No booking requests found."}
        </p>
      )}

      {/* Requests List */}
      {activeSection === "requests" && !loading && requestsForDisplay.length > 0 && (
        <div className="space-y-4">
          {requestsForDisplay.map((req) => {
            const isPendingFaculty = req.status === "PENDING_FACULTY";
            const isPendingStaff = req.status === "PENDING_STAFF";
            const isApproved = req.status === "APPROVED";
            const isCancellableStatus = isPendingFaculty || isPendingStaff || isApproved;
            const isOwnRequest = user ? req.userId === user.id : false;
            const isFacultyApprover = user ? req.facultyId === user.id : false;
            const isActing = actingId === req.id;
            const conflictGroupId = requestConflictGroupById.get(req.id) ?? null;
            const conflictGroup =
              conflictGroupId === null
                ? null
                : conflictGroupById.get(conflictGroupId) ?? null;
            const conflictGroupOrdinal =
              conflictGroupId === null
                ? null
                : conflictGroupOrdinalById.get(conflictGroupId) ?? null;
            const isFirstVisibleInConflictGroup =
              conflictGroupId !== null &&
              firstVisibleRequestIdByGroup.get(conflictGroupId) === req.id;

            const canForward = currentRole === "FACULTY" && isPendingFaculty;
            const canApprove =
              (currentRole === "STAFF" || currentRole === "ADMIN") &&
              isPendingStaff;
            const canReject =
              (currentRole === "FACULTY" && isPendingFaculty) ||
              ((currentRole === "STAFF" || currentRole === "ADMIN") &&
                isPendingStaff);
            const canCancel =
              (currentRole === "ADMIN" || isOwnRequest || isFacultyApprover) &&
              isCancellableStatus;
            const canEditRequest =
              ((currentRole === "STUDENT" && isOwnRequest) ||
                (currentRole === "FACULTY" && (isOwnRequest || isFacultyApprover))) &&
              isCancellableStatus;
            const willEditUpdateDirectly =
              canEditRequest &&
              req.status !== "APPROVED" &&
              !(
                req.status === "PENDING_STAFF" &&
                (currentRole === "STUDENT" || (currentRole === "FACULTY" && !isOwnRequest))
              );
            const editRequestHint = willEditUpdateDirectly
              ? "Will update directly"
              : "Will go for re-approval";

            const hasActions =
              canEditRequest || canForward || canApprove || canReject || canCancel;
            const requestedByLabel =
              req.userId === null
                ? "-"
                : (adminUserNameById[req.userId] ?? "Unknown User");
            const facultyApproverLabel =
              req.facultyId === null
                ? "Unassigned"
                : (adminUserNameById[req.facultyId] ?? "Unknown User");

            return (
              <div key={req.id} className="space-y-2">
                {conflictGroup && isFirstVisibleInConflictGroup && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-amber-900">
                        Conflict Group {conflictGroupOrdinal ?? "-"}
                      </p>
                      <Badge variant="destructive">
                        {conflictGroup.requests.length} overlapping requests
                      </Badge>
                    </div>
                    <p className="mt-1 text-amber-800">
                      {roomNameById.get(conflictGroup.roomId) ?? `Room #${conflictGroup.roomId}`} · {formatDateTimeDDMMYYYY(conflictGroup.windowStartAt)} to {formatDateTimeDDMMYYYY(conflictGroup.windowEndAt)}
                    </p>
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">
                        Room Booking Request #{req.id}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {conflictGroupId !== null && (
                          <Badge variant="destructive">
                            Conflict Group {conflictGroupOrdinal ?? "-"}
                          </Badge>
                        )}
                        <Badge variant={statusBadgeVariant(req.status)}>
                          {STATUS_LABELS[req.status]}
                        </Badge>
                      </div>
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
                      <p className="mt-1">{req.purpose}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {hasActions && (
                    <div className="border-t pt-4 flex flex-wrap gap-2">
                      {canEditRequest && (
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isActing || isSubmitting}
                            onClick={() => beginEditRequest(req)}
                          >
                            Edit Request
                          </Button>
                          <p className="text-xs text-gray-500">{editRequestHint}</p>
                        </div>
                      )}
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
                          {isActing ? "Processing..." : "Forward to Staff"}
                        </Button>
                      )}
                      {canApprove && (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          disabled={isActing}
                          onClick={() => void handleApproveRequest(req.id)}
                        >
                          {isActing ? "Processing..." : "Approve"}
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
                          {isActing ? "Processing..." : "Reject"}
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
                          {isActing ? "Processing..." : "Cancel"}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {activeSection === "edit-requests" && (
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
                        {isActing ? "Processing..." : "Approve"}
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
                        {isActing ? "Processing..." : "Reject"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}