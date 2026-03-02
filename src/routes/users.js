/**
 * User Routes
 * Admin-only for list/update/delete
 * Users are created via /auth/register
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isAdmin, checkPermission } = require('../middleware/rbac');
const { asyncHandler } = require('../utils/errorHandler');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

// GET /api/users - List all users (admin only)
router.get(
  '/',
  isAdmin,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name,
              r.name as role_name,
              d.name as department_name,
              u.employee_id, u.student_id, u.phone,
              u.is_active, u.is_email_verified, u.last_login,
              u.created_at, u.updated_at
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.is_active = true
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  })
);

// GET /api/users/:id - Get user by ID (admin only)
router.get(
  '/:id',
  isAdmin,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name,
              r.name as role_name, r.id as role_id,
              d.name as department_name, u.department_id,
              u.employee_id, u.student_id, u.phone,
              u.is_active, u.is_email_verified, u.last_login,
              u.created_at, u.updated_at
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: { user: result.rows[0] } });
  })
);

// PUT /api/users/:id - Update user (admin only)
router.put(
  '/:id',
  isAdmin,
  asyncHandler(async (req, res) => {
    const { first_name, last_name, email, roleId, departmentId, phone, is_active } = req.body;

    const result = await db.query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        role_id = COALESCE($4, role_id),
        department_id = COALESCE($5, department_id),
        phone = COALESCE($6, phone),
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
       WHERE id = $8
       RETURNING id, email, first_name, last_name, is_active`,
      [first_name, last_name, email, roleId, departmentId, phone, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    logger.info('User updated', { userId: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  })
);

// DELETE /api/users/:id - Soft delete user (admin only)
router.delete(
  '/:id',
  isAdmin,
  asyncHandler(async (req, res) => {
    // Prevent self-deletion
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    const result = await db.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found or already deleted' });
    }

    // Revoke all their refresh tokens
    await db.query(
      'UPDATE refresh_tokens SET is_revoked = true, revoked_at = NOW() WHERE user_id = $1 AND is_revoked = false',
      [req.params.id]
    );

    logger.info('User deleted', { userId: req.params.id });
    res.json({ success: true, message: 'User deleted successfully' });
  })
);

module.exports = router;
