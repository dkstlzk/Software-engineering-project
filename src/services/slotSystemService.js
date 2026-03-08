/**
 * Slot System Service
 * Manages multiple independent slot systems (BTech_1stYear, MTech, MBA, etc.)
 * Each slot system defines its own set of slots with day/time mappings.
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

class SlotSystemService {
    /**
     * Create a new slot system
     * @param {Object} data - { name, programType, yearGroup, description }
     * @returns {Promise<Object>} Created slot system
     */
    async create(data) {
        const { name, programType, yearGroup, description } = data;

        const result = await db.query(
            `INSERT INTO slot_systems (name, program_type, year_group, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [name, programType, yearGroup || null, description || null]
        );

        const slotSystem = result.rows[0];
        logger.info('Slot system created', { id: slotSystem.id, name });
        return slotSystem;
    }

    /**
     * Upload slots to a slot system from parsed CSV rows
     * @param {string} slotSystemId - Slot system UUID
     * @param {Array<Object>} rows - [{ slotCode, day, startTime, endTime }]
     * @returns {Promise<Object>} Upload result with inserted count and errors
     */
    async uploadSlots(slotSystemId, rows) {
        // Verify slot system exists
        const system = await this.findById(slotSystemId);
        if (!system) {
            throw ApiError.notFound('Slot system not found');
        }

        const inserted = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;

            try {
                // Validate required fields
                if (!row.slotCode || !row.day || !row.startTime || !row.endTime) {
                    errors.push({ row: rowNum, error: 'Missing required fields (slotCode, day, startTime, endTime)', data: row });
                    continue;
                }

                // Normalize day
                const day = this.normalizeDay(row.day);
                if (!day) {
                    errors.push({ row: rowNum, error: `Invalid day: ${row.day}. Expected: ${VALID_DAYS.join(', ')}`, data: row });
                    continue;
                }

                // Validate time format
                if (!this.isValidTime(row.startTime) || !this.isValidTime(row.endTime)) {
                    errors.push({ row: rowNum, error: 'Invalid time format. Expected HH:MM', data: row });
                    continue;
                }

                const result = await db.query(
                    `INSERT INTO slot_entries (slot_system_id, slot_code, day, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (slot_system_id, slot_code, day, start_time) DO UPDATE
           SET end_time = EXCLUDED.end_time
           RETURNING *`,
                    [slotSystemId, row.slotCode.trim(), day, row.startTime, row.endTime]
                );

                inserted.push(result.rows[0]);
            } catch (error) {
                errors.push({ row: rowNum, error: error.message, data: row });
            }
        }

        logger.info('Slots uploaded', {
            slotSystemId,
            inserted: inserted.length,
            errors: errors.length,
        });

        return { inserted, errors, totalProcessed: rows.length };
    }

    /**
     * Get all slot systems
     * @returns {Promise<Array>} Slot systems list
     */
    async findAll() {
        const result = await db.query(
            `SELECT ss.*,
              COUNT(se.id) as slot_count
       FROM slot_systems ss
       LEFT JOIN slot_entries se ON ss.id = se.slot_system_id
       WHERE ss.is_active = true
       GROUP BY ss.id
       ORDER BY ss.name`
        );

        return result.rows;
    }

    /**
     * Get a slot system by ID with all its slots
     * @param {string} id - Slot system UUID
     * @returns {Promise<Object>} Slot system with slots
     */
    async findById(id) {
        const systemResult = await db.query(
            `SELECT * FROM slot_systems WHERE id = $1`,
            [id]
        );

        if (systemResult.rows.length === 0) {
            throw ApiError.notFound('Slot system not found');
        }

        const slotsResult = await db.query(
            `SELECT * FROM slot_entries
       WHERE slot_system_id = $1
       ORDER BY slot_code, CASE day
         WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3
         WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 WHEN 'Sun' THEN 7
       END, start_time`,
            [id]
        );

        return {
            ...systemResult.rows[0],
            slots: slotsResult.rows,
        };
    }

    /**
     * Delete a slot system (soft delete)
     * @param {string} id - Slot system UUID
     */
    async delete(id) {
        await this.findById(id); // Verify exists

        // Check if any courses reference this slot system
        const courseCheck = await db.query(
            `SELECT COUNT(*) FROM courses WHERE slot_system_id = $1`,
            [id]
        );

        if (parseInt(courseCheck.rows[0].count) > 0) {
            throw ApiError.conflict(
                'Cannot delete slot system with mapped courses. Unmap courses first.'
            );
        }

        await db.query(
            `UPDATE slot_systems SET is_active = false, updated_at = NOW() WHERE id = $1`,
            [id]
        );

        logger.info('Slot system deleted', { id });
    }

    /**
     * Normalize day string to standard format
     * @param {string} day - Day input (Monday, Mon, mon, etc.)
     * @returns {string|null} Normalized day or null if invalid
     */
    normalizeDay(day) {
        if (!day) return null;
        const d = day.trim().toLowerCase();
        const dayMap = {
            'mon': 'Mon', 'monday': 'Mon',
            'tue': 'Tue', 'tuesday': 'Tue', 'tues': 'Tue',
            'wed': 'Wed', 'wednesday': 'Wed',
            'thu': 'Thu', 'thursday': 'Thu', 'thur': 'Thu', 'thurs': 'Thu',
            'fri': 'Fri', 'friday': 'Fri',
            'sat': 'Sat', 'saturday': 'Sat',
            'sun': 'Sun', 'sunday': 'Sun',
        };
        return dayMap[d] || null;
    }

    /**
     * Validate time format HH:MM
     * @param {string} time
     * @returns {boolean}
     */
    isValidTime(time) {
        return /^\d{2}:\d{2}$/.test(time);
    }
}

module.exports = new SlotSystemService();
