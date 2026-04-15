export type UserRole =
  | "ADMIN"
  | "STAFF"
  | "FACULTY"
  | "STUDENT"
  | "PENDING_ROLE";

export type SetupRole = "STUDENT";

export type AuthMethod = "email" | "google";

export type AuthUser = {
  id: number;
  name: string;
  email?: string;
  department?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  registeredVia?: string;
  buildings?: Array<{ id: number; name: string }>;
};

export type SystemQoLSectionKey =
  | "dashboard"
  | "bookings"
  | "rooms"
  | "availability"
  | "bookingRequests"
  | "users";

export type SystemAutoLoadSections = Record<SystemQoLSectionKey, boolean>;

export type SystemQoLPreferences = {
  manualDataLoading: boolean;
  autoLoadDependentData: boolean;
  autoLoadSections: SystemAutoLoadSections;
};

export type SystemQoLPreferencesPatch = Partial<
  Omit<SystemQoLPreferences, "autoLoadSections">
> & {
  autoLoadSections?: Partial<SystemAutoLoadSections>;
};

export type SystemQoLSettings = SystemQoLPreferences & {
  updatedBy: number | null;
  updatedAt: string;
};

export type AssignableUserRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT";

export type FacultyUser = {
  id: number;
  name: string;
  email: string;
  department: string | null;
  avatarUrl: string | null;
};

export type ManagedUser = {
  id: number;
  name: string;
  displayName: string | null;
  email: string;
  role: UserRole;
  department: string | null;
  isActive: boolean;
  registeredVia: string;
  firstLogin: boolean;
  createdAt: string;
  assignedBuildings: Building[];
};

export type ManagedUsersPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ManagedUsersListResponse = {
  data: ManagedUser[];
  pagination: ManagedUsersPagination;
};

export type StaffBuildingAssignmentsResponse = {
  userId: number;
  buildingIds: number[];
  buildings: Building[];
};

export type RoomType =
  | "LECTURE_HALL"
  | "CLASSROOM"
  | "SEMINAR_ROOM"
  | "COMPUTER_LAB"
  | "CONFERENCE_ROOM"
  | "AUDITORIUM"
  | "WORKSHOP"
  | "OTHER";

export type Building = {
  id: number;
  name: string;
  location: string | null;
  managedByStaffId: number | null;
};

export type Room = {
  id: number;
  name: string;
  buildingId: number;
  capacity: number | null;
  roomType: RoomType | null;
  hasProjector: boolean;
  hasMic: boolean;
  accessible: boolean;
  equipmentList: string | null;
};

export type BookingStatus =
  | "PENDING_FACULTY"
  | "PENDING_STAFF"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type BookingEventType =
  | "QUIZ"
  | "SEMINAR"
  | "SPEAKER_SESSION"
  | "MEETING"
  | "CULTURAL_EVENT"
  | "WORKSHOP"
  | "CLASS"
  | "OTHER";

export type BookingSource =
  | "MANUAL_REQUEST"
  | "TIMETABLE_ALLOCATION"
  | "SLOT_CHANGE"
  | "VENUE_CHANGE";

export type BookingRequest = {
  id: number;
  userId: number | null;
  facultyId: number | null;
  bookingId?: number | null;
  roomId: number;
  startAt: string;
  endAt: string;
  eventType: BookingEventType;
  purpose: string;
  participantCount: number | null;
  status: BookingStatus;
  createdAt: string;
};

export type BookingRequestChangeMode =
  | "UPDATED_EXISTING_REQUEST"
  | "CREATED_CHANGE_REQUEST";

export type BookingRequestChangeResponse = {
  mode: BookingRequestChangeMode;
  request: BookingRequest;
};

export type Booking = {
  id: number;
  roomId: number;
  startAt: string;
  endAt: string;
  requestId: number | null;
  approvedBy: number | null;
  approvedAt: string | null;
  source: BookingSource;
  sourceRef: string | null;
};

export type Holiday = {
  id: number;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  createdBy: number | null;
  createdAt: string;
};

export type HolidayCreateResponse = {
  holiday: Holiday;
  prunedTimetableBookings: number;
};

export type TimetableDayOverride = {
  id: number;
  targetDate: string;
  followsDayOfWeek: DayOfWeek;
  note: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedBy: number | null;
  updatedAt: string;
};

export type DayOverrideRecomputeSlotSystemReport = {
  slotSystemId: number;
  noChanges: boolean;
  commitSessionId: number | null;
  batchId: number | null;
  affectedRows: number;
  unchangedRows: number;
  createdBookings: number;
  skippedOperations: number;
  deletedConflictingBookings: number;
  autoResolvedExternalConflicts: number;
  autoResolvedInternalConflicts: number;
  autoResolvedRuntimeConflicts: number;
  impactedBatchIds: number[];
};

export type DayOverrideRecomputeSummary = {
  targetDate: string;
  impactedSlotSystems: number;
  processedSlotSystems: number;
  noChangeSlotSystems: number;
  createdBookings: number;
  skippedOperations: number;
  deletedConflictingBookings: number;
  autoResolvedExternalConflicts: number;
  autoResolvedInternalConflicts: number;
  autoResolvedRuntimeConflicts: number;
  slotSystems: DayOverrideRecomputeSlotSystemReport[];
};

export type TimetableDayOverrideSaveResponse = {
  dayOverride: TimetableDayOverride;
  recompute: DayOverrideRecomputeSummary;
};

export type TimetableDayOverrideDeleteResponse = {
  deletedId: number;
  targetDate: string;
  recompute: DayOverrideRecomputeSummary;
};

export type BookingEditRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type BookingEditRequest = {
  id: number;
  bookingId: number;
  proposedRoomId: number | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  status: BookingEditRequestStatus;
  requestedBy: number;
  reviewedBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type EditBookingPayload = {
  newRoomId?: number;
  newStartAt?: string;
  newEndAt?: string;
};

export type EditBookingDirectResponse = {
  flow: "DIRECT_EDIT";
  booking: Booking;
};

export type EditBookingRequestResponse = {
  flow: "REQUEST_EDIT";
  request: BookingEditRequest;
};

export type EditBookingResponse = EditBookingDirectResponse | EditBookingRequestResponse;

export type ChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ChangeRequestCourseOption = {
  id: number;
  code: string;
  name: string;
};

export type ChangeRequestBookingOption = {
  id: number;
  roomId: number;
  startAt: string;
  endAt: string;
  courseId: number;
  courseCode: string;
  courseName: string;
  roomName: string;
  buildingName: string;
};

export type ChangeRequestRoomOption = {
  id: number;
  name: string;
  buildingId: number;
  buildingName: string;
};

export type ChangeRequestRequester = {
  id: number;
  name: string;
  email: string;
};

export type SlotChangeRequestRecord = {
  id: number;
  requestedBy: number;
  courseId: number;
  currentBookingId: number;
  proposedRoomId: number | null;
  proposedStart: string;
  proposedEnd: string;
  reason: string;
  status: ChangeRequestStatus;
  reviewedBy: number | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VenueChangeRequestRecord = {
  id: number;
  requestedBy: number;
  courseId: number;
  currentBookingId: number;
  proposedRoomId: number;
  reason: string;
  status: ChangeRequestStatus;
  reviewedBy: number | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SlotChangeRequestListItem = {
  request: SlotChangeRequestRecord;
  course: ChangeRequestCourseOption;
  currentBooking: Booking;
  proposedRoom: ChangeRequestRoomOption | null;
  requestedByUser: ChangeRequestRequester;
};

export type VenueChangeRequestListItem = {
  request: VenueChangeRequestRecord;
  course: ChangeRequestCourseOption;
  currentBooking: Booking;
  proposedRoom: ChangeRequestRoomOption;
  requestedByUser: ChangeRequestRequester;
};

export type ChangeRequestDetailRequester = ChangeRequestRequester & {
  [key: string]: unknown;
};

export type SlotChangeRequestDetail = {
  request: SlotChangeRequestRecord;
  course: ChangeRequestCourseOption;
  currentBooking: Booking;
  proposedRoom: Room | null;
  requestedByUser: ChangeRequestDetailRequester;
};

export type VenueChangeRequestDetail = {
  request: VenueChangeRequestRecord;
  course: ChangeRequestCourseOption;
  currentBooking: Booking;
  proposedRoom: Room;
  requestedByUser: ChangeRequestDetailRequester;
};

export type SlotChangeOptionsResponse = {
  courses: ChangeRequestCourseOption[];
  bookings: ChangeRequestBookingOption[];
  rooms: ChangeRequestRoomOption[];
};

export type VenueChangeOptionsResponse = {
  courses: ChangeRequestCourseOption[];
  bookings: ChangeRequestBookingOption[];
  rooms: ChangeRequestRoomOption[];
};

export type SlotChangeCreateInput = {
  courseId: number;
  currentBookingId: number;
  proposedRoomId?: number;
  proposedStart: string;
  proposedEnd: string;
  reason: string;
};

export type SlotChangeBatchCreateInput = {
  courseId: number;
  proposedRoomId?: number;
  proposedStartTime: string;
  proposedEndTime: string;
  reason: string;
  fromDate?: string;
  toDate?: string;
};

export type VenueChangeCreateInput = {
  courseId: number;
  currentBookingId: number;
  proposedRoomId: number;
  reason: string;
};

export type VenueChangeBatchCreateInput = {
  courseId: number;
  proposedRoomId: number;
  reason: string;
  fromDate?: string;
  toDate?: string;
};

export type SlotChangeValidateInput = {
  courseId: number;
  currentBookingId: number;
  proposedStart: string;
  proposedEnd: string;
  proposedRoomId?: number;
};

export type SlotChangeAlternativeSuggestion = {
  type: "room" | "time";
  roomId?: number;
  roomName?: string;
  buildingName?: string;
  startAt?: string;
  endAt?: string;
  reason: string;
};

export type SlotChangeValidationResponse = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: SlotChangeAlternativeSuggestion[];
};

export type VenueChangeValidateInput = {
  courseId: number;
  currentBookingId: number;
  proposedRoomId: number;
};

export type VenueSuggestion = {
  roomId: number;
  roomName: string;
  buildingName: string;
  capacity: number | null;
  hasProjector: boolean;
  hasMic: boolean;
  accessible: boolean;
};

export type VenueChangeValidationSlot = {
  startAt: string;
  endAt: string;
  isCurrentSlot: boolean;
};

export type VenueChangeValidationResponse = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  availableSlots?: VenueChangeValidationSlot[];
};

export type SlotChangeCreateResponse = {
  request: SlotChangeRequestRecord;
  warnings: string[];
};

export type VenueChangeCreateResponse = {
  request: VenueChangeRequestRecord;
  warnings: string[];
};

export type ChangeRequestBatchSuccess = {
  bookingId: number;
  requestId: number;
  warnings: string[];
};

export type ChangeRequestBatchFailure = {
  bookingId: number;
  bookingStartAt: string;
  bookingEndAt: string;
  errors: string[];
  warnings: string[];
};

export type ChangeRequestBatchCreateResponse = {
  requestedCount: number;
  createdCount: number;
  skippedCount: number;
  created: ChangeRequestBatchSuccess[];
  failures: ChangeRequestBatchFailure[];
};

export type ChangeRequestActionResponse = {
  success: boolean;
  bookingId?: number;
};

export type BookingDetail = {
  id: number;
  startAt: string;
  endAt: string;
  activityName?: string;
  bookedBy?: string;
  contactInfo?: string;
  purpose?: string;
  hasAccess: boolean;
  visibilityLevel: 'full' | 'restricted' | 'none';
};

export type NotificationType =
  | "BOOKING_REQUEST_CREATED"
  | "BOOKING_REQUEST_FORWARDED"
  | "BOOKING_REQUEST_APPROVED"
  | "BOOKING_REQUEST_REJECTED"
  | "BOOKING_REQUEST_CANCELLED"
  | "SLOT_CHANGE_REQUESTED"
  | "SLOT_CHANGE_APPROVED"
  | "SLOT_CHANGE_REJECTED"
  | "VENUE_CHANGE_REQUESTED"
  | "VENUE_CHANGE_APPROVED"
  | "VENUE_CHANGE_REJECTED";

export type AppNotification = {
  notificationId: number;
  recipientId: number;
  subject: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  sentAt: string;
};

export type NotificationsResponse = {
  data: AppNotification[];
  unreadCount: number;
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
  bookings?: BookingDetail[];
};

export type AvailabilityBuilding = {
  buildingId: number;
  buildingName: string;
  rooms: AvailabilityRoom[];
};

export type MatrixAvailabilitySlot = {
  time: string;
  status: "booked" | "available";
  bookingCount: number;
  bookings: BookingDetail[];
};

export type MatrixAvailabilityRoom = {
  roomId: number;
  roomName: string;
  slots: MatrixAvailabilitySlot[];
};

export type BuildingMatrixAvailability = {
  buildingId: number;
  buildingName: string;
  date: string;
  timeRange: { start: string; end: string };
  slotDuration: number;
  matrix: MatrixAvailabilityRoom[];
};

export type TimelineSegment = {
  start: string;      // ISO 8601 datetime
  end: string;        // ISO 8601 datetime
  status: 'free' | 'booked';
  booking?: {
    id: number;
    title?: string;
    startAt: string;
    endAt: string;
    bookedBy?: string;
    activityName?: string;
    contactInfo?: string;
    purpose?: string;
  };
  isRestricted?: boolean;  // true if booking details are masked
};

export type RoomDayTimeline = {
  room: {
    id: number;
    name: string;
    buildingId: number;
    buildingName: string;
  };
  date: string;  // YYYY-MM-DD
  segments: TimelineSegment[];
};

export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type SlotSystem = {
  id: number;
  name: string;
  isLocked: boolean;
  version: number;
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
  auxiliaryData: Record<string, string>;
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
  auxiliaryHeaders: string[];
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
  validRows: number;
  resolvedRows: number;
  unresolvedRows: number;
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

export type TimetableImportTransferRowReport = {
  sourceBatchId: number;
  sourceRowId: number;
  targetSlotSystemId: number;
  targetBatchId: number;
  targetProcessedRows: number;
  targetBatchStatus: "PREVIEWED" | "COMMITTED";
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

export type TimetableImportConflictingBooking = {
  rowId: number;
  rowIndex: number;
  occurrenceId: number;
  roomId: number;
  startAt: string;
  endAt: string;
  message: string;
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
  conflictingBookings: TimetableImportConflictingBooking[];
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

export type TimetableImportProcessedOccurrenceBooking = {
  id: number;
  roomId: number;
  startAt: string;
  endAt: string;
  requestId: number | null;
  source: BookingSource;
  sourceRef: string | null;
};

export type TimetableImportProcessedOccurrence = {
  occurrenceId: number;
  status: TimetableImportProcessedOccurrenceStatus;
  roomId: number;
  startAt: string;
  endAt: string;
  sourceRef: string | null;
  errorMessage: string | null;
  booking: TimetableImportProcessedOccurrenceBooking | null;
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

// ============================================================================
// Staged Commit Session Types
// ============================================================================

export type CommitSessionStatus =
  | "STARTED"
  | "EXTERNAL_DONE"
  | "INTERNAL_DONE"
  | "FROZEN"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type CommitSessionStage = "external" | "internal" | "runtime";

export type CommitResolutionAction =
  | "SKIP"
  | "CHANGE_ROOM"
  | "CHANGE_SLOT_EXISTING"
  | "CREATE_SLOT_AND_USE"
  | "FORCE_OVERWRITE"
  | "ALTERNATIVE_ROOM";

export type CommitResolutionTarget = "COMMITTING" | "CLASHING";

export type CommitSessionSummary = {
  commitSessionId: number;
  batchId: number;
  slotSystemId: number;
  status: CommitSessionStatus;
  payloadSnapshot: string;
  isFrozen: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommitSessionConflict = {
  id: string;
  stage: CommitSessionStage;
  type: CommitSessionStage;
  operationId: string;
  rowId: number;
  rowIndex: number;
  roomId: number;
  startAt: string;
  endAt: string;
  reason: string;
  metadata: Record<string, unknown>;
};

export type CommitStageReport = {
  commitSessionId: number;
  stage: CommitSessionStage;
  conflictCount: number;
  conflicts: CommitSessionConflict[];
};

export type CommitSessionResolutionDecision = {
  conflictId: string;
  action: CommitResolutionAction;
  target?: CommitResolutionTarget;
  roomId?: number;
  startAt?: string;
  endAt?: string;
};

export type CommitSessionFinalizeReport = {
  commitSessionId: number;
  batchId: number;
  createdBookings: number;
  skippedOperations: number;
  deletedConflictingBookings: number;
};

export type CommitSessionCancelResponse = {
  commitSessionId: number;
  status: "CANCELLED";
};

export type TimetableSnapshotDay = {
  id: number;
  dayOfWeek: DayOfWeek;
  orderIndex: number;
  laneCount: number;
};

export type TimetableSnapshotTimeBand = {
  id: number;
  startTime: string;
  endTime: string;
  orderIndex: number;
};

export type TimetableSnapshotBlock = {
  id: number;
  dayId: number;
  startBandId: number;
  laneIndex: number;
  rowSpan: number;
  label: string;
};

export type TimetableSnapshotState = {
  slotSystemId: number;
  days: TimetableSnapshotDay[];
  timeBands: TimetableSnapshotTimeBand[];
  blocks: TimetableSnapshotBlock[];
  roomAssignments?: Record<string, number>;
};

export type EditCommitDiffOperationPreview = {
  type: "ADD_SLOT" | "REMOVE_SLOT" | "CHANGE_SLOT" | "CHANGE_VENUE";
  label: string;
  oldDescriptorCount: number;
  newDescriptorCount: number;
  oldRoomId: number | null;
  newRoomId: number | null;
  operationGroupId: string;
  affectedBookings: number;
};

export type EditCommitSessionStartResponse = {
  session?: CommitSessionSummary;
  noChanges?: boolean;
  message?: string;
  diff: {
    summary: {
      total: number;
      added: number;
      removed: number;
      changedSlot: number;
      changedVenue: number;
    };
    changedLabels: string[];
    operations: EditCommitDiffOperationPreview[];
    affectedRows: number;
    unchangedRows: number;
    expectedVersion: number;
    currentVersion: number;
    bookingImpact: {
      totalAffectedBookings: number;
      byOperation: {
        operationId: string;
        affectedBookings: number;
      }[];
    };
  };
};

// ============================================================================
// Change Workspace Types
// ============================================================================

export type SlotSystemChanges = {
  addDays?: Array<{ dayOfWeek: string; orderIndex?: number }>;
  removeDayIds?: number[];
  addTimeBands?: Array<{ startTime: string; endTime: string; orderIndex?: number }>;
  removeTimeBandIds?: number[];
  updateTimeBands?: Array<{
    timeBandId: number;
    startTime?: string;
    endTime?: string;
    orderIndex?: number;
  }>;
  addBlocks?: Array<{
    dayId: number;
    startBandId: number;
    laneIndex: number;
    rowSpan: number;
    label: string;
  }>;
  removeBlockIds?: number[];
  addLaneDayIds?: number[];
  removeLaneDayIds?: number[];
};

export type ChangePreviewResult = {
  slotSystemId: number;
  isLocked: boolean;
  summary: {
    daysToAdd: number;
    daysToRemove: number;
    timeBandsToAdd: number;
    timeBandsToRemove: number;
    timeBandsToUpdate: number;
    blocksToAdd: number;
    blocksToRemove: number;
    lanesToAdd: number;
    lanesToRemove: number;
  };
  affectedBatches: Array<{
    batchId: number;
    status: string;
    affectedOccurrences: number;
  }>;
  warnings: string[];
};

export type ChangeApplyResult = {
  slotSystemId: number;
  applied: {
    daysAdded: number;
    daysRemoved: number;
    timeBandsAdded: number;
    timeBandsRemoved: number;
    timeBandsUpdated: number;
    blocksAdded: number;
    blocksRemoved: number;
    lanesAdded: number;
    lanesRemoved: number;
  };
  recomputation: {
    affectedOccurrences: number;
    deletedBookings: number;
    warnings: string[];
  };
};

// ============================================================================

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  authProvider?: string;
};

export type RefreshTokenResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type ApiErrorPayload = {
  error?: string | { code?: string; message?: string };
  message?: string;
  code?: string;
  holidays?: Array<{
    id?: number;
    name?: string;
    startDate?: string;
    endDate?: string;
  }>;
};

export type TimetableImportBatchListResponse = {
  data: TimetableImportBatchSummary[];
};

export type DashboardStats = {
  totalBookingsThisMonth: number;
  pendingRequests: number;
  pendingRequestsByFaculty: number;
  pendingRequestsByStaff: number;
  pendingRequestsToClear: number;
  roomUtilization: number;
  activeUsers: number;
};

export type UpcomingBooking = {
  id: number;
  roomId: number;
  roomName: string | null;
  startAt: string;
  endAt: string;
  source: string;
  requestId: number | null;
};

export type ActivityItem = {
  id: number;
  type: string;
  status: string;
  userId: number | null;
  userName: string | null;
  roomId: number;
  roomName: string | null;
  startAt: string;
  createdAt: string;
  eventType: string;
};

export type DashboardData = {
  stats: DashboardStats;
  upcomingBookings: UpcomingBooking[];
  activities: ActivityItem[];
};
