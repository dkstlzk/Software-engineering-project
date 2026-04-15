import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required in backend/.env");
}

const pool = new Pool({ connectionString });

const SEEDED_LOGIN_DATA_PATH = path.join(__dirname, "seededLoginUsers.json");
const seededLoginData = JSON.parse(
  fs.readFileSync(SEEDED_LOGIN_DATA_PATH, "utf8"),
);

const SEEDED_LOGIN_USERS = Array.isArray(seededLoginData.users)
  ? seededLoginData.users
  : [];

const SEEDED_STAFF_BUILDING_ASSIGNMENTS = SEEDED_LOGIN_USERS.flatMap((user) => {
  if (user.role !== "STAFF") {
    return [];
  }

  const assignedBuildings = Array.isArray(user.assignedBuildings)
    ? user.assignedBuildings
    : [];

  return assignedBuildings.map((buildingName) => ({
    staffKey: user.key,
    buildingName,
  }));
});

if (SEEDED_LOGIN_USERS.length === 0) {
  throw new Error(
    "No users found in backend/scripts/seededLoginUsers.json. Add at least one seeded login user.",
  );
}

const DEFAULT_PASSWORD =
  process.env.SEED_DEFAULT_PASSWORD || seededLoginData.defaultPassword || "password123";

const counters = {
  usersCreated: 0,
  usersUpdated: 0,
  buildingsCreated: 0,
  buildingsUpdated: 0,
  roomsCreated: 0,
  roomsUpdated: 0,
  staffAssignmentsCreated: 0,
  coursesCreated: 0,
  coursesUpdated: 0,
  courseFacultyLinksCreated: 0,
  courseEnrollmentLinksCreated: 0,
  bookingRequestsCreated: 0,
  bookingRequestsUpdated: 0,
  bookingsCreated: 0,
  bookingCourseLinksCreated: 0,
  bookingEditRequestsCreated: 0,
  bookingEditRequestsUpdated: 0,
  notificationsCreated: 0,
};

function fixedDate(day, hour, minute) {
  return new Date(Date.UTC(2030, 0, day, hour, minute, 0, 0));
}

function getSeededUserId(userIdsByKey, key) {
  const id = userIdsByKey[key];
  if (!id) {
    throw new Error(`Missing seeded user id for key: ${key}`);
  }

  return id;
}

async function upsertUser(client, passwordHash, input) {
  const existing = await client.query(
    "SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [input.email],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE users
         SET name = $2,
             password_hash = $3,
             role = $4,
             department = $5,
             is_active = TRUE,
             registered_via = 'email',
             first_login = FALSE,
             google_id = NULL,
             avatar_url = NULL,
             display_name = $2
       WHERE id = $1`,
      [id, input.name, passwordHash, input.role, input.department ?? null],
    );
    counters.usersUpdated += 1;
    return id;
  }

  const inserted = await client.query(
    `INSERT INTO users
      (name, email, password_hash, role, department, is_active, registered_via, first_login, google_id, avatar_url, display_name)
     VALUES
      ($1, $2, $3, $4, $5, TRUE, 'email', FALSE, NULL, NULL, $1)
     RETURNING id`,
    [input.name, input.email, passwordHash, input.role, input.department ?? null],
  );

  counters.usersCreated += 1;
  return inserted.rows[0].id;
}

async function upsertBuilding(client, input) {
  const existing = await client.query(
    "SELECT id FROM buildings WHERE lower(name) = lower($1) LIMIT 1",
    [input.name],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE buildings
         SET location = $2,
             managed_by_staff_id = $3
       WHERE id = $1`,
      [id, input.location ?? null, input.managedByStaffId ?? null],
    );
    counters.buildingsUpdated += 1;
    return id;
  }

  const inserted = await client.query(
    `INSERT INTO buildings (name, location, managed_by_staff_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.name, input.location ?? null, input.managedByStaffId ?? null],
  );

  counters.buildingsCreated += 1;
  return inserted.rows[0].id;
}

async function upsertRoom(client, input) {
  const existing = await client.query(
    `SELECT id
       FROM rooms
      WHERE building_id = $1
        AND lower(name) = lower($2)
      LIMIT 1`,
    [input.buildingId, input.name],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE rooms
         SET capacity = $2,
             room_type = $3,
             has_projector = $4,
             has_mic = $5,
             accessible = $6,
             equipment_list = $7
       WHERE id = $1`,
      [
        id,
        input.capacity ?? null,
        input.roomType ?? "OTHER",
        input.hasProjector ?? false,
        input.hasMic ?? false,
        input.accessible ?? true,
        input.equipmentList ?? null,
      ],
    );
    counters.roomsUpdated += 1;
    return id;
  }

  const inserted = await client.query(
    `INSERT INTO rooms
      (name, building_id, capacity, room_type, has_projector, has_mic, accessible, equipment_list)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.name,
      input.buildingId,
      input.capacity ?? null,
      input.roomType ?? "OTHER",
      input.hasProjector ?? false,
      input.hasMic ?? false,
      input.accessible ?? true,
      input.equipmentList ?? null,
    ],
  );

  counters.roomsCreated += 1;
  return inserted.rows[0].id;
}

async function ensureStaffAssignment(client, staffId, buildingId, assignedBy) {
  const existing = await client.query(
    `SELECT 1
       FROM staff_building_assignments
      WHERE staff_id = $1 AND building_id = $2
      LIMIT 1`,
    [staffId, buildingId],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return;
  }

  await client.query(
    `INSERT INTO staff_building_assignments (staff_id, building_id, assigned_by)
     VALUES ($1, $2, $3)`,
    [staffId, buildingId, assignedBy],
  );

  counters.staffAssignmentsCreated += 1;
}

async function upsertCourse(client, input) {
  const existing = await client.query(
    "SELECT id FROM courses WHERE code = $1 LIMIT 1",
    [input.code],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE courses
         SET name = $2,
             department = $3,
             credits = $4,
             description = $5,
             created_by = $6,
             is_active = TRUE
       WHERE id = $1`,
      [
        id,
        input.name,
        input.department,
        input.credits,
        input.description ?? null,
        input.createdBy,
      ],
    );
    counters.coursesUpdated += 1;
    return id;
  }

  const inserted = await client.query(
    `INSERT INTO courses
      (code, name, department, credits, description, created_by, is_active)
     VALUES
      ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING id`,
    [
      input.code,
      input.name,
      input.department,
      input.credits,
      input.description ?? null,
      input.createdBy,
    ],
  );

  counters.coursesCreated += 1;
  return inserted.rows[0].id;
}

async function ensureCourseFacultyLink(client, courseId, facultyId) {
  const existing = await client.query(
    `SELECT 1
       FROM course_faculty
      WHERE course_id = $1 AND faculty_id = $2
      LIMIT 1`,
    [courseId, facultyId],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return;
  }

  await client.query(
    `INSERT INTO course_faculty (course_id, faculty_id)
     VALUES ($1, $2)`,
    [courseId, facultyId],
  );

  counters.courseFacultyLinksCreated += 1;
}

async function ensureCourseEnrollmentLink(client, courseId, studentId) {
  const existing = await client.query(
    `SELECT 1
       FROM course_enrollments
      WHERE course_id = $1 AND student_id = $2
      LIMIT 1`,
    [courseId, studentId],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return;
  }

  await client.query(
    `INSERT INTO course_enrollments (course_id, student_id)
     VALUES ($1, $2)`,
    [courseId, studentId],
  );

  counters.courseEnrollmentLinksCreated += 1;
}

async function upsertBookingRequest(client, input) {
  const existing = await client.query(
    `SELECT id, booking_id
       FROM booking_requests
      WHERE purpose = $1
      LIMIT 1`,
    [input.purpose],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE booking_requests
         SET user_id = $2,
             faculty_id = $3,
             room_id = $4,
             start_at = $5,
             end_at = $6,
             event_type = $7,
             participant_count = $8,
             status = $9,
             rejection_reason = $10,
             internal_note = $11,
             decided_at = $12
       WHERE id = $1`,
      [
        id,
        input.userId ?? null,
        input.facultyId ?? null,
        input.roomId,
        input.startAt,
        input.endAt,
        input.eventType,
        input.participantCount ?? null,
        input.status,
        input.rejectionReason ?? null,
        input.internalNote ?? null,
        input.decidedAt ?? null,
      ],
    );

    counters.bookingRequestsUpdated += 1;
    return { id, bookingId: existing.rows[0].booking_id ?? null };
  }

  const inserted = await client.query(
    `INSERT INTO booking_requests
      (user_id, faculty_id, room_id, start_at, end_at, event_type, purpose, participant_count, status, rejection_reason, internal_note, decided_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, booking_id`,
    [
      input.userId ?? null,
      input.facultyId ?? null,
      input.roomId,
      input.startAt,
      input.endAt,
      input.eventType,
      input.purpose,
      input.participantCount ?? null,
      input.status,
      input.rejectionReason ?? null,
      input.internalNote ?? null,
      input.decidedAt ?? null,
    ],
  );

  counters.bookingRequestsCreated += 1;
  return {
    id: inserted.rows[0].id,
    bookingId: inserted.rows[0].booking_id ?? null,
  };
}

async function ensureBooking(client, input) {
  const existing = await client.query(
    `SELECT id
       FROM bookings
      WHERE source_ref = $1
      LIMIT 1`,
    [input.sourceRef],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO bookings
      (room_id, start_at, end_at, request_id, approved_by, approved_at, source, source_ref)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.roomId,
      input.startAt,
      input.endAt,
      input.requestId ?? null,
      input.approvedBy ?? null,
      input.approvedAt ?? null,
      input.source,
      input.sourceRef,
    ],
  );

  counters.bookingsCreated += 1;
  return inserted.rows[0].id;
}

async function ensureBookingCourseLink(client, bookingId, courseId) {
  const existing = await client.query(
    `SELECT 1
       FROM booking_course_link
      WHERE booking_id = $1 AND course_id = $2
      LIMIT 1`,
    [bookingId, courseId],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return;
  }

  await client.query(
    `INSERT INTO booking_course_link (booking_id, course_id)
     VALUES ($1, $2)`,
    [bookingId, courseId],
  );

  counters.bookingCourseLinksCreated += 1;
}

async function linkBookingToRequest(client, bookingRequestId, bookingId) {
  await client.query(
    `UPDATE booking_requests
        SET booking_id = $2
      WHERE id = $1`,
    [bookingRequestId, bookingId],
  );
}

async function ensureBookingEditRequest(client, input) {
  const existing = await client.query(
    `SELECT id
       FROM booking_edit_requests
      WHERE booking_id = $1
        AND requested_by = $2
        AND proposed_room_id IS NOT DISTINCT FROM $3
        AND proposed_start_at IS NOT DISTINCT FROM $4
        AND proposed_end_at IS NOT DISTINCT FROM $5
      LIMIT 1`,
    [
      input.bookingId,
      input.requestedBy,
      input.proposedRoomId ?? null,
      input.proposedStartAt ?? null,
      input.proposedEndAt ?? null,
    ],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const id = existing.rows[0].id;

    await client.query(
      `UPDATE booking_edit_requests
          SET status = $2,
              reviewed_by = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [id, input.status ?? "PENDING", input.reviewedBy ?? null],
    );

    counters.bookingEditRequestsUpdated += 1;
    return id;
  }

  const inserted = await client.query(
    `INSERT INTO booking_edit_requests
      (booking_id, proposed_room_id, proposed_start_at, proposed_end_at, status, requested_by, reviewed_by)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.bookingId,
      input.proposedRoomId ?? null,
      input.proposedStartAt ?? null,
      input.proposedEndAt ?? null,
      input.status ?? "PENDING",
      input.requestedBy,
      input.reviewedBy ?? null,
    ],
  );

  counters.bookingEditRequestsCreated += 1;
  return inserted.rows[0].id;
}

async function ensureNotification(client, input) {
  const existing = await client.query(
    `SELECT notification_id
       FROM notifications
      WHERE recipient_id = $1
        AND subject = $2
        AND message = $3
        AND type = $4
      LIMIT 1`,
    [input.recipientId, input.subject, input.message, input.type],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return;
  }

  await client.query(
    `INSERT INTO notifications (recipient_id, subject, message, type)
     VALUES ($1, $2, $3, $4)`,
    [input.recipientId, input.subject, input.message, input.type],
  );

  counters.notificationsCreated += 1;
}

async function seedDevData() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Users (email/password only)
    const userIdsByKey = {};
    for (const seededUser of SEEDED_LOGIN_USERS) {
      if (
        !seededUser.key ||
        !seededUser.name ||
        !seededUser.email ||
        !seededUser.role
      ) {
        throw new Error(
          "Each entry in backend/scripts/seededLoginUsers.json must include key, name, email, and role.",
        );
      }

      userIdsByKey[seededUser.key] = await upsertUser(client, passwordHash, {
        name: seededUser.name,
        email: seededUser.email,
        role: seededUser.role,
        department: seededUser.department ?? null,
      });
    }

    const adminId = getSeededUserId(userIdsByKey, "admin");
    const staffOpsId = getSeededUserId(userIdsByKey, "staffOps");
    const staffFacilitiesId = getSeededUserId(userIdsByKey, "staffFacilities");
    const facultyCsId = getSeededUserId(userIdsByKey, "facultyCs");
    const facultyEeId = getSeededUserId(userIdsByKey, "facultyEe");
    const studentAliceId = getSeededUserId(userIdsByKey, "studentAlice");
    const studentBobId = getSeededUserId(userIdsByKey, "studentBob");
    const studentCharlieId = getSeededUserId(userIdsByKey, "studentCharlie");

    // Buildings and rooms
    const academicBlockAId = await upsertBuilding(client, {
      name: "Academic Block A",
      location: "North Campus",
      managedByStaffId: staffOpsId,
    });

    const lectureHallComplexId = await upsertBuilding(client, {
      name: "Lecture Hall Complex",
      location: "Central Campus",
      managedByStaffId: staffOpsId,
    });

    const innovationCenterId = await upsertBuilding(client, {
      name: "Innovation Center",
      location: "South Campus",
      managedByStaffId: staffFacilitiesId,
    });

    const roomA101Id = await upsertRoom(client, {
      buildingId: academicBlockAId,
      name: "A-101",
      capacity: 80,
      roomType: "LECTURE_HALL",
      hasProjector: true,
      hasMic: true,
      accessible: true,
      equipmentList: "Projector, Podium Mic",
    });

    const roomA102Id = await upsertRoom(client, {
      buildingId: academicBlockAId,
      name: "A-102",
      capacity: 60,
      roomType: "CLASSROOM",
      hasProjector: true,
      hasMic: false,
      accessible: true,
      equipmentList: "Projector",
    });

    const roomLh201Id = await upsertRoom(client, {
      buildingId: lectureHallComplexId,
      name: "LH-201",
      capacity: 120,
      roomType: "LECTURE_HALL",
      hasProjector: true,
      hasMic: true,
      accessible: true,
      equipmentList: "Dual Projector, Wireless Mic",
    });

    const roomLh202Id = await upsertRoom(client, {
      buildingId: lectureHallComplexId,
      name: "LH-202",
      capacity: 100,
      roomType: "LECTURE_HALL",
      hasProjector: true,
      hasMic: true,
      accessible: true,
      equipmentList: "Projector, PA System",
    });

    const roomIc110Id = await upsertRoom(client, {
      buildingId: innovationCenterId,
      name: "IC-110",
      capacity: 40,
      roomType: "SEMINAR_ROOM",
      hasProjector: true,
      hasMic: false,
      accessible: true,
      equipmentList: "Display Panel",
    });

    const roomIc210Id = await upsertRoom(client, {
      buildingId: innovationCenterId,
      name: "IC-210",
      capacity: 50,
      roomType: "COMPUTER_LAB",
      hasProjector: true,
      hasMic: false,
      accessible: true,
      equipmentList: "40 Workstations, Projector",
    });

    const buildingIdsByName = {
      "Academic Block A": academicBlockAId,
      "Lecture Hall Complex": lectureHallComplexId,
      "Innovation Center": innovationCenterId,
    };

    // Staff building assignments come from seededLoginUsers.json
    for (const assignment of SEEDED_STAFF_BUILDING_ASSIGNMENTS) {
      const staffId = getSeededUserId(userIdsByKey, assignment.staffKey);
      const buildingId = buildingIdsByName[assignment.buildingName];

      if (!buildingId) {
        throw new Error(
          `Unknown building '${assignment.buildingName}' in seededLoginUsers.json for staff key '${assignment.staffKey}'.`,
        );
      }

      await ensureStaffAssignment(client, staffId, buildingId, adminId);
    }

    // Courses and course mappings
    const courseCs101Id = await upsertCourse(client, {
      code: "CS101",
      name: "Introduction to Programming",
      department: "Computer Science",
      credits: 4,
      description: "Core first-year programming course",
      createdBy: adminId,
    });

    const courseEe201Id = await upsertCourse(client, {
      code: "EE201",
      name: "Circuits and Networks",
      department: "Electrical Engineering",
      credits: 4,
      description: "Second-year core circuits course",
      createdBy: adminId,
    });

    const courseHs105Id = await upsertCourse(client, {
      code: "HS105",
      name: "Technical Communication",
      department: "Humanities",
      credits: 3,
      description: "Communication and presentation skills",
      createdBy: adminId,
    });

    await ensureCourseFacultyLink(client, courseCs101Id, facultyCsId);
    await ensureCourseFacultyLink(client, courseEe201Id, facultyEeId);
    await ensureCourseFacultyLink(client, courseHs105Id, facultyCsId);

    await ensureCourseEnrollmentLink(client, courseCs101Id, studentAliceId);
    await ensureCourseEnrollmentLink(client, courseCs101Id, studentBobId);
    await ensureCourseEnrollmentLink(client, courseEe201Id, studentBobId);
    await ensureCourseEnrollmentLink(client, courseEe201Id, studentCharlieId);
    await ensureCourseEnrollmentLink(client, courseHs105Id, studentAliceId);
    await ensureCourseEnrollmentLink(client, courseHs105Id, studentCharlieId);

    // Booking requests and bookings
    const csLectureStart = fixedDate(15, 9, 0);
    const csLectureEnd = fixedDate(15, 10, 0);
    const eeLectureStart = fixedDate(15, 11, 0);
    const eeLectureEnd = fixedDate(15, 12, 0);

    const pendingFacultyStart = fixedDate(16, 10, 0);
    const pendingFacultyEnd = fixedDate(16, 11, 0);

    const pendingStaffStart = fixedDate(16, 14, 0);
    const pendingStaffEnd = fixedDate(16, 15, 0);

    const rejectedStart = fixedDate(17, 11, 0);
    const rejectedEnd = fixedDate(17, 12, 0);

    const approvedRequest = await upsertBookingRequest(client, {
      userId: facultyCsId,
      facultyId: facultyCsId,
      roomId: roomA101Id,
      startAt: csLectureStart,
      endAt: csLectureEnd,
      eventType: "CLASS",
      purpose: "[SEED] CS101 Week 1 lecture",
      participantCount: 70,
      status: "APPROVED",
      internalNote: "seed-data",
      decidedAt: fixedDate(10, 12, 0),
    });

    const pendingFacultyRequest = await upsertBookingRequest(client, {
      userId: studentAliceId,
      facultyId: facultyCsId,
      roomId: roomLh201Id,
      startAt: pendingFacultyStart,
      endAt: pendingFacultyEnd,
      eventType: "SEMINAR",
      purpose: "[SEED] Student seminar proposal",
      participantCount: 45,
      status: "PENDING_FACULTY",
      internalNote: "seed-data",
    });

    const pendingStaffRequest = await upsertBookingRequest(client, {
      userId: facultyEeId,
      facultyId: facultyEeId,
      roomId: roomIc110Id,
      startAt: pendingStaffStart,
      endAt: pendingStaffEnd,
      eventType: "WORKSHOP",
      purpose: "[SEED] EE201 workshop room request",
      participantCount: 35,
      status: "PENDING_STAFF",
      internalNote: "seed-data",
    });

    const rejectedRequest = await upsertBookingRequest(client, {
      userId: studentBobId,
      facultyId: facultyCsId,
      roomId: roomA102Id,
      startAt: rejectedStart,
      endAt: rejectedEnd,
      eventType: "QUIZ",
      purpose: "[SEED] Quiz room request (rejected)",
      participantCount: 50,
      status: "REJECTED",
      rejectionReason: "Time window unavailable",
      internalNote: "seed-data",
      decidedAt: fixedDate(11, 9, 30),
    });

    const csLectureBookingId = await ensureBooking(client, {
      roomId: roomA101Id,
      startAt: csLectureStart,
      endAt: csLectureEnd,
      requestId: approvedRequest.id,
      approvedBy: adminId,
      approvedAt: fixedDate(10, 12, 0),
      source: "MANUAL_REQUEST",
      sourceRef: "seed:booking:cs101-week1",
    });

    if (!approvedRequest.bookingId) {
      await linkBookingToRequest(client, approvedRequest.id, csLectureBookingId);
    }

    const eeLectureBookingId = await ensureBooking(client, {
      roomId: roomLh202Id,
      startAt: eeLectureStart,
      endAt: eeLectureEnd,
      requestId: null,
      approvedBy: adminId,
      approvedAt: fixedDate(10, 12, 30),
      source: "TIMETABLE_ALLOCATION",
      sourceRef: "seed:booking:ee201-lecture",
    });

    await ensureBookingCourseLink(client, csLectureBookingId, courseCs101Id);
    await ensureBookingCourseLink(client, eeLectureBookingId, courseEe201Id);

    // Booking edit requests (replaces deprecated slot/venue change request tables)
    await ensureBookingEditRequest(client, {
      bookingId: csLectureBookingId,
      requestedBy: facultyCsId,
      proposedRoomId: roomLh201Id,
      proposedStartAt: fixedDate(15, 10, 0),
      proposedEndAt: fixedDate(15, 11, 0),
      status: "PENDING",
    });

    await ensureBookingEditRequest(client, {
      bookingId: eeLectureBookingId,
      requestedBy: facultyEeId,
      proposedRoomId: roomIc210Id,
      status: "APPROVED",
      reviewedBy: adminId,
    });

    // Notifications
    await ensureNotification(client, {
      recipientId: adminId,
      subject: "[SEED] Booking Request Awaiting Action",
      message: "A seeded booking request is waiting for admin/staff review.",
      type: "BOOKING_REQUEST_CREATED",
    });

    await ensureNotification(client, {
      recipientId: staffOpsId,
      subject: "[SEED] Request Forwarded to Staff",
      message: "A seeded request was forwarded to staff queue.",
      type: "BOOKING_REQUEST_FORWARDED",
    });

    await ensureNotification(client, {
      recipientId: facultyCsId,
      subject: "[SEED] Request Approved",
      message: "Your seeded request has been approved.",
      type: "BOOKING_REQUEST_APPROVED",
    });

    await ensureNotification(client, {
      recipientId: studentAliceId,
      subject: "[SEED] Request Requires Faculty Review",
      message: "Your seeded request is pending faculty approval.",
      type: "BOOKING_REQUEST_CREATED",
    });

    // Keep variables referenced so we know seed path completed.
    void pendingFacultyRequest;
    void pendingStaffRequest;
    void rejectedRequest;

    await client.query("COMMIT");

    console.log("Seeded development data successfully.");
    console.log("All seeded users are email/password accounts only.");
    console.log(`Default seeded password: ${DEFAULT_PASSWORD}`);
    console.log("\nSeed summary:");
    for (const [key, value] of Object.entries(counters)) {
      console.log(`- ${key}: ${value}`);
    }

    console.log("\nSeeded login accounts:");
    for (const seededUser of SEEDED_LOGIN_USERS) {
      console.log(`- ${seededUser.email} (${seededUser.role})`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDevData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed development data:", error);
    process.exit(1);
  });
