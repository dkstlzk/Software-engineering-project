/**
 * Timetable Service
 * Handles timetable upload, parsing, and storage
 * Validates courses and assigns slot systems
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const parserService = require('./parserService');
const courseService = require('./courseService');

class TimetableService {
    /**
     * Upload timetable entries for a slot system
     * @param {string} slotSystemId - Slot system UUID
     * @param {Array<Object>} rows - Raw timetable rows from CSV/Excel
     * @returns {Promise<Object>} Upload result
     */
    async upload(slotSystemId, rows) {
        // Verify slot system exists
        const ssCheck = await db.query(
            `SELECT id FROM slot_systems WHERE id = $1 AND is_active = true`,
            [slotSystemId]
        );
        if (ssCheck.rows.length === 0) {
            throw ApiError.notFound('Slot system not found');
        }

        const inserted = [];
        const errors = [];
        const warnings = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;

            try {
                // Parse the row using parser service
                const parsed = parserService.parseTimetableRow(row);

                // Validate required fields
                if (!parsed.subjectCode) {
                    errors.push({ row: rowNum, error: 'Missing subject_code', data: row });
                    continue;
                }

                if (!parsed.slotCode) {
                    // If parser couldn't extract slot code, record warning but still insert
                    warnings.push({ row: rowNum, warning: 'Could not extract slot code from slot string', data: row });
                }

                // Try to find the course by code
                let courseId = null;
                try {
                    const course = await courseService.findByCode(parsed.subjectCode);
                    if (course) {
                        courseId = course.id;
                        // Verify course belongs to same slot system
                        if (course.slot_system_id && course.slot_system_id !== slotSystemId) {
                            warnings.push({
                                row: rowNum,
                                warning: `Course ${parsed.subjectCode} is mapped to different slot system`,
                                data: row,
                            });
                        }
                    } else {
                        warnings.push({
                            row: rowNum,
                            warning: `Course ${parsed.subjectCode} not found in database`,
                            data: row,
                        });
                    }
                } catch (err) {
                    // Course not found — this is a warning, not an error
                    warnings.push({ row: rowNum, warning: `Course lookup failed: ${err.message}`, data: row });
                }

                // Insert timetable entry
                const result = await db.query(
                    `INSERT INTO timetable_entries
           (subject_code, subject_name, slot_code, slot_constraints, instructor, student_count, classroom, raw_input, course_id, slot_system_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
                    [
                        parsed.subjectCode,
                        parsed.subjectName || null,
                        parsed.slotCode || 'UNKNOWN',
                        JSON.stringify(parsed.slotConstraints),
                        parsed.instructor || null,
                        parsed.studentCount,
                        parsed.classroom,
                        parsed.rawInput,
                        courseId,
                        slotSystemId,
                    ]
                );

                inserted.push(result.rows[0]);
            } catch (error) {
                errors.push({ row: rowNum, error: error.message, data: row });
            }
        }

        logger.info('Timetable uploaded', {
            slotSystemId,
            inserted: inserted.length,
            warnings: warnings.length,
            errors: errors.length,
        });

        return {
            inserted,
            warnings,
            errors,
            totalProcessed: rows.length,
        };
    }

    /**
     * Get timetable entries for a slot system
     * @param {string} slotSystemId
     * @returns {Promise<Array>}
     */
    async findBySlotSystem(slotSystemId) {
        const result = await db.query(
            `SELECT te.*, c.name as course_name
       FROM timetable_entries te
       LEFT JOIN courses c ON te.course_id = c.id
       WHERE te.slot_system_id = $1
       ORDER BY te.subject_code, te.slot_code`,
            [slotSystemId]
        );

        return result.rows;
    }

    /**
     * Get timetable entry by ID
     * @param {string} id
     * @returns {Promise<Object>}
     */
    async findById(id) {
        const result = await db.query(
            `SELECT te.*, c.name as course_name, ss.name as slot_system_name
       FROM timetable_entries te
       LEFT JOIN courses c ON te.course_id = c.id
       LEFT JOIN slot_systems ss ON te.slot_system_id = ss.id
       WHERE te.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            throw ApiError.notFound('Timetable entry not found');
        }

        return result.rows[0];
    }
}

module.exports = new TimetableService();
