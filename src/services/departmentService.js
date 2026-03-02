/**
 * Department Service
 * Handles department CRUD operations
 * Admin-only operations as per SRS requirements
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

class DepartmentService {
  /**
   * Create a new department
   * @param {Object} data - Department data
   * @param {string} userId - Creating user ID (for audit)
   * @returns {Promise<Object>} Created department
   */
  async create(data, userId) {
    const { name, code, description, headId, contactEmail, contactPhone } = data;

    const result = await db.query(
      `INSERT INTO departments (name, code, description, head_id, contact_email, contact_phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, code.toUpperCase(), description, headId, contactEmail, contactPhone]
    );

    const department = result.rows[0];

    // Log audit
    await this.logAudit(userId, 'CREATE', department.id, null, department);

    logger.info('Department created', { departmentId: department.id, name });
    return department;
  }

  /**
   * Get all departments
   * @param {Object} options - Query options (pagination, filters)
   * @returns {Promise<Object>} Departments list with pagination
   */
  async findAll(options = {}) {
    const { page = 1, limit = 20, search = '', isActive = true } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE d.is_active = $1';
    const params = [isActive];

    if (search) {
      whereClause += ` AND (name ILIKE $${params.length + 1} OR code ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM departments d ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get departments with head info
    const result = await db.query(
      `SELECT d.*, 
              u.first_name as head_first_name, 
              u.last_name as head_last_name,
              u.email as head_email
       FROM departments d
       LEFT JOIN users u ON d.head_id = u.id
       ${whereClause}
       ORDER BY d.name ASC
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
   * Get department by ID
   * @param {string} id - Department ID
   * @returns {Promise<Object>} Department data
   */
  async findById(id) {
    const result = await db.query(
      `SELECT d.*, 
              u.first_name as head_first_name, 
              u.last_name as head_last_name,
              u.email as head_email,
              (SELECT COUNT(*) FROM users WHERE department_id = d.id) as member_count,
              (SELECT COUNT(*) FROM rooms WHERE department_id = d.id) as room_count
       FROM departments d
       LEFT JOIN users u ON d.head_id = u.id
       WHERE d.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Department not found');
    }

    return result.rows[0];
  }

  /**
   * Get department by code
   * @param {string} code - Department code
   * @returns {Promise<Object>} Department data
   */
  async findByCode(code) {
    const result = await db.query(
      `SELECT * FROM departments WHERE code = $1`,
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Department not found');
    }

    return result.rows[0];
  }

  /**
   * Update department
   * @param {string} id - Department ID
   * @param {Object} data - Update data
   * @param {string} userId - Updating user ID (for audit)
   * @returns {Promise<Object>} Updated department
   */
  async update(id, data, userId) {
    // Get current department for audit
    const current = await this.findById(id);

    const { name, code, description, headId, contactEmail, contactPhone, isActive } = data;

    const result = await db.query(
      `UPDATE departments SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        head_id = COALESCE($4, head_id),
        contact_email = COALESCE($5, contact_email),
        contact_phone = COALESCE($6, contact_phone),
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name,
        code?.toUpperCase(),
        description,
        headId,
        contactEmail,
        contactPhone,
        isActive,
        id,
      ]
    );

    const department = result.rows[0];

    // Log audit
    await this.logAudit(userId, 'UPDATE', id, current, department);

    logger.info('Department updated', { departmentId: id });
    return department;
  }

  /**
   * Delete department (soft delete)
   * @param {string} id - Department ID
   * @param {string} userId - Deleting user ID (for audit)
   * @returns {Promise<void>}
   */
  async delete(id, userId) {
    // Get current department for audit
    const current = await this.findById(id);

    // Check if department has rooms or users
    const roomCheck = await db.query(
      'SELECT COUNT(*) FROM rooms WHERE department_id = $1 AND is_active = true',
      [id]
    );
    
    if (parseInt(roomCheck.rows[0].count) > 0) {
      throw ApiError.conflict(
        'Cannot delete department with active rooms. Please reassign or deactivate rooms first.'
      );
    }

    const userCheck = await db.query(
      'SELECT COUNT(*) FROM users WHERE department_id = $1 AND is_active = true',
      [id]
    );

    if (parseInt(userCheck.rows[0].count) > 0) {
      throw ApiError.conflict(
        'Cannot delete department with active users. Please reassign users first.'
      );
    }

    // Soft delete
    await db.query(
      `UPDATE departments SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Log audit
    await this.logAudit(userId, 'DELETE', id, current, { ...current, is_active: false });

    logger.info('Department deleted', { departmentId: id });
  }

  /**
   * Hard delete department (admin only, with confirmation)
   * NFR-5.2.1: Multi-step confirmation for critical deletions
   * @param {string} id - Department ID
   * @param {string} userId - Deleting user ID (for audit)
   * @param {string} confirmationCode - Confirmation code
   * @returns {Promise<void>}
   */
  async hardDelete(id, userId, confirmationCode) {
    // Verify confirmation (simple code check)
    if (confirmationCode !== `DELETE_DEPT_${id.substring(0, 8).toUpperCase()}`) {
      throw ApiError.badRequest('Invalid confirmation code');
    }

    const current = await this.findById(id);

    // Check for dependencies
    const roomCheck = await db.query(
      'SELECT COUNT(*) FROM rooms WHERE department_id = $1',
      [id]
    );

    if (parseInt(roomCheck.rows[0].count) > 0) {
      throw ApiError.conflict(
        'Cannot permanently delete department with associated rooms.'
      );
    }

    await db.query('DELETE FROM departments WHERE id = $1', [id]);

    // Log audit
    await this.logAudit(userId, 'HARD_DELETE', id, current, null);

    logger.info('Department permanently deleted', { departmentId: id });
  }

  /**
   * Get department statistics
   * @param {string} id - Department ID
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(id) {
    const result = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM users u WHERE u.department_id = $1 AND u.is_active = true) as active_users,
        (SELECT COUNT(*) FROM rooms r WHERE r.department_id = $1 AND r.is_active = true) as active_rooms,
        (SELECT SUM(capacity) FROM rooms r WHERE r.department_id = $1 AND r.is_active = true) as total_capacity,
        (SELECT COUNT(*) FROM room_allocations ra
         JOIN rooms r ON ra.room_id = r.id
         WHERE r.department_id = $1 AND ra.is_active = true) as active_allocations`,
      [id]
    );

    return result.rows[0];
  }

  /**
   * Log audit entry
   * @param {string} userId - User performing action
   * @param {string} action - Action type
   * @param {string} entityId - Department ID
   * @param {Object} oldValues - Previous values
   * @param {Object} newValues - New values
   */
  async logAudit(userId, action, entityId, oldValues, newValues) {
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, 'departments', $3, $4, $5)`,
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

module.exports = new DepartmentService();
