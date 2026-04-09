// Constants
export { API_BASE_URL, AUTH_TOKEN_KEY, AUTH_USER_KEY, AUTH_REFRESH_TOKEN_KEY, LAST_ACTIVITY_KEY, REMEMBER_ME_KEY } from "./constants";

// Types
export type {
  UserRole,
  SetupRole,
  AuthUser,
  AssignableUserRole,
  FacultyUser,
  ManagedUser,
  ManagedUsersPagination,
  ManagedUsersListResponse,
  StaffBuildingAssignmentsResponse,
  Building,
  Room,
  BookingStatus,
  BookingEventType,
  BookingSource,
  BookingRequest,
  Booking,
  BookingEditRequestStatus,
  BookingEditRequest,
  EditBookingPayload,
  EditBookingDirectResponse,
  EditBookingRequestResponse,
  EditBookingResponse,
  NotificationType,
  AppNotification,
  NotificationsResponse,
  BookingPruneScope,
  BookingPruneResult,
  AvailabilityRoom,
  AvailabilityBuilding,
  TimelineSegment,
  RoomDayTimeline,
  DayOfWeek,
  SlotSystem,
  SlotDay,
  SlotTimeBand,
  SlotBlock,
  SlotFullGrid,
  TimetableImportRowStatus,
  TimetableImportPreviewRow,
  TimetableImportPreviewReport,
  TimetableImportSavedDecision,
  TimetableImportBatchSummary,
  TimetableImportDecisionSaveReport,
  TimetableImportBatchDeleteReport,
  TimetableImportTransferRowReport,
  TimetableImportCreateSlotDecision,
  TimetableImportCreateRoomDecision,
  TimetableImportCommitDecision,
  TimetableImportCommitRowResult,
  TimetableImportConflictingBooking,
  TimetableImportCommitReport,
  TimetableImportProcessedOccurrenceStatus,
  TimetableImportProcessedOccurrence,
  TimetableImportProcessedRow,
  TimetableImportProcessedRowsReport,
  LoginResponse,
  RefreshTokenResponse,
  ApiErrorPayload,
  TimetableImportBatchListResponse,
  DashboardStats,
  UpcomingBooking,
  ActivityItem,
  DashboardData,
  CommitSessionStatus,
  CommitSessionStage,
  CommitResolutionAction,
  CommitResolutionTarget,
  CommitSessionSummary,
  CommitSessionConflict,
  CommitStageReport,
  CommitSessionResolutionDecision,
  CommitSessionFinalizeReport,
  CommitSessionCancelResponse,
  TimetableSnapshotDay,
  TimetableSnapshotTimeBand,
  TimetableSnapshotBlock,
  TimetableSnapshotState,
  EditCommitDiffOperationPreview,
  EditCommitSessionStartResponse,
  SlotSystemChanges,
  ChangePreviewResult,
  ChangeApplyResult,
} from "./types";

// Client utilities
export {
  setOnUnauthorized,
  getAuthToken,
  getRefreshToken,
  getAuthUser,
  clearAuth,
  setAuthSession,
  request,
  requestFormData,
  httpErrorMessage,
  refreshAccessToken,
  classifyError,
  type ErrorType,
} from "./client";

// Auth endpoints
export {
  login,
  startGoogleOAuthLogin,
  loginWithOAuthToken,
  completeOAuthSetup,
} from "./auth";

// JWT utilities
export {
  decodeToken,
  isValidToken,
  getTokenExpiry,
  isTokenExpiring,
  isTokenExpired,
  getTimeUntilExpiry,
  getTokenType,
  type TokenPayload,
} from "./jwt-utils";

// Storage utilities
export {
  setEncryptedStorage,
  getEncryptedStorage,
  clearEncryptedStorage,
  hasEncryptedStorage,
} from "./storage-utils";

// Buildings endpoints
export {
  getBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
} from "./buildings";

// Rooms endpoints
export {
  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomAvailability,
} from "./rooms";

// Users endpoints
export {
  getFacultyUsers,
  getManagedUsers,
  createManagedUser,
  updateManagedUserRole,
  updateManagedUserActiveStatus,
  deleteManagedUser,
  getUserBuildingAssignments,
  updateUserBuildingAssignments,
} from "./users";

// Booking requests endpoints
export {
  getBookingRequests,
  createBookingRequest,
  approveBookingRequest,
  forwardBookingRequest,
  rejectBookingRequest,
  cancelBookingRequest,
} from "./booking-requests";

// Edit booking endpoints
export {
  editBooking,
  getEditRequests,
  approveEditRequest,
  rejectEditRequest,
} from "./editBooking";

// Notifications endpoints
export {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notifications";

// Bookings endpoints
export {
  getBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  pruneAllBookings,
  pruneBookingsBySlotSystem,
} from "./bookings";

// Availability endpoints
export {
  getAvailability,
  getRoomDayTimeline,
} from "./availability";

// Dashboard endpoints
export {
  getDashboardData,
  getDashboardStats,
  getUpcomingBookings,
  getActivityFeed,
} from "./dashboard";

// Slot system and Timetable import endpoints
export {
  getSlotSystems,
  createSlotSystem,
  deleteSlotSystem,
  getDays,
  createDay,
  deleteDay,
  addDayLane,
  removeDayLane,
  getTimeBands,
  createTimeBand,
  updateTimeBand,
  deleteTimeBand,
  getFullGrid,
  createBlock,
  deleteBlock,
  getTimetableImportBatches,
  getTimetableImportBatch,
  saveTimetableImportDecisions,
  transferTimetableImportRow,
  previewTimetableImport,
  commitTimetableImport,
  reallocateTimetableImport,
  deleteTimetableImportBatch,
  getTimetableImportProcessedRows,
  startCommitSession,
  startEditCommitSession,
  runExternalCommitCheck,
  resolveExternalCommitConflicts,
  runInternalCommitCheck,
  resolveInternalCommitConflicts,
  startCommitFreeze,
  runRuntimeCommitCheck,
  resolveRuntimeCommitConflicts,
  finalizeCommitSession,
  cancelCommitSession,
  getCommitSessionStatus,
  previewSlotSystemChanges,
  applySlotSystemChanges,
} from "./slots";
