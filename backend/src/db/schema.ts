import {
  pgTable,
  pgEnum,
  serial,
  AnyPgColumn,
  text,
  boolean,
  uniqueIndex,
  index,
  check,
  integer,
  date,
  timestamp,
  jsonb,
  varchar,
  json,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dayOfWeekEnum, slotSystems } from "../modules/timetable/schema";

// Forward declaration for users reference (defined later in this file)
// We use a late reference pattern here

export const roomTypeEnum = pgEnum("room_type", [
  "LECTURE_HALL",
  "CLASSROOM",
  "SEMINAR_ROOM",
  "COMPUTER_LAB",
  "CONFERENCE_ROOM",
  "AUDITORIUM",
  "WORKSHOP",
  "OTHER",
]);

export const buildings = pgTable(
  "buildings",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    location: text("location"),
    managedByStaffId: integer("managed_by_staff_id"),
  },
  (table) => ({
    nameUnique: uniqueIndex("buildings_name_unique").on(
      sql`lower(${table.name})`
    ),
    managedByIdx: index("buildings_managed_by_idx").on(table.managedByStaffId),
  })
);

export const rooms = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildings.id),
    capacity: integer("capacity"),
    roomType: roomTypeEnum("room_type").default("OTHER"),
    hasProjector: boolean("has_projector").notNull().default(false),
    hasMic: boolean("has_mic").notNull().default(false),
    accessible: boolean("accessible").notNull().default(true),
    equipmentList: text("equipment_list"),
  },
  (table) => ({
    roomUniquePerBuilding: uniqueIndex("rooms_building_name_unique").on(
      table.buildingId,
      sql`lower(${table.name})`
    ),
    accessibleIdx: index("rooms_accessible_idx").on(table.accessible),
  })
);

// Deprecated: Slot/Venue change system removed
// retained only for backward compatibility
// not used in current system
export const bookingSourceEnum = pgEnum("booking_source", [
  "MANUAL_REQUEST",
  "TIMETABLE_ALLOCATION",
  "SLOT_CHANGE",
  "VENUE_CHANGE",
]);

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),

  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),

  startAt: timestamp("start_at", { withTimezone: false }).notNull(),

  endAt: timestamp("end_at", { withTimezone: false }).notNull(),

  requestId: integer("request_id").references((): AnyPgColumn => bookingRequests.id, {
    onDelete: "set null",
  }),

  approvedBy: integer("approved_by").references(() => users.id, {
    onDelete: "set null",
  }),

  approvedAt: timestamp("approved_at", { withTimezone: false }),

  source: bookingSourceEnum("source").notNull().default("MANUAL_REQUEST"),

  sourceRef: text("source_ref"),
});

export const holidays = pgTable(
  "holidays",
  {
    id: serial("id").primaryKey(),

    name: text("name").notNull(),
    description: text("description"),

    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),

    createdBy: integer("created_by").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameIdx: index("holidays_name_idx").on(table.name),
    startDateIdx: index("holidays_start_date_idx").on(table.startDate),
    endDateIdx: index("holidays_end_date_idx").on(table.endDate),
    dateRangeCheck: check(
      "holidays_date_range_check",
      sql`${table.startDate} <= ${table.endDate}`,
    ),
  }),
);

export const timetableImportBatchStatusEnum = pgEnum(
  "timetable_import_batch_status",
  ["PREVIEWED", "COMMITTED"],
);

export const timetableImportRowStatusEnum = pgEnum("timetable_import_row_status", [
  "VALID_AND_AUTOMATABLE",
  "UNRESOLVED_SLOT",
  "UNRESOLVED_ROOM",
  "AMBIGUOUS_CLASSROOM",
  "DUPLICATE_ROW",
  "CONFLICTING_MAPPING",
  "MISSING_REQUIRED_FIELD",
  "OTHER_PROCESSING_ERROR",
]);

export const timetableImportOccurrenceStatusEnum = pgEnum(
  "timetable_import_occurrence_status",
  [
    "PENDING",
    "CREATED",
    "FAILED",
    "SKIPPED",
    "UNRESOLVED",
    "ALREADY_PROCESSED",
  ],
);

export const timetableImportDecisionActionEnum = pgEnum(
  "timetable_import_decision_action",
  ["AUTO", "RESOLVE", "SKIP"],
);

export const timetableCommitSessionStatusEnum = pgEnum(
  "timetable_commit_session_status",
  [
    "STARTED",
    "EXTERNAL_DONE",
    "INTERNAL_DONE",
    "FROZEN",
    "COMPLETED",
    "CANCELLED",
    "FAILED",
  ],
);

export type TimetableImportCreateSlotPayload = {
  dayId: number;
  startBandId: number;
  endBandId: number;
  laneIndex?: number;
  label?: string;
};

export type TimetableImportCreateRoomPayload = {
  buildingName: string;
  roomName: string;
};

export const timetableImportBatches = pgTable(
  "timetable_import_batches",
  {
    id: serial("id").primaryKey(),

    batchKey: text("batch_key").notNull(),

    slotSystemId: integer("slot_system_id")
      .notNull()
      .references(() => slotSystems.id, { onDelete: "cascade" }),

    termStartDate: timestamp("term_start_date", { withTimezone: false }).notNull(),
    termEndDate: timestamp("term_end_date", { withTimezone: false }).notNull(),

    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    fingerprint: text("fingerprint").notNull(),

    aliasMap: jsonb("alias_map")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    warnings: jsonb("warnings")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    auxiliaryHeaders: jsonb("auxiliary_headers")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    status: timetableImportBatchStatusEnum("status")
      .notNull()
      .default("PREVIEWED"),

    createdBy: integer("created_by"),

    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),

    committedAt: timestamp("committed_at", { withTimezone: false }),
  },
  (table) => ({
    batchKeyUnique: uniqueIndex("timetable_import_batches_batch_key_unique").on(
      table.batchKey,
    ),
    fingerprintUnique: uniqueIndex(
      "timetable_import_batches_fingerprint_unique",
    ).on(table.fingerprint),
  }),
);

export const timetableImportRows = pgTable(
  "timetable_import_rows",
  {
    id: serial("id").primaryKey(),

    batchId: integer("batch_id")
      .notNull()
      .references(() => timetableImportBatches.id, { onDelete: "cascade" }),

    rowIndex: integer("row_index").notNull(),

    rawRow: jsonb("raw_row").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),

    rawCourseCode: text("raw_course_code"),
    rawSlot: text("raw_slot"),
    rawClassroom: text("raw_classroom"),

    normalizedCourseCode: text("normalized_course_code"),
    normalizedSlot: text("normalized_slot"),
    normalizedClassroom: text("normalized_classroom"),

    classification: timetableImportRowStatusEnum("classification").notNull(),

    reasons: jsonb("reasons")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    suggestions: jsonb("suggestions")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    parsedBuilding: text("parsed_building"),
    parsedRoom: text("parsed_room"),

    resolvedSlotLabel: text("resolved_slot_label"),

    resolvedRoomId: integer("resolved_room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),

    rowHash: text("row_hash"),

    auxiliaryData: jsonb("auxiliary_data")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    batchRowUnique: uniqueIndex("timetable_import_rows_batch_row_unique").on(
      table.batchId,
      table.rowIndex,
    ),
  }),
);

export const timetableImportOccurrences = pgTable(
  "timetable_import_occurrences",
  {
    id: serial("id").primaryKey(),

    batchId: integer("batch_id")
      .notNull()
      .references(() => timetableImportBatches.id, { onDelete: "cascade" }),

    rowId: integer("row_id")
      .notNull()
      .references(() => timetableImportRows.id, { onDelete: "cascade" }),

    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),

    startAt: timestamp("start_at", { withTimezone: false }).notNull(),
    endAt: timestamp("end_at", { withTimezone: false }).notNull(),

    source: text("source").notNull().default("TIMETABLE_ALLOCATION"),
    sourceRef: text("source_ref"),

    dedupeKey: text("dedupe_key").notNull(),

    bookingId: integer("booking_id").references((): AnyPgColumn => bookings.id, {
      onDelete: "set null",
    }),

    status: timetableImportOccurrenceStatusEnum("status")
      .notNull()
      .default("PENDING"),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    dedupeKeyUnique: uniqueIndex(
      "timetable_import_occurrences_dedupe_key_unique",
    ).on(table.dedupeKey),
  }),
);

export const timetableImportRowResolutions = pgTable(
  "timetable_import_row_resolutions",
  {
    id: serial("id").primaryKey(),

    batchId: integer("batch_id")
      .notNull()
      .references(() => timetableImportBatches.id, { onDelete: "cascade" }),

    rowId: integer("row_id")
      .notNull()
      .references(() => timetableImportRows.id, { onDelete: "cascade" }),

    action: timetableImportDecisionActionEnum("action").notNull(),

    resolvedSlotLabel: text("resolved_slot_label"),

    resolvedRoomId: integer("resolved_room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),

    createSlot: jsonb("create_slot").$type<TimetableImportCreateSlotPayload | null>(),

    createRoom: jsonb("create_room").$type<TimetableImportCreateRoomPayload | null>(),

    createdCount: integer("created_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    alreadyProcessedCount: integer("already_processed_count").notNull().default(0),
    unresolvedCount: integer("unresolved_count").notNull().default(0),

    reasons: jsonb("reasons")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    batchRowUnique: uniqueIndex(
      "timetable_import_row_resolutions_batch_row_unique",
    ).on(table.batchId, table.rowId),
  }),
);

export const commitSessions = pgTable(
  "commit_sessions",
  {
    id: serial("id").primaryKey(),

    batchId: integer("batch_id")
      .notNull()
      .references(() => timetableImportBatches.id, { onDelete: "cascade" }),

    slotSystemId: integer("slot_system_id")
      .notNull()
      .references(() => slotSystems.id, { onDelete: "cascade" }),

    status: timetableCommitSessionStatusEnum("status")
      .notNull()
      .default("STARTED"),

    payloadSnapshot: text("payload_snapshot").notNull(),

    operations: jsonb("operations")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    externalConflicts: jsonb("external_conflicts")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    internalConflicts: jsonb("internal_conflicts")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    runtimeConflicts: jsonb("runtime_conflicts")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    resolutions: jsonb("resolutions")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    frozenAt: timestamp("frozen_at", { withTimezone: false }),

    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    batchIdIdx: index("commit_sessions_batch_id_idx").on(table.batchId),
    slotSystemIdIdx: index("commit_sessions_slot_system_id_idx").on(table.slotSystemId),
    statusIdx: index("commit_sessions_status_idx").on(table.status),
    createdAtIdx: index("commit_sessions_created_at_idx").on(table.createdAt),
  }),
);

export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING_FACULTY",
  "PENDING_STAFF",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const bookingEditRequestStatusEnum = pgEnum("booking_edit_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const bookingEventTypeEnum = pgEnum("booking_event_type", [
  "QUIZ",
  "SEMINAR",
  "SPEAKER_SESSION",
  "MEETING",
  "CULTURAL_EVENT",
  "WORKSHOP",
  "CLASS",
  "OTHER",
]);

export const bookingRequests = pgTable(
  "booking_requests",
  {
    id: serial("id").primaryKey(),

    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    facultyId: integer("faculty_id").references(() => users.id, {
      onDelete: "set null",
    }),

    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),

    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),

    eventType: bookingEventTypeEnum("event_type").notNull().default("OTHER"),

    purpose: text("purpose").notNull(),

    participantCount: integer("participant_count"),

    status: bookingStatusEnum("status").notNull().default("PENDING_FACULTY"),

    createdAt: timestamp("created_at").notNull().defaultNow(),

    bookingId: integer("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),

    rejectionReason: text("rejection_reason"),

    internalNote: text("internal_note"),

    decidedAt: timestamp("decided_at"),
  },
  (table) => ({
    userIdIdx: index("booking_requests_user_id_idx").on(table.userId),
    facultyIdIdx: index("booking_requests_faculty_id_idx").on(table.facultyId),
    roomIdIdx: index("booking_requests_room_id_idx").on(table.roomId),
    statusIdx: index("booking_requests_status_idx").on(table.status),
    participantCountPositiveCheck: check(
      "booking_requests_participant_count_positive_check",
      sql`${table.participantCount} IS NULL OR ${table.participantCount} > 0`,
    ),
  }),
);

export const bookingEditRequests = pgTable(
  "booking_edit_requests",
  {
    id: serial("id").primaryKey(),

    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    proposedRoomId: integer("proposed_room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),

    proposedStartAt: timestamp("proposed_start_at", { withTimezone: false }),
    proposedEndAt: timestamp("proposed_end_at", { withTimezone: false }),

    status: bookingEditRequestStatusEnum("status").notNull().default("PENDING"),

    requestedBy: integer("requested_by")
      .notNull()
      .references(() => users.id),

    reviewedBy: integer("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    bookingIdIdx: index("booking_edit_requests_booking_id_idx").on(table.bookingId),
    statusIdx: index("booking_edit_requests_status_idx").on(table.status),
    requestedByIdx: index("booking_edit_requests_requested_by_idx").on(table.requestedBy),
    proposedFieldsPresentCheck: check(
      "booking_edit_requests_proposed_fields_present_check",
      sql`${table.proposedRoomId} IS NOT NULL OR ${table.proposedStartAt} IS NOT NULL OR ${table.proposedEndAt} IS NOT NULL`,
    ),
  }),
);

// ------------------------
// User Role Enum
// ------------------------
export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "STAFF",
  "FACULTY",
  "STUDENT",
  "PENDING_ROLE",
]);

// ------------------------
// Users Table
// ------------------------
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),

    name: text("name").notNull(),

    email: text("email").notNull().unique(),

    passwordHash: text("password_hash").notNull(),

    role: userRoleEnum("role").notNull(),

    googleId: text("google_id"),
    avatarUrl: text("avatar_url"),
    displayName: text("display_name"),
    department: text("department"),
    isActive: boolean("is_active").notNull().default(true),
    registeredVia: text("registered_via").notNull().default("email"),
    firstLogin: boolean("first_login").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: false })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    googleIdUnique: uniqueIndex("users_google_id_unique").on(table.googleId),
    departmentIdx: index("users_department_idx").on(table.department),
    isActiveIdx: index("users_is_active_idx").on(table.isActive),
    registeredViaIdx: index("users_registered_via_idx").on(table.registeredVia),
    registeredViaAllowedCheck: check(
      "users_registered_via_allowed_check",
      sql`${table.registeredVia} IN ('email', 'google')`,
    ),
    googleDomainCheck: check(
      "users_google_email_domain_check",
      sql`${table.registeredVia} <> 'google' OR lower(${table.email}) LIKE '%@iitj.ac.in'`,
    ),
  }),
);

export const systemPreferences = pgTable(
  "system_preferences",
  {
    id: integer("id").primaryKey().notNull().default(1),
    manualDataLoading: boolean("manual_data_loading").notNull().default(true),
    autoLoadDependentData: boolean("auto_load_dependent_data")
      .notNull()
      .default(false),
    autoLoadSections: jsonb("auto_load_sections")
      .$type<Record<string, boolean>>()
      .notNull()
      .default(sql`'{"dashboard":false,"bookings":false,"rooms":false,"availability":false,"bookingRequests":false,"users":false}'::jsonb`),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    singletonCheck: check(
      "system_preferences_singleton_check",
      sql`${table.id} = 1`,
    ),
    updatedByIdx: index("system_preferences_updated_by_idx").on(table.updatedBy),
  }),
);

export const timetableDayOverrides = pgTable(
  "timetable_day_overrides",
  {
    id: serial("id").primaryKey(),
    targetDate: date("target_date").notNull(),
    followsDayOfWeek: dayOfWeekEnum("follows_day_of_week").notNull(),
    note: text("note"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    targetDateUnique: uniqueIndex("timetable_day_overrides_target_date_unique").on(
      table.targetDate,
    ),
    followsDayIdx: index("timetable_day_overrides_follows_day_idx").on(
      table.followsDayOfWeek,
    ),
    targetDateIdx: index("timetable_day_overrides_target_date_idx").on(
      table.targetDate,
    ),
  }),
);

// Deprecated: Slot/Venue change system removed
// retained only for backward compatibility
// not used in current system
export const notificationTypeEnum = pgEnum("notification_type", [
  "BOOKING_REQUEST_CREATED",
  "BOOKING_REQUEST_FORWARDED",
  "BOOKING_REQUEST_APPROVED",
  "BOOKING_REQUEST_REJECTED",
  "BOOKING_REQUEST_CANCELLED",
  "SLOT_CHANGE_REQUESTED",
  "SLOT_CHANGE_APPROVED",
  "SLOT_CHANGE_REJECTED",
  "VENUE_CHANGE_REQUESTED",
  "VENUE_CHANGE_APPROVED",
  "VENUE_CHANGE_REJECTED",
]);

export const notifications = pgTable(
  "notifications",
  {
    notificationId: serial("notification_id").primaryKey(),

    recipientId: integer("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    subject: text("subject").notNull(),

    message: text("message").notNull(),

    type: notificationTypeEnum("type").notNull(),

    isRead: boolean("is_read").notNull().default(false),

    sentAt: timestamp("sent_at", { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    recipientIdIdx: index("notifications_recipient_id_idx").on(table.recipientId),
    recipientReadIdx: index("notifications_recipient_read_idx").on(
      table.recipientId,
      table.isRead,
    ),
    sentAtIdx: index("notifications_sent_at_idx").on(table.sentAt),
  }),
);

export const staffBuildingAssignments = pgTable(
  "staff_building_assignments",
  {
    staffId: integer("staff_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    assignedBy: integer("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    staffBuildingUnique: uniqueIndex(
      "staff_building_assignments_staff_building_unique",
    ).on(table.staffId, table.buildingId),
    staffIdIdx: index("staff_building_assignments_staff_id_idx").on(table.staffId),
    buildingIdIdx: index("staff_building_assignments_building_id_idx").on(
      table.buildingId,
    ),
    assignedByIdx: index("staff_building_assignments_assigned_by_idx").on(
      table.assignedBy,
    ),
  }),
);

export const courses = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    department: text("department").notNull(),
    credits: integer("credits").notNull(),
    description: text("description"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    codeUnique: uniqueIndex("courses_code_unique").on(table.code),
    createdByIdx: index("courses_created_by_idx").on(table.createdBy),
    departmentIdx: index("courses_department_idx").on(table.department),
    nameIdx: index("courses_name_idx").on(table.name),
    isActiveIdx: index("courses_is_active_idx").on(table.isActive),
  }),
);

export const courseFaculty = pgTable(
  "course_faculty",
  {
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    facultyId: integer("faculty_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pairUnique: uniqueIndex("course_faculty_course_id_faculty_id_unique").on(
      table.courseId,
      table.facultyId,
    ),
    courseIdIdx: index("course_faculty_course_id_idx").on(table.courseId),
    facultyIdIdx: index("course_faculty_faculty_id_idx").on(table.facultyId),
  }),
);

export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pairUnique: uniqueIndex(
      "course_enrollments_course_id_student_id_unique",
    ).on(table.courseId, table.studentId),
    courseIdIdx: index("course_enrollments_course_id_idx").on(table.courseId),
    studentIdIdx: index("course_enrollments_student_id_idx").on(table.studentId),
  }),
);

export const bookingCourseLink = pgTable(
  "booking_course_link",
  {
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pairUnique: uniqueIndex("booking_course_link_booking_id_course_id_unique").on(
      table.bookingId,
      table.courseId,
    ),
    bookingIdIdx: index("booking_course_link_booking_id_idx").on(table.bookingId),
    courseIdIdx: index("booking_course_link_course_id_idx").on(table.courseId),
  }),
);

// Session store table (created by connect-pg-simple)
export const userSessions = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").$type<{
      cookie: {
        originalMaxAge: number;
        expires: string;
        httpOnly: boolean;
        path: string;
      };
      passport?: { user: number };
    }>().notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  })
);

export * from "../modules/timetable/schema";