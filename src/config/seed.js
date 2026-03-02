/**
 * Database Seed Script
 * Populates initial data for roles, permissions, and admin user
 * Based on SRS Section 2.3 User Classes and RBAC requirements
 */
const bcrypt = require('bcryptjs');
const { pool } = require('./database');
const config = require('./index');
const logger = require('../utils/logger');

/**
 * Role permissions based on SRS requirements
 * Admin: Full system access
 * Staff (LHC Staff): Room management, booking approvals
 * Faculty: Room requests, student request verification
 * Student: Room booking requests (requires faculty verification)
 */
const roles = [
  {
    name: 'admin',
    description: 'System administrator with full access. Manages timetables, academic calendars, examination schedules, and resolves conflicts.',
    permissions: {
      // User management
      users: { create: true, read: true, update: true, delete: true },
      // Department management (REQ - admin only operations)
      departments: { create: true, read: true, update: true, delete: true },
      // Room management (REQ - admin/staff operations)
      rooms: { create: true, read: true, update: true, delete: true },
      // Building management
      buildings: { create: true, read: true, update: true, delete: true },
      // Inventory management
      inventory: { create: true, read: true, update: true, delete: true },
      // Allocation management
      allocations: { create: true, read: true, update: true, delete: true },
      // Booking requests (REQ-4.1.10 - conflict resolution)
      bookings: { 
        create: true, 
        read: true, 
        update: true, 
        delete: true, 
        approve: true, 
        reject: true,
        resolve_conflicts: true 
      },
      // Academic data
      courses: { create: true, read: true, update: true, delete: true },
      slots: { create: true, read: true, update: true, delete: true },
      academic_years: { create: true, read: true, update: true, delete: true },
      holidays: { create: true, read: true, update: true, delete: true },
      // Timetable upload (REQ-4.1.4)
      timetable: { upload: true, read: true },
      // Audit logs (NFR-5.2.1)
      audit_logs: { read: true },
      // Notifications
      notifications: { create: true, read: true, broadcast: true },
      // Reports
      reports: { generate: true, read: true },
    },
  },
  {
    name: 'staff',
    description: 'LHC Staff with room management and booking approval privileges.',
    permissions: {
      // User management - view only
      users: { create: false, read: true, update: false, delete: false },
      // Department management
      departments: { create: false, read: true, update: false, delete: false },
      // Room management (as per SRS - manages rooms)
      rooms: { create: true, read: true, update: true, delete: false },
      // Building - view only
      buildings: { create: false, read: true, update: false, delete: false },
      // Inventory management
      inventory: { create: true, read: true, update: true, delete: true },
      // Allocation management (manages allocation policies)
      allocations: { create: true, read: true, update: true, delete: false },
      // Booking requests - final approval/rejection (SRS 4.1.2)
      bookings: { 
        create: true, 
        read: true, 
        update: false, 
        delete: false, 
        approve: true, 
        reject: true,
        resolve_conflicts: false 
      },
      // Academic data - view only
      courses: { create: false, read: true, update: false, delete: false },
      slots: { create: true, read: true, update: true, delete: false },
      academic_years: { create: false, read: true, update: false, delete: false },
      holidays: { create: false, read: true, update: false, delete: false },
      // Notifications
      notifications: { create: true, read: true, broadcast: false },
      // Reports
      reports: { generate: true, read: true },
    },
  },
  {
    name: 'faculty',
    description: 'Faculty members who can request rooms and verify student booking requests.',
    permissions: {
      // User management - none
      users: { create: false, read: true, update: false, delete: false },
      // Department - view only
      departments: { create: false, read: true, update: false, delete: false },
      // Room - view for availability
      rooms: { create: false, read: true, update: false, delete: false },
      // Building - view only
      buildings: { create: false, read: true, update: false, delete: false },
      // Inventory - view only
      inventory: { create: false, read: true, update: false, delete: false },
      // Allocations - view own and request changes (REQ-4.3.x)
      allocations: { create: false, read: true, update: false, delete: false, request_change: true },
      // Booking requests - can create and verify student requests (SRS 4.1.2)
      bookings: { 
        create: true, 
        read: true, 
        update: false, 
        delete: false, 
        approve: false, 
        reject: false,
        verify_student: true,  // Faculty verification privilege
        resolve_conflicts: false 
      },
      // Academic data - view only
      courses: { create: false, read: true, update: false, delete: false },
      slots: { create: false, read: true, update: false, delete: false },
      academic_years: { create: false, read: true, update: false, delete: false },
      holidays: { create: false, read: true, update: false, delete: false },
      // Notifications - read own
      notifications: { create: false, read: true, broadcast: false },
    },
  },
  {
    name: 'student',
    description: 'Students who can request room bookings (requires faculty verification before staff approval).',
    permissions: {
      // User management - none
      users: { create: false, read: false, update: false, delete: false },
      // Department - view only
      departments: { create: false, read: true, update: false, delete: false },
      // Room - view for availability
      rooms: { create: false, read: true, update: false, delete: false },
      // Building - view only
      buildings: { create: false, read: true, update: false, delete: false },
      // Inventory - view only
      inventory: { create: false, read: true, update: false, delete: false },
      // Allocations - view only
      allocations: { create: false, read: true, update: false, delete: false },
      // Booking requests - can create but goes to faculty first (SRS 2.3, 4.1.2)
      bookings: { 
        create: true, 
        read: true,  // Can read own requests
        update: false, 
        delete: false, 
        approve: false, 
        reject: false,
        verify_student: false,
        resolve_conflicts: false 
      },
      // Academic data - view only
      courses: { create: false, read: true, update: false, delete: false },
      slots: { create: false, read: true, update: false, delete: false },
      academic_years: { create: false, read: true, update: false, delete: false },
      holidays: { create: false, read: true, update: false, delete: false },
      // Notifications - read own
      notifications: { create: false, read: true, broadcast: false },
    },
  },
];

/**
 * Allocation policies per role
 * As per class diagram: AllocationPolicy entity
 */
const allocationPolicies = [
  {
    role_name: 'admin',
    max_booking_duration_hours: 24,
    max_advance_booking_days: 365,
    min_notice_hours: 0,
    approval_chain: [],
    max_concurrent_bookings: 50,
    allowed_room_types: ['lecture_hall', 'classroom', 'lab', 'seminar_room', 'conference_room', 'auditorium'],
    priority_level: 100,
  },
  {
    role_name: 'staff',
    max_booking_duration_hours: 12,
    max_advance_booking_days: 180,
    min_notice_hours: 0,
    approval_chain: [],
    max_concurrent_bookings: 20,
    allowed_room_types: ['lecture_hall', 'classroom', 'lab', 'seminar_room', 'conference_room', 'auditorium'],
    priority_level: 80,
  },
  {
    role_name: 'faculty',
    max_booking_duration_hours: 8,
    max_advance_booking_days: 90,
    min_notice_hours: 2,
    approval_chain: ['staff'],
    max_concurrent_bookings: 10,
    allowed_room_types: ['lecture_hall', 'classroom', 'lab', 'seminar_room', 'conference_room'],
    priority_level: 60,
  },
  {
    role_name: 'student',
    max_booking_duration_hours: 4,
    max_advance_booking_days: 30,
    min_notice_hours: 24,
    approval_chain: ['faculty', 'staff'],
    max_concurrent_bookings: 3,
    allowed_room_types: ['classroom', 'seminar_room'],
    priority_level: 20,
  },
];

/**
 * Default admin user
 */
const defaultAdmin = {
  email: 'admin@iitj.ac.in',
  password: 'Admin@123!', // Should be changed after first login
  first_name: 'System',
  last_name: 'Administrator',
  employee_id: 'ADMIN001',
};

/**
 * Default building (LHC - Lecture Hall Complex)
 */
const defaultBuilding = {
  name: 'Lecture Hall Complex',
  code: 'LHC',
  address: 'IIT Jodhpur Campus',
  floors: 3,
};

/**
 * Default slots (academic time slots)
 */
const defaultSlots = [
  { name: 'Slot A', start_time: '08:00', end_time: '09:00', slot_type: 'regular' },
  { name: 'Slot B', start_time: '09:00', end_time: '10:00', slot_type: 'regular' },
  { name: 'Slot C', start_time: '10:00', end_time: '11:00', slot_type: 'regular' },
  { name: 'Slot D', start_time: '11:00', end_time: '12:00', slot_type: 'regular' },
  { name: 'Slot E', start_time: '12:00', end_time: '13:00', slot_type: 'regular' },
  { name: 'Slot F', start_time: '14:00', end_time: '15:00', slot_type: 'regular' },
  { name: 'Slot G', start_time: '15:00', end_time: '16:00', slot_type: 'regular' },
  { name: 'Slot H', start_time: '16:00', end_time: '17:00', slot_type: 'regular' },
  { name: 'Slot I', start_time: '17:00', end_time: '18:00', slot_type: 'regular' },
];

const seedDatabase = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insert roles with permissions
    logger.info('Seeding roles...');
    const roleIds = {};
    
    for (const role of roles) {
      const result = await client.query(
        `INSERT INTO roles (name, description, permissions)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           permissions = EXCLUDED.permissions,
           updated_at = NOW()
         RETURNING id`,
        [role.name, role.description, JSON.stringify(role.permissions)]
      );
      roleIds[role.name] = result.rows[0].id;
    }
    logger.info('Roles seeded successfully');
    
    // Insert default admin user
    logger.info('Seeding admin user...');
    const passwordHash = await bcrypt.hash(
      defaultAdmin.password,
      config.security.bcryptSaltRounds
    );
    
    await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, employee_id, is_email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (email) DO NOTHING`,
      [
        defaultAdmin.email,
        passwordHash,
        defaultAdmin.first_name,
        defaultAdmin.last_name,
        roleIds.admin,
        defaultAdmin.employee_id,
      ]
    );
    logger.info('Admin user seeded successfully');
    
    // Insert default building
    logger.info('Seeding default building...');
    await client.query(
      `INSERT INTO buildings (name, code, address, floors)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [
        defaultBuilding.name,
        defaultBuilding.code,
        defaultBuilding.address,
        defaultBuilding.floors,
      ]
    );
    logger.info('Building seeded successfully');
    
    // Insert default slots
    logger.info('Seeding time slots...');
    for (const slot of defaultSlots) {
      await client.query(
        `INSERT INTO slots (name, start_time, end_time, slot_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [slot.name, slot.start_time, slot.end_time, slot.slot_type]
      );
    }
    logger.info('Time slots seeded successfully');
    
    // Insert allocation policies
    logger.info('Seeding allocation policies...');
    for (const policy of allocationPolicies) {
      await client.query(
        `INSERT INTO allocation_policies (
          role_name, max_booking_duration_hours, max_advance_booking_days,
          min_notice_hours, approval_chain, max_concurrent_bookings,
          allowed_room_types, priority_level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (role_name) DO UPDATE SET
           max_booking_duration_hours = EXCLUDED.max_booking_duration_hours,
           max_advance_booking_days = EXCLUDED.max_advance_booking_days,
           min_notice_hours = EXCLUDED.min_notice_hours,
           approval_chain = EXCLUDED.approval_chain,
           max_concurrent_bookings = EXCLUDED.max_concurrent_bookings,
           allowed_room_types = EXCLUDED.allowed_room_types,
           priority_level = EXCLUDED.priority_level,
           updated_at = NOW()`,
        [
          policy.role_name,
          policy.max_booking_duration_hours,
          policy.max_advance_booking_days,
          policy.min_notice_hours,
          JSON.stringify(policy.approval_chain),
          policy.max_concurrent_bookings,
          JSON.stringify(policy.allowed_room_types),
          policy.priority_level,
        ]
      );
    }
    logger.info('Allocation policies seeded successfully');
    
    await client.query('COMMIT');
    logger.info('Database seeding completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Database seeding failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

// Run seeding if executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seeding completed successfully');
      console.log('Default admin credentials:');
      console.log(`  Email: ${defaultAdmin.email}`);
      console.log(`  Password: ${defaultAdmin.password}`);
      console.log('Please change the password after first login!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase, roles };
