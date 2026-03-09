/**
 * Validation Service (Conflict Detection Engine)
 * Detects scheduling conflicts and validates constraints
 * 
 * Hard Constraints:
 * - No two bookings for same room at same time
 * - Room capacity must be >= required capacity
 */
const db = require('../config/database');
const logger = require('../utils/logger');

class ValidationService {
    /**
     * Check if a room has a scheduling conflict for a given time
     * @param {string} roomId - Room UUID
     * @param {string} day - Day of week (Mon, Tue, etc.)
     * @param {string} startTime - Start time (HH:MM)
     * @param {string} endTime - End time (HH:MM)
     * @param {string|null} excludeBookingId - Booking to exclude from check
     * @param {string|null} date - Specific date to check (YYYY-MM-DD)
     * @returns {Promise<Object>} { available: boolean, conflicts: Array }
     */
    async checkRoomConflict(roomId, day, startTime, endTime, excludeBookingId = null, date = null) {
        const params = [roomId, startTime, endTime];
        let dateCondition = '';
        let excludeCondition = '';

        if (date) {
            params.push(date);
            dateCondition = `AND b.date = $${params.length}`;
        } else {
            params.push(day);
            dateCondition = `AND b.day = $${params.length}`;
        }

        if (excludeBookingId) {
            params.push(excludeBookingId);
            excludeCondition = `AND b.id != $${params.length}`;
        }

        const result = await db.query(
            `SELECT b.id, b.date, b.day, b.start_time, b.end_time,
              c.course_code, c.name as course_name
       FROM bookings b
       LEFT JOIN courses c ON b.course_id = c.id
       WHERE b.room_id = $1
         AND b.is_active = true
         AND b.start_time < $3
         AND b.end_time > $2
         ${dateCondition}
         ${excludeCondition}`,
            params
        );

        // Also check booking_requests for conflicts
        const brParams = [roomId, startTime, endTime];
        let brDateCondition = '';

        if (date) {
            brParams.push(date);
            brDateCondition = `AND br.booking_date = $${brParams.length}`;
        }

        const brResult = await db.query(
            `SELECT br.id, br.booking_date, br.start_time, br.end_time, br.event_title
       FROM booking_requests br
       WHERE br.room_id = $1
         AND br.status IN ('approved', 'pending_staff')
         AND br.start_time < $3
         AND br.end_time > $2
         ${brDateCondition}`,
            brParams
        );

        const conflicts = [
            ...result.rows.map(r => ({ type: 'booking', ...r })),
            ...brResult.rows.map(r => ({ type: 'booking_request', ...r })),
        ];

        return {
            available: conflicts.length === 0,
            conflicts,
        };
    }

    /**
     * Check if a room has sufficient capacity
     * @param {string} roomId - Room UUID
     * @param {number} requiredCapacity - Number of students
     * @returns {Promise<Object>} { sufficient: boolean, roomCapacity: number }
     */
    async checkCapacity(roomId, requiredCapacity) {
        const result = await db.query(
            `SELECT capacity FROM rooms WHERE id = $1 AND is_active = true`,
            [roomId]
        );

        if (result.rows.length === 0) {
            return { sufficient: false, roomCapacity: 0, error: 'Room not found' };
        }

        const roomCapacity = result.rows[0].capacity;
        return {
            sufficient: roomCapacity >= requiredCapacity,
            roomCapacity,
            requiredCapacity,
        };
    }

    /**
     * Full validation for a proposed booking
     * @param {Object} bookingData - { roomId, day, startTime, endTime, requiredCapacity, date, excludeBookingId }
     * @returns {Promise<Object>} { valid: boolean, errors: Array }
     */
    async validateBooking(bookingData) {
        const { roomId, day, startTime, endTime, requiredCapacity, date, excludeBookingId } = bookingData;
        const errors = [];

        // Check room conflict
        const conflictResult = await this.checkRoomConflict(roomId, day, startTime, endTime, excludeBookingId, date);
        if (!conflictResult.available) {
            errors.push({
                type: 'ROOM_CONFLICT',
                message: 'Room is already booked during this time',
                conflicts: conflictResult.conflicts,
            });
        }

        // Check capacity if required
        if (requiredCapacity && requiredCapacity > 0) {
            const capacityResult = await this.checkCapacity(roomId, requiredCapacity);
            if (!capacityResult.sufficient) {
                errors.push({
                    type: 'INSUFFICIENT_CAPACITY',
                    message: `Room capacity (${capacityResult.roomCapacity}) is less than required (${requiredCapacity})`,
                    roomCapacity: capacityResult.roomCapacity,
                    requiredCapacity,
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}

module.exports = new ValidationService();
