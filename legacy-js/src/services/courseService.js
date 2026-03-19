/**
 * Course Service
 * Manages courses and their slot system mappings
 * Enforces that courses must belong to a slot system
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

class CourseService {
    /**
     * Create a new course with required slot system mapping
     * @param {Object} data - Course data
     * @returns {Promise<Object>} Created course
     */
    async create(data) {
        const { courseCode, name, departmentId, credits, description, slotSystemId, instructor, studentCount } = data;

        if (!slotSystemId) {
            throw ApiError.badRequest('A course MUST be mapped to a slot system. Provide slotSystemId.');
        }

        // Verify slot system exists
        const ssCheck = await db.query(
            `SELECT id FROM slot_systems WHERE id = $1 AND is_active = true`,
            [slotSystemId]
        );
        if (ssCheck.rows.length === 0) {
            throw ApiError.notFound('Slot system not found');
        }

        const result = await db.query(
            `INSERT INTO courses (course_code, name, department_id, credits, description, slot_system_id, instructor, student_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
            [courseCode, name, departmentId || null, credits || 3, description || null, slotSystemId, instructor || null, studentCount || 0]
        );

        const course = result.rows[0];
        logger.info('Course created', { id: course.id, courseCode });
        return course;
    }

    /**
     * Map a course to a slot system
     * @param {string} courseId - Course UUID
     * @param {string} slotSystemId - Slot system UUID
     * @returns {Promise<Object>} Updated course
     */
    async mapSlotSystem(courseId, slotSystemId) {
        // Verify course exists
        const course = await this.findById(courseId);
        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        // Verify slot system exists
        const ssCheck = await db.query(
            `SELECT id FROM slot_systems WHERE id = $1 AND is_active = true`,
            [slotSystemId]
        );
        if (ssCheck.rows.length === 0) {
            throw ApiError.notFound('Slot system not found');
        }

        const result = await db.query(
            `UPDATE courses SET slot_system_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
            [slotSystemId, courseId]
        );

        logger.info('Course mapped to slot system', { courseId, slotSystemId });
        return result.rows[0];
    }

    /**
     * Find course by ID
     * @param {string} id - Course UUID
     * @returns {Promise<Object>}
     */
    async findById(id) {
        const result = await db.query(
            `SELECT c.*, ss.name as slot_system_name, d.name as department_name
       FROM courses c
       LEFT JOIN slot_systems ss ON c.slot_system_id = ss.id
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE c.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            throw ApiError.notFound('Course not found');
        }

        return result.rows[0];
    }

    /**
     * Find course by course code
     * @param {string} courseCode
     * @returns {Promise<Object|null>}
     */
    async findByCode(courseCode) {
        const result = await db.query(
            `SELECT c.*, ss.name as slot_system_name
       FROM courses c
       LEFT JOIN slot_systems ss ON c.slot_system_id = ss.id
       WHERE c.course_code = $1`,
            [courseCode]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * List all courses with optional filtering
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async findAll(options = {}) {
        const { slotSystemId, departmentId, page = 1, limit = 50 } = options;
        const offset = (page - 1) * limit;
        const params = [];
        const conditions = ['c.is_active = true'];

        if (slotSystemId) {
            conditions.push(`c.slot_system_id = $${params.length + 1}`);
            params.push(slotSystemId);
        }

        if (departmentId) {
            conditions.push(`c.department_id = $${params.length + 1}`);
            params.push(departmentId);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.query(
            `SELECT COUNT(*) FROM courses c ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT c.*, ss.name as slot_system_name, d.name as department_name
       FROM courses c
       LEFT JOIN slot_systems ss ON c.slot_system_id = ss.id
       LEFT JOIN departments d ON c.department_id = d.id
       ${whereClause}
       ORDER BY c.course_code
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        return {
            data: result.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }
}

module.exports = new CourseService();
