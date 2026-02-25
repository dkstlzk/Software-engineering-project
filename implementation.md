# 🏛️ Unified Room Allocation & LHC Management System
**Version:** 1.0 | **Based on SRS v2.4** | **IIT Jodhpur**

A web-based portal providing a unified gateway for managing lecture halls, department rooms, and examination schedules at IIT Jodhpur. This document describes what needs to be built and how to approach building it efficiently.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Database Design](#4-database-design)
5. [Backend Modules](#5-backend-modules)
6. [Frontend Requirements](#6-frontend-requirements)
7. [Core Business Logic](#7-core-business-logic)
8. [API Reference](#8-api-reference)
9. [Authentication & Permissions](#9-authentication--permissions)
10. [Notification System](#10-notification-system)
11. [Phase-wise Development Plan](#11-phase-wise-development-plan)
12. [Deployment](#12-deployment)
13. [Testing Strategy](#13-testing-strategy)
14. [Class Design Reference](#14-class-design-reference)
15. [Design Decisions & Deviations from SRS](#15-design-decisions--deviations-from-srs)
16. [Spreadsheet Sufficiency Analysis](#16-spreadsheet-sufficiency-analysis)

---

## 1. Architecture Overview

The system follows a **monolith-first, service-ready** pattern — easier to develop and deploy at college scale, while keeping modules clean enough to extract later if needed.

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT LAYER                       │
│  React SPA  ──  Role-based dashboards per user type  │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS / REST
┌────────────────────────▼────────────────────────────┐
│                   API GATEWAY                        │
│  Nginx  ──  Rate limiting, SSL termination, routing  │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│               APPLICATION SERVER                     │
│  Node.js / Express  ──  JWT Auth Middleware          │
│  ├── Booking Module                                  │
│  ├── Timetable Module                                │
│  ├── Clash Detection Engine                          │
│  ├── Slot/Venue Change Module                        │
│  ├── Notification Service                            │
│  └── Admin / Conflict Resolution Module              │
└──────────┬────────────────────────┬─────────────────┘
           │                        │
┌──────────▼────────┐   ┌───────────▼──────────────────┐
│   PostgreSQL DB   │   │   Redis (Cache + Job Queue)   │
│  Primary storage  │   │  Session store, notif queue   │
└───────────────────┘   └──────────────────────────────┘
```

**Key design choices and why:**

- **PostgreSQL over MySQL** — complex relational queries and row-level locking are critical for concurrent booking prevention.
- **Redis** — caches room availability (invalidated on booking changes) and acts as a BullMQ job queue for background email notifications.
- **React SPA** — single app with role-gated views, avoiding the overhead of separate apps per role.
- **Monolithic-first** — appropriate for college scale; modules can be extracted to microservices only if load demands it.

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + TypeScript | Type safety, component reuse |
| UI Library | Shadcn/UI + Tailwind CSS | Fast, consistent, accessible |
| State Management | Redux | Predictable global state |
| Backend | Node.js + Express + TypeScript | Familiar ecosystem, strong typing |
| ORM | Prisma | Type-safe DB access, migration tooling |
| Database | PostgreSQL 15 | ACID compliance, row-level locking |
| Cache / Queue | Redis + BullMQ | Fast invalidation, async email jobs |
| Auth | JWT + bcrypt | Stateless, role-embeddable tokens |
| Email | Nodemailer + SMTP (or SendGrid) | Booking status notifications |
| File Parsing | SheetJS (xlsx) | Excel timetable upload |
| Testing | Jest + Supertest + Playwright | Unit, integration, E2E |
| Container | Docker + Docker Compose | Dev/prod parity |
| Reverse Proxy | Nginx | SSL, rate limiting |
| CI/CD | GitHub Actions | Automated test & deploy |

---

## 3. Repository Structure

The project is a monorepo with two apps: `api` (Express backend) and `web` (React frontend), plus shared infrastructure config.

```
lhc-management/
├── apps/
│   ├── api/                        # Express backend
│   │   ├── src/
│   │   │   ├── modules/            # Feature modules (one folder per domain)
│   │   │   │   ├── auth/
│   │   │   │   ├── booking/
│   │   │   │   ├── timetable/
│   │   │   │   ├── clash-detection/
│   │   │   │   ├── slot-change/
│   │   │   │   ├── venue-change/
│   │   │   │   ├── notifications/
│   │   │   │   ├── admin/
│   │   │   │   └── rooms/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── rbac.middleware.ts
│   │   │   │   └── rate-limit.middleware.ts
│   │   │   ├── shared/
│   │   │   │   ├── errors/
│   │   │   │   ├── utils/
│   │   │   │   └── types/
│   │   │   └── app.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── package.json
│   │
│   └── web/                        # React frontend
│       ├── src/
│       │   ├── pages/
│       │   │   ├── admin/
│       │   │   ├── staff/
│       │   │   ├── faculty/
│       │   │   └── student/
│       │   ├── components/
│       │   │   ├── booking/
│       │   │   ├── timetable/
│       │   │   ├── rooms/
│       │   │   └── shared/
│       │   ├── hooks/
│       │   ├── stores/
│       │   └── lib/
│       └── package.json
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── nginx/
│   └── nginx.conf
└── .github/
    └── workflows/
        └── ci-cd.yml
```

**Each backend module follows the same internal structure:**
```
module/
├── module.routes.ts      # Express router
├── module.controller.ts  # Request handling, response formatting
├── module.service.ts     # Business logic
├── module.types.ts       # Zod schemas + TypeScript types
└── module.test.ts        # Unit tests
```

This consistency makes modules easy to navigate and test in isolation.

---

## 4. Database Design

### 4.1 Core Entities

The schema revolves around these primary entities and their relationships. This section is a high-level summary; Section 14 (Class Design Reference) is the authoritative definition of every attribute and method.

**Users & Roles**
- `User` — single table for all user types (single-table inheritance); role discriminator is `ADMIN`, `STAFF`, `FACULTY`, or `STUDENT`.
- `Department` — academic departments that employ faculty and own rooms.

**Buildings & Rooms**
- `Building` — a physical campus building (e.g., LHC). Staff are assigned to buildings, not individual rooms.
- `Room` — a bookable space within a building. Stores permanent equipment metadata (projector, mic, accessibility), capacity, and room type. Soft-deleted via `isActive` flag so booking history is never lost.

**Time & Slots**
- `TimeSlot` — a raw time block (start time, end time). Used as the primitive for overlap detection.
- `SlotDefinition` — a named academic slot (e.g., `A`, `B`, `K`, `L1`). Belongs to a slot type (`FIRST_YEAR` or `SENIOR`). This is what the timetable references.
- `SlotOccurrence` — junction between `SlotDefinition`, `DayOfWeek`, and `TimeSlot`. Records that "slot A occurs Monday 09:00–09:50, Wednesday 09:00–09:50" etc.
- `VenueTimeSlot` — a specific room on a specific calendar date at a specific time slot. This is the actual unit checked for availability. One record = one bookable cell. Marked `isBooked` when a confirmed `Booking` occupies it. On holidays and weekends, timetable-generated `VenueTimeSlot` records are **not** pre-marked as booked — they remain free and bookable.

**Timetable & Courses**
- `AcademicYear` — the academic year boundary. All timetables are scoped to a year.
- `Course` — the course catalog. **Must be populated by Admin before timetable upload.** The timetable parser looks up courses by code; if a code is not found, the admin is notified and must add the course or fix the file.
- `Enrollment` — join table between `Student` and `Course`. Populated by Admin (bulk upload). Used for student-level clash detection during slot changes (REQ-4.3.2).
- `Timetable` — an uploaded semester timetable with a `DRAFT → ACTIVE → ARCHIVED` lifecycle. Admin reviews a parse preview before activating.
- `CourseAllocation` — the core allocation record: Course + SlotDefinition + Room + Timetable. When activated, generates recurring `Booking` records for every working day the slot falls on.

**Booking Workflow**
- `BookingRequest` — the central workflow entity. Status flows through: `PENDING_FACULTY_VERIFICATION` → `PENDING_STAFF_APPROVAL` → `APPROVED` / `REJECTED` / `PENDING_ADMIN_RESOLUTION` / `CANCELLED`. See Section 7.1 for the full state machine.
- `Booking` — a confirmed room allocation. Created on approval or auto-generated from timetable. Blocks the corresponding `VenueTimeSlot`.
- `BookingApproval` — an immutable audit record of every action (approve, reject, verify, forward) in the workflow chain.
- `ConflictResolution` — created by Admin when two requests collide for the same room+slot. Records the selected winner and all rejected requests.
- `SlotChangeRequest` — faculty request to move a course to a different time slot. Includes `bypassedStudentCheck` flag (REQ-4.3.14).
- `VenueChangeRequest` — faculty request to move a course to a different room.

**Supporting**
- `Notification` — in-app notification record. Email is queued asynchronously alongside it.
- `Holiday` — a date on which no timetable bookings are active and the room is free for manual booking.
- `AuditLog` — immutable append-only record of all system state changes.

### 4.2 Key Enums

| Enum | Values |
|------|--------|
| `UserRole` | `ADMIN`, `STAFF`, `FACULTY`, `STUDENT` |
| `BookingStatus` | `PENDING_FACULTY_VERIFICATION`, `PENDING_STAFF_APPROVAL`, `PENDING_ADMIN_RESOLUTION`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `BookingSource` | `MANUAL_REQUEST`, `TIMETABLE_ALLOCATION`, `SLOT_CHANGE`, `VENUE_CHANGE` |
| `EventType` | `QUIZ`, `SEMINAR`, `SPEAKER_SESSION`, `MEETING`, `CULTURAL_EVENT`, `WORKSHOP`, `CLASS`, `OTHER` |
| `TimetableStatus` | `DRAFT`, `ACTIVE`, `ARCHIVED` |
| `ChangeRequestStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `RoomType` | `LECTURE_HALL`, `CLASSROOM`, `SEMINAR_ROOM`, `LAB`, `AUDITORIUM`, `MEETING_ROOM` |
| `NotificationType` | `BOOKING_APPROVED`, `BOOKING_REJECTED`, `VERIFICATION_REQUIRED`, `CONFLICT_ALERT`, `SLOT_CHANGE_NOTIFICATION`, `VENUE_CHANGE_NOTIFICATION`, `REMINDER` |
| `ApprovalAction` | `APPROVED`, `REJECTED`, `FORWARDED`, `VERIFIED` |

### 4.3 Performance Indexes (NFR-5.1.1)

These indexes must be added via migrations to achieve the < 2s query time NFR:

```sql
CREATE INDEX idx_venue_time_slot_lookup   ON "VenueTimeSlot"("roomId", "bookingDate", "timeSlotId");
CREATE INDEX idx_booking_room_date_slot   ON "BookingRequest"("roomId", "bookingDate", "timeSlotId");
CREATE INDEX idx_booking_status           ON "BookingRequest"("status");
CREATE INDEX idx_course_allocation        ON "CourseAllocation"("roomId", "slotId");
CREATE INDEX idx_notification_user_unread ON "Notification"("recipientId", "isRead");
CREATE INDEX idx_enrollment_student       ON "Enrollment"("studentId");
CREATE INDEX idx_enrollment_course        ON "Enrollment"("courseId");
```

---

## 5. Backend Modules

### 5.1 Auth Module

Handles login, JWT generation, and session management.

- On login, validate credentials with bcrypt, then sign a JWT containing `{ sub, role, name }` with an 8-hour expiry.
- The auth middleware verifies the token on every protected route and attaches the decoded user to `req.user`.
- The RBAC middleware (`requireRoles(...roles)`) guards individual routes by checking `req.user.role` against allowed roles.

### 5.2 Booking Module

This is the most complex module. It implements the full multi-step approval workflow.

**Creating a booking request — two paths:**

**Path A — Room is free (`VenueTimeSlot.isBooked = false`):**
1. Check room capacity against `participantCount`; reject with alternatives if insufficient.
2. Set initial status based on requester role: students get `PENDING_FACULTY_VERIFICATION`; faculty get `PENDING_STAFF_APPROVAL`. Students must supply a `verifierId`.
3. Create the `BookingRequest` and `BookingApproval` audit record, notify the next actor in the chain.

**Path B — Room is already confirmed-booked (`VenueTimeSlot.isBooked = true`):**
1. System informs the requester that this room+slot is already booked and suggests alternatives.
2. Requester can pick an alternative (returns to Path A) or **force-submit** for the same room anyway.
3. If force-submitted: the request is created **immediately with status `PENDING_ADMIN_RESOLUTION`** — it never enters the student→faculty→staff chain at all.
4. Admin is notified of the new conflict request. The relevant staff member is also notified that a conflict for their room has been sent directly to Admin for resolution, so they are not left unaware.

**Faculty verification step (Path A only):**
- Faculty can only verify bookings where they are the assigned `verifierId` and status is `PENDING_FACULTY_VERIFICATION`.
- Approval moves status to `PENDING_STAFF_APPROVAL` and notifies staff. Rejection moves to `REJECTED` and notifies the student.

**Staff approval step (Path A only):**
- Re-check `VenueTimeSlot.isBooked` inside a database transaction at the moment of approval (race-condition safety for the window between submission and decision).
- **If still free:** set status to `APPROVED`, call `Booking.blockVenueTimeSlot()`, create `BookingApproval` record, notify requester.
- **If now taken** (another request was approved in the brief window between this request being submitted and staff acting on it): move this request to `PENDING_ADMIN_RESOLUTION`, notify Admin and notify staff. This is an edge case — it only happens if two normal Path A requests race to approval simultaneously.

**Important:** multiple Path A requests for the same room+slot are all allowed to sit in `PENDING_STAFF_APPROVAL` together — there is no pre-emptive escalation. Staff works through them normally. The race-condition re-check at approval time handles any collision.

**Admin conflict resolution:**
- Admin sees all `PENDING_ADMIN_RESOLUTION` requests grouped by room+slot.
- Admin selects one winner; the system approves it, blocks the `VenueTimeSlot`, rejects all others, and notifies every requester.

### 5.3 Clash Detection Engine

A shared service used by the Booking, Slot Change, and Venue Change modules.

**For booking requests, checks in order:**
1. **Holiday/weekend check** — if the date is a `Holiday` or falls on Saturday/Sunday, timetable allocations for that date are ignored (the room is treated as free). Manual booking is permitted.
2. **VenueTimeSlot availability** — query `VenueTimeSlot` for the exact `(roomId, bookingDate, timeSlotId)` triple. If `isBooked = true`, the slot is confirmed-taken. The requester is shown this and offered alternatives. If they choose to force-submit for the same room regardless, the request bypasses the normal approval chain and goes straight to `PENDING_ADMIN_RESOLUTION` (see Section 5.2, Path B). This check does **not** look at other pending requests — those are not a conflict until one of them is actually approved.
3. **Room capacity** — reject if `participantCount > room.capacity`; include capacity in the alternative room suggestions.

**For slot changes, additionally checks (REQ-4.3.2 / REQ-4.3.14):**
- Whether any enrolled student has another course in the target slot (via `Enrollment` + `CourseAllocation`).
- If no enrollment data exists, bypass this check and set `bypassedStudentCheck = true`.

The service must expose a `suggestAlternatives()` method returning up to 5 rooms with sufficient capacity whose `VenueTimeSlot` records are free for the requested date+slot (REQ-4.1.9).

### 5.4 Timetable Module

Handles all admin data setup and the Excel timetable upload flow (REQ-4.1.4 / REQ-4.2.1).

#### Pre-Population Requirement

The timetable parser validates every row against data that must already exist in the system. Admin must populate these tables **before** uploading a timetable:

| Table | What to populate | How |
|-------|-----------------|-----|
| `Course` | Course code, name, L-T-P, credits, department | Admin uploads a course master list (CSV or form) |
| `Room` | Room name/code, building, capacity, type, equipment | Admin uploads a room master list or fills via UI |
| `SlotDefinition` + `SlotOccurrence` | Named slots and their day+time mappings (A, B, K, L1 ... per year group) | Admin uploads slot system definition once per academic year |
| `Faculty` (User) | Faculty email, name, department | Admin creates user accounts |

If any of these are missing when the timetable is uploaded, the parser reports specific errors ("Course code CSL2010 not found — add the course or fix the file") and does not commit anything. The admin must resolve all errors and re-upload.

#### Actual Timetable File Format

Based on the actual IIT Jodhpur spreadsheet (`Classroom Allocation` sheet), the system must accept a file with these columns:

| Column | Example | Notes |
|--------|---------|-------|
| `Subject Code` | `EEL3060` | Looked up against `Course.courseCode` |
| `Subject` | `Power Engineering` | For display / mismatch warning only |
| `L-T-P` | `3-0-3` | Validated against stored course data |
| `Credit` | `4.5` | Validated |
| `Slot` | `A`, `L1`, `K` | Looked up against `SlotDefinition.slotName` |
| `Department` | `Electrical Engineering` | Validated against `Department` |
| `Instructor` | `Ravi Yadav` | Matched to `Faculty` by name or email |
| `Student Registered` | `91` | Stored as `enrollmentCount` on the course |
| `Classroom` | `LHC 105` | Looked up against `Room.roomName` |
| Extra notes column | `LHC 308 for Saturday 11–12 PM` | Parsed as an annotation; flagged for admin review |

Slot names in the actual data include complex entries like `D (Wed)`, `G (Tue, Fri)`, `L1`, `M5`, `NG`. The parser must handle these by looking them up in `SlotDefinition` by name. If a slot name is not recognised, it is reported as a validation error — not silently skipped.

#### Upload Flow

1. Admin uploads the Excel file for a semester.
2. Parser reads and validates every row, collecting all errors without stopping early.
3. Any course code, room name, slot name, or instructor not found in the system is listed in a **validation error report** sent to Admin.
4. Admin fixes errors (add missing courses/rooms, correct typos) and re-uploads.
5. Once all rows pass validation, Admin sees a **preview diff** showing exactly what allocations will be created.
6. Admin confirms → system creates `CourseAllocation` records and sets `Timetable` status to `ACTIVE`.
7. `TimetableParser.generateBookingsFromAllocations()` creates recurring `Booking` records and marks the corresponding `VenueTimeSlot` records as booked for every working day in the semester (excluding holidays and weekends).

### 5.5 Slot Change Module

Validates and creates slot change requests (REQ-4.3.1 to 4.3.7).

**Validation order:**
1. Check room availability in the target slot.
2. Check student enrollment clashes — bypass if enrollment data is absent, set `bypassedStudentCheck = true`.
3. If any blocking constraint found: return reasons + alternative slot suggestions (REQ-4.3.6 / 4.3.7). Do not create the request.
4. If clear: create `SlotChangeRequest` with `PENDING` status and notify LHC staff.

### 5.6 Venue Change Module

Validates and creates venue change requests (REQ-4.3.8 to 4.3.11).

**Flow:**
1. Faculty selects a target room.
2. System checks availability of that room across all relevant slots.
3. System returns a list of feasible slots where the room is free.
4. Faculty picks a slot; system creates `VenueChangeRequest` and notifies LHC staff.

---

## 6. Frontend Requirements

### 6.1 Role-Based Dashboard Architecture

A single React app serves all four roles. After login, the app redirects to the role-specific dashboard route (`/admin`, `/staff`, `/faculty`, `/student`). Route guards prevent unauthorized access.

### 6.2 Required Pages per Role

**Admin Dashboard**
- Upload and manage academic calendars and semester holidays.
- Upload/replace timetables via Excel, with parse preview before commit.
- Manage rooms, departments, and user accounts.
- Conflict resolution queue (escalated bookings).
- System-wide booking overview.

**LHC Staff Dashboard**
- Pending booking requests queue with filters (date, room, event type).
- Approve / Reject interface with mandatory note on rejection.
- Pending slot/venue change requests.
- Room availability calendar view.

**Faculty Dashboard**
- My course timetable.
- Initiate room booking form.
- Pending student verification requests (badge count on nav).
- Slot change / venue change request forms with live feasibility feedback.
- Booking history with status timeline.

**Student Dashboard**
- Initiate room booking (with faculty selector for verifier).
- Track my booking requests with a status timeline showing: Submitted → Faculty Verified → Staff Approved/Rejected.
- In-app notifications panel.
- Browse available rooms (read-only calendar view).

### 6.3 Key Components to Build

- **`BookingRequestForm`** — handles both student and faculty flows; shows/hides faculty selector based on role.
- **`RoomAvailabilityCalendar`** — a weekly grid (rows = rooms, columns = time slots) with color coding: Green = Available, Red = Booked (timetable), Yellow = Pending approval, Gray = Past/Holiday. Clicking an available cell pre-fills the booking form.
- **`ClashWarningModal`** — shown when a clash is detected; displays clash reasons and alternative suggestions.
- **`TimetableUpload`** — drag-and-drop Excel upload with a parse preview table before the admin confirms submission.
- **`NotificationBell`** — unread count badge with dropdown; poll or use WebSocket for live updates.
- **`BookingStatusTimeline`** — visual step-through of a booking's approval stages.

---

## 7. Core Business Logic

### 7.1 Booking State Machine

Understanding this flow is critical before implementing the booking module. Status names match `BookingStatus` enum exactly.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATH A  —  Room is free at time of submission
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[STUDENT initiates]
        │
        ▼
PENDING_FACULTY_VERIFICATION ──(Faculty Rejects)──► REJECTED
        │                                                │
  (Faculty Approves)                           [Notify Student]
        │
        ▼
PENDING_STAFF_APPROVAL ◄──────────── [FACULTY initiates directly]
        │
        │  (multiple Path A requests for same slot can queue here — normal)
        │
        ├──(Staff Approves, slot still free)─────────► APPROVED
        │                                                  │
        │                                         [Block VenueTimeSlot]
        │                                         [Notify Requester]
        │
        └──(Race-condition edge case: slot taken in the window
            between submission and staff decision)
                        │
                        ▼
           PENDING_ADMIN_RESOLUTION
                        │
           [Notify Admin + Notify Staff]


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATH B  —  Room is already confirmed-booked at submission time
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ANY USER force-submits for an already-booked room]
        │
        │  (skips student→faculty→staff chain entirely)
        │
        ▼
PENDING_ADMIN_RESOLUTION  ◄── created immediately on submission
        │
        ├── [Notify Admin — conflict request raised]
        └── [Notify relevant Staff — informed only, no action needed]


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADMIN RESOLUTION  —  applies to both paths above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PENDING_ADMIN_RESOLUTION
        │
  (Admin picks winner)
        │              │
     APPROVED       REJECTED
  [Notify Winner]  [Notify all others]


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AFTER APPROVAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPROVED ──(Requester cancels before event)──► CANCELLED
                  [Free VenueTimeSlot]
```

---

### 7.2 Room Availability Model

Availability is driven entirely by `VenueTimeSlot` records. A room+date+timeslot is available if and only if its `VenueTimeSlot.isBooked = false`.

**How slots get marked booked:**
- When a timetable is activated, `generateBookingsFromAllocations()` creates `Booking` records and marks `VenueTimeSlot.isBooked = true` for every working day that slot falls on, for the entire semester.
- When a `BookingRequest` is approved by staff or admin, `Booking.blockVenueTimeSlot()` marks the corresponding record.

**How slots stay free on non-working days:**
- When generating timetable bookings, the system skips any date that is a `Holiday`, a Saturday, or a Sunday. The `VenueTimeSlot` record for those days is either not created or left with `isBooked = false`.
- This means rooms are freely bookable on holidays and weekends — manual booking requests for those dates proceed through the normal workflow without any timetable conflict.

**Redis caching:** the availability matrix (`getAvailabilityMatrix()`) is cached with a 60-second TTL keyed on `(buildingId, date)`. Invalidated on any `VenueTimeSlot` update for that building+date. Required to satisfy NFR-5.1.1 (< 2s response).

---

### 7.3 Admin Data Setup Order

Before any timetable can be uploaded, Admin must complete setup in this sequence:

1. **Create `AcademicYear`** — define the year and mark it active.
2. **Declare holidays** — add all `Holiday` records for the semester. This determines which dates timetable bookings are generated for.
3. **Add Departments** — create all department records.
4. **Add Buildings and Rooms** — with capacity, type, and equipment metadata.
5. **Define Slot System** — create `SlotDefinition` + `SlotOccurrence` records for both First Year and Senior year groups. This only needs to be done once per year group unless the slot system changes.
6. **Add Faculty accounts** — users with role `FACULTY`.
7. **Add Courses** — with course code, name, L-T-P, department, expected capacity. The timetable parser matches on course code, so codes must match the spreadsheet exactly.
8. **Upload Enrollment data** *(optional but recommended)* — student–course mappings via bulk upload. Required for student-level clash detection during slot changes (REQ-4.3.2). If absent, clash detection is bypassed with a warning (REQ-4.3.14).
9. **Upload Timetable Excel** — only now will the parser have all the data it needs to validate and commit.

---

### 7.4 Conditional Student Clash Validation (REQ-4.3.14)

When a slot change is requested, the system must check if any enrolled student has a schedule conflict in the target slot. However, if no enrollment data exists for the course, the system must:
- Skip the student-level check entirely.
- Record `bypassedStudentCheck = true` on the `SlotChangeRequest`.
- Display a clear notice to the user that student-level validation was not performed.

This satisfies both NFR-5.4.1 (graceful degradation) and NFR-5.4.3 (user awareness).

---

## 8. API Reference

All routes require a valid JWT in the `Authorization: Bearer <token>` header unless marked public. Role restrictions are noted in brackets.

### Admin Setup (pre-timetable population)
```
POST   /api/admin/academic-years               # Create academic year
POST   /api/admin/holidays                     # Declare a holiday
POST   /api/admin/holidays/bulk                # Bulk upload holiday list
POST   /api/admin/departments                  # Add department
POST   /api/admin/buildings                    # Add building
POST   /api/admin/rooms                        # Add room
POST   /api/admin/rooms/bulk                   # Bulk upload room master list
POST   /api/admin/slots                        # Define slot system (SlotDefinition + Occurrences)
POST   /api/admin/courses                      # Add single course
POST   /api/admin/courses/bulk                 # Bulk upload course master list
POST   /api/admin/enrollments/bulk             # Upload student–course enrollment data
```

### Authentication
```
POST   /api/auth/login               # Public
POST   /api/auth/refresh
POST   /api/auth/logout
```

### Rooms
```
GET    /api/rooms                                    # List all active rooms
GET    /api/rooms/:id/availability                   # REQ-4.1.1 — Real-time availability
GET    /api/rooms/available?date=&slot=&capacity=    # Filtered available rooms
POST   /api/rooms                                    # [ADMIN / LHC_STAFF]
PUT    /api/rooms/:id                                # [ADMIN / LHC_STAFF]
```

### Bookings
```
GET    /api/bookings                            # My bookings (role-filtered)
GET    /api/bookings/pending                    # [STAFF / FACULTY] Pending queue
GET    /api/bookings/conflicts                  # [ADMIN] All PENDING_ADMIN_RESOLUTION requests
POST   /api/bookings                            # Create booking request
PATCH  /api/bookings/:id/verify                 # [FACULTY] Verify student request
PATCH  /api/bookings/:id/staff-decision         # [STAFF] Approve / reject
PATCH  /api/bookings/:id/resolve                # [ADMIN] Resolve conflict — pick winner
DELETE /api/bookings/:id                        # [INITIATOR] Cancel booking
```

### Timetable
```
POST   /api/timetable/upload              # [ADMIN] Upload Excel timetable
GET    /api/timetable                     # View current timetable
DELETE /api/timetable/:calendarId         # [ADMIN] Remove a timetable
```

### Slot & Venue Changes
```
POST   /api/slot-changes                  # [FACULTY] Request slot change
GET    /api/slot-changes/pending          # [LHC_STAFF] View pending requests
PATCH  /api/slot-changes/:id/decision     # [LHC_STAFF] Approve / reject

POST   /api/venue-changes                 # [FACULTY] Request venue change
GET    /api/venue-changes/pending         # [LHC_STAFF] View pending
PATCH  /api/venue-changes/:id/decision    # [LHC_STAFF] Approve / reject
```

### Notifications
```
GET    /api/notifications                 # My notifications
PATCH  /api/notifications/read-all        # Mark all read
PATCH  /api/notifications/:id/read        # Mark one read
```

### Admin (conflict resolution & user management)
```
GET    /api/admin/users                    # User management list
POST   /api/admin/users                    # Create user
PUT    /api/admin/users/:id/role           # Change user role
```

---

## 9. Authentication & Permissions

### JWT Payload Structure
```json
{
  "sub": "user-uuid",
  "role": "FACULTY",
  "name": "Dr. Example",
  "iat": 1700000000,
  "exp": 1700028800
}
```

Token expiry is 8 hours. All sensitive data must be encrypted in transit (HTTPS) and at rest (NFR-5.3.2).

### Permission Matrix

| Action | ADMIN | STAFF | FACULTY | STUDENT |
|--------|:-----:|:-----:|:-------:|:-------:|
| Admin data setup (courses, rooms, slots, holidays) | ✅ | ❌ | ❌ | ❌ |
| Upload timetable | ✅ | ❌ | ❌ | ❌ |
| Create booking request | ✅ | ✅ | ✅ | ✅ |
| Verify student booking | ❌ | ❌ | ✅ | ❌ |
| Staff approve / reject | ✅ | ✅ | ❌ | ❌ |
| Resolve conflict (`PENDING_ADMIN_RESOLUTION`) | ✅ | ❌ | ❌ | ❌ |
| Manage rooms & buildings | ✅ | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |
| Request slot / venue change | ✅ | ❌ | ✅ | ❌ |
| View all bookings | ✅ | ✅ | ❌ | ❌ |
| View own bookings | ✅ | ✅ | ✅ | ✅ |

---

## 10. Notification System

Notifications are processed **asynchronously** using BullMQ (Redis-backed queue). The flow is:

1. A system event occurs (booking submitted, approved, rejected, escalated, etc.).
2. An in-app `Notification` record is written to the DB immediately.
3. An email job is added to the BullMQ queue — the API response is never blocked waiting for email delivery.
4. A background worker processes the queue and sends emails via Nodemailer/SMTP.

### Required Email Templates

| Template | Triggered by |
|----------|-------------|
| `booking-submitted.html` | New booking request created |
| `verification-requested.html` | Student booking sent to faculty |
| `booking-approved.html` | Staff approves booking |
| `booking-rejected.html` | Faculty or staff rejects |
| `conflict-escalated.html` | Booking escalated to admin |
| `slot-change-decision.html` | Staff approves/rejects slot change |

### Notification Triggers per Role

- **Faculty** — notified when a student selects them as verifier (REQ-4.5.2).
- **Students** — notified when their booking is approved, rejected, or forwarded to LHC staff (REQ-4.5.3).
- **LHC Staff** — notified of new pending requests (REQ-4.5.1).
- **Admin** — notified when a booking conflict is escalated (REQ-4.1.10).

---

## 11. Phase-wise Development Plan

### Phase 1 — Core (High Priority Requirements) — ~6 weeks

**Weeks 1–2: Foundation**
- [ ] Project scaffolding: monorepo setup, Docker, CI pipeline
- [ ] DB schema design + Prisma migrations
- [ ] Auth module: login, JWT signing, RBAC middleware
- [ ] Room and slot CRUD (admin operations)
- [ ] Basic user management

**Weeks 3–4: Booking Workflow**
- [ ] Room availability API + Redis caching (REQ-4.1.1 / NFR-5.1.1)
- [ ] Booking creation with double-booking prevention (REQ-4.1.2, 4.1.8)
- [ ] Student → Faculty → Staff approval workflow (REQ-4.1.5)
- [ ] Clash detection engine with alternative suggestions (REQ-4.1.8, 4.1.9)
- [ ] Excel timetable upload + preallocation (REQ-4.1.4, 4.2.1, 4.2.2)

**Weeks 5–6: Dashboards & Notifications**
- [ ] Role-based dashboards for all 4 roles
- [ ] Room availability calendar component
- [ ] In-app notification system (REQ-4.5.1, 4.5.2, 4.5.3)
- [ ] Async email notifications via BullMQ
- [ ] Security: HTTPS, role guards, encrypted storage (NFR-5.3.1, 5.3.2)
- [ ] Performance: DB indexes, Redis caching (NFR-5.1.1)

### Phase 2 — Mid Priority Requirements — ~3 weeks

**Weeks 7–8: Slot & Venue Changes**
- [ ] Slot change request + feasibility validation (REQ-4.3.1 to 4.3.7)
- [ ] Student clash detection using enrollment data (REQ-4.3.2)
- [ ] Graceful bypass when enrollment data is absent (REQ-4.3.14 / NFR-5.4.1)
- [ ] Venue change request flow (REQ-4.3.8 to 4.3.11)
- [ ] Event types and parameters in booking form (REQ-4.1.6, 4.1.7)

**Week 9: Conflict Resolution & Metadata**
- [ ] Admin conflict resolution queue (REQ-4.1.10)
- [ ] Escalated booking management UI
- [ ] Room metadata-based recommendations (REQ-4.3.12, 4.3.13)

### Phase 3 — Low Priority / Future — Post-MVP

- [ ] Examination timetable generation (REQ-4.4.1)
- [ ] Visual seating arrangement (REQ-4.4.2, 4.4.3)
- [ ] ERP / academic database integration (SRS Appendix C)
- [ ] Advanced scheduling algorithms
- [ ] Mobile-responsive PWA

---

## 12. Deployment

### 12.1 Infrastructure

**Minimum production specs:** 2 vCPU, 4 GB RAM, 40 GB SSD — adequate for college scale.

The production stack consists of four Docker containers managed by Docker Compose:
- `nginx` — reverse proxy, SSL termination, rate limiting.
- `api` — the Express backend.
- `web` — the React static frontend served via Nginx.
- `db` — PostgreSQL 15.
- `redis` — Redis 7.

### 12.2 Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@db:5432/lhc_prod

# Redis
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=<strong-random-256-bit-key>
JWT_EXPIRES_IN=8h

# Email (use institute SMTP or SendGrid)
SMTP_HOST=smtp.iitj.ac.in
SMTP_PORT=587
SMTP_USER=noreply@iitj.ac.in
SMTP_PASS=<email-password>
MAIL_FROM="LHC Portal <noreply@iitj.ac.in>"

# App
APP_URL=https://lhc.iitj.ac.in
NODE_ENV=production
PORT=3001
```

### 12.3 CI/CD Pipeline (GitHub Actions)

The pipeline has two jobs:
1. **`test`** — spins up a Postgres service container, runs Prisma migrations, runs all tests, and builds the frontend. Runs on every push and pull request to `main`.
2. **`deploy`** — builds and pushes Docker images to GHCR, then SSH-deploys to the production server. Runs only on merges to `main` after `test` passes.

Secrets required in GitHub: `SERVER_HOST`, `SERVER_USER`, `SSH_KEY`.

---

## 13. Testing Strategy

### Unit Tests (Jest)
- `ClashDetectionService` — all clash scenario combinations.
- `BookingService` — state transition logic for all status changes.
- `TimetableService` — Excel parsing with valid and malformed files.
- `SlotChangeService` — feasibility checks including the REQ-4.3.14 bypass path.
- RBAC middleware — all role combinations for all protected routes.

### Integration Tests (Supertest)
- Full booking workflow: Student → Faculty → Staff, verifying DB state at each step.
- Double-booking prevention under concurrent requests (race condition safety).
- Timetable upload with valid and invalid Excel files.
- Slot change with and without enrollment data present.

### E2E Tests (Playwright)
- Login and role-based redirect.
- Room availability calendar displays correct state.
- Complete booking form submission and status tracking.
- Notification received after approval.

### Load Testing (k6)
- Room availability endpoint: 100 concurrent users, assert P95 < 2s (NFR-5.1.1).
- Booking creation: 50 concurrent requests to the same slot — verify no double-booking occurs.

### Security Testing (NFR-5.3.1)
- Unauthorized role escalation attempts (e.g., student calling staff-only endpoints).
- JWT tampering (modified payload, expired token, wrong secret).
- SQL injection — Prisma's parameterized queries provide baseline protection; verify with automated scan.

---

## 14. Class Design Reference

This section is the definitive reference for every class in the system. Each entry describes what the class represents, lists all its final attributes and methods, and explains what each is meant to achieve. Use this as the blueprint when implementing models, database tables, and service logic.

Classes are grouped by domain. Enumerations are listed at the end of each group.

---

### 14.1 User Domain

#### `User` *(abstract)*

The base class for all system actors. All four user types share this common identity and authentication structure. Implemented as a single database table with a `role` discriminator — no separate tables per role, which avoids joins on every auth check.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `userId` | int | Primary key, unique system identifier |
| `name` | string | Full display name |
| `email` | string | Login credential and notification address; must be unique |
| `phone` | string | Optional contact for SMS/urgent notifications |
| `role` | UserRole | Discriminator — determines subclass behaviour and permissions |
| `passwordHash` | string | Bcrypt-hashed password; never store plaintext |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `login()` | bool | Validates credentials, initiates a session/JWT |
| `logout()` | void | Invalidates the current session token |
| `updateProfile()` | void | Allows users to update their own name, phone, and password |

---

#### `Admin`

Inherits `User`. Responsible for all system-wide configuration: timetable ingestion, academic calendar management, conflict arbitration, and user administration. Has the highest privilege level.

**Additional Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `adminLevel` | string | Reserved for future multi-tier admin roles (e.g., "super", "department") |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `uploadTimetable(file)` | Timetable | Triggers parsing and validation of an Excel timetable file |
| `declareHoliday(date, description)` | Holiday | Adds a holiday to the academic calendar, blocking bookings on that date |
| `manageUsers()` | void | Entry point for creating, deactivating, or changing roles of users |
| `viewAuditLogs()` | List\<AuditLog\> | Retrieves the full system audit trail for compliance review |
| `defineSlotSystem(slotData)` | SlotDefinition | Creates or updates the named slot system (e.g., A1, B2) for a year group |
| `resolveConflict(conflictingRequests)` | ConflictResolution | Selects one booking request as the winner when two conflict; rejects all others |

---

#### `Staff`

Inherits `User`. Manages the physical buildings and rooms, and is the final approver in the booking request workflow. A staff member may be responsible for more than one building.

**Additional Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `managedBuildingIds` | List\<int\> | IDs of buildings this staff member oversees; stored as a join relation, not a column |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `manageRooms()` | void | Entry point for adding, editing, or deactivating rooms in managed buildings |
| `approveBooking(requestId)` | bool | Approves a pending booking request; triggers final allocation and notification |
| `rejectBooking(requestId, reason)` | bool | Rejects a booking with a mandatory reason that is communicated to the requester |
| `viewBuildingBookings()` | List\<Booking\> | Returns all bookings across rooms in managed buildings for oversight |

---

#### `Faculty`

Inherits `User`. Can initiate room bookings for course-related events, request changes to their course's allocated slot or venue, and verify booking requests submitted by students.

**Additional Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `department` | string | The academic department this faculty member belongs to |

> `coursesTeaching` is a navigable relation to `CourseAllocation`, not a stored column.

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `requestRoomBooking(details)` | BookingRequest | Submits a room booking request; goes directly to staff (no faculty verification needed) |
| `requestSlotChange(courseId, newSlot)` | SlotChangeRequest | Requests a time slot change for one of their allocated courses |
| `requestVenueChange(courseId, newRoom)` | VenueChangeRequest | Requests a different room for one of their allocated courses |
| `verifyStudentRequest(requestId, decision)` | bool | Approves or rejects a student's booking request before it is forwarded to staff |

---

#### `Student`

Inherits `User`. Can browse room availability, submit event booking requests (which require faculty verification), and view their own class schedule.

**Additional Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `studentId` | string | Institute roll number, distinct from the internal `userId` |

> `enrolledCourses` is a navigable relation via `Enrollment`, not a stored column.

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `viewClassSchedule()` | List\<CourseAllocation\> | Returns the student's full weekly timetable based on their enrolled courses |
| `requestEventBooking(details)` | BookingRequest | Submits a room booking request; requires selection of a faculty verifier |
| `viewRoomAvailability(date)` | List\<VenueTimeSlot\> | Shows which rooms are free on a given date across all time slots |

---

#### `UserRole` *(enumeration)*
`ADMIN` · `STAFF` · `FACULTY` · `STUDENT`

---

### 14.2 Building & Room Domain

#### `Building`

Represents a physical campus building (e.g., Lecture Hall Complex). Separating this from `Room` makes the model extensible to other buildings and allows staff assignment at the building level.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `buildingId` | int | Primary key |
| `buildingName` | string | Human-readable name (e.g., "LHC", "Academic Block") |
| `location` | string | Campus location or address for wayfinding |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `getRooms()` | List\<Room\> | Returns all active rooms within this building |
| `getStaff()` | List\<Staff\> | Returns all staff members responsible for this building |

---

#### `Room`

A bookable physical space. Stores permanent equipment metadata (what is fixed in the room) and capacity information used for validation and recommendation.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `roomId` | int | Primary key |
| `roomName` | string | Identifier such as "LH-1" or "Room-101" |
| `buildingId` | int | Foreign key to `Building` |
| `capacity` | int | Maximum seating; used to validate booking participant count |
| `roomType` | RoomType | Category of room — used for filtering and recommendations |
| `hasProjector` | bool | Permanent projector installed |
| `hasMic` | bool | Permanent microphone/PA system installed |
| `accessible` | bool | Whether the room meets accessibility requirements |
| `equipmentList` | string | Free-text or JSON list of other permanent equipment for Phase 2 metadata search |
| `isActive` | bool | Soft-delete flag; inactive rooms are hidden but their booking history is preserved |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `checkAvailability(date, timeSlot)` | bool | Returns whether this room is free at a specific date and time slot |
| `getBookings(date)` | List\<Booking\> | Returns all confirmed bookings for this room on a given date |

---

#### `RoomType` *(enumeration)*
`LECTURE_HALL` · `CLASSROOM` · `SEMINAR_ROOM` · `LAB` · `AUDITORIUM` · `MEETING_ROOM`

---

### 14.3 Time & Slot Domain

This domain models the IIT slot system, where a named slot (e.g., `A1`) recurs on multiple days at potentially different times. Three classes work together to represent this correctly.

#### `TimeSlot`

A raw, reusable time block defined by a start and end time. Multiple slot definitions and occurrences can reference the same time block.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `timeSlotId` | int | Primary key |
| `startTime` | time | Start time of the block (e.g., 08:00) |
| `endTime` | time | End time of the block (e.g., 09:00) |
| `durationMinutes` | int | Derived from start/end; useful for display and validation |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `overlaps(otherTimeSlot)` | bool | Core clash detection primitive — true if two time blocks share any overlap |
| `toString()` | string | Human-readable format (e.g., "08:00–09:00") for UI display |

---

#### `SlotDefinition`

A named academic slot (e.g., `A1`, `B2`). Each definition belongs to a slot type (First Year or Senior) and has multiple weekly occurrences defining which day+time it maps to.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `slotId` | int | Primary key |
| `slotName` | string | Named identifier (e.g., "A1") |
| `slotType` | string | Which timetable system this belongs to — "FIRST_YEAR" or "SENIOR" |
| `description` | string | Optional human-readable description for admin reference |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `getOccurrences()` | List\<SlotOccurrence\> | Returns all day+time combinations for this slot |
| `getTimeSlots()` | List\<TimeSlot\> | Returns the distinct time blocks this slot occupies across the week |

---

#### `SlotOccurrence`

The junction entity between `SlotDefinition` and `TimeSlot`. Each record says: "slot A1 occurs on Monday at 08:00–09:00." One slot definition will have several of these records.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `occurrenceId` | int | Primary key |
| `slotId` | int | Foreign key to `SlotDefinition` |
| `dayOfWeek` | DayOfWeek | Which day this occurrence falls on |
| `timeSlotId` | int | Foreign key to `TimeSlot` |

---

#### `VenueTimeSlot`

Represents a specific room at a specific date and time slot. This is the actual unit of availability — one record per room+date+timeslot combination. When a booking is confirmed, the matching `VenueTimeSlot` is marked as booked.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `venueTimeSlotId` | int | Primary key |
| `roomId` | int | Foreign key to `Room` |
| `bookingDate` | date | The specific calendar date |
| `timeSlotId` | int | Foreign key to `TimeSlot` |
| `isBooked` | bool | Whether this slot is currently occupied |
| `bookedByBookingId` | int | Foreign key to the `Booking` that occupies this slot; null if free |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `markAsBooked(bookingId)` | void | Sets `isBooked = true` and records the booking reference |
| `markAsFree()` | void | Releases the slot when a booking is cancelled |
| `isAvailable()` | bool | Returns true if not booked and the date is not a holiday |

> This table will grow large over a semester. Index on `(roomId, bookingDate, timeSlotId)` is mandatory for performance (NFR-5.1.1).

---

#### `DayOfWeek` *(enumeration)*
`MONDAY` · `TUESDAY` · `WEDNESDAY` · `THURSDAY` · `FRIDAY` · `SATURDAY` · `SUNDAY`

---

### 14.4 Timetable & Course Domain

#### `AcademicYear`

Defines the boundaries of an academic year. Timetables and allocations are scoped to an academic year to keep historical data intact when a new year begins.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `yearId` | int | Primary key |
| `yearName` | string | Human label (e.g., "2025–26") |
| `startDate` | date | First day of the academic year |
| `endDate` | date | Last day of the academic year |
| `isActive` | bool | Only one year should be active at a time |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `getSemesters()` | List\<string\> | Returns semester labels within this year for filtering |

---

#### `Course`

Represents a course in the academic catalog. Courses must exist before a timetable can reference them — the timetable parser looks up courses by code; it does not create them.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `courseId` | int | Primary key |
| `courseCode` | string | Unique institute course code (e.g., "CS201") |
| `courseName` | string | Full course title |
| `instructorId` | int | Foreign key to the `Faculty` member teaching this course |
| `department` | string | Owning department |
| `enrollmentCount` | int | Number of currently enrolled students; used for clash detection |
| `expectedCapacity` | int | Expected peak attendance; used to match room capacity |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `getEnrolledStudents()` | List\<Student\> | Returns students via the `Enrollment` join class |
| `getAllocations()` | List\<CourseAllocation\> | Returns all timetable allocations for this course |

---

#### `Enrollment`

Join class between `Student` and `Course`. Required for student-level clash detection during slot change validation (REQ-4.3.2). Without this, it is impossible to determine whether moving a course to a new slot would conflict with any student's other courses.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `enrollmentId` | int | Primary key |
| `studentId` | int | Foreign key to `Student` |
| `courseId` | int | Foreign key to `Course` |

> This class has no methods — it is a pure data join. The `AvailabilityService` queries it directly when checking student-level slot conflicts.

---

#### `Timetable`

Represents an uploaded semester timetable. The `DRAFT` → `ACTIVE` → `ARCHIVED` lifecycle prevents an unreviewed upload from immediately affecting live bookings.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `timetableId` | int | Primary key |
| `semester` | string | Semester label (e.g., "Semester 1") |
| `academicYearId` | int | Foreign key to `AcademicYear` |
| `uploadedDate` | date | When the file was uploaded |
| `uploadedBy` | int | Foreign key to the `Admin` who uploaded it |
| `originalFilePath` | string | Path to the stored source Excel file for audit purposes |
| `status` | TimetableStatus | Lifecycle state: DRAFT, ACTIVE, or ARCHIVED |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `getAllocations()` | List\<CourseAllocation\> | Returns all course-slot-room allocations under this timetable |
| `getCourses()` | List\<Course\> | Returns all courses covered in this timetable |
| `regenerateBookings()` | void | Re-creates all recurring `Booking` records from allocations; used when a timetable is activated or updated |

---

#### `TimetableStatus` *(enumeration)*
`DRAFT` · `ACTIVE` · `ARCHIVED`

---

#### `CourseAllocation`

The central entity linking a course, a slot, a room, and a timetable together. Each record represents "Course X is taught in Room Y during Slot Z this semester." This is the source of truth for recurring bookings.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `allocationId` | int | Primary key |
| `courseId` | int | Foreign key to `Course` |
| `slotId` | int | Foreign key to `SlotDefinition` |
| `roomId` | int | Foreign key to `Room` |
| `timetableId` | int | Foreign key to `Timetable` |
| `createdAt` | datetime | When this allocation was created |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `createRecurringBookings(semester)` | List\<Booking\> | Generates one `Booking` record per occurrence of the slot across the semester dates, blocking those `VenueTimeSlot` records |
| `updateRoom(newRoomId)` | bool | Applies a venue change — cancels existing bookings for this allocation and regenerates them for the new room |
| `updateSlot(newSlotId)` | bool | Applies a slot change — cancels existing bookings and regenerates them for the new slot |
| `validateAllocation()` | bool | Checks that room capacity ≥ course expected capacity and that no other allocation uses the same room+slot in this timetable |

---

#### `TimetableParser` *(service)*

Handles reading and validating the uploaded Excel file. Responsible for parsing, not for creating master data — if a course code or room name is not found, it raises a validation error rather than creating a new record.

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `parseExcel(file)` | ParsedTimetableData | Reads the Excel file and converts it into structured in-memory data |
| `validateData(parsedData)` | ValidationResult | Checks all course codes, room names, and slot names against existing records; collects all errors before returning |
| `createTimetable(parsedData, academicYearId)` | Timetable | Creates the `Timetable` record in DRAFT status |
| `createCourseAllocations(parsedData, timetableId)` | List\<CourseAllocation\> | Creates all `CourseAllocation` records from validated parsed data |
| `generateBookingsFromAllocations(allocations)` | List\<Booking\> | Calls `createRecurringBookings()` on each allocation to populate the booking calendar |
| `handleSlotChange(allocationId, newSlotId)` | List\<Booking\> | Regenerates bookings after a slot change is approved |
| `handleVenueChange(allocationId, newRoomId)` | List\<Booking\> | Regenerates bookings after a venue change is approved |

---

#### `ParsedTimetableData`

Intermediate data transfer object that holds the results of parsing an Excel file before any database writes occur. Keeps raw spreadsheet data out of the domain model.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `courses` | List\<CourseData\> | Parsed course rows from the spreadsheet |
| `slots` | List\<SlotDefinitionData\> | Parsed slot rows |
| `metadata` | Map\<string, string\> | Header-level info such as semester name, year |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `validate()` | bool | Checks internal consistency of the parsed data before passing to the parser service |

---

### 14.5 Booking Domain

#### `BookingRequest`

The workflow entity. Represents a request to use a room that is moving through an approval chain. It is distinct from `Booking` — a request may be rejected, cancelled, or still in progress, whereas a `Booking` is a confirmed allocation.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `requestId` | int | Primary key |
| `requesterId` | int | Foreign key to the `User` who submitted the request |
| `requesterRole` | UserRole | Cached role at submission time; determines the initial approval chain |
| `roomId` | int | Requested room |
| `bookingDate` | date | Date of the requested booking |
| `timeSlotId` | int | Requested time slot |
| `eventType` | EventType | Category of the event (quiz, seminar, etc.) |
| `purpose` | string | Free-text description of the event |
| `participantCount` | int | Number of expected attendees; validated against room capacity |
| `specialRequests` | string | Any additional requirements (portable mic, extra chairs, etc.) |
| `guestDetails` | string/JSON | Details of invited external guests for speaker sessions |
| `verifiedByFacultyId` | int | Foreign key to the faculty verifier; required when requester is a student |
| `status` | BookingStatus | Current position in the approval workflow |
| `createdAt` | datetime | Submission timestamp |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `submit()` | bool | Validates the request and sets the initial status based on requester role |
| `cancel()` | void | Allows the requester to withdraw the request if not yet approved |
| `requiresFacultyVerification()` | bool | Returns true if the requester is a student; encapsulates the role check |
| `getApprovalChain()` | List\<BookingApproval\> | Returns the ordered list of approval actions taken on this request; used for the status timeline UI |

---

#### `Booking`

A confirmed room allocation. Created when a `BookingRequest` is approved, or automatically when timetable allocations generate recurring bookings. A booking blocks the corresponding `VenueTimeSlot`.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `bookingId` | int | Primary key |
| `requestId` | int | Foreign key to the originating `BookingRequest`; null for timetable-generated bookings |
| `roomId` | int | The confirmed room |
| `bookingDate` | date | The confirmed date |
| `timeSlotId` | int | The confirmed time slot |
| `approvedBy` | int | Foreign key to the `Staff` or `Admin` who confirmed this booking |
| `approvedAt` | datetime | When the confirmation was made |
| `source` | BookingSource | Whether this came from a manual request or timetable allocation |
| `sourceReference` | string | Reference to the allocation ID or request ID for traceability |
| `courseAllocationId` | int | Optional foreign key to `CourseAllocation` if generated by timetable |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `cancel()` | bool | Cancels the booking and calls `markAsFree()` on the associated `VenueTimeSlot` |
| `notifyParticipants()` | void | Triggers notifications to the requester and any relevant parties |
| `blockVenueTimeSlot()` | void | Marks the corresponding `VenueTimeSlot` as booked on confirmation |

---

#### `BookingApproval`

An immutable audit record for every action taken in the approval chain. Every approve, reject, verify, or forward action creates one record. Powers the booking status timeline in the UI and satisfies NFR-5.2.1.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `approvalId` | int | Primary key |
| `bookingRequestId` | int | Foreign key to the `BookingRequest` |
| `approverId` | int | Foreign key to the `User` who took the action |
| `approverRole` | UserRole | Role of the actor at the time of the action |
| `action` | ApprovalAction | What was done: APPROVED, REJECTED, FORWARDED, or VERIFIED |
| `comments` | string | Optional notes from the approver; mandatory on rejection |
| `timestamp` | datetime | When the action was taken |

---

#### `ConflictResolution`

Created by Admin when two or more `BookingRequest` records conflict for the same room and slot (REQ-4.1.10). Records which request was selected and which were rejected, along with the admin's reasoning.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `conflictId` | int | Primary key |
| `conflictingRequestIds` | List\<int\> | All request IDs involved in the conflict |
| `resolvedBy` | int | Foreign key to the `Admin` who resolved it |
| `selectedRequestId` | int | The request ID that was approved |
| `rejectedRequestIds` | List\<int\> | All request IDs that were rejected as a result |
| `resolvedAt` | datetime | Timestamp of resolution |
| `resolutionNotes` | string | Admin's explanation of the decision |

---

#### `BookingStatus` *(enumeration)*
`PENDING_FACULTY_VERIFICATION` · `PENDING_STAFF_APPROVAL` · `PENDING_ADMIN_RESOLUTION` · `APPROVED` · `REJECTED` · `CANCELLED`

#### `BookingSource` *(enumeration)*
`MANUAL_REQUEST` · `TIMETABLE_ALLOCATION` · `SLOT_CHANGE` · `VENUE_CHANGE`

#### `EventType` *(enumeration)*
`QUIZ` · `SEMINAR` · `SPEAKER_SESSION` · `MEETING` · `CULTURAL_EVENT` · `WORKSHOP` · `CLASS` · `OTHER`

#### `ApprovalAction` *(enumeration)*
`APPROVED` · `REJECTED` · `FORWARDED` · `VERIFIED`

---

### 14.6 Change Request Domain

#### `SlotChangeRequest`

Raised by faculty to move a course from its current time slot to a different one. The system validates feasibility before creating this record, and `bypassedStudentCheck` records whether the student-clash validation was skipped due to missing enrollment data (REQ-4.3.14).

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `requestId` | int | Primary key |
| `courseAllocationId` | int | Foreign key to the allocation being modified |
| `currentSlotId` | int | The slot the course is currently in |
| `requestedSlotId` | int | The target slot the faculty wants |
| `requestedBy` | int | Foreign key to the `Faculty` making the request |
| `status` | ChangeRequestStatus | PENDING, APPROVED, or REJECTED |
| `justification` | string | Reason provided by faculty for the change |
| `bypassedStudentCheck` | bool | True if student-level clash validation was skipped due to absent enrollment data; displayed to the user as a warning (REQ-4.3.14 / NFR-5.4.3) |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `validate()` | ValidationResult | Checks room availability in the target slot and student-level conflicts (or sets `bypassedStudentCheck` if enrollment data is absent) |
| `apply()` | bool | On approval, calls `CourseAllocation.updateSlot()` to regenerate bookings for the new slot |

---

#### `VenueChangeRequest`

Raised by faculty to move a course to a different room while keeping the same slot. The system checks the target room's availability across relevant slots before creating this record.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `requestId` | int | Primary key |
| `courseAllocationId` | int | Foreign key to the allocation being modified |
| `currentRoomId` | int | The room the course is currently allocated to |
| `requestedRoomId` | int | The target room the faculty wants |
| `requestedBy` | int | Foreign key to the `Faculty` making the request |
| `status` | ChangeRequestStatus | PENDING, APPROVED, or REJECTED |
| `justification` | string | Reason provided by faculty for the change |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `validate()` | ValidationResult | Checks that the requested room is available in the current slot and that its capacity is sufficient |
| `apply()` | bool | On approval, calls `CourseAllocation.updateRoom()` to regenerate bookings for the new room |

---

#### `ChangeRequestStatus` *(enumeration)*
`PENDING` · `APPROVED` · `REJECTED`

---

### 14.7 Availability Service

#### `AvailabilityService` *(service)*

A stateless service class with no persistent data of its own. It queries `VenueTimeSlot`, `Room`, and `TimeSlot` to answer all availability questions from booking, clash detection, and recommendation flows. Its `getAvailabilityMatrix()` method is the data source for the room calendar UI.

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `checkAvailability(roomId, date, timeSlotId)` | bool | Single point-in-time availability check for one room |
| `getAvailableRooms(date, timeSlotId, minCapacity)` | List\<Room\> | Returns all rooms free at a given date+slot with sufficient capacity; used when suggesting alternatives (REQ-4.1.9) |
| `suggestAlternativeRooms(date, timeSlot, capacity)` | List\<Room\> | Returns up to 5 alternative rooms when the requested room is unavailable (REQ-4.1.9) |
| `suggestAlternativeTimeSlots(roomId, date)` | List\<TimeSlot\> | Returns free time slots for a given room on a date; used in venue change flow (REQ-4.3.10) |
| `getAvailabilityMatrix(date, buildingId)` | Map | Returns a 2D map of room × time slot → availability status; source data for the calendar grid UI |

> Results from `getAvailabilityMatrix()` and `getAvailableRooms()` should be cached in Redis with a 60-second TTL and invalidated on any booking status change for the affected room+slot (NFR-5.1.1).

---

### 14.8 Supporting Domain

#### `Notification`

An in-app notification record. Created synchronously when a system event occurs; the corresponding email is queued asynchronously. Every relevant system event (booking state change, verification request, conflict alert) produces at least one notification record.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `notificationId` | int | Primary key |
| `recipientId` | int | Foreign key to the `User` receiving this notification |
| `subject` | string | Short subject line (used as email subject too) |
| `message` | string | Full notification body |
| `type` | NotificationType | Category of event that triggered this notification |
| `isRead` | bool | Whether the user has read it in-app |
| `sentAt` | datetime | Timestamp of creation |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `send()` | void | Writes the DB record and enqueues the email job |
| `markAsRead()` | void | Sets `isRead = true` |

---

#### `NotificationType` *(enumeration)*
`BOOKING_APPROVED` · `BOOKING_REJECTED` · `VERIFICATION_REQUIRED` · `CONFLICT_ALERT` · `SLOT_CHANGE_NOTIFICATION` · `VENUE_CHANGE_NOTIFICATION` · `REMINDER`

---

#### `Holiday`

A date on which no new bookings can be made and no timetable slots are active. Managed by Admin. `isRecurring` supports annual holidays (e.g., national holidays) that do not need to be re-entered each year.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `holidayId` | int | Primary key |
| `holidayDate` | date | The calendar date of the holiday |
| `description` | string | Name or reason (e.g., "Republic Day") |
| `isRecurring` | bool | If true, this holiday repeats every year on the same date |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `isHoliday(date)` | bool | Returns whether a given date is blocked; respects recurring flag |

---

#### `AuditLog`

An immutable append-only record of every significant action in the system. Written by services, never by controllers. Satisfies NFR-5.2.1 (data loss protection) and NFR-5.3.1 (security audit trail).

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `logId` | int | Primary key |
| `userId` | int | Foreign key to the `User` who performed the action |
| `action` | string | Action name (e.g., "BOOKING_APPROVED", "TIMETABLE_UPLOADED") |
| `entityType` | string | The class name of the entity affected (e.g., "BookingRequest") |
| `entityId` | int | The primary key of the affected record |
| `changeDetails` | string | JSON snapshot of what changed (old → new values) |
| `timestamp` | datetime | When the action occurred |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `log(userId, action, entity, details)` | void | Static factory method; the only way to create a log entry. Call this from service classes after every state-changing operation. |

---

#### `Department`

Represents an academic department. Links faculty members to their department and tracks which rooms a department owns or manages.

**Attributes**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `departmentId` | int | Primary key |
| `deptName` | string | Full department name |
| `deptCode` | string | Short code (e.g., "CSE", "EE") |

**Methods**
| Method | Returns | Purpose |
|--------|---------|---------|
| `getFaculty()` | List\<Faculty\> | Returns all faculty members belonging to this department |
| `getRooms()` | List\<Room\> | Returns all rooms owned or primarily used by this department |

---

## 15. Design Decisions & Deviations from SRS

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | REQ-4.1.2: Prevent double booking | `VenueTimeSlot.isBooked` is the single source of truth; re-checked inside a DB transaction at approval time | A dedicated per-slot record is more reliable than querying across two tables (timetable + bookings) for every availability check |
| 2 | REQ-4.1.10: Conflict escalation | Two triggers: (a) **Path B force-submit** — if a user submits for an already-booked room, the request goes straight to `PENDING_ADMIN_RESOLUTION` at creation time, bypassing staff entirely; staff is notified for awareness only. (b) **Path A race-condition** — if staff approves and the slot was taken in the brief window since submission, that request also moves to `PENDING_ADMIN_RESOLUTION` and staff is notified. Multiple pending requests in `PENDING_STAFF_APPROVAL` for the same slot are not escalated — staff processes them normally | Force-submit conflicts must not burden staff with a decision they have no authority to make fairly; they go directly to Admin |
| 4 | Holiday/weekend availability | Timetable booking generation skips holidays and weekends; `VenueTimeSlot` records for those dates are never marked booked. Manual booking is always allowed on those days | Rooms should not sit unused on holidays just because a course is allocated to that slot in theory |
| 5 | REQ-4.2.2: Timetable pre-population | Admin must populate Course, Room, SlotDefinition, and Faculty before timetable upload. Parser reports all missing references and refuses to commit until resolved | Avoids silent data inconsistencies; forces the system to be the source of truth |
| 6 | Actual timetable format | Parser accepts the IIT Jodhpur `Classroom Allocation` spreadsheet format (Subject Code, Slot, Department, Instructor, Student Registered, Classroom) rather than a custom format | No reformatting burden on admin; the existing spreadsheet can be uploaded directly |
| 7 | Slot name complexity | Parser looks up slot names including complex variants (`D (Wed)`, `G (Tue, Fri)`, `NG`, `L1` etc.) against `SlotDefinition.slotName`. Unrecognised names are reported as errors | The actual slot data is messy; strict lookup with clear errors is better than silent guessing |
| 8 | REQ-4.3.14: Bypass student check | `bypassedStudentCheck` boolean on `SlotChangeRequest`; shown as a UI warning | Traceable, auditable, satisfies NFR-5.4.1 and NFR-5.4.3 |
| 9 | `BookingStatus` naming | Using `PENDING_FACULTY_VERIFICATION`, `PENDING_STAFF_APPROVAL`, `PENDING_ADMIN_RESOLUTION` (not `ESCALATED`) | Descriptive names communicate current state to all user roles without ambiguity |
| 10 | Soft-delete for rooms/users | `isActive` flag rather than hard delete | Preserves booking history and audit trail |
| 11 | Redis cache for availability | `getAvailabilityMatrix()` cached 60s, keyed on building+date, invalidated on any `VenueTimeSlot` change | Required to satisfy NFR-5.1.1 (< 2s); raw DB queries over a full semester of `VenueTimeSlot` records would breach this |
| 12 | Pagination | All list APIs are paginated | Essential for production; a full semester of `VenueTimeSlot` or `AuditLog` records would break un-paginated endpoints |

---

## 16. Spreadsheet Sufficiency Analysis

This section answers whether the provided timetable image (Senior year slot system) and the `Classroom Allocation` spreadsheet are sufficient to populate all required tables before timetable upload.

### What the spreadsheet provides

The `Classroom Allocation` sheet (1,060 rows) contains: Subject Code, Subject Name, L-T-P, Credits, Slot, Department, Instructor name, Student count, and Classroom. This is enough to populate:

| Table | Covered? | Notes |
|-------|----------|-------|
| `Course` (code, name, L-T-P, credits, dept) | ✅ Yes | All columns present |
| `CourseAllocation` (course → slot → room) | ✅ Yes | Core of the timetable |
| `Room` (room name/code) | ⚠️ Partial | Room names present but **capacity, type, building, equipment are not in the spreadsheet** — must be added separately |
| `SlotDefinition` (slot names) | ⚠️ Partial | Slot names are present but **day+time mappings are not** — these come from the slot system image |
| `Faculty` (instructor name) | ⚠️ Partial | Names present but **email and department are missing** — faculty accounts must be created first |
| `Enrollment` (student counts) | ⚠️ Partial | `Student Registered` gives enrollment count per course but **not individual student–course mappings** — a separate enrollment list is needed for student-level clash detection |
| `Department` | ✅ Yes | 26 departments listed |

### What the slot system image provides

The timetable image (Senior year, AY 2025-26 Sem II) maps slot names to day+time pairs. For example: slot `A` = Mon 09:00, Tue 09:00, Wed 09:00; slot `K` = Mon 08:00, Wed 08:00, Fri 08:00; lab slots `L1`–`L10` = two-hour blocks on specific days. This is exactly what `SlotOccurrence` records need. A similar image or sheet is needed for the First Year slot system.

### What is still missing and must be provided separately

| Missing data | Where needed | Recommended format |
|-------------|-------------|-------------------|
| Room capacity, type, building, equipment | `Room` table | Separate room master CSV or admin form |
| Faculty email addresses | `User` table | Faculty list CSV |
| First Year slot system day+time mappings | `SlotDefinition` + `SlotOccurrence` | Image or sheet similar to the Senior one provided |
| Individual student–course enrollments | `Enrollment` table | Student enrollment CSV (roll number, course code) |
| Academic year dates and holidays | `AcademicYear`, `Holiday` | Admin inputs manually or uploads a holiday calendar |

### Summary

The two files together cover about 70% of what is needed. The timetable can be uploaded and validated once room master data, faculty emails, and the First Year slot system are also provided. Enrollment data is optional for the timetable upload itself but required for full slot-change clash detection.

*This document is a living reference. Update it as implementation decisions are made and requirements evolve. All requirement IDs referenced here correspond to SRS v2.4.*