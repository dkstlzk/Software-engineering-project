/**
 * Database Migration Script
 * Creates all tables for the Unified Room Allocation System
 * Based on UML Class Diagrams from SRS Documentation
 * 
 * Entity Relationships:
 * - Users belong to Roles and optionally Departments
 * - Rooms belong to Departments and have Inventory items
 * - Allocations link Users, Rooms, and Slots
 * - BookingRequests go through approval workflow
 */
const { pool } = require('./database');
const logger = require('../utils/logger');

const createTables = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // =============================================================
    // CORE ENUMS AND TYPES
    // =============================================================
    
    // Create custom enum types
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'staff', 'faculty', 'student');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE booking_status AS ENUM (
          'pending_faculty',
          'pending_staff',
          'approved',
          'rejected',
          'cancelled',
          'conflict_escalated'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE event_type AS ENUM (
          'class',
          'quiz',
          'exam',
          'seminar',
          'meeting',
          'speaker_session',
          'cultural_event',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE room_type AS ENUM (
          'lecture_hall',
          'classroom',
          'lab',
          'seminar_room',
          'conference_room',
          'auditorium'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE inventory_status AS ENUM ('available', 'in_use', 'maintenance', 'damaged');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // =============================================================
    // ROLES TABLE
    // Enhanced RBAC with granular permissions
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // DEPARTMENTS TABLE
    // Academic departments that own rooms
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        code VARCHAR(20) UNIQUE NOT NULL,
        description TEXT,
        head_id UUID, -- References users table (circular dependency resolved via ALTER)
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // USERS TABLE
    // Base user entity with inheritance concept for roles
    // Supports: Admin, Staff, Faculty, Student
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        employee_id VARCHAR(50) UNIQUE, -- For staff/faculty
        student_id VARCHAR(50) UNIQUE,  -- For students
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        is_email_verified BOOLEAN DEFAULT false,
        last_login TIMESTAMP WITH TIME ZONE,
        password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_employee_or_student CHECK (
          NOT (employee_id IS NOT NULL AND student_id IS NOT NULL)
        )
      );
    `);
    
    // Add foreign key to departments for head
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE departments 
        ADD CONSTRAINT fk_department_head 
        FOREIGN KEY (head_id) REFERENCES users(id) ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // =============================================================
    // REFRESH TOKENS TABLE
    // For JWT refresh token management
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        revoked_at TIMESTAMP WITH TIME ZONE
      );
    `);
    
    // =============================================================
    // BUILDINGS TABLE
    // Physical buildings containing rooms
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS buildings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) UNIQUE NOT NULL,
        address TEXT,
        floors INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // ROOMS TABLE
    // Physical rooms that can be allocated
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_number VARCHAR(50) NOT NULL,
        name VARCHAR(100),
        building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
        department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        floor INTEGER DEFAULT 0,
        capacity INTEGER NOT NULL CHECK (capacity > 0),
        room_type room_type NOT NULL DEFAULT 'classroom',
        has_projector BOOLEAN DEFAULT false,
        has_whiteboard BOOLEAN DEFAULT true,
        has_ac BOOLEAN DEFAULT false,
        has_mic BOOLEAN DEFAULT false,
        has_video_conferencing BOOLEAN DEFAULT false,
        is_accessible BOOLEAN DEFAULT false, -- Wheelchair accessible
        is_active BOOLEAN DEFAULT true,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(building_id, room_number)
      );
    `);
    
    // =============================================================
    // ROOM INVENTORY TABLE
    // Items/equipment in each room
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        item_name VARCHAR(100) NOT NULL,
        item_description TEXT,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
        status inventory_status DEFAULT 'available',
        serial_number VARCHAR(100),
        purchase_date DATE,
        warranty_expiry DATE,
        last_maintenance DATE,
        next_maintenance DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // ACADEMIC YEARS TABLE
    // Academic calendar management
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS academic_years (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_current BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_dates CHECK (end_date > start_date)
      );
    `);
    
    // =============================================================
    // SLOTS TABLE
    // Time slots for scheduling
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
        slot_type VARCHAR(50) DEFAULT 'regular', -- regular, first_year, senior
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_times CHECK (end_time > start_time)
      );
    `);
    
    // =============================================================
    // HOLIDAYS TABLE
    // Institute holidays
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
        is_recurring BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // COURSES TABLE
    // Academic courses
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        credits INTEGER DEFAULT 3,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // ROOM ALLOCATIONS TABLE
    // Permanent/semester allocations for courses
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
        course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
        instructor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
        effective_from DATE NOT NULL,
        effective_until DATE,
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(room_id, slot_id, effective_from)
      );
    `);
    
    // =============================================================
    // ALLOCATION POLICIES TABLE
    // Configurable booking/allocation policies per role
    // As per class diagram: AllocationPolicy class
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS allocation_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role_name VARCHAR(50) NOT NULL,
        max_booking_duration_hours INTEGER NOT NULL DEFAULT 4,
        max_advance_booking_days INTEGER NOT NULL DEFAULT 30,
        min_notice_hours INTEGER NOT NULL DEFAULT 0,
        approval_chain JSONB NOT NULL DEFAULT '[]',
        max_concurrent_bookings INTEGER DEFAULT 5,
        allowed_room_types JSONB DEFAULT '[]',
        priority_level INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(role_name)
      );
    `);
    
    // =============================================================
    // BOOKING REQUESTS TABLE
    // Ad-hoc room booking requests with approval workflow
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        booking_date DATE NOT NULL,
        slot_id UUID REFERENCES slots(id),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        event_type event_type NOT NULL DEFAULT 'other',
        event_title VARCHAR(200) NOT NULL,
        event_description TEXT,
        expected_attendees INTEGER,
        requires_projector BOOLEAN DEFAULT false,
        requires_mic BOOLEAN DEFAULT false,
        special_requirements TEXT,
        status booking_status NOT NULL DEFAULT 'pending_staff',
        faculty_verifier_id UUID REFERENCES users(id), -- For student requests
        faculty_verification_at TIMESTAMP WITH TIME ZONE,
        faculty_remarks TEXT,
        staff_reviewer_id UUID REFERENCES users(id),
        staff_review_at TIMESTAMP WITH TIME ZONE,
        staff_remarks TEXT,
        admin_resolver_id UUID REFERENCES users(id), -- For conflicts
        admin_resolution_at TIMESTAMP WITH TIME ZONE,
        admin_remarks TEXT,
        rejection_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_booking_times CHECK (end_time > start_time)
      );
    `);
    
    // =============================================================
    // NOTIFICATIONS TABLE
    // System notifications (REQ-4.5.x)
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL, -- booking_request, approval, rejection, reminder
        reference_type VARCHAR(50), -- booking_request, allocation, etc
        reference_id UUID,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // AUDIT LOG TABLE
    // For tracking all system changes (NFR-5.2.1)
    // =============================================================
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID,
        old_values JSONB,
        new_values JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // =============================================================
    // INDEXES FOR PERFORMANCE
    // =============================================================
    
    // Users table indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
      CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
    `);
    
    // Rooms table indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);
      CREATE INDEX IF NOT EXISTS idx_rooms_department ON rooms(department_id);
      CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(room_type);
      CREATE INDEX IF NOT EXISTS idx_rooms_capacity ON rooms(capacity);
    `);
    
    // Booking requests indexes for fast availability queries (NFR-5.1.1)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_requests_room_date 
        ON booking_requests(room_id, booking_date);
      CREATE INDEX IF NOT EXISTS idx_booking_requests_status 
        ON booking_requests(status);
      CREATE INDEX IF NOT EXISTS idx_booking_requests_requester 
        ON booking_requests(requester_id);
      CREATE INDEX IF NOT EXISTS idx_booking_requests_date 
        ON booking_requests(booking_date);
    `);
    
    // Room allocations indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_allocations_room_slot 
        ON room_allocations(room_id, slot_id);
      CREATE INDEX IF NOT EXISTS idx_allocations_dates 
        ON room_allocations(effective_from, effective_until);
    `);
    
    // Allocation policies index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_allocation_policies_role 
        ON allocation_policies(role_name);
    `);
    
    // Notifications indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user 
        ON notifications(user_id, is_read);
    `);
    
    // Audit log indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
        ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
        ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created 
        ON audit_logs(created_at);
    `);

    // =============================================================
    // SPRINT 2: SLOT SYSTEMS TABLE
    // Multiple independent slot systems (BTech_1stYear, MTech, etc.)
    // =============================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS slot_systems (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        program_type VARCHAR(50) NOT NULL,
        year_group VARCHAR(50),
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // =============================================================
    // SPRINT 2: SLOT ENTRIES TABLE
    // Individual time slots within a slot system
    // =============================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS slot_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_system_id UUID NOT NULL REFERENCES slot_systems(id) ON DELETE CASCADE,
        slot_code VARCHAR(20) NOT NULL,
        day VARCHAR(10) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_slot_times CHECK (end_time > start_time),
        UNIQUE(slot_system_id, slot_code, day, start_time)
      );
    `);

    // =============================================================
    // SPRINT 2: ALTER COURSES TABLE
    // Add slot_system_id foreign key
    // =============================================================

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE courses
        ADD COLUMN slot_system_id UUID REFERENCES slot_systems(id) ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);
    
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE courses
        ADD COLUMN instructor VARCHAR(200);
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);
    
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE courses
        ADD COLUMN student_count INTEGER DEFAULT 0;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // =============================================================
    // SPRINT 2: TIMETABLE ENTRIES TABLE
    // Parsed timetable rows with slot normalization
    // =============================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS timetable_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_code VARCHAR(20) NOT NULL,
        subject_name VARCHAR(200),
        slot_code VARCHAR(20) NOT NULL,
        slot_constraints JSONB DEFAULT '{}',
        instructor VARCHAR(200),
        student_count INTEGER DEFAULT 0,
        classroom VARCHAR(100),
        raw_input TEXT,
        course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
        slot_system_id UUID NOT NULL REFERENCES slot_systems(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // =============================================================
    // SPRINT 2: BOOKINGS TABLE
    // Preallocated room bookings from timetable
    // =============================================================

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE booking_type AS ENUM ('class', 'lab', 'tutorial', 'exam', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        slot_entry_id UUID REFERENCES slot_entries(id) ON DELETE SET NULL,
        date DATE NOT NULL,
        day VARCHAR(10) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
        timetable_entry_id UUID REFERENCES timetable_entries(id) ON DELETE SET NULL,
        booking_type booking_type NOT NULL DEFAULT 'class',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_booking_times CHECK (end_time > start_time)
      );
    `);

    // =============================================================
    // SPRINT 2: INDEXES
    // =============================================================

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_slot_entries_system
        ON slot_entries(slot_system_id);
      CREATE INDEX IF NOT EXISTS idx_slot_entries_code
        ON slot_entries(slot_system_id, slot_code);
      CREATE INDEX IF NOT EXISTS idx_courses_slot_system
        ON courses(slot_system_id);
      CREATE INDEX IF NOT EXISTS idx_timetable_entries_slot_system
        ON timetable_entries(slot_system_id);
      CREATE INDEX IF NOT EXISTS idx_timetable_entries_course
        ON timetable_entries(course_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_room_date
        ON bookings(room_id, date);
      CREATE INDEX IF NOT EXISTS idx_bookings_room_day_time
        ON bookings(room_id, day, start_time, end_time);
      CREATE INDEX IF NOT EXISTS idx_bookings_course
        ON bookings(course_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_timetable_entry
        ON bookings(timetable_entry_id);
    `);
    
    await client.query('COMMIT');
    logger.info('Database migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Database migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

// Run migration if executed directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables };
