/**
 * Suggestion Service
 * Provides intelligent alternatives when booking conflicts are detected
 * 
 * Returns:
 *   - Alternative rooms (same time period, matching requirements)
 */
const db = require('../config/database');
const logger = require('../utils/logger');

class SuggestionService {
    /**
     * Get alternative suggestions when a booking conflict is detected
     * @param {Object} bookingData - { roomId, date, startTime, endTime, expectedAttendees, requiresProjector, requiresMic }
     * @returns {Promise<Object>} { alternativeRooms }
     */
    async getSuggestions(bookingData) {
        const alternativeRooms = await this.findAlternativeRooms(bookingData);

        return {
            alternativeRooms,
        };
    }

    /**
     * Find alternative rooms that are available for the same time slot
     * @param {Object} data - Booking data
     * @returns {Promise<Array>} List of available rooms
     */
    async findAlternativeRooms(data) {
        const { roomId, date, startTime, endTime, expectedAttendees, requiresProjector, requiresMic } = data;

        try {
            // Build conditions for suitable rooms
            const params = [date, startTime, endTime, roomId];
            const conditions = ['r.is_active = true', `r.id != $4`];

            if (expectedAttendees && expectedAttendees > 0) {
                params.push(expectedAttendees);
                conditions.push(`r.capacity >= $${params.length}`);
            }

            if (requiresProjector) {
                conditions.push('r.has_projector = true');
            }

            if (requiresMic) {
                conditions.push('r.has_mic = true');
            }

            // Get candidate rooms that aren't already booked
            const result = await db.query(
                `SELECT r.id, r.room_number, r.name, r.capacity, r.room_type,
                        r.has_projector, r.has_mic, r.has_ac,
                        b.name as building_name, b.code as building_code
                 FROM rooms r
                 JOIN buildings b ON r.building_id = b.id
                 WHERE ${conditions.join(' AND ')}
                   AND r.id NOT IN (
                     SELECT DISTINCT bk.room_id FROM bookings bk
                     WHERE bk.date = $1 AND bk.is_active = true
                       AND bk.start_time < $3 AND bk.end_time > $2
                   )
                   AND r.id NOT IN (
                     SELECT DISTINCT br.room_id FROM booking_requests br
                     WHERE br.booking_date = $1
                       AND br.status IN ('approved', 'pending_staff', 'pending_faculty')
                       AND br.start_time < $3 AND br.end_time > $2
                   )
                 ORDER BY r.capacity ASC
                 LIMIT 5`,
                params
            );

            return result.rows;
        } catch (error) {
            logger.error('Error finding alternative rooms', { error: error.message });
            return [];
        }
    }

}

module.exports = new SuggestionService();
