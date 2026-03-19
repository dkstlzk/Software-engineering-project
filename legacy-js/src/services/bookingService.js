/**
 * Booking Service
 * Core booking request CRUD and status tracking
 * 
 * Handles:
 *   - Booking creation with role-based initial status routing
 *   - Validation: room, date, time, conflicts, duplicates
 *   - Query: by ID, by user, pending for faculty/staff
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const stateMachineService = require('./stateMachineService');
const validationService = require('./validationService');
const suggestionService = require('./suggestionService');
const notificationService = require('./notificationService');

class BookingService {
    /**
     * Create a new booking request
     * @param {Object} data - Booking data
     * @param {Object} requester - { userId, role }
     * @returns {Promise<Object>} Created booking request
     */
    async create(data, requester) {
        const {
            roomId,
            bookingDate,
            startTime,
            endTime,
            eventType,
            eventTitle,
            eventDescription,
            expectedAttendees,
            requiresProjector,
            requiresMic,
            specialRequirements,
            facultyVerifierId,
        } = data;

        // 1. Validate room exists
        const roomResult = await db.query(
            `SELECT id, capacity FROM rooms WHERE id = $1 AND is_active = true`,
            [roomId]
        );
        if (roomResult.rows.length === 0) {
            throw ApiError.badRequest('Room not found or inactive');
        }

        // 3. Validate date is not in the past
        const requestDate = new Date(bookingDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (requestDate < today) {
            throw ApiError.badRequest('Cannot create booking for a past date');
        }

        // 4. Validate capacity
        if (expectedAttendees && expectedAttendees > roomResult.rows[0].capacity) {
            throw ApiError.badRequest(
                `Room capacity (${roomResult.rows[0].capacity}) is less than expected attendees (${expectedAttendees})`
            );
        }

        // 5. Student must specify faculty verifier
        if (requester.role === 'student' && !facultyVerifierId) {
            throw ApiError.badRequest('Student requests require a faculty verifier');
        }

        // 6. Validate faculty verifier exists and is faculty
        if (facultyVerifierId) {
            const facultyResult = await db.query(
                `SELECT u.id FROM users u
                 JOIN roles r ON u.role_id = r.id
                 WHERE u.id = $1 AND r.name = 'faculty' AND u.is_active = true`,
                [facultyVerifierId]
            );
            if (facultyResult.rows.length === 0) {
                throw ApiError.badRequest('Faculty verifier not found or is not a faculty member');
            }
        }

        // 7. Check for scheduling conflicts
        const dayOfWeek = new Date(bookingDate).getDay();
        const dayMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
        const day = dayMap[dayOfWeek];

        const conflictResult = await validationService.checkRoomConflict(
            roomId, day, startTime, endTime, null, bookingDate
        );

        if (!conflictResult.available) {
            // Get suggestions for alternative rooms
            const suggestions = await suggestionService.getSuggestions({
                roomId, date: bookingDate, startTime, endTime,
                expectedAttendees, requiresProjector, requiresMic,
            });

            throw ApiError.conflict(
                'Room is not available at the requested time',
                {
                    conflicts: conflictResult.conflicts,
                    suggestions,
                }
            );
        }

        // 8. Check for duplicate requests
        const duplicateResult = await db.query(
            `SELECT id FROM booking_requests
             WHERE requester_id = $1 AND room_id = $2 AND booking_date = $3
               AND start_time = $4 AND end_time = $5
               AND status NOT IN ('rejected', 'cancelled')`,
            [requester.userId, roomId, bookingDate, startTime, endTime]
        );
        if (duplicateResult.rows.length > 0) {
            throw ApiError.conflict('A duplicate booking request already exists');
        }

        // 8. Determine initial status based on role
        const initialStatus = stateMachineService.getInitialStatus(requester.role);

        // 9. Create the booking request
        const result = await db.query(
            `INSERT INTO booking_requests (
                requester_id, room_id, booking_date,
                start_time, end_time, event_type, event_title,
                event_description, expected_attendees,
                requires_projector, requires_mic, special_requirements,
                status, faculty_verifier_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                requester.userId, roomId, bookingDate,
                startTime, endTime, eventType || 'other', eventTitle,
                eventDescription || null, expectedAttendees || null,
                requiresProjector || false, requiresMic || false,
                specialRequirements || null, initialStatus,
                requester.role === 'student' ? facultyVerifierId : null,
            ]
        );

        const booking = result.rows[0];

        // 12. Trigger notifications
        await notificationService.notifyBookingCreated(booking);

        // 13: Audit log
        try {
            await db.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
                 VALUES ($1, 'CREATE', 'booking_request', $2, $3)`,
                [requester.userId, booking.id, JSON.stringify(booking)]
            );
        } catch (error) {
            logger.error('Failed to log audit', { error: error.message });
        }

        logger.info('Booking request created', {
            bookingId: booking.id,
            requester: requester.userId,
            status: initialStatus,
        });

        return booking;
    }

    /**
     * Get a booking request by ID with related info
     * @param {string} id - Booking request UUID
     * @returns {Promise<Object>} Booking request with joined data
     */
    async findById(id) {
        const result = await db.query(
            `SELECT br.*,
                    u.first_name || ' ' || u.last_name as requester_name,
                    u.email as requester_email,
                    r_role.name as requester_role,
                    rm.room_number, rm.name as room_name, rm.capacity as room_capacity,
                    bld.name as building_name,
                    fv.first_name || ' ' || fv.last_name as faculty_verifier_name,
                    sr.first_name || ' ' || sr.last_name as staff_reviewer_name
             FROM booking_requests br
             JOIN users u ON br.requester_id = u.id
             JOIN roles r_role ON u.role_id = r_role.id
             JOIN rooms rm ON br.room_id = rm.id
             JOIN buildings bld ON rm.building_id = bld.id
             LEFT JOIN users fv ON br.faculty_verifier_id = fv.id
             LEFT JOIN users sr ON br.staff_reviewer_id = sr.id
             WHERE br.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            throw ApiError.notFound('Booking request not found');
        }

        return result.rows[0];
    }

    /**
     * Get booking requests for a user
     * @param {string} userId - User UUID
     * @param {Object} options - { status, page, limit }
     * @returns {Promise<Object>} { data, pagination }
     */
    async findByUser(userId, options = {}) {
        const { status, page = 1, limit = 20 } = options;
        const offset = (page - 1) * limit;
        const params = [userId];
        let statusFilter = '';

        if (status) {
            params.push(status);
            statusFilter = `AND br.status = $${params.length}`;
        }

        const countResult = await db.query(
            `SELECT COUNT(*) FROM booking_requests br
             WHERE br.requester_id = $1 ${statusFilter}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT br.*,
                    rm.room_number, rm.name as room_name,
                    bld.name as building_name
             FROM booking_requests br
             JOIN rooms rm ON br.room_id = rm.id
             JOIN buildings bld ON rm.building_id = bld.id
             WHERE br.requester_id = $1 ${statusFilter}
             ORDER BY br.created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        return {
            data: result.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    /**
     * Get pending student requests for a faculty member
     * @param {string} facultyId - Faculty user UUID
     * @returns {Promise<Array>} Pending booking requests
     */
    async findPendingForFaculty(facultyId) {
        const result = await db.query(
            `SELECT br.*,
                    u.first_name || ' ' || u.last_name as requester_name,
                    u.email as requester_email,
                    rm.room_number, rm.name as room_name, rm.capacity as room_capacity,
                    bld.name as building_name
             FROM booking_requests br
             JOIN users u ON br.requester_id = u.id
             JOIN rooms rm ON br.room_id = rm.id
             JOIN buildings bld ON rm.building_id = bld.id
             WHERE br.faculty_verifier_id = $1
               AND br.status = 'pending_faculty'
             ORDER BY br.created_at ASC`,
            [facultyId]
        );

        return result.rows;
    }

    /**
     * Get requests pending staff/admin approval
     * @returns {Promise<Array>} Pending booking requests
     */
    async findPendingForStaff() {
        const result = await db.query(
            `SELECT br.*,
                    u.first_name || ' ' || u.last_name as requester_name,
                    u.email as requester_email,
                    r_role.name as requester_role,
                    rm.room_number, rm.name as room_name, rm.capacity as room_capacity,
                    bld.name as building_name,
                    fv.first_name || ' ' || fv.last_name as faculty_verifier_name
             FROM booking_requests br
             JOIN users u ON br.requester_id = u.id
             JOIN roles r_role ON u.role_id = r_role.id
             JOIN rooms rm ON br.room_id = rm.id
             JOIN buildings bld ON rm.building_id = bld.id
             LEFT JOIN users fv ON br.faculty_verifier_id = fv.id
             WHERE br.status = 'pending_staff'
             ORDER BY br.created_at ASC`
        );

        return result.rows;
    }
}

module.exports = new BookingService();
