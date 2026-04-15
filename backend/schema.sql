-- Production schema for PostgreSQL (Neon compatible)
-- Generated from backend/src/db/schema.ts and backend/src/modules/timetable/schema.ts

BEGIN;

-- =========================
-- Enums
-- =========================
CREATE TYPE room_type AS ENUM (
  'LECTURE_HALL',
  'CLASSROOM',
  'SEMINAR_ROOM',
  'COMPUTER_LAB',
  'CONFERENCE_ROOM',
  'AUDITORIUM',
  'WORKSHOP',
  'OTHER'
);

CREATE TYPE booking_source AS ENUM (
  'MANUAL_REQUEST',
  'TIMETABLE_ALLOCATION',
  'SLOT_CHANGE',
  'VENUE_CHANGE'
);

CREATE TYPE timetable_import_batch_status AS ENUM (
  'PREVIEWED',
  'COMMITTED'
);

CREATE TYPE timetable_import_row_status AS ENUM (
  'VALID_AND_AUTOMATABLE',
  'UNRESOLVED_SLOT',
  'UNRESOLVED_ROOM',
  'AMBIGUOUS_CLASSROOM',
  'DUPLICATE_ROW',
  'CONFLICTING_MAPPING',
  'MISSING_REQUIRED_FIELD',
  'OTHER_PROCESSING_ERROR'
);

CREATE TYPE timetable_import_occurrence_status AS ENUM (
  'PENDING',
  'CREATED',
  'FAILED',
  'SKIPPED',
  'UNRESOLVED',
  'ALREADY_PROCESSED'
);

CREATE TYPE timetable_import_decision_action AS ENUM (
  'AUTO',
  'RESOLVE',
  'SKIP'
);

CREATE TYPE timetable_commit_session_status AS ENUM (
  'STARTED',
  'EXTERNAL_DONE',
  'INTERNAL_DONE',
  'FROZEN',
  'COMPLETED',
  'CANCELLED',
  'FAILED'
);

CREATE TYPE booking_status AS ENUM (
  'PENDING_FACULTY',
  'PENDING_STAFF',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE booking_edit_request_status AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE booking_event_type AS ENUM (
  'QUIZ',
  'SEMINAR',
  'SPEAKER_SESSION',
  'MEETING',
  'CULTURAL_EVENT',
  'WORKSHOP',
  'CLASS',
  'OTHER'
);

CREATE TYPE user_role AS ENUM (
  'ADMIN',
  'STAFF',
  'FACULTY',
  'STUDENT',
  'PENDING_ROLE'
);

CREATE TYPE notification_type AS ENUM (
  'BOOKING_REQUEST_CREATED',
  'BOOKING_REQUEST_FORWARDED',
  'BOOKING_REQUEST_APPROVED',
  'BOOKING_REQUEST_REJECTED',
  'BOOKING_REQUEST_CANCELLED',
  'SLOT_CHANGE_REQUESTED',
  'SLOT_CHANGE_APPROVED',
  'SLOT_CHANGE_REJECTED',
  'VENUE_CHANGE_REQUESTED',
  'VENUE_CHANGE_APPROVED',
  'VENUE_CHANGE_REJECTED'
);

CREATE TYPE day_of_week AS ENUM (
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN'
);

-- =========================
-- Core tables
-- =========================
CREATE TABLE slot_systems (
  id serial PRIMARY KEY,
  name text NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  committed_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  google_id text,
  avatar_url text,
  display_name text,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  registered_via text NOT NULL DEFAULT 'email',
  first_login boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT users_registered_via_allowed_check
    CHECK (registered_via IN ('email', 'google')),
  CONSTRAINT users_google_email_domain_check
    CHECK (registered_via <> 'google' OR lower(email) LIKE '%@iitj.ac.in')
);

CREATE UNIQUE INDEX users_google_id_unique ON users (google_id);
CREATE INDEX users_department_idx ON users (department);
CREATE INDEX users_is_active_idx ON users (is_active);
CREATE INDEX users_registered_via_idx ON users (registered_via);

CREATE TABLE buildings (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  location text,
  managed_by_staff_id integer REFERENCES users(id)
);

CREATE UNIQUE INDEX buildings_name_unique ON buildings (lower(name));
CREATE INDEX buildings_managed_by_idx ON buildings (managed_by_staff_id);

CREATE TABLE rooms (
  id serial PRIMARY KEY,
  name text NOT NULL,
  building_id integer NOT NULL REFERENCES buildings(id),
  capacity integer,
  room_type room_type DEFAULT 'OTHER',
  has_projector boolean NOT NULL DEFAULT false,
  has_mic boolean NOT NULL DEFAULT false,
  accessible boolean NOT NULL DEFAULT true,
  equipment_list text
);

CREATE UNIQUE INDEX rooms_building_name_unique ON rooms (building_id, lower(name));
CREATE INDEX rooms_accessible_idx ON rooms (accessible);

CREATE TABLE holidays (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT holidays_date_range_check CHECK (start_date <= end_date)
);

CREATE INDEX holidays_name_idx ON holidays (name);
CREATE INDEX holidays_start_date_idx ON holidays (start_date);
CREATE INDEX holidays_end_date_idx ON holidays (end_date);

CREATE TABLE bookings (
  id serial PRIMARY KEY,
  room_id integer NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_at timestamp NOT NULL,
  end_at timestamp NOT NULL,
  request_id integer,
  approved_by integer REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamp,
  source booking_source NOT NULL DEFAULT 'MANUAL_REQUEST',
  source_ref text
);

CREATE TABLE booking_requests (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  faculty_id integer REFERENCES users(id) ON DELETE SET NULL,
  room_id integer NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_at timestamp NOT NULL,
  end_at timestamp NOT NULL,
  event_type booking_event_type NOT NULL DEFAULT 'OTHER',
  purpose text NOT NULL,
  participant_count integer,
  status booking_status NOT NULL DEFAULT 'PENDING_FACULTY',
  created_at timestamp NOT NULL DEFAULT now(),
  booking_id integer REFERENCES bookings(id) ON DELETE SET NULL,
  rejection_reason text,
  internal_note text,
  decided_at timestamp,
  CONSTRAINT booking_requests_participant_count_positive_check
    CHECK (participant_count IS NULL OR participant_count > 0)
);

CREATE INDEX booking_requests_user_id_idx ON booking_requests (user_id);
CREATE INDEX booking_requests_faculty_id_idx ON booking_requests (faculty_id);
CREATE INDEX booking_requests_room_id_idx ON booking_requests (room_id);
CREATE INDEX booking_requests_status_idx ON booking_requests (status);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_request_id_fk
  FOREIGN KEY (request_id)
  REFERENCES booking_requests(id)
  ON DELETE SET NULL;

CREATE TABLE booking_edit_requests (
  id serial PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  proposed_room_id integer REFERENCES rooms(id) ON DELETE SET NULL,
  proposed_start_at timestamp,
  proposed_end_at timestamp,
  status booking_edit_request_status NOT NULL DEFAULT 'PENDING',
  requested_by integer NOT NULL REFERENCES users(id),
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT booking_edit_requests_proposed_fields_present_check
    CHECK (
      proposed_room_id IS NOT NULL OR
      proposed_start_at IS NOT NULL OR
      proposed_end_at IS NOT NULL
    )
);

CREATE INDEX booking_edit_requests_booking_id_idx ON booking_edit_requests (booking_id);
CREATE INDEX booking_edit_requests_status_idx ON booking_edit_requests (status);
CREATE INDEX booking_edit_requests_requested_by_idx ON booking_edit_requests (requested_by);

CREATE TABLE notifications (
  notification_id serial PRIMARY KEY,
  recipient_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  type notification_type NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  sent_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_id_idx ON notifications (recipient_id);
CREATE INDEX notifications_recipient_read_idx ON notifications (recipient_id, is_read);
CREATE INDEX notifications_sent_at_idx ON notifications (sent_at);

CREATE TABLE staff_building_assignments (
  staff_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  building_id integer NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  assigned_by integer REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_building_assignments_staff_building_unique
  ON staff_building_assignments (staff_id, building_id);
CREATE INDEX staff_building_assignments_staff_id_idx ON staff_building_assignments (staff_id);
CREATE INDEX staff_building_assignments_building_id_idx ON staff_building_assignments (building_id);
CREATE INDEX staff_building_assignments_assigned_by_idx ON staff_building_assignments (assigned_by);

CREATE TABLE courses (
  id serial PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  department text NOT NULL,
  credits integer NOT NULL,
  description text,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX courses_code_unique ON courses (code);
CREATE INDEX courses_created_by_idx ON courses (created_by);
CREATE INDEX courses_department_idx ON courses (department);
CREATE INDEX courses_name_idx ON courses (name);
CREATE INDEX courses_is_active_idx ON courses (is_active);

CREATE TABLE course_faculty (
  course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  faculty_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX course_faculty_course_id_faculty_id_unique
  ON course_faculty (course_id, faculty_id);
CREATE INDEX course_faculty_course_id_idx ON course_faculty (course_id);
CREATE INDEX course_faculty_faculty_id_idx ON course_faculty (faculty_id);

CREATE TABLE course_enrollments (
  course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX course_enrollments_course_id_student_id_unique
  ON course_enrollments (course_id, student_id);
CREATE INDEX course_enrollments_course_id_idx ON course_enrollments (course_id);
CREATE INDEX course_enrollments_student_id_idx ON course_enrollments (student_id);

CREATE TABLE booking_course_link (
  booking_id integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX booking_course_link_booking_id_course_id_unique
  ON booking_course_link (booking_id, course_id);
CREATE INDEX booking_course_link_booking_id_idx ON booking_course_link (booking_id);
CREATE INDEX booking_course_link_course_id_idx ON booking_course_link (course_id);

CREATE TABLE system_preferences (
  id integer PRIMARY KEY NOT NULL DEFAULT 1,
  manual_data_loading boolean NOT NULL DEFAULT true,
  auto_load_dependent_data boolean NOT NULL DEFAULT false,
  auto_load_sections jsonb NOT NULL DEFAULT '{"dashboard":false,"bookings":false,"rooms":false,"availability":false,"bookingRequests":false,"users":false}'::jsonb,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT system_preferences_singleton_check CHECK (id = 1)
);

CREATE INDEX system_preferences_updated_by_idx ON system_preferences (updated_by);

CREATE TABLE user_sessions (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX "IDX_session_expire" ON user_sessions (expire);

-- =========================
-- Timetable tables
-- =========================
CREATE TABLE slot_days (
  id serial PRIMARY KEY,
  slot_system_id integer NOT NULL REFERENCES slot_systems(id) ON DELETE CASCADE,
  day_of_week day_of_week NOT NULL,
  order_index integer NOT NULL,
  lane_count integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX unique_day_per_system ON slot_days (slot_system_id, day_of_week);
CREATE UNIQUE INDEX unique_day_order_per_system ON slot_days (slot_system_id, order_index);

CREATE TABLE slot_time_bands (
  id serial PRIMARY KEY,
  slot_system_id integer NOT NULL REFERENCES slot_systems(id) ON DELETE CASCADE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  order_index integer NOT NULL
);

CREATE UNIQUE INDEX unique_band_order ON slot_time_bands (slot_system_id, order_index);

CREATE TABLE slot_blocks (
  id serial PRIMARY KEY,
  slot_system_id integer NOT NULL REFERENCES slot_systems(id) ON DELETE CASCADE,
  day_id integer NOT NULL REFERENCES slot_days(id) ON DELETE CASCADE,
  start_band_id integer NOT NULL REFERENCES slot_time_bands(id) ON DELETE CASCADE,
  lane_index integer NOT NULL DEFAULT 0,
  row_span integer NOT NULL DEFAULT 1,
  label text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE timetable_import_batches (
  id serial PRIMARY KEY,
  batch_key text NOT NULL,
  slot_system_id integer NOT NULL REFERENCES slot_systems(id) ON DELETE CASCADE,
  term_start_date timestamp NOT NULL,
  term_end_date timestamp NOT NULL,
  file_name text NOT NULL,
  file_hash text NOT NULL,
  fingerprint text NOT NULL,
  alias_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  auxiliary_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  status timetable_import_batch_status NOT NULL DEFAULT 'PREVIEWED',
  created_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  committed_at timestamp
);

CREATE UNIQUE INDEX timetable_import_batches_batch_key_unique
  ON timetable_import_batches (batch_key);
CREATE UNIQUE INDEX timetable_import_batches_fingerprint_unique
  ON timetable_import_batches (fingerprint);

CREATE TABLE timetable_import_rows (
  id serial PRIMARY KEY,
  batch_id integer NOT NULL REFERENCES timetable_import_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw_row jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_course_code text,
  raw_slot text,
  raw_classroom text,
  normalized_course_code text,
  normalized_slot text,
  normalized_classroom text,
  classification timetable_import_row_status NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  parsed_building text,
  parsed_room text,
  resolved_slot_label text,
  resolved_room_id integer REFERENCES rooms(id) ON DELETE SET NULL,
  row_hash text,
  auxiliary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX timetable_import_rows_batch_row_unique
  ON timetable_import_rows (batch_id, row_index);

CREATE TABLE timetable_import_occurrences (
  id serial PRIMARY KEY,
  batch_id integer NOT NULL REFERENCES timetable_import_batches(id) ON DELETE CASCADE,
  row_id integer NOT NULL REFERENCES timetable_import_rows(id) ON DELETE CASCADE,
  room_id integer NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_at timestamp NOT NULL,
  end_at timestamp NOT NULL,
  source text NOT NULL DEFAULT 'TIMETABLE_ALLOCATION',
  source_ref text,
  dedupe_key text NOT NULL,
  booking_id integer REFERENCES bookings(id) ON DELETE SET NULL,
  status timetable_import_occurrence_status NOT NULL DEFAULT 'PENDING',
  error_message text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX timetable_import_occurrences_dedupe_key_unique
  ON timetable_import_occurrences (dedupe_key);

CREATE TABLE timetable_import_row_resolutions (
  id serial PRIMARY KEY,
  batch_id integer NOT NULL REFERENCES timetable_import_batches(id) ON DELETE CASCADE,
  row_id integer NOT NULL REFERENCES timetable_import_rows(id) ON DELETE CASCADE,
  action timetable_import_decision_action NOT NULL,
  resolved_slot_label text,
  resolved_room_id integer REFERENCES rooms(id) ON DELETE SET NULL,
  create_slot jsonb,
  create_room jsonb,
  created_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  already_processed_count integer NOT NULL DEFAULT 0,
  unresolved_count integer NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX timetable_import_row_resolutions_batch_row_unique
  ON timetable_import_row_resolutions (batch_id, row_id);

CREATE TABLE commit_sessions (
  id serial PRIMARY KEY,
  batch_id integer NOT NULL REFERENCES timetable_import_batches(id) ON DELETE CASCADE,
  slot_system_id integer NOT NULL REFERENCES slot_systems(id) ON DELETE CASCADE,
  status timetable_commit_session_status NOT NULL DEFAULT 'STARTED',
  payload_snapshot text NOT NULL,
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  runtime_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolutions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  frozen_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX commit_sessions_batch_id_idx ON commit_sessions (batch_id);
CREATE INDEX commit_sessions_slot_system_id_idx ON commit_sessions (slot_system_id);
CREATE INDEX commit_sessions_status_idx ON commit_sessions (status);
CREATE INDEX commit_sessions_created_at_idx ON commit_sessions (created_at);

COMMIT;
