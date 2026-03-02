/**
 * Room Service
 * Handles room management and availability queries
 * Implements REQ-4.1.1: Real-time room availability
 * Implements REQ-4.1.2: Prevent double booking
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

class RoomService {
  /**
   * Create a new room
   * @param {Object} data - Room data
   * @param {string} userId - Creating user ID (for audit)
   * @returns {Promise<Object>} Created room
   */
  async create(data, userId) {
    const {
      roomNumber,
      name,
      buildingId,
      departmentId,
      floor,
      capacity,
      roomType,
      hasProjector,
      hasWhiteboard,
      hasAc,
      hasMic,
      hasVideoConferencing,
      isAccessible,
      description,
    } = data;

    const result = await db.query(
      `INSERT INTO rooms (
        room_number, name, building_id, department_id, floor, capacity,
        room_type, has_projector, has_whiteboard, has_ac, has_mic,
        has_video_conferencing, is_accessible, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        roomNumber,
        name,
        buildingId,
        departmentId,
        floor || 0,
        capacity,
        roomType || 'classroom',
        hasProjector || false,
        hasWhiteboard || true,
        hasAc || false,
        hasMic || false,
        hasVideoConferencing || false,
        isAccessible || false,
        description,
      ]
    );

    const room = result.rows[0];

    await this.logAudit(userId, 'CREATE', room.id, null, room);
    logger.info('Room created', { roomId: room.id, roomNumber });

    return room;
  }

  /**
   * Get all rooms with filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Rooms list with pagination
   */
  async findAll(options = {}) {
    const {
      page = 1,
      limit = 20,
      search = '',
      buildingId,
      departmentId,
      roomType,
      minCapacity,
      maxCapacity,
      hasProjector,
      hasMic,
      isAccessible,
      isActive = true,
    } = options;

    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    // Build dynamic WHERE clause
    conditions.push(`r.is_active = $${params.length + 1}`);
    params.push(isActive);

    if (search) {
      conditions.push(`(r.room_number ILIKE $${params.length + 1} OR r.name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (buildingId) {
      conditions.push(`r.building_id = $${params.length + 1}`);
      params.push(buildingId);
    }

    if (departmentId) {
      conditions.push(`r.department_id = $${params.length + 1}`);
      params.push(departmentId);
    }

    if (roomType) {
      conditions.push(`r.room_type = $${params.length + 1}`);
      params.push(roomType);
    }

    if (minCapacity) {
      conditions.push(`r.capacity >= $${params.length + 1}`);
      params.push(minCapacity);
    }

    if (maxCapacity) {
      conditions.push(`r.capacity <= $${params.length + 1}`);
      params.push(maxCapacity);
    }

    if (hasProjector !== undefined) {
      conditions.push(`r.has_projector = $${params.length + 1}`);
      params.push(hasProjector);
    }

    if (hasMic !== undefined) {
      conditions.push(`r.has_mic = $${params.length + 1}`);
      params.push(hasMic);
    }

    if (isAccessible !== undefined) {
      conditions.push(`r.is_accessible = $${params.length + 1}`);
      params.push(isAccessible);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM rooms r ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get rooms with building and department info
    const result = await db.query(
      `SELECT r.*,
              b.name as building_name,
              b.code as building_code,
              d.name as department_name,
              d.code as department_code
       FROM rooms r
       JOIN buildings b ON r.building_id = b.id
       LEFT JOIN departments d ON r.department_id = d.id
       ${whereClause}
       ORDER BY b.name, r.floor, r.room_number
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
   * Get room by ID
   * @param {string} id - Room ID
   * @returns {Promise<Object>} Room data
   */
  async findById(id) {
    const result = await db.query(
      `SELECT r.*,
              b.name as building_name,
              b.code as building_code,
              b.address as building_address,
              d.name as department_name,
              d.code as department_code
       FROM rooms r
       JOIN buildings b ON r.building_id = b.id
       LEFT JOIN departments d ON r.department_id = d.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Room not found');
    }

    return result.rows[0];
  }

  /**
   * Update room
   * @param {string} id - Room ID
   * @param {Object} data - Update data
   * @param {string} userId - Updating user ID
   * @returns {Promise<Object>} Updated room
   */
  async update(id, data, userId) {
    const current = await this.findById(id);

    const {
      roomNumber,
      name,
      buildingId,
      departmentId,
      floor,
      capacity,
      roomType,
      hasProjector,
      hasWhiteboard,
      hasAc,
      hasMic,
      hasVideoConferencing,
      isAccessible,
      isActive,
      description,
    } = data;

    const result = await db.query(
      `UPDATE rooms SET
        room_number = COALESCE($1, room_number),
        name = COALESCE($2, name),
        building_id = COALESCE($3, building_id),
        department_id = COALESCE($4, department_id),
        floor = COALESCE($5, floor),
        capacity = COALESCE($6, capacity),
        room_type = COALESCE($7, room_type),
        has_projector = COALESCE($8, has_projector),
        has_whiteboard = COALESCE($9, has_whiteboard),
        has_ac = COALESCE($10, has_ac),
        has_mic = COALESCE($11, has_mic),
        has_video_conferencing = COALESCE($12, has_video_conferencing),
        is_accessible = COALESCE($13, is_accessible),
        is_active = COALESCE($14, is_active),
        description = COALESCE($15, description),
        updated_at = NOW()
       WHERE id = $16
       RETURNING *`,
      [
        roomNumber,
        name,
        buildingId,
        departmentId,
        floor,
        capacity,
        roomType,
        hasProjector,
        hasWhiteboard,
        hasAc,
        hasMic,
        hasVideoConferencing,
        isAccessible,
        isActive,
        description,
        id,
      ]
    );

    const room = result.rows[0];
    await this.logAudit(userId, 'UPDATE', id, current, room);
    logger.info('Room updated', { roomId: id });

    return room;
  }

  /**
   * Delete room (soft delete)
   * @param {string} id - Room ID
   * @param {string} userId - Deleting user ID
   */
  async delete(id, userId) {
    const current = await this.findById(id);

    // Check for active allocations
    const allocationCheck = await db.query(
      `SELECT COUNT(*) FROM room_allocations 
       WHERE room_id = $1 AND is_active = true`,
      [id]
    );

    if (parseInt(allocationCheck.rows[0].count) > 0) {
      throw ApiError.conflict(
        'Cannot delete room with active allocations. Please remove allocations first.'
      );
    }

    // Check for pending bookings
    const bookingCheck = await db.query(
      `SELECT COUNT(*) FROM booking_requests 
       WHERE room_id = $1 AND booking_date >= CURRENT_DATE 
       AND status NOT IN ('rejected', 'cancelled')`,
      [id]
    );

    if (parseInt(bookingCheck.rows[0].count) > 0) {
      throw ApiError.conflict(
        'Cannot delete room with pending or future bookings.'
      );
    }

    await db.query(
      `UPDATE rooms SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await this.logAudit(userId, 'DELETE', id, current, { ...current, is_active: false });
    logger.info('Room deleted', { roomId: id });
  }

  /**
   * Check room availability for a specific date and time
   * REQ-4.1.1: Real-time room availability
   * @param {string} roomId - Room ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @returns {Promise<Object>} Availability status
   */
  async checkAvailability(roomId, date, startTime, endTime) {
    // Check for approved bookings that conflict
    const bookingConflict = await db.query(
      `SELECT id, event_title, start_time, end_time, status
       FROM booking_requests
       WHERE room_id = $1
         AND booking_date = $2
         AND status IN ('approved', 'pending_staff', 'pending_faculty')
         AND (
           (start_time < $4 AND end_time > $3)
         )`,
      [roomId, date, startTime, endTime]
    );

    // Check for permanent allocations that conflict
    const allocationConflict = await db.query(
      `SELECT ra.id, c.name as course_name, s.start_time, s.end_time, s.day_of_week
       FROM room_allocations ra
       JOIN slots s ON ra.slot_id = s.id
       LEFT JOIN courses c ON ra.course_id = c.id
       WHERE ra.room_id = $1
         AND ra.is_active = true
         AND ra.effective_from <= $2
         AND (ra.effective_until IS NULL OR ra.effective_until >= $2)
         AND s.day_of_week = EXTRACT(DOW FROM $2::date)
         AND (
           (s.start_time < $4 AND s.end_time > $3)
         )`,
      [roomId, date, startTime, endTime]
    );

    const isAvailable = bookingConflict.rows.length === 0 && allocationConflict.rows.length === 0;

    return {
      isAvailable,
      conflicts: {
        bookings: bookingConflict.rows,
        allocations: allocationConflict.rows,
      },
    };
  }

  /**
   * Get room availability for a date (all slots)
   * @param {string} roomId - Room ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @returns {Promise<Object>} Availability grid
   */
  async getDayAvailability(roomId, date) {
    // Get all slots
    const slotsResult = await db.query(
      `SELECT * FROM slots WHERE is_active = true ORDER BY start_time`
    );
    const slots = slotsResult.rows;

    // Get bookings for the date
    const bookings = await db.query(
      `SELECT start_time, end_time, event_title, event_type, status
       FROM booking_requests
       WHERE room_id = $1
         AND booking_date = $2
         AND status IN ('approved', 'pending_staff', 'pending_faculty')
       ORDER BY start_time`,
      [roomId, date]
    );

    // Get allocations for the day of week
    const allocations = await db.query(
      `SELECT s.start_time, s.end_time, s.name as slot_name, c.name as course_name
       FROM room_allocations ra
       JOIN slots s ON ra.slot_id = s.id
       LEFT JOIN courses c ON ra.course_id = c.id
       WHERE ra.room_id = $1
         AND ra.is_active = true
         AND ra.effective_from <= $2
         AND (ra.effective_until IS NULL OR ra.effective_until >= $2)
         AND s.day_of_week = EXTRACT(DOW FROM $2::date)
       ORDER BY s.start_time`,
      [roomId, date]
    );

    return {
      date,
      slots,
      bookings: bookings.rows,
      allocations: allocations.rows,
    };
  }

  /**
   * Find available rooms for given criteria
   * REQ-4.1.9: Suggest alternative rooms
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array>} Available rooms
   */
  async findAvailableRooms(criteria) {
    const {
      date,
      startTime,
      endTime,
      minCapacity,
      roomType,
      hasProjector,
      hasMic,
      buildingId,
      excludeRoomId,
      limit = 10,
    } = criteria;

    const params = [];
    const conditions = [`r.is_active = true`];

    if (minCapacity) {
      conditions.push(`r.capacity >= $${params.length + 1}`);
      params.push(minCapacity);
    }

    if (roomType) {
      conditions.push(`r.room_type = $${params.length + 1}`);
      params.push(roomType);
    }

    if (hasProjector) {
      conditions.push(`r.has_projector = true`);
    }

    if (hasMic) {
      conditions.push(`r.has_mic = true`);
    }

    if (buildingId) {
      conditions.push(`r.building_id = $${params.length + 1}`);
      params.push(buildingId);
    }

    if (excludeRoomId) {
      conditions.push(`r.id != $${params.length + 1}`);
      params.push(excludeRoomId);
    }

    // Get candidate rooms
    const candidateRooms = await db.query(
      `SELECT r.id, r.room_number, r.name, r.capacity, r.room_type,
              r.has_projector, r.has_mic, r.has_ac,
              b.name as building_name, b.code as building_code
       FROM rooms r
       JOIN buildings b ON r.building_id = b.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.capacity ASC
       LIMIT $${params.length + 1}`,
      [...params, limit * 3] // Get extra candidates for filtering
    );

    // Check availability for each candidate
    const availableRooms = [];
    for (const room of candidateRooms.rows) {
      const availability = await this.checkAvailability(room.id, date, startTime, endTime);
      if (availability.isAvailable) {
        availableRooms.push(room);
        if (availableRooms.length >= limit) break;
      }
    }

    return availableRooms;
  }

  /**
   * Log audit entry
   */
  async logAudit(userId, action, entityId, oldValues, newValues) {
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, 'rooms', $3, $4, $5)`,
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

module.exports = new RoomService();
