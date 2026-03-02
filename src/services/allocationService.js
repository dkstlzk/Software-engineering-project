/**
 * Allocation Service
 * Handles room allocations and booking policies
 * Implements REQ-4.1.x and REQ-4.2.x requirements
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

/**
 * Allocation Policies Cache
 * Loaded from the allocation_policies DB table.
 * Fallback defaults used only if the DB is unreachable.
 */
const DEFAULT_POLICIES = {
  admin:   { max_booking_duration_hours: 24, max_advance_booking_days: 365, min_notice_hours: 0, approval_chain: [],                   max_concurrent_bookings: 50, allowed_room_types: ['lecture_hall','lab','seminar','conference','office'], priority_level: 100 },
  staff:   { max_booking_duration_hours: 12, max_advance_booking_days: 180, min_notice_hours: 0, approval_chain: [],                   max_concurrent_bookings: 20, allowed_room_types: ['lecture_hall','lab','seminar','conference'],         priority_level: 80 },
  faculty: { max_booking_duration_hours: 8,  max_advance_booking_days: 90,  min_notice_hours: 2, approval_chain: ['staff'],             max_concurrent_bookings: 10, allowed_room_types: ['lecture_hall','lab','seminar'],                    priority_level: 60 },
  student: { max_booking_duration_hours: 4,  max_advance_booking_days: 30,  min_notice_hours: 24,approval_chain: ['faculty','staff'],  max_concurrent_bookings: 3,  allowed_room_types: ['lecture_hall','lab','seminar'],                    priority_level: 20 },
};

class AllocationService {
  /**
   * Create a permanent room allocation (timetable-based)
   * @param {Object} data - Allocation data
   * @param {string} userId - Creating user ID
   * @returns {Promise<Object>} Created allocation
   */
  async createAllocation(data, userId) {
    const {
      roomId,
      slotId,
      courseId,
      instructorId,
      academicYearId,
      effectiveFrom,
      effectiveUntil,
    } = data;

    // Check for conflicts
    const conflicts = await this.checkAllocationConflicts(
      roomId,
      slotId,
      effectiveFrom,
      effectiveUntil
    );

    if (conflicts.length > 0) {
      throw ApiError.conflict('Allocation conflicts with existing allocations', {
        conflicts: conflicts.map(c => ({
          id: c.id,
          course: c.course_name,
          slot: c.slot_name,
        })),
      });
    }

    const result = await db.query(
      `INSERT INTO room_allocations (
        room_id, slot_id, course_id, instructor_id, academic_year_id,
        effective_from, effective_until, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        roomId,
        slotId,
        courseId,
        instructorId,
        academicYearId,
        effectiveFrom,
        effectiveUntil,
        userId,
      ]
    );

    const allocation = result.rows[0];
    await this.logAudit(userId, 'CREATE_ALLOCATION', allocation.id, null, allocation);
    logger.info('Room allocation created', { allocationId: allocation.id });

    return allocation;
  }

  /**
   * Check for allocation conflicts
   * @param {string} roomId - Room ID
   * @param {string} slotId - Slot ID
   * @param {string} effectiveFrom - Start date
   * @param {string} effectiveUntil - End date (optional)
   * @param {string} excludeId - Allocation ID to exclude
   * @returns {Promise<Array>} Conflicting allocations
   */
  async checkAllocationConflicts(roomId, slotId, effectiveFrom, effectiveUntil, excludeId = null) {
    let query = `
      SELECT ra.*, c.name as course_name, s.name as slot_name
      FROM room_allocations ra
      LEFT JOIN courses c ON ra.course_id = c.id
      JOIN slots s ON ra.slot_id = s.id
      WHERE ra.room_id = $1
        AND ra.slot_id = $2
        AND ra.is_active = true
        AND ra.effective_from <= $3
        AND (ra.effective_until IS NULL OR ra.effective_until >= $4)
    `;
    const params = [roomId, slotId, effectiveUntil || '9999-12-31', effectiveFrom];

    if (excludeId) {
      query += ` AND ra.id != $5`;
      params.push(excludeId);
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get all allocations with filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Allocations list
   */
  async findAll(options = {}) {
    const {
      page = 1,
      limit = 20,
      roomId,
      courseId,
      instructorId,
      academicYearId,
      isActive = true,
    } = options;

    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    conditions.push(`ra.is_active = $${params.length + 1}`);
    params.push(isActive);

    if (roomId) {
      conditions.push(`ra.room_id = $${params.length + 1}`);
      params.push(roomId);
    }

    if (courseId) {
      conditions.push(`ra.course_id = $${params.length + 1}`);
      params.push(courseId);
    }

    if (instructorId) {
      conditions.push(`ra.instructor_id = $${params.length + 1}`);
      params.push(instructorId);
    }

    if (academicYearId) {
      conditions.push(`ra.academic_year_id = $${params.length + 1}`);
      params.push(academicYearId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await db.query(
      `SELECT COUNT(*) FROM room_allocations ra ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await db.query(
      `SELECT ra.*,
              r.room_number, r.name as room_name,
              b.name as building_name,
              s.name as slot_name, s.start_time, s.end_time, s.day_of_week,
              c.course_code, c.name as course_name,
              u.first_name as instructor_first_name, u.last_name as instructor_last_name
       FROM room_allocations ra
       JOIN rooms r ON ra.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN slots s ON ra.slot_id = s.id
       LEFT JOIN courses c ON ra.course_id = c.id
       LEFT JOIN users u ON ra.instructor_id = u.id
       ${whereClause}
       ORDER BY r.room_number, s.day_of_week, s.start_time
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get allocation by ID
   * @param {string} id - Allocation ID
   * @returns {Promise<Object>} Allocation data
   */
  async findById(id) {
    const result = await db.query(
      `SELECT ra.*,
              r.room_number, r.name as room_name, r.capacity,
              b.name as building_name, b.code as building_code,
              s.name as slot_name, s.start_time, s.end_time, s.day_of_week,
              c.course_code, c.name as course_name,
              u.first_name as instructor_first_name, u.last_name as instructor_last_name, u.email as instructor_email
       FROM room_allocations ra
       JOIN rooms r ON ra.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN slots s ON ra.slot_id = s.id
       LEFT JOIN courses c ON ra.course_id = c.id
       LEFT JOIN users u ON ra.instructor_id = u.id
       WHERE ra.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Allocation not found');
    }

    return result.rows[0];
  }

  /**
   * Update allocation
   * @param {string} id - Allocation ID
   * @param {Object} data - Update data
   * @param {string} userId - Updating user ID
   * @returns {Promise<Object>} Updated allocation
   */
  async update(id, data, userId) {
    const current = await this.findById(id);

    const {
      roomId,
      slotId,
      courseId,
      instructorId,
      academicYearId,
      effectiveFrom,
      effectiveUntil,
      isActive,
    } = data;

    // Check for conflicts if changing room, slot, or dates
    if (roomId || slotId || effectiveFrom || effectiveUntil) {
      const conflicts = await this.checkAllocationConflicts(
        roomId || current.room_id,
        slotId || current.slot_id,
        effectiveFrom || current.effective_from,
        effectiveUntil || current.effective_until,
        id
      );

      if (conflicts.length > 0) {
        throw ApiError.conflict('Update would create conflicts', {
          conflicts: conflicts.map(c => ({
            id: c.id,
            course: c.course_name,
            slot: c.slot_name,
          })),
        });
      }
    }

    const result = await db.query(
      `UPDATE room_allocations SET
        room_id = COALESCE($1, room_id),
        slot_id = COALESCE($2, slot_id),
        course_id = COALESCE($3, course_id),
        instructor_id = COALESCE($4, instructor_id),
        academic_year_id = COALESCE($5, academic_year_id),
        effective_from = COALESCE($6, effective_from),
        effective_until = COALESCE($7, effective_until),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        roomId,
        slotId,
        courseId,
        instructorId,
        academicYearId,
        effectiveFrom,
        effectiveUntil,
        isActive,
        id,
      ]
    );

    const allocation = result.rows[0];
    await this.logAudit(userId, 'UPDATE_ALLOCATION', id, current, allocation);
    logger.info('Allocation updated', { allocationId: id });

    return allocation;
  }

  /**
   * Delete allocation (soft delete)
   * @param {string} id - Allocation ID
   * @param {string} userId - Deleting user ID
   */
  async delete(id, userId) {
    const current = await this.findById(id);

    await db.query(
      `UPDATE room_allocations SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await this.logAudit(userId, 'DELETE_ALLOCATION', id, current, { ...current, is_active: false });
    logger.info('Allocation deleted', { allocationId: id });
  }

  /**
   * Load the allocation policy for a given role from the DB.
   * Falls back to DEFAULT_POLICIES if the table has no matching row.
   * @param {string} roleName
   * @returns {Promise<Object>}
   */
  async _loadPolicy(roleName) {
    try {
      const result = await db.query(
        `SELECT * FROM allocation_policies WHERE role_name = $1 AND is_active = true`,
        [roleName]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
    } catch (err) {
      logger.warn('Could not load allocation policy from DB, using defaults', { role: roleName, error: err.message });
    }
    return DEFAULT_POLICIES[roleName] || DEFAULT_POLICIES.student;
  }

  /**
   * Validate booking request against policies (reads from DB)
   * @param {Object} request - Booking request details
   * @param {string} userRole - User's role
   * @returns {Promise<Object>} Validation result
   */
  async validateBookingPolicy(request, userRole) {
    const errors = [];
    const warnings = [];

    const policy = await this._loadPolicy(userRole);

    // Check booking duration
    const startTime = new Date(`1970-01-01T${request.startTime}`);
    const endTime = new Date(`1970-01-01T${request.endTime}`);
    const durationHours = (endTime - startTime) / (1000 * 60 * 60);

    if (durationHours > policy.max_booking_duration_hours) {
      errors.push(`Maximum booking duration for ${userRole} is ${policy.max_booking_duration_hours} hours`);
    }

    // Check advance booking
    const bookingDate = new Date(request.bookingDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysAdvance = Math.ceil((bookingDate - today) / (1000 * 60 * 60 * 24));

    if (daysAdvance > policy.max_advance_booking_days) {
      errors.push(`${userRole} can only book up to ${policy.max_advance_booking_days} days in advance`);
    }

    // Check minimum notice
    const bookingDateTime = new Date(`${request.bookingDate}T${request.startTime}`);
    const hoursUntilBooking = (bookingDateTime - new Date()) / (1000 * 60 * 60);

    if (hoursUntilBooking < policy.min_notice_hours) {
      errors.push(`${userRole} must book at least ${policy.min_notice_hours} hours in advance`);
    }

    // Check if student needs faculty verification
    if (userRole === 'student' && !request.facultyVerifierId) {
      errors.push('Students must specify a faculty member for verification');
    }

    // Check allowed room types if request contains room type
    const allowedRoomTypes = policy.allowed_room_types || [];
    if (request.roomType && allowedRoomTypes.length > 0 && !allowedRoomTypes.includes(request.roomType)) {
      errors.push(`${userRole} is not allowed to book room type: ${request.roomType}`);
    }

    // Check concurrent bookings limit
    if (request.userId && policy.max_concurrent_bookings) {
      try {
        const concurrent = await db.query(
          `SELECT COUNT(*) FROM booking_requests
           WHERE requester_id = $1 AND status IN ('approved', 'pending_staff', 'pending_faculty') AND booking_date >= CURRENT_DATE`,
          [request.userId]
        );
        const count = parseInt(concurrent.rows[0].count);
        if (count >= policy.max_concurrent_bookings) {
          errors.push(`${userRole} has reached the maximum of ${policy.max_concurrent_bookings} concurrent bookings`);
        }
      } catch (_) {
        // non-critical – skip check
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      requiredApprovals: policy.approval_chain || [],
      priorityLevel: policy.priority_level || 0,
    };
  }

  /**
   * Get allocation policies for a role (from DB)
   * @param {string} role - User role
   * @returns {Promise<Object>} Applicable policies
   */
  async getPoliciesForRole(role) {
    const policy = await this._loadPolicy(role);
    return {
      maxBookingDuration: policy.max_booking_duration_hours,
      maxAdvanceBookingDays: policy.max_advance_booking_days,
      minNoticeHours: policy.min_notice_hours,
      approvalChain: policy.approval_chain || [],
      maxConcurrentBookings: policy.max_concurrent_bookings,
      allowedRoomTypes: policy.allowed_room_types || [],
      priorityLevel: policy.priority_level,
    };
  }

  /**
   * Get all allocation policies (admin view)
   * @returns {Promise<Array>}
   */
  async getAllPolicies() {
    const result = await db.query(
      `SELECT * FROM allocation_policies ORDER BY priority_level DESC`
    );
    return result.rows;
  }

  /**
   * Update an allocation policy
   * @param {string} roleName - Role name
   * @param {Object} data - Policy update data
   * @param {string} userId - Admin user ID
   * @returns {Promise<Object>}
   */
  async updatePolicy(roleName, data, userId) {
    const {
      maxBookingDurationHours,
      maxAdvanceBookingDays,
      minNoticeHours,
      approvalChain,
      maxConcurrentBookings,
      allowedRoomTypes,
      priorityLevel,
      isActive,
    } = data;

    const result = await db.query(
      `UPDATE allocation_policies SET
        max_booking_duration_hours = COALESCE($1, max_booking_duration_hours),
        max_advance_booking_days = COALESCE($2, max_advance_booking_days),
        min_notice_hours = COALESCE($3, min_notice_hours),
        approval_chain = COALESCE($4, approval_chain),
        max_concurrent_bookings = COALESCE($5, max_concurrent_bookings),
        allowed_room_types = COALESCE($6, allowed_room_types),
        priority_level = COALESCE($7, priority_level),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
       WHERE role_name = $9
       RETURNING *`,
      [
        maxBookingDurationHours,
        maxAdvanceBookingDays,
        minNoticeHours,
        approvalChain ? JSON.stringify(approvalChain) : null,
        maxConcurrentBookings,
        allowedRoomTypes ? JSON.stringify(allowedRoomTypes) : null,
        priorityLevel,
        isActive,
        roleName,
      ]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound(`Allocation policy for role '${roleName}' not found`);
    }

    await this.logAudit(userId, 'UPDATE_POLICY', result.rows[0].id, null, result.rows[0]);
    return result.rows[0];
  }

  /**
   * Get room schedule for a week
   * @param {string} roomId - Room ID
   * @param {string} weekStart - Start of week (YYYY-MM-DD)
   * @returns {Promise<Object>} Weekly schedule
   */
  async getRoomWeeklySchedule(roomId, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Get permanent allocations
    const allocations = await db.query(
      `SELECT ra.*, s.name as slot_name, s.start_time, s.end_time, s.day_of_week,
              c.course_code, c.name as course_name
       FROM room_allocations ra
       JOIN slots s ON ra.slot_id = s.id
       LEFT JOIN courses c ON ra.course_id = c.id
       WHERE ra.room_id = $1
         AND ra.is_active = true
         AND ra.effective_from <= $2
         AND (ra.effective_until IS NULL OR ra.effective_until >= $3)
       ORDER BY s.day_of_week, s.start_time`,
      [roomId, weekEnd.toISOString().split('T')[0], weekStart]
    );

    // Get ad-hoc bookings
    const bookings = await db.query(
      `SELECT br.*, 
              s.name as slot_name
       FROM booking_requests br
       LEFT JOIN slots s ON br.slot_id = s.id
       WHERE br.room_id = $1
         AND br.booking_date BETWEEN $2 AND $3
         AND br.status IN ('approved', 'pending_staff', 'pending_faculty')
       ORDER BY br.booking_date, br.start_time`,
      [roomId, weekStart, weekEnd.toISOString().split('T')[0]]
    );

    return {
      roomId,
      weekStart,
      weekEnd: weekEnd.toISOString().split('T')[0],
      allocations: allocations.rows,
      bookings: bookings.rows,
    };
  }

  /**
   * Log audit entry
   */
  async logAudit(userId, action, entityId, oldValues, newValues) {
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, 'room_allocations', $3, $4, $5)`,
        [
          userId,
          action,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
        ]
      );
    } catch (error) {
      logger.error('Failed to log audit', { error: error.message });
    }
  }
}

module.exports = new AllocationService();
