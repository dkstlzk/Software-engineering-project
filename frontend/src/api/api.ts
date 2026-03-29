const API_BASE_URL = "/api";
const AUTH_TOKEN_KEY = "authToken";
const AUTH_USER_KEY = "authUser";

/* ===== Types ===== */

export type UserRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT";

export type AuthUser = {
  id: number;
  name: string;
  role: UserRole;
};

export type Building = {
  id: number;
  name: string;
};

export type Room = {
  id: number;
  name: string;
  buildingId: number;
};

export type BookingStatus =
  | "PENDING_FACULTY"
  | "PENDING_STAFF"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type BookingSource = "MANUAL" | "BOOKING_REQUEST" | "TIMETABLE_IMPORT";

export type BookingRequest = {
  id: number;
  userId: number | null;
  roomId: number;
  startAt: string;
  endAt: string;
  purpose: string;
  status: BookingStatus;
  createdAt: string;
};

export type Booking = {
  id: number;
  roomId: number;
  startAt: string;
  endAt: string;
  requestId: number | null;
  source: BookingSource;
  sourceRef: string | null;
};

export type BookingPruneScope = "all" | "slot-system";

export type BookingPruneResult = {
  scope: BookingPruneScope;
  deletedBookings: number;
  slotSystemId?: number;
};

export type AvailabilityRoom = {
  id: number;
  name: string;
  isAvailable: boolean;
};

export type AvailabilityBuilding = {
  buildingId: number;
  buildingName: string;
  rooms: AvailabilityRoom[];
};

export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type SlotSystem = {
  id: number;
  name: string;
  createdAt: string;
};

export type SlotDay = {
  id: number;
  slotSystemId: number;
  dayOfWeek: DayOfWeek;
  orderIndex: number;
  laneCount: number;
};

export type SlotTimeBand = {
  id: number;
  slotSystemId: number;
  startTime: string;
  endTime: string;
  orderIndex: number;
};

export type SlotBlock = {
  id: number;
  slotSystemId: number;
  dayId: number;
  startBandId: number;
  laneIndex: number;
  rowSpan: number;
  label: string;
  createdAt: string;
};

export type SlotFullGrid = {
  slotSystem: SlotSystem;
  days: SlotDay[];
  timeBands: SlotTimeBand[];
  blocks: SlotBlock[];
};

export type TimetableImportRowStatus =
  | "VALID_AND_AUTOMATABLE"
  | "UNRESOLVED_SLOT"
  | "UNRESOLVED_ROOM"
  | "AMBIGUOUS_CLASSROOM"
  | "DUPLICATE_ROW"
  | "CONFLICTING_MAPPING"
  | "MISSING_REQUIRED_FIELD"
  | "OTHER_PROCESSING_ERROR";

export type TimetableImportPreviewRow = {
  rowId: number;
  rowIndex: number;
  courseCode: string;
  slot: string;
  classroom: string;
  classification: TimetableImportRowStatus;
  reasons: string[];
  suggestions: string[];
  parsedBuilding: string | null;
  parsedRoom: string | null;
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
};

export type TimetableImportPreviewReport = {
  batchId: number;
  reused: boolean;
  status: "PREVIEWED" | "COMMITTED";
  slotSystemId: number;
  termStartDate: string;
  termEndDate: string;
  processedRows: number;
  validRows: number;
  unresolvedRows: number;
  warnings: string[];
  savedDecisions: TimetableImportSavedDecision[];
  rows: TimetableImportPreviewRow[];
};

export type TimetableImportSavedDecision = {
  rowId: number;
  action: "AUTO" | "RESOLVE" | "SKIP";
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  createSlot: TimetableImportCreateSlotDecision | null;
  createRoom: TimetableImportCreateRoomDecision | null;
  updatedAt: string;
};

export type TimetableImportBatchSummary = {
  batchId: number;
  slotSystemId: number;
  slotSystemName: string;
  fileName: string;
  status: "PREVIEWED" | "COMMITTED";
  termStartDate: string;
  termEndDate: string;
  createdAt: string;
  committedAt: string | null;
};

export type TimetableImportDecisionSaveReport = {
  batchId: number;
  status: "PREVIEWED" | "COMMITTED";
  savedDecisions: TimetableImportSavedDecision[];
};

export type TimetableImportBatchDeleteReport = {
  batchId: number;
  status: "DELETED";
  deletedBookings: number;
};

export type TimetableImportCreateSlotDecision = {
  dayId: number;
  startBandId: number;
  endBandId: number;
  laneIndex?: number;
  label?: string;
};

export type TimetableImportCreateRoomDecision = {
  buildingName: string;
  roomName: string;
};

export type TimetableImportCommitDecision = {
  rowId: number;
  action: "AUTO" | "RESOLVE" | "SKIP";
  resolvedSlotLabel?: string;
  resolvedRoomId?: number;
  createSlot?: TimetableImportCreateSlotDecision;
  createRoom?: TimetableImportCreateRoomDecision;
};

export type TimetableImportCommitRowResult = {
  rowId: number;
  rowIndex: number;
  classification: TimetableImportRowStatus;
  action: "AUTO" | "RESOLVE" | "SKIP";
  created: number;
  failed: number;
  skipped: number;
  alreadyProcessed: number;
  unresolved: number;
  reasons: string[];
  bookingConflictReasons: string[];
};

export type TimetableImportCommitReport = {
  batchId: number;
  status: "COMMITTED" | "ALREADY_COMMITTED";
  processedRows: number;
  autoCreatedBookings: number;
  alreadyProcessedBookings: number;
  failedOccurrences: number;
  unresolvedRows: number;
  skippedRows: number;
  bookingConflictRows: number;
  bookingConflictOccurrences: number;
  rowResults: TimetableImportCommitRowResult[];
  warnings: string[];
};

export type TimetableImportProcessedOccurrenceStatus =
  | "PENDING"
  | "CREATED"
  | "FAILED"
  | "SKIPPED"
  | "UNRESOLVED"
  | "ALREADY_PROCESSED";

export type TimetableImportProcessedOccurrence = {
  occurrenceId: number;
  status: TimetableImportProcessedOccurrenceStatus;
  roomId: number;
  startAt: string;
  endAt: string;
  sourceRef: string | null;
  errorMessage: string | null;
  booking: Booking | null;
};

export type TimetableImportProcessedRow = {
  rowId: number;
  rowIndex: number;
  classification: TimetableImportRowStatus;
  courseCode: string;
  slot: string;
  classroom: string;
  action: "AUTO" | "RESOLVE" | "SKIP";
  resolvedSlotLabel: string | null;
  resolvedRoomId: number | null;
  createSlot: TimetableImportCreateSlotDecision | null;
  createRoom: TimetableImportCreateRoomDecision | null;
  created: number;
  failed: number;
  skipped: number;
  alreadyProcessed: number;
  unresolved: number;
  reasons: string[];
  bookingConflictReasons: string[];
  occurrences: TimetableImportProcessedOccurrence[];
};

export type TimetableImportProcessedRowsReport = {
  batchId: number;
  status: "PREVIEWED" | "COMMITTED";
  warnings: string[];
  rows: TimetableImportProcessedRow[];
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

type BuildingsListResponse = {
  data: Building[];
};

type TimetableImportBatchListResponse = {
  data: TimetableImportBatchSummary[];
};

/* ===== Auth Helpers ===== */

let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void) {
  onUnauthorizedCallback = cb;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

/* ===== Core Request ===== */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    // Auto-logout on 401
    if (response.status === 401) {
      clearAuth();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }

    const apiPayload = payload as ApiErrorPayload | null;
    const message =
      apiPayload?.error ??
      apiPayload?.message ??
      httpErrorMessage(response.status);
    throw new Error(message);
  }

  return payload as T;
}

async function requestFormData<T>(
  path: string,
  formData: FormData,
  init?: Omit<RequestInit, "body" | "headers"> & { headers?: HeadersInit }
): Promise<T> {
  const token = getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method: init?.method ?? "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    body: formData,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }

    const apiPayload = payload as ApiErrorPayload | null;
    const message =
      apiPayload?.error ??
      apiPayload?.message ??
      httpErrorMessage(response.status);

    throw new Error(message);
  }

  return payload as T;
}

function httpErrorMessage(status: number): string {
  switch (status) {
    case 400: return "Invalid request";
    case 401: return "Session expired. Please log in again.";
    case 403: return "You don't have permission to perform this action";
    case 404: return "Resource not found";
    case 409: return "Conflict with existing data";
    default:  return `Request failed (${status})`;
  }
}

/* ===== Auth ===== */

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  localStorage.setItem(AUTH_TOKEN_KEY, response.token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));

  return response.user;
}

/* ===== Buildings ===== */

export async function getBuildings(): Promise<Building[]> {
  const response = await request<BuildingsListResponse>("/buildings");
  return response.data;
}

export async function createBuilding(name: string): Promise<Building> {
  const response = await request<{ data: Building }>("/buildings", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return response.data;
}

export async function updateBuilding(id: number, name: string): Promise<Building> {
  const response = await request<{ data: Building }>(`/buildings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return response.data;
}

export async function deleteBuilding(id: number): Promise<void> {
  await request<{ message: string }>(`/buildings/${id}`, {
    method: "DELETE",
  });
}

/* ===== Rooms ===== */

export async function getRooms(buildingId?: number): Promise<Room[]> {
  const query =
    buildingId === undefined ? "" : `?buildingId=${encodeURIComponent(String(buildingId))}`;
  return request<Room[]>(`/rooms${query}`);
}

export async function createRoom(name: string, buildingId: number): Promise<Room> {
  return request<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify({ name, buildingId }),
  });
}

export async function updateRoom(id: number, name: string): Promise<Room> {
  const response = await request<{ data: Room }>(`/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return response.data;
}

export async function deleteRoom(id: number): Promise<void> {
  await request<{ message: string }>(`/rooms/${id}`, {
    method: "DELETE",
  });
}

export async function getRoomAvailability(
  roomId: number,
  startAt: string,
  endAt: string
): Promise<{ id: number; startAt: string; endAt: string }[]> {
  const params = new URLSearchParams({ startAt, endAt });
  return request(`/rooms/${roomId}/availability?${params.toString()}`);
}

/* ===== Booking Requests ===== */

export async function getBookingRequests(status?: BookingStatus): Promise<BookingRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<BookingRequest[]>(`/booking-requests${query}`);
}

export async function createBookingRequest(input: {
  roomId: number;
  startAt: string;
  endAt: string;
  purpose: string;
}): Promise<BookingRequest> {
  return request<BookingRequest>("/booking-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/approve`, {
    method: "POST",
  });
}

export async function forwardBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/forward`, {
    method: "POST",
  });
}

export async function rejectBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/reject`, {
    method: "POST",
  });
}

export async function cancelBookingRequest(id: number): Promise<void> {
  await request<unknown>(`/booking-requests/${id}/cancel`, {
    method: "POST",
  });
}

/* ===== Bookings ===== */

export async function getBookings(filters?: {
  roomId?: number;
  buildingId?: number;
  startAt?: string;
  endAt?: string;
}): Promise<Booking[]> {
  const params = new URLSearchParams();
  if (filters?.roomId !== undefined) params.set("roomId", String(filters.roomId));
  if (filters?.buildingId !== undefined) params.set("buildingId", String(filters.buildingId));
  if (filters?.startAt) params.set("startAt", filters.startAt);
  if (filters?.endAt) params.set("endAt", filters.endAt);
  const qs = params.toString();
  return request<Booking[]>(`/bookings${qs ? `?${qs}` : ""}`);
}

export async function createBooking(input: {
  roomId: number;
  startAt: string;
  endAt: string;
  metadata?: {
    source?: BookingSource;
    sourceRef?: string;
  };
}): Promise<Booking> {
  return request<Booking>("/bookings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBooking(
  id: number,
  input: {
    roomId?: number;
    startAt?: string;
    endAt?: string;
  }
): Promise<Booking> {
  return request<Booking>(`/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteBooking(id: number): Promise<void> {
  await request<void>(`/bookings/${id}`, {
    method: "DELETE",
  });
}

export async function pruneAllBookings(): Promise<BookingPruneResult> {
  return request<BookingPruneResult>("/bookings/prune?scope=all", {
    method: "DELETE",
  });
}

export async function pruneBookingsBySlotSystem(slotSystemId: number): Promise<BookingPruneResult> {
  if (!Number.isInteger(slotSystemId) || slotSystemId <= 0) {
    throw new Error("Invalid slotSystemId");
  }

  const params = new URLSearchParams({
    scope: "slot-system",
    slotSystemId: String(slotSystemId),
  });

  return request<BookingPruneResult>(`/bookings/prune?${params.toString()}`, {
    method: "DELETE",
  });
}

/* ===== Availability ===== */

export async function getAvailability(
  startAt: string,
  endAt: string,
  buildingId?: number
): Promise<AvailabilityBuilding[]> {
  const params = new URLSearchParams({ startAt, endAt });
  if (buildingId !== undefined) params.set("buildingId", String(buildingId));
  return request<AvailabilityBuilding[]>(`/availability?${params.toString()}`);
}

/* ===== Timetable ===== */

export async function getSlotSystems(): Promise<SlotSystem[]> {
  return request<SlotSystem[]>("/timetable/slot-systems");
}

export async function createSlotSystem(name: string): Promise<SlotSystem> {
  return request<SlotSystem>("/timetable/slot-systems", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteSlotSystem(slotSystemId: number): Promise<void> {
  await request<void>(`/timetable/slot-systems/${slotSystemId}`, {
    method: "DELETE",
  });
}

export async function getDays(slotSystemId: number): Promise<SlotDay[]> {
  const params = new URLSearchParams({ slotSystemId: String(slotSystemId) });
  return request<SlotDay[]>(`/timetable/days?${params.toString()}`);
}

export async function createDay(input: {
  slotSystemId: number;
  dayOfWeek: DayOfWeek;
  orderIndex?: number;
}): Promise<SlotDay> {
  return request<SlotDay>("/timetable/days", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteDay(dayId: number): Promise<void> {
  await request<void>(`/timetable/days/${dayId}`, {
    method: "DELETE",
  });
}

export async function addDayLane(dayId: number): Promise<SlotDay> {
  return request<SlotDay>(`/timetable/days/${dayId}/lanes`, {
    method: "POST",
  });
}

export async function removeDayLane(dayId: number): Promise<SlotDay> {
  return request<SlotDay>(`/timetable/days/${dayId}/lanes`, {
    method: "DELETE",
  });
}

export async function getTimeBands(slotSystemId: number): Promise<SlotTimeBand[]> {
  const params = new URLSearchParams({ slotSystemId: String(slotSystemId) });
  return request<SlotTimeBand[]>(`/timetable/time-bands?${params.toString()}`);
}

export async function createTimeBand(input: {
  slotSystemId: number;
  startTime: string;
  endTime: string;
  orderIndex?: number;
}): Promise<SlotTimeBand> {
  return request<SlotTimeBand>("/timetable/time-bands", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTimeBand(
  timeBandId: number,
  input: {
    startTime?: string;
    endTime?: string;
    orderIndex?: number;
  }
): Promise<SlotTimeBand> {
  return request<SlotTimeBand>(`/timetable/time-bands/${timeBandId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTimeBand(timeBandId: number): Promise<void> {
  await request<void>(`/timetable/time-bands/${timeBandId}`, {
    method: "DELETE",
  });
}

export async function getFullGrid(slotSystemId: number): Promise<SlotFullGrid> {
  return request<SlotFullGrid>(`/timetable/slot-systems/${slotSystemId}/full`);
}

export async function createBlock(input: {
  slotSystemId: number;
  dayId: number;
  startBandId: number;
  laneIndex: number;
  rowSpan: number;
  label: string;
}): Promise<SlotBlock> {
  return request<SlotBlock>("/timetable/blocks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteBlock(blockId: number): Promise<void> {
  await request<void>(`/timetable/blocks/${blockId}`, {
    method: "DELETE",
  });
}

export async function getTimetableImportBatches(input?: {
  slotSystemId?: number;
  limit?: number;
}): Promise<TimetableImportBatchSummary[]> {
  const params = new URLSearchParams();

  if (input?.slotSystemId !== undefined) {
    params.set("slotSystemId", String(input.slotSystemId));
  }

  if (input?.limit !== undefined) {
    params.set("limit", String(input.limit));
  }

  const query = params.toString();
  const response = await request<TimetableImportBatchListResponse>(
    `/timetable/imports${query ? `?${query}` : ""}`,
  );

  return response.data;
}

export async function getTimetableImportBatch(
  batchId: number,
): Promise<TimetableImportPreviewReport> {
  return request<TimetableImportPreviewReport>(`/timetable/imports/${batchId}`);
}

export async function saveTimetableImportDecisions(
  batchId: number,
  decisions: TimetableImportCommitDecision[],
): Promise<TimetableImportDecisionSaveReport> {
  return request<TimetableImportDecisionSaveReport>(`/timetable/imports/${batchId}/decisions`, {
    method: "PUT",
    body: JSON.stringify({ decisions }),
  });
}

export async function previewTimetableImport(input: {
  slotSystemId: number;
  termStartDate: string;
  termEndDate: string;
  file: File;
  aliasMap?: Record<string, string>;
}): Promise<TimetableImportPreviewReport> {
  const formData = new FormData();
  formData.append("slotSystemId", String(input.slotSystemId));
  formData.append("termStartDate", input.termStartDate);
  formData.append("termEndDate", input.termEndDate);
  formData.append("file", input.file);

  if (input.aliasMap && Object.keys(input.aliasMap).length > 0) {
    formData.append("aliasMap", JSON.stringify(input.aliasMap));
  }

  return requestFormData<TimetableImportPreviewReport>("/timetable/imports/preview", formData);
}

export async function commitTimetableImport(
  batchId: number,
  decisions: TimetableImportCommitDecision[]
): Promise<TimetableImportCommitReport> {
  return request<TimetableImportCommitReport>(`/timetable/imports/${batchId}/commit`, {
    method: "POST",
    body: JSON.stringify({ decisions }),
  });
}

export async function reallocateTimetableImport(
  batchId: number,
  decisions: TimetableImportCommitDecision[],
): Promise<TimetableImportCommitReport> {
  return request<TimetableImportCommitReport>(`/timetable/imports/${batchId}/reallocate`, {
    method: "POST",
    body: JSON.stringify({ decisions }),
  });
}

export async function deleteTimetableImportBatch(
  batchId: number,
): Promise<TimetableImportBatchDeleteReport> {
  return request<TimetableImportBatchDeleteReport>(`/timetable/imports/${batchId}`, {
    method: "DELETE",
  });
}

export async function getTimetableImportProcessedRows(
  batchId: number,
): Promise<TimetableImportProcessedRowsReport> {
  return request<TimetableImportProcessedRowsReport>(
    `/timetable/imports/${batchId}/processed-rows`,
  );
}