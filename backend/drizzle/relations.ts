import { relations } from "drizzle-orm/relations";
import { slotSystems, timetableImportBatches, timetableImportRows, rooms, timetableImportOccurrences, bookings, timetableImportRowResolutions, courses, courseEnrollments, users, buildings, slotBlocks, slotDays, slotTimeBands, bookingCourseLink, courseFaculty, slotChangeRequests, bookingRequests, staffBuildingAssignments, notifications } from "./schema";

export const timetableImportBatchesRelations = relations(timetableImportBatches, ({one, many}) => ({
	slotSystem: one(slotSystems, {
		fields: [timetableImportBatches.slotSystemId],
		references: [slotSystems.id]
	}),
	timetableImportRows: many(timetableImportRows),
	timetableImportOccurrences: many(timetableImportOccurrences),
	timetableImportRowResolutions: many(timetableImportRowResolutions),
}));

export const slotSystemsRelations = relations(slotSystems, ({many}) => ({
	timetableImportBatches: many(timetableImportBatches),
	slotBlocks: many(slotBlocks),
	slotDays: many(slotDays),
	slotTimeBands: many(slotTimeBands),
}));

export const timetableImportRowsRelations = relations(timetableImportRows, ({one, many}) => ({
	timetableImportBatch: one(timetableImportBatches, {
		fields: [timetableImportRows.batchId],
		references: [timetableImportBatches.id]
	}),
	room: one(rooms, {
		fields: [timetableImportRows.resolvedRoomId],
		references: [rooms.id]
	}),
	timetableImportOccurrences: many(timetableImportOccurrences),
	timetableImportRowResolutions: many(timetableImportRowResolutions),
}));

export const roomsRelations = relations(rooms, ({one, many}) => ({
	timetableImportRows: many(timetableImportRows),
	timetableImportOccurrences: many(timetableImportOccurrences),
	timetableImportRowResolutions: many(timetableImportRowResolutions),
	building: one(buildings, {
		fields: [rooms.buildingId],
		references: [buildings.id]
	}),
	slotChangeRequests: many(slotChangeRequests),
	bookingRequests: many(bookingRequests),
	bookings: many(bookings),
}));

export const timetableImportOccurrencesRelations = relations(timetableImportOccurrences, ({one}) => ({
	timetableImportRow: one(timetableImportRows, {
		fields: [timetableImportOccurrences.rowId],
		references: [timetableImportRows.id]
	}),
	room: one(rooms, {
		fields: [timetableImportOccurrences.roomId],
		references: [rooms.id]
	}),
	booking: one(bookings, {
		fields: [timetableImportOccurrences.bookingId],
		references: [bookings.id]
	}),
	timetableImportBatch: one(timetableImportBatches, {
		fields: [timetableImportOccurrences.batchId],
		references: [timetableImportBatches.id]
	}),
}));

export const bookingsRelations = relations(bookings, ({one, many}) => ({
	timetableImportOccurrences: many(timetableImportOccurrences),
	bookingCourseLinks: many(bookingCourseLink),
	slotChangeRequests: many(slotChangeRequests),
	bookingRequests: many(bookingRequests, {
		relationName: "bookingRequests_bookingId_bookings_id"
	}),
	room: one(rooms, {
		fields: [bookings.roomId],
		references: [rooms.id]
	}),
	bookingRequest: one(bookingRequests, {
		fields: [bookings.requestId],
		references: [bookingRequests.id],
		relationName: "bookings_requestId_bookingRequests_id"
	}),
	user_userId: one(users, {
		fields: [bookings.userId],
		references: [users.id],
		relationName: "bookings_userId_users_id"
	}),
	user_approvedBy: one(users, {
		fields: [bookings.approvedBy],
		references: [users.id],
		relationName: "bookings_approvedBy_users_id"
	}),
}));

export const timetableImportRowResolutionsRelations = relations(timetableImportRowResolutions, ({one}) => ({
	room: one(rooms, {
		fields: [timetableImportRowResolutions.resolvedRoomId],
		references: [rooms.id]
	}),
	timetableImportBatch: one(timetableImportBatches, {
		fields: [timetableImportRowResolutions.batchId],
		references: [timetableImportBatches.id]
	}),
	timetableImportRow: one(timetableImportRows, {
		fields: [timetableImportRowResolutions.rowId],
		references: [timetableImportRows.id]
	}),
}));

export const courseEnrollmentsRelations = relations(courseEnrollments, ({one}) => ({
	course: one(courses, {
		fields: [courseEnrollments.courseId],
		references: [courses.id]
	}),
	user: one(users, {
		fields: [courseEnrollments.studentId],
		references: [users.id]
	}),
}));

export const coursesRelations = relations(courses, ({one, many}) => ({
	courseEnrollments: many(courseEnrollments),
	bookingCourseLinks: many(bookingCourseLink),
	user: one(users, {
		fields: [courses.createdBy],
		references: [users.id]
	}),
	courseFaculties: many(courseFaculty),
	slotChangeRequests: many(slotChangeRequests),
}));

export const usersRelations = relations(users, ({many}) => ({
	courseEnrollments: many(courseEnrollments),
	buildings: many(buildings),
	courses: many(courses),
	courseFaculties: many(courseFaculty),
	slotChangeRequests_requestedBy: many(slotChangeRequests, {
		relationName: "slotChangeRequests_requestedBy_users_id"
	}),
	slotChangeRequests_reviewedBy: many(slotChangeRequests, {
		relationName: "slotChangeRequests_reviewedBy_users_id"
	}),
	bookingRequests_userId: many(bookingRequests, {
		relationName: "bookingRequests_userId_users_id"
	}),
	bookingRequests_facultyId: many(bookingRequests, {
		relationName: "bookingRequests_facultyId_users_id"
	}),
	bookings_userId: many(bookings, {
		relationName: "bookings_userId_users_id"
	}),
	bookings_approvedBy: many(bookings, {
		relationName: "bookings_approvedBy_users_id"
	}),
	staffBuildingAssignments_staffId: many(staffBuildingAssignments, {
		relationName: "staffBuildingAssignments_staffId_users_id"
	}),
	staffBuildingAssignments_assignedBy: many(staffBuildingAssignments, {
		relationName: "staffBuildingAssignments_assignedBy_users_id"
	}),
	notifications: many(notifications),
}));

export const buildingsRelations = relations(buildings, ({one, many}) => ({
	user: one(users, {
		fields: [buildings.managedByStaffId],
		references: [users.id]
	}),
	rooms: many(rooms),
	staffBuildingAssignments: many(staffBuildingAssignments),
}));

export const slotBlocksRelations = relations(slotBlocks, ({one}) => ({
	slotSystem: one(slotSystems, {
		fields: [slotBlocks.slotSystemId],
		references: [slotSystems.id]
	}),
	slotDay: one(slotDays, {
		fields: [slotBlocks.dayId],
		references: [slotDays.id]
	}),
	slotTimeBand: one(slotTimeBands, {
		fields: [slotBlocks.startBandId],
		references: [slotTimeBands.id]
	}),
}));

export const slotDaysRelations = relations(slotDays, ({one, many}) => ({
	slotBlocks: many(slotBlocks),
	slotSystem: one(slotSystems, {
		fields: [slotDays.slotSystemId],
		references: [slotSystems.id]
	}),
}));

export const slotTimeBandsRelations = relations(slotTimeBands, ({one, many}) => ({
	slotBlocks: many(slotBlocks),
	slotSystem: one(slotSystems, {
		fields: [slotTimeBands.slotSystemId],
		references: [slotSystems.id]
	}),
}));

export const bookingCourseLinkRelations = relations(bookingCourseLink, ({one}) => ({
	booking: one(bookings, {
		fields: [bookingCourseLink.bookingId],
		references: [bookings.id]
	}),
	course: one(courses, {
		fields: [bookingCourseLink.courseId],
		references: [courses.id]
	}),
}));

export const courseFacultyRelations = relations(courseFaculty, ({one}) => ({
	course: one(courses, {
		fields: [courseFaculty.courseId],
		references: [courses.id]
	}),
	user: one(users, {
		fields: [courseFaculty.facultyId],
		references: [users.id]
	}),
}));

export const slotChangeRequestsRelations = relations(slotChangeRequests, ({one}) => ({
	user_requestedBy: one(users, {
		fields: [slotChangeRequests.requestedBy],
		references: [users.id],
		relationName: "slotChangeRequests_requestedBy_users_id"
	}),
	course: one(courses, {
		fields: [slotChangeRequests.courseId],
		references: [courses.id]
	}),
	booking: one(bookings, {
		fields: [slotChangeRequests.currentBookingId],
		references: [bookings.id]
	}),
	room: one(rooms, {
		fields: [slotChangeRequests.proposedRoomId],
		references: [rooms.id]
	}),
	user_reviewedBy: one(users, {
		fields: [slotChangeRequests.reviewedBy],
		references: [users.id],
		relationName: "slotChangeRequests_reviewedBy_users_id"
	}),
}));

export const bookingRequestsRelations = relations(bookingRequests, ({one, many}) => ({
	user_userId: one(users, {
		fields: [bookingRequests.userId],
		references: [users.id],
		relationName: "bookingRequests_userId_users_id"
	}),
	room: one(rooms, {
		fields: [bookingRequests.roomId],
		references: [rooms.id]
	}),
	booking: one(bookings, {
		fields: [bookingRequests.bookingId],
		references: [bookings.id],
		relationName: "bookingRequests_bookingId_bookings_id"
	}),
	user_facultyId: one(users, {
		fields: [bookingRequests.facultyId],
		references: [users.id],
		relationName: "bookingRequests_facultyId_users_id"
	}),
	bookings: many(bookings, {
		relationName: "bookings_requestId_bookingRequests_id"
	}),
}));

export const staffBuildingAssignmentsRelations = relations(staffBuildingAssignments, ({one}) => ({
	user_staffId: one(users, {
		fields: [staffBuildingAssignments.staffId],
		references: [users.id],
		relationName: "staffBuildingAssignments_staffId_users_id"
	}),
	building: one(buildings, {
		fields: [staffBuildingAssignments.buildingId],
		references: [buildings.id]
	}),
	user_assignedBy: one(users, {
		fields: [staffBuildingAssignments.assignedBy],
		references: [users.id],
		relationName: "staffBuildingAssignments_assignedBy_users_id"
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.recipientId],
		references: [users.id]
	}),
}));