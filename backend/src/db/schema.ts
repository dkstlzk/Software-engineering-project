import {
  pgTable,
  pgEnum,
  serial,
  text,
  boolean,
  uniqueIndex,
  index,
  check,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { slotSystems } from "../modules/timetable/schema";

export const buildings = pgTable(
  "buildings",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("buildings_name_unique").on(
      sql`lower(${table.name})`
    ),
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
  },
  (table) => ({
    roomUniquePerBuilding: uniqueIndex("rooms_building_name_unique").on(
      table.buildingId,
      sql`lower(${table.name})`
    ),
  })
);

export const bookingSourceEnum = pgEnum("booking_source", [
  "MANUAL",
  "BOOKING_REQUEST",
  "TIMETABLE_IMPORT",
]);

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),

  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),

  startAt: timestamp("start_at", { withTimezone: false }).notNull(),

  endAt: timestamp("end_at", { withTimezone: false }).notNull(),

  requestId: integer("request_id").references(() => bookingRequests.id, {
    onDelete: "set null",
  }),

  source: bookingSourceEnum("source").notNull().default("MANUAL"),

  sourceRef: text("source_ref"),
});

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

    source: text("source").notNull().default("TIMETABLE_IMPORT"),
    sourceRef: text("source_ref"),

    dedupeKey: text("dedupe_key").notNull(),

    bookingId: integer("booking_id").references(() => bookings.id, {
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

export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING_FACULTY",
  "PENDING_STAFF",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
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

    purpose: text("purpose").notNull(),

    status: bookingStatusEnum("status").notNull().default("PENDING_FACULTY"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("booking_requests_user_id_idx").on(table.userId),
    facultyIdIdx: index("booking_requests_faculty_id_idx").on(table.facultyId),
    roomIdIdx: index("booking_requests_room_id_idx").on(table.roomId),
    statusIdx: index("booking_requests_status_idx").on(table.status),
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

export const slotChangeRequestStatusEnum = pgEnum("slot_change_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const slotChangeRequests = pgTable(
  "slot_change_requests",
  {
    id: serial("id").primaryKey(),
    requestedBy: integer("requested_by")
      .notNull()
      .references(() => users.id),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    currentBookingId: integer("current_booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    proposedRoomId: integer("proposed_room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    proposedStart: timestamp("proposed_start", { withTimezone: true }).notNull(),
    proposedEnd: timestamp("proposed_end", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    status: slotChangeRequestStatusEnum("status").notNull().default("PENDING"),
    reviewedBy: integer("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    requestedByIdx: index("slot_change_requests_requested_by_idx").on(
      table.requestedBy,
    ),
    courseIdIdx: index("slot_change_requests_course_id_idx").on(table.courseId),
    currentBookingIdIdx: index("slot_change_requests_current_booking_id_idx").on(
      table.currentBookingId,
    ),
    proposedRoomIdIdx: index("slot_change_requests_proposed_room_id_idx").on(
      table.proposedRoomId,
    ),
    reviewedByIdx: index("slot_change_requests_reviewed_by_idx").on(
      table.reviewedBy,
    ),
    statusIdx: index("slot_change_requests_status_idx").on(table.status),
    proposedStartIdx: index("slot_change_requests_proposed_start_idx").on(
      table.proposedStart,
    ),
    proposedEndIdx: index("slot_change_requests_proposed_end_idx").on(
      table.proposedEnd,
    ),
    proposedRangeCheck: check(
      "slot_change_requests_valid_proposed_range_check",
      sql`${table.proposedEnd} > ${table.proposedStart}`,
    ),
  }),
);

export * from "../modules/timetable/schema";