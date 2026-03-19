/**
 * Slot Resolution Service
 * Converts (slot_code + slot_system_id + constraints) → actual time blocks
 * 
 * Example:
 *   "A" + BTech_1stYear → [{ day: "Mon", startTime: "09:00", endTime: "09:50" }, { day: "Tue", startTime: "09:00", endTime: "09:50" }]
 *   "B" + constraints: ["Tue"] → [{ day: "Tue", startTime: "10:00", endTime: "10:50" }] (filtered to Tue only)
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

class SlotResolutionService {
    /**
     * Resolve a slot code to actual time blocks within a slot system
     * @param {string} slotCode - Slot code (A, B, K, M1, etc.)
     * @param {string} slotSystemId - Slot system UUID
     * @param {Object} constraints - Optional constraints { dayConstraints: ["Tue", "Fri"] }
     * @returns {Promise<Array<Object>>} Resolved time blocks [{ id, day, startTime, endTime }]
     */
    async resolve(slotCode, slotSystemId, constraints = {}) {
        if (!slotCode || !slotSystemId) {
            throw ApiError.badRequest('slotCode and slotSystemId are required');
        }

        // Fetch all slot entries for this code in this system
        const result = await db.query(
            `SELECT id, slot_code, day, start_time, end_time
       FROM slot_entries
       WHERE slot_system_id = $1 AND slot_code = $2
       ORDER BY CASE day
         WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3
         WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 WHEN 'Sun' THEN 7
       END, start_time`,
            [slotSystemId, slotCode]
        );

        let timeBlocks = result.rows.map(row => ({
            id: row.id,
            slotCode: row.slot_code,
            day: row.day,
            startTime: row.start_time,
            endTime: row.end_time,
        }));

        // Apply day constraints if provided
        if (constraints.dayConstraints && constraints.dayConstraints.length > 0) {
            const allowedDays = constraints.dayConstraints.map(d => d.trim());
            timeBlocks = timeBlocks.filter(block => allowedDays.includes(block.day));
        }

        if (timeBlocks.length === 0) {
            logger.warn('Slot resolution returned no time blocks', {
                slotCode,
                slotSystemId,
                constraints,
            });
        }

        return timeBlocks;
    }

    /**
     * Resolve a timetable entry to time blocks
     * @param {Object} timetableEntry - Timetable entry from DB
     * @returns {Promise<Array<Object>>} Resolved time blocks
     */
    async resolveEntry(timetableEntry) {
        const constraints = typeof timetableEntry.slot_constraints === 'string'
            ? JSON.parse(timetableEntry.slot_constraints)
            : timetableEntry.slot_constraints || {};

        return this.resolve(
            timetableEntry.slot_code,
            timetableEntry.slot_system_id,
            constraints
        );
    }

    /**
     * Resolve all entries for a slot system
     * @param {string} slotSystemId
     * @returns {Promise<Array<Object>>} Entries with resolved time blocks
     */
    async resolveAllForSlotSystem(slotSystemId) {
        const entries = await db.query(
            `SELECT * FROM timetable_entries WHERE slot_system_id = $1`,
            [slotSystemId]
        );

        const resolved = [];
        for (const entry of entries.rows) {
            const timeBlocks = await this.resolveEntry(entry);
            resolved.push({
                entry,
                timeBlocks,
            });
        }

        return resolved;
    }
}

module.exports = new SlotResolutionService();
