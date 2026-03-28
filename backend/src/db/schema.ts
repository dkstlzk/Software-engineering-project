import {
  pgTable,
  pgEnum,
  serial,
  text,
  uniqueIndex,
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

export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING_FACULTY",
  "PENDING_STAFF",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const bookingRequests = pgTable("booking_requests", {
  id: serial("id").primaryKey(),

  userId: integer("user_id").references(() => users.id, {
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
});

// ------------------------
// User Role Enum
// ------------------------
export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "STAFF",
  "FACULTY",
  "STUDENT",
]);

// ------------------------
// Users Table
// ------------------------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  name: text("name").notNull(),

  email: text("email").notNull().unique(),

  passwordHash: text("password_hash").notNull(),

  role: userRoleEnum("role").notNull(),

  createdAt: timestamp("created_at", { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export * from "../modules/timetable/schema";