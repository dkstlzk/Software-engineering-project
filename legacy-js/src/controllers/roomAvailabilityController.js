/**
 * Room Availability Controller
 * Time-based room availability queries (slot-system-independent)
 * GET /rooms/availability?date=&startTime=&endTime=
 */
const { query } = require('express-validator');
const db = require('../config/database');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation for availability query
 */
const availabilityValidation = [
    query('date')
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage('Date must be in YYYY-MM-DD format'),
    query('startTime')
        .optional()
        .matches(/^\d{2}:\d{2}$/)
        .withMessage('Start time must be in HH:MM format'),
    query('endTime')
        .optional()
        .matches(/^\d{2}:\d{2}$/)
        .withMessage('End time must be in HH:MM format'),
];

/**
 * Get room availability for a date and optional time range
 * GET /api/rooms/availability?date=2025-01-15&startTime=09:00&endTime=10:00
 * 
 * If startTime/endTime are omitted, returns all rooms with their booking status for the whole day.
 * If provided, checks which rooms are free during that specific window.
 */
const getAvailability = asyncHandler(async (req, res) => {
    const { date, startTime, endTime } = req.query;

    // Get all active rooms
    const roomsResult = await db.query(
        `SELECT r.id, r.room_number, r.name, r.capacity, r.room_type,
            b_name.name as building_name
     FROM rooms r
     JOIN buildings b_name ON r.building_id = b_name.id
     WHERE r.is_active = true
     ORDER BY r.capacity, r.room_number`
    );

    const allRooms = roomsResult.rows;

    // If no time range specified, show all rooms with day's bookings summary
    if (!startTime || !endTime) {
        // Get all bookings/requests for the day
        const dayBookings = await db.query(
            `SELECT DISTINCT room_id FROM bookings
             WHERE date = $1 AND is_active = true`,
            [date]
        );
        const dayRequests = await db.query(
            `SELECT DISTINCT room_id FROM booking_requests
             WHERE booking_date = $1 AND status IN ('approved', 'pending_staff', 'pending_faculty')`,
            [date]
        );

        const occupiedRoomIds = new Set([
            ...dayBookings.rows.map(r => r.room_id),
            ...dayRequests.rows.map(r => r.room_id),
        ]);

        const available = allRooms.filter(r => !occupiedRoomIds.has(r.id));
        const occupied = allRooms.filter(r => occupiedRoomIds.has(r.id));

        return res.json({
            success: true,
            data: {
                date,
                available,
                occupied,
                message: 'No time range specified — showing rooms with any bookings on this day',
                summary: {
                    totalRooms: allRooms.length,
                    availableCount: available.length,
                    occupiedCount: occupied.length,
                },
            },
        });
    }

    // Time range specified — check each room for conflicts in that window
    const available = [];
    const occupied = [];

    for (const room of allRooms) {
        // Check bookings table
        const bookingConflict = await db.query(
            `SELECT b.id, b.start_time, b.end_time, c.course_code
             FROM bookings b
             LEFT JOIN courses c ON b.course_id = c.id
             WHERE b.room_id = $1
               AND b.date = $2
               AND b.is_active = true
               AND b.start_time < $4
               AND b.end_time > $3`,
            [room.id, date, startTime, endTime]
        );

        // Check booking_requests table
        const requestConflict = await db.query(
            `SELECT id, start_time, end_time, event_title
             FROM booking_requests
             WHERE room_id = $1
               AND booking_date = $2
               AND status IN ('approved', 'pending_staff')
               AND start_time < $4
               AND end_time > $3`,
            [room.id, date, startTime, endTime]
        );

        if (bookingConflict.rows.length > 0 || requestConflict.rows.length > 0) {
            occupied.push({
                ...room,
                conflicts: [{
                    bookings: bookingConflict.rows,
                    requests: requestConflict.rows,
                }],
            });
        } else {
            available.push(room);
        }
    }

    res.json({
        success: true,
        data: {
            date,
            startTime,
            endTime,
            available,
            occupied,
            summary: {
                totalRooms: allRooms.length,
                availableCount: available.length,
                occupiedCount: occupied.length,
            },
        },
    });
});

module.exports = {
    availabilityValidation,
    getAvailability,
};
