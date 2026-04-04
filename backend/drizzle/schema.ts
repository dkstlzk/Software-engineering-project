import { pgTable, uniqueIndex, foreignKey, serial, text, integer, timestamp, jsonb, index, boolean, time, unique, check, varchar, json, type AnyPgColumn, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const bookingEventType = pgEnum("booking_event_type", ['QUIZ', 'SEMINAR', 'SPEAKER_SESSION', 'MEETING', 'CULTURAL_EVENT', 'WORKSHOP', 'CLASS', 'OTHER'])
export const bookingSource = pgEnum("booking_source", ['MANUAL_REQUEST', 'TIMETABLE_ALLOCATION', 'SLOT_CHANGE', 'VENUE_CHANGE'])
export const bookingStatus = pgEnum("booking_status", ['PENDING_FACULTY', 'PENDING_STAFF', 'APPROVED', 'REJECTED', 'CANCELLED'])
export const dayOfWeek = pgEnum("day_of_week", ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])
export const notificationType = pgEnum("notification_type", ['BOOKING_REQUEST_CREATED', 'BOOKING_REQUEST_FORWARDED', 'BOOKING_REQUEST_APPROVED', 'BOOKING_REQUEST_REJECTED', 'BOOKING_REQUEST_CANCELLED'])
export const roomType = pgEnum("room_type", ['LECTURE_HALL', 'CLASSROOM', 'SEMINAR_ROOM', 'COMPUTER_LAB', 'CONFERENCE_ROOM', 'AUDITORIUM', 'WORKSHOP', 'OTHER'])
export const slotChangeRequestStatus = pgEnum("slot_change_request_status", ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
export const timetableImportBatchStatus = pgEnum("timetable_import_batch_status", ['PREVIEWED', 'COMMITTED'])
export const timetableImportDecisionAction = pgEnum("timetable_import_decision_action", ['AUTO', 'RESOLVE', 'SKIP'])
export const timetableImportOccurrenceStatus = pgEnum("timetable_import_occurrence_status", ['PENDING', 'CREATED', 'FAILED', 'SKIPPED', 'UNRESOLVED', 'ALREADY_PROCESSED'])
export const timetableImportRowStatus = pgEnum("timetable_import_row_status", ['VALID_AND_AUTOMATABLE', 'UNRESOLVED_SLOT', 'UNRESOLVED_ROOM', 'AMBIGUOUS_CLASSROOM', 'DUPLICATE_ROW', 'CONFLICTING_MAPPING', 'MISSING_REQUIRED_FIELD', 'OTHER_PROCESSING_ERROR'])
export const userRole = pgEnum("user_role", ['ADMIN', 'STAFF', 'FACULTY', 'STUDENT', 'PENDING_ROLE'])


export const timetableImportBatches = pgTable("timetable_import_batches", {
	id: serial().primaryKey().notNull(),
	batchKey: text("batch_key").notNull(),
	slotSystemId: integer("slot_system_id").notNull(),
	termStartDate: timestamp("term_start_date", { mode: 'string' }).notNull(),
	termEndDate: timestamp("term_end_date", { mode: 'string' }).notNull(),
	fileName: text("file_name").notNull(),
	fileHash: text("file_hash").notNull(),
	fingerprint: text().notNull(),
	aliasMap: jsonb("alias_map").default({}).notNull(),
	warnings: jsonb().default([]).notNull(),
	status: timetableImportBatchStatus().default('PREVIEWED').notNull(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	committedAt: timestamp("committed_at", { mode: 'string' }),
}, (table) => [
	uniqueIndex("timetable_import_batches_batch_key_unique").using("btree", table.batchKey.asc().nullsLast().op("text_ops")),
	uniqueIndex("timetable_import_batches_fingerprint_unique").using("btree", table.fingerprint.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.slotSystemId],
			foreignColumns: [slotSystems.id],
			name: "timetable_import_batches_slot_system_id_slot_systems_id_fk"
		}).onDelete("cascade"),
]);

export const timetableImportRows = pgTable("timetable_import_rows", {
	id: serial().primaryKey().notNull(),
	batchId: integer("batch_id").notNull(),
	rowIndex: integer("row_index").notNull(),
	rawRow: jsonb("raw_row").default([]).notNull(),
	rawCourseCode: text("raw_course_code"),
	rawSlot: text("raw_slot"),
	rawClassroom: text("raw_classroom"),
	normalizedCourseCode: text("normalized_course_code"),
	normalizedSlot: text("normalized_slot"),
	normalizedClassroom: text("normalized_classroom"),
	classification: timetableImportRowStatus().notNull(),
	reasons: jsonb().default([]).notNull(),
	suggestions: jsonb().default([]).notNull(),
	parsedBuilding: text("parsed_building"),
	parsedRoom: text("parsed_room"),
	resolvedSlotLabel: text("resolved_slot_label"),
	resolvedRoomId: integer("resolved_room_id"),
	rowHash: text("row_hash"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("timetable_import_rows_batch_row_unique").using("btree", table.batchId.asc().nullsLast().op("int4_ops"), table.rowIndex.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [timetableImportBatches.id],
			name: "timetable_import_rows_batch_id_timetable_import_batches_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.resolvedRoomId],
			foreignColumns: [rooms.id],
			name: "timetable_import_rows_resolved_room_id_rooms_id_fk"
		}).onDelete("set null"),
]);

export const timetableImportOccurrences = pgTable("timetable_import_occurrences", {
	id: serial().primaryKey().notNull(),
	batchId: integer("batch_id").notNull(),
	rowId: integer("row_id").notNull(),
	roomId: integer("room_id").notNull(),
	startAt: timestamp("start_at", { mode: 'string' }).notNull(),
	endAt: timestamp("end_at", { mode: 'string' }).notNull(),
	source: text().default('TIMETABLE_ALLOCATION').notNull(),
	sourceRef: text("source_ref"),
	dedupeKey: text("dedupe_key").notNull(),
	bookingId: integer("booking_id"),
	status: timetableImportOccurrenceStatus().default('PENDING').notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("timetable_import_occurrences_dedupe_key_unique").using("btree", table.dedupeKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.rowId],
			foreignColumns: [timetableImportRows.id],
			name: "timetable_import_occurrences_row_id_timetable_import_rows_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.roomId],
			foreignColumns: [rooms.id],
			name: "timetable_import_occurrences_room_id_rooms_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "timetable_import_occurrences_booking_id_bookings_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [timetableImportBatches.id],
			name: "timetable_import_occurrences_batch_id_timetable_import_batches_"
		}).onDelete("cascade"),
]);

export const timetableImportRowResolutions = pgTable("timetable_import_row_resolutions", {
	id: serial().primaryKey().notNull(),
	batchId: integer("batch_id").notNull(),
	rowId: integer("row_id").notNull(),
	action: timetableImportDecisionAction().notNull(),
	resolvedSlotLabel: text("resolved_slot_label"),
	resolvedRoomId: integer("resolved_room_id"),
	createSlot: jsonb("create_slot"),
	createRoom: jsonb("create_room"),
	createdCount: integer("created_count").default(0).notNull(),
	failedCount: integer("failed_count").default(0).notNull(),
	skippedCount: integer("skipped_count").default(0).notNull(),
	alreadyProcessedCount: integer("already_processed_count").default(0).notNull(),
	unresolvedCount: integer("unresolved_count").default(0).notNull(),
	reasons: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("timetable_import_row_resolutions_batch_row_unique").using("btree", table.batchId.asc().nullsLast().op("int4_ops"), table.rowId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.resolvedRoomId],
			foreignColumns: [rooms.id],
			name: "timetable_import_row_resolutions_resolved_room_id_rooms_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [timetableImportBatches.id],
			name: "timetable_import_row_resolutions_batch_id_timetable_import_batc"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.rowId],
			foreignColumns: [timetableImportRows.id],
			name: "timetable_import_row_resolutions_row_id_timetable_import_rows_i"
		}).onDelete("cascade"),
]);

export const courseEnrollments = pgTable("course_enrollments", {
	courseId: integer("course_id").notNull(),
	studentId: integer("student_id").notNull(),
	enrolledAt: timestamp("enrolled_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("course_enrollments_course_id_idx").using("btree", table.courseId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("course_enrollments_course_id_student_id_unique").using("btree", table.courseId.asc().nullsLast().op("int4_ops"), table.studentId.asc().nullsLast().op("int4_ops")),
	index("course_enrollments_student_id_idx").using("btree", table.studentId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "course_enrollments_course_id_courses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [users.id],
			name: "course_enrollments_student_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const buildings = pgTable("buildings", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	location: text(),
	managedByStaffId: integer("managed_by_staff_id"),
}, (table) => [
	uniqueIndex("buildings_name_unique").using("btree", sql`lower(name)`),
	index("idx_buildings_managed_by").using("btree", table.managedByStaffId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.managedByStaffId],
			foreignColumns: [users.id],
			name: "buildings_managed_by_staff_id_fkey"
		}).onDelete("set null"),
]);

export const rooms = pgTable("rooms", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	buildingId: integer("building_id").notNull(),
	capacity: integer().default(40).notNull(),
	roomType: roomType("room_type").default('OTHER'),
	hasProjector: boolean("has_projector").default(false).notNull(),
	hasMic: boolean("has_mic").default(false).notNull(),
	accessible: boolean().default(true).notNull(),
	equipmentList: text("equipment_list"),
}, (table) => [
	index("idx_rooms_accessible").using("btree", table.accessible.asc().nullsLast().op("bool_ops")),
	uniqueIndex("rooms_building_name_unique").using("btree", sql`building_id`, sql`lower(name)`),
	foreignKey({
			columns: [table.buildingId],
			foreignColumns: [buildings.id],
			name: "rooms_building_id_buildings_id_fk"
		}),
]);

export const slotBlocks = pgTable("slot_blocks", {
	id: serial().primaryKey().notNull(),
	slotSystemId: integer("slot_system_id").notNull(),
	dayId: integer("day_id").notNull(),
	startBandId: integer("start_band_id").notNull(),
	rowSpan: integer("row_span").default(1).notNull(),
	label: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	laneIndex: integer("lane_index").default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.slotSystemId],
			foreignColumns: [slotSystems.id],
			name: "slot_blocks_slot_system_id_slot_systems_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.dayId],
			foreignColumns: [slotDays.id],
			name: "slot_blocks_day_id_slot_days_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startBandId],
			foreignColumns: [slotTimeBands.id],
			name: "slot_blocks_start_band_id_slot_time_bands_id_fk"
		}).onDelete("cascade"),
]);

export const slotDays = pgTable("slot_days", {
	id: serial().primaryKey().notNull(),
	slotSystemId: integer("slot_system_id").notNull(),
	dayOfWeek: dayOfWeek("day_of_week").notNull(),
	orderIndex: integer("order_index").notNull(),
	laneCount: integer("lane_count").default(1).notNull(),
}, (table) => [
	uniqueIndex("unique_day_order_per_system").using("btree", table.slotSystemId.asc().nullsLast().op("int4_ops"), table.orderIndex.asc().nullsLast().op("int4_ops")),
	uniqueIndex("unique_day_per_system").using("btree", table.slotSystemId.asc().nullsLast().op("enum_ops"), table.dayOfWeek.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.slotSystemId],
			foreignColumns: [slotSystems.id],
			name: "slot_days_slot_system_id_slot_systems_id_fk"
		}).onDelete("cascade"),
]);

export const slotSystems = pgTable("slot_systems", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const slotTimeBands = pgTable("slot_time_bands", {
	id: serial().primaryKey().notNull(),
	slotSystemId: integer("slot_system_id").notNull(),
	startTime: time("start_time").notNull(),
	endTime: time("end_time").notNull(),
	orderIndex: integer("order_index").notNull(),
}, (table) => [
	uniqueIndex("unique_band_order").using("btree", table.slotSystemId.asc().nullsLast().op("int4_ops"), table.orderIndex.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.slotSystemId],
			foreignColumns: [slotSystems.id],
			name: "slot_time_bands_slot_system_id_slot_systems_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	role: userRole().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	googleId: text("google_id"),
	avatarUrl: text("avatar_url"),
	displayName: text("display_name"),
	department: text(),
	isActive: boolean("is_active").default(true).notNull(),
	registeredVia: text("registered_via").default('email').notNull(),
	firstLogin: boolean("first_login").default(true).notNull(),
}, (table) => [
	index("users_department_idx").using("btree", table.department.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_google_id_unique").using("btree", table.googleId.asc().nullsLast().op("text_ops")),
	index("users_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("users_registered_via_idx").using("btree", table.registeredVia.asc().nullsLast().op("text_ops")),
	unique("users_email_unique").on(table.email),
	check("users_registered_via_allowed_check", sql`registered_via = ANY (ARRAY['email'::text, 'google'::text])`),
	check("users_google_email_domain_check", sql`(registered_via <> 'google'::text) OR (lower(email) ~~ '%@iitj.ac.in'::text)`),
]);

export const bookingCourseLink = pgTable("booking_course_link", {
	bookingId: integer("booking_id").notNull(),
	courseId: integer("course_id").notNull(),
}, (table) => [
	uniqueIndex("booking_course_link_booking_id_course_id_unique").using("btree", table.bookingId.asc().nullsLast().op("int4_ops"), table.courseId.asc().nullsLast().op("int4_ops")),
	index("booking_course_link_booking_id_idx").using("btree", table.bookingId.asc().nullsLast().op("int4_ops")),
	index("booking_course_link_course_id_idx").using("btree", table.courseId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "booking_course_link_booking_id_bookings_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "booking_course_link_course_id_courses_id_fk"
		}).onDelete("cascade"),
]);

export const courses = pgTable("courses", {
	id: serial().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	department: text().notNull(),
	credits: integer().notNull(),
	description: text(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	uniqueIndex("courses_code_unique").using("btree", table.code.asc().nullsLast().op("text_ops")),
	index("courses_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("int4_ops")),
	index("courses_department_idx").using("btree", table.department.asc().nullsLast().op("text_ops")),
	index("courses_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("courses_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "courses_created_by_users_id_fk"
		}).onDelete("set null"),
]);

export const courseFaculty = pgTable("course_faculty", {
	courseId: integer("course_id").notNull(),
	facultyId: integer("faculty_id").notNull(),
}, (table) => [
	uniqueIndex("course_faculty_course_id_faculty_id_unique").using("btree", table.courseId.asc().nullsLast().op("int4_ops"), table.facultyId.asc().nullsLast().op("int4_ops")),
	index("course_faculty_course_id_idx").using("btree", table.courseId.asc().nullsLast().op("int4_ops")),
	index("course_faculty_faculty_id_idx").using("btree", table.facultyId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "course_faculty_course_id_courses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.facultyId],
			foreignColumns: [users.id],
			name: "course_faculty_faculty_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const slotChangeRequests = pgTable("slot_change_requests", {
	id: serial().primaryKey().notNull(),
	requestedBy: integer("requested_by").notNull(),
	courseId: integer("course_id").notNull(),
	currentBookingId: integer("current_booking_id").notNull(),
	proposedRoomId: integer("proposed_room_id"),
	proposedStart: timestamp("proposed_start", { withTimezone: true, mode: 'string' }).notNull(),
	proposedEnd: timestamp("proposed_end", { withTimezone: true, mode: 'string' }).notNull(),
	reason: text().notNull(),
	status: slotChangeRequestStatus().default('PENDING').notNull(),
	reviewedBy: integer("reviewed_by"),
	reviewNote: text("review_note"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("slot_change_requests_course_id_idx").using("btree", table.courseId.asc().nullsLast().op("int4_ops")),
	index("slot_change_requests_current_booking_id_idx").using("btree", table.currentBookingId.asc().nullsLast().op("int4_ops")),
	index("slot_change_requests_proposed_end_idx").using("btree", table.proposedEnd.asc().nullsLast().op("timestamptz_ops")),
	index("slot_change_requests_proposed_room_id_idx").using("btree", table.proposedRoomId.asc().nullsLast().op("int4_ops")),
	index("slot_change_requests_proposed_start_idx").using("btree", table.proposedStart.asc().nullsLast().op("timestamptz_ops")),
	index("slot_change_requests_requested_by_idx").using("btree", table.requestedBy.asc().nullsLast().op("int4_ops")),
	index("slot_change_requests_reviewed_by_idx").using("btree", table.reviewedBy.asc().nullsLast().op("int4_ops")),
	index("slot_change_requests_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "slot_change_requests_requested_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "slot_change_requests_course_id_courses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.currentBookingId],
			foreignColumns: [bookings.id],
			name: "slot_change_requests_current_booking_id_bookings_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.proposedRoomId],
			foreignColumns: [rooms.id],
			name: "slot_change_requests_proposed_room_id_rooms_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "slot_change_requests_reviewed_by_users_id_fk"
		}).onDelete("set null"),
	check("slot_change_requests_valid_proposed_range_check", sql`proposed_end > proposed_start`),
]);

export const userSessions = pgTable("user_sessions", {
	sid: varchar().primaryKey().notNull(),
	sess: json().notNull(),
	expire: timestamp({ precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("IDX_session_expire").using("btree", table.expire.asc().nullsLast().op("timestamp_ops")),
]);

export const bookingRequests = pgTable("booking_requests", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id"),
	roomId: integer("room_id").notNull(),
	startAt: timestamp("start_at", { mode: 'string' }).notNull(),
	endAt: timestamp("end_at", { mode: 'string' }).notNull(),
	purpose: text().notNull(),
	status: bookingStatus().default('PENDING_FACULTY').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	bookingId: integer("booking_id"),
	rejectionReason: text("rejection_reason"),
	internalNote: text("internal_note"),
	decidedAt: timestamp("decided_at", { mode: 'string' }),
	facultyId: integer("faculty_id"),
	eventType: bookingEventType("event_type").default('OTHER').notNull(),
	participantCount: integer("participant_count"),
}, (table) => [
	index("booking_requests_faculty_id_idx").using("btree", table.facultyId.asc().nullsLast().op("int4_ops")),
	index("booking_requests_room_id_idx").using("btree", table.roomId.asc().nullsLast().op("int4_ops")),
	index("booking_requests_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("booking_requests_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "booking_requests_user_id_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.roomId],
			foreignColumns: [rooms.id],
			name: "booking_requests_room_id_rooms_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "booking_requests_booking_id_bookings_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.facultyId],
			foreignColumns: [users.id],
			name: "booking_requests_faculty_id_users_id_fk"
		}).onDelete("set null"),
	check("booking_requests_participant_count_positive_check", sql`(participant_count IS NULL) OR (participant_count > 0)`),
]);

export const bookings = pgTable("bookings", {
	id: serial().primaryKey().notNull(),
	roomId: integer("room_id").notNull(),
	startAt: timestamp("start_at", { mode: 'string' }).notNull(),
	endAt: timestamp("end_at", { mode: 'string' }).notNull(),
	requestId: integer("request_id"),
	source: bookingSource().default('MANUAL_REQUEST').notNull(),
	sourceRef: text("source_ref"),
	userId: integer("user_id"),
	purpose: text().default('General booking').notNull(),
	approvedBy: integer("approved_by"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.roomId],
			foreignColumns: [rooms.id],
			name: "bookings_room_id_rooms_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [bookingRequests.id],
			name: "bookings_request_id_booking_requests_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "bookings_user_id_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "bookings_approved_by_users_id_fk"
		}).onDelete("set null"),
]);

export const staffBuildingAssignments = pgTable("staff_building_assignments", {
	staffId: integer("staff_id").notNull(),
	buildingId: integer("building_id").notNull(),
	assignedBy: integer("assigned_by"),
	assignedAt: timestamp("assigned_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("staff_building_assignments_assigned_by_idx").using("btree", table.assignedBy.asc().nullsLast().op("int4_ops")),
	index("staff_building_assignments_building_id_idx").using("btree", table.buildingId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("staff_building_assignments_staff_building_unique").using("btree", table.staffId.asc().nullsLast().op("int4_ops"), table.buildingId.asc().nullsLast().op("int4_ops")),
	index("staff_building_assignments_staff_id_idx").using("btree", table.staffId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [users.id],
			name: "staff_building_assignments_staff_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.buildingId],
			foreignColumns: [buildings.id],
			name: "staff_building_assignments_building_id_buildings_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assignedBy],
			foreignColumns: [users.id],
			name: "staff_building_assignments_assigned_by_users_id_fk"
		}).onDelete("set null"),
]);

export const notifications = pgTable("notifications", {
	notificationId: serial("notification_id").primaryKey().notNull(),
	recipientId: integer("recipient_id").notNull(),
	subject: text().notNull(),
	message: text().notNull(),
	type: notificationType().notNull(),
	isRead: boolean("is_read").default(false).notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("notifications_recipient_id_idx").using("btree", table.recipientId.asc().nullsLast().op("int4_ops")),
	index("notifications_recipient_read_idx").using("btree", table.recipientId.asc().nullsLast().op("int4_ops"), table.isRead.asc().nullsLast().op("int4_ops")),
	index("notifications_sent_at_idx").using("btree", table.sentAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.recipientId],
			foreignColumns: [users.id],
			name: "notifications_recipient_id_users_id_fk"
		}).onDelete("cascade"),
]);
