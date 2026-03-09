/**
 * Preallocation Service
 * Generates room bookings from timetable entries
 * Uses slot resolution to determine actual time blocks
 * Assigns rooms based on provided classroom or capacity matching
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const slotResolutionService = require('./slotResolutionService');
const validationService = require('./validationService');

class PreallocationService {
    /**
     * Run preallocation for a slot system within a date range
     * @param {string} slotSystemId - Slot system UUID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Preallocation result
     */
    async preallocate(slotSystemId, startDate, endDate) {
        // Verify slot system
        const ssCheck = await db.query(
            `SELECT id FROM slot_systems WHERE id = $1 AND is_active = true`,
            [slotSystemId]
        );
        if (ssCheck.rows.length === 0) {
            throw ApiError.notFound('Slot system not found');
        }

        // Get all timetable entries for this slot system
        const entriesResult = await db.query(
            `SELECT te.*, c.student_count as course_student_count
       FROM timetable_entries te
       LEFT JOIN courses c ON te.course_id = c.id
       WHERE te.slot_system_id = $1`,
            [slotSystemId]
        );

        const entries = entriesResult.rows;
        const bookingsCreated = [];
        const errors = [];
        const warnings = [];

        // Day name to day-of-week number (for date matching)
        const dayToNum = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };

        for (const entry of entries) {
            try {
                // Resolve slot to time blocks
                const timeBlocks = await slotResolutionService.resolveEntry(entry);

                if (timeBlocks.length === 0) {
                    warnings.push({
                        entryId: entry.id,
                        subjectCode: entry.subject_code,
                        warning: `No time blocks resolved for slot ${entry.slot_code}`,
                    });
                    continue;
                }

                const studentCount = entry.student_count || entry.course_student_count || 0;

                for (const block of timeBlocks) {
                    // Find all dates in range that match this day
                    const dates = this.getDatesForDay(startDate, endDate, dayToNum[block.day]);

                    for (const date of dates) {
                        try {
                            // Determine room
                            let roomId = null;

                            if (entry.classroom) {
                                // Try to find room by number
                                const roomResult = await db.query(
                                    `SELECT id FROM rooms WHERE room_number = $1 AND is_active = true LIMIT 1`,
                                    [entry.classroom]
                                );

                                if (roomResult.rows.length > 0) {
                                    roomId = roomResult.rows[0].id;
                                } else {
                                    warnings.push({
                                        entryId: entry.id,
                                        subjectCode: entry.subject_code,
                                        date,
                                        warning: `Classroom ${entry.classroom} not found in room database`,
                                    });
                                }
                            }

                            if (!roomId && studentCount > 0) {
                                // Find available room with sufficient capacity
                                roomId = await this.findAvailableRoom(
                                    date,
                                    block.startTime,
                                    block.endTime,
                                    studentCount
                                );

                                if (!roomId) {
                                    warnings.push({
                                        entryId: entry.id,
                                        subjectCode: entry.subject_code,
                                        date,
                                        warning: `No available room found for ${studentCount} students`,
                                    });
                                    continue;
                                }
                            }

                            if (!roomId) {
                                warnings.push({
                                    entryId: entry.id,
                                    subjectCode: entry.subject_code,
                                    date,
                                    warning: 'No room could be assigned (no classroom specified and no student count)',
                                });
                                continue;
                            }

                            // Check for conflicts before creating booking
                            const conflict = await validationService.checkRoomConflict(
                                roomId, block.day, block.startTime, block.endTime, null, date
                            );

                            if (!conflict.available) {
                                warnings.push({
                                    entryId: entry.id,
                                    subjectCode: entry.subject_code,
                                    date,
                                    warning: `Room conflict detected: ${JSON.stringify(conflict.conflicts)}`,
                                });
                                continue;
                            }

                            // Create booking
                            const bookingResult = await db.query(
                                `INSERT INTO bookings
                 (room_id, slot_entry_id, date, day, start_time, end_time, course_id, timetable_entry_id, booking_type)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'class')
                 RETURNING *`,
                                [roomId, block.id, date, block.day, block.startTime, block.endTime, entry.course_id, entry.id]
                            );

                            bookingsCreated.push(bookingResult.rows[0]);
                        } catch (dateError) {
                            errors.push({
                                entryId: entry.id,
                                subjectCode: entry.subject_code,
                                date,
                                error: dateError.message,
                            });
                        }
                    }
                }
            } catch (entryError) {
                errors.push({
                    entryId: entry.id,
                    subjectCode: entry.subject_code,
                    error: entryError.message,
                });
            }
        }

        logger.info('Preallocation completed', {
            slotSystemId,
            bookingsCreated: bookingsCreated.length,
            warnings: warnings.length,
            errors: errors.length,
        });

        return {
            bookingsCreated,
            warnings,
            errors,
            totalEntries: entries.length,
        };
    }

    /**
     * Find an available room with sufficient capacity for a time block
     * @param {string} date - Date (YYYY-MM-DD)
     * @param {string} startTime - Start time
     * @param {string} endTime - End time
     * @param {number} requiredCapacity - Minimum capacity
     * @returns {Promise<string|null>} Room ID or null
     */
    async findAvailableRoom(date, startTime, endTime, requiredCapacity) {
        // Find rooms with enough capacity that don't have conflicting bookings
        const result = await db.query(
            `SELECT r.id
       FROM rooms r
       WHERE r.is_active = true
         AND r.capacity >= $1
         AND r.id NOT IN (
           SELECT b.room_id FROM bookings b
           WHERE b.date = $2 AND b.is_active = true
             AND b.start_time < $4 AND b.end_time > $3
         )
         AND r.id NOT IN (
           SELECT br.room_id FROM booking_requests br
           WHERE br.booking_date = $2
             AND br.status IN ('approved', 'pending_staff')
             AND br.start_time < $4 AND br.end_time > $3
         )
       ORDER BY r.capacity ASC
       LIMIT 1`,
            [requiredCapacity, date, startTime, endTime]
        );

        return result.rows.length > 0 ? result.rows[0].id : null;
    }

    /**
     * Get all dates within a range that fall on a specific day of week
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {number} dayOfWeek - Day of week (0=Sun, 1=Mon, ..., 6=Sat)
     * @returns {string[]} Array of date strings
     */
    getDatesForDay(startDate, endDate, dayOfWeek) {
        const dates = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Find first occurrence of the target day
        const current = new Date(start);
        while (current.getDay() !== dayOfWeek && current <= end) {
            current.setDate(current.getDate() + 1);
        }

        // Collect all occurrences
        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 7);
        }

        return dates;
    }

    /**
     * Get bookings with filters
     * @param {Object} filters
     * @returns {Promise<Array>}
     */
    async findBookings(filters = {}) {
        const { slotSystemId, roomId, courseId, date, page = 1, limit = 50 } = filters;
        const params = [];
        const conditions = ['b.is_active = true'];
        const offset = (page - 1) * limit;

        if (slotSystemId) {
            conditions.push(`te.slot_system_id = $${params.length + 1}`);
            params.push(slotSystemId);
        }

        if (roomId) {
            conditions.push(`b.room_id = $${params.length + 1}`);
            params.push(roomId);
        }

        if (courseId) {
            conditions.push(`b.course_id = $${params.length + 1}`);
            params.push(courseId);
        }

        if (date) {
            conditions.push(`b.date = $${params.length + 1}`);
            params.push(date);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await db.query(
            `SELECT b.*,
              r.room_number, r.name as room_name, r.capacity,
              c.course_code, c.name as course_name,
              te.subject_code, te.instructor
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       LEFT JOIN courses c ON b.course_id = c.id
       LEFT JOIN timetable_entries te ON b.timetable_entry_id = te.id
       ${whereClause}
       ORDER BY b.date, b.start_time
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        return result.rows;
    }
}

module.exports = new PreallocationService();
