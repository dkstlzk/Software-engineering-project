/**
 * Building Routes
 * Admin for create/update/delete
 * Read access for all authenticated users
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

// GET /api/buildings - List all active buildings
router.get(
  '/',
  checkPermission('buildings', 'read'),
  asyncHandler(async (req, res) => {
    const result = await db.query(
      'SELECT * FROM buildings WHERE is_active = true ORDER BY name'
    );
    res.json({ success: true, data: result.rows });
  })
);

// GET /api/buildings/:id - Get building by ID
router.get(
  '/:id',
  checkPermission('buildings', 'read'),
  asyncHandler(async (req, res) => {
    const result = await db.query('SELECT * FROM buildings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Building not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  })
);

// GET /api/buildings/:id/rooms - Get rooms for a building
router.get(
  '/:id/rooms',
  checkPermission('buildings', 'read'),
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT r.*, d.name as department_name, d.code as department_code
       FROM rooms r
       LEFT JOIN departments d ON r.department_id = d.id
       WHERE r.building_id = $1 AND r.is_active = true
       ORDER BY r.floor, r.room_number`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  })
);

// POST /api/buildings - Create a new building (admin only)
router.post(
  '/',
  isAdmin,
  asyncHandler(async (req, res) => {
    const { name, code, address, floors, is_active } = req.body;
    const result = await db.query(
      'INSERT INTO buildings (name, code, address, floors, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, code, address, floors, is_active ?? true]
    );
    // Audit log
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values) VALUES ($1, $2, $3, $4, $5)`,
        [req.user.userId, 'CREATE', 'buildings', result.rows[0].id, JSON.stringify(result.rows[0])]
      );
    } catch (_) {}
    logger.info('Building created', { buildingId: result.rows[0].id });
    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

// PUT /api/buildings/:id - Update a building (admin only)
router.put(
  '/:id',
  isAdmin,
  asyncHandler(async (req, res) => {
    const { name, code, address, floors, is_active } = req.body;
    const result = await db.query(
      'UPDATE buildings SET name=$1, code=$2, address=$3, floors=$4, is_active=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [name, code, address, floors, is_active, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Building not found' });
    }
    logger.info('Building updated', { buildingId: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  })
);

// DELETE /api/buildings/:id - Delete a building (admin only)
router.delete(
  '/:id',
  isAdmin,
  asyncHandler(async (req, res) => {
    // Check for active rooms
    const roomCheck = await db.query(
      'SELECT COUNT(*) FROM rooms WHERE building_id = $1 AND is_active = true',
      [req.params.id]
    );
    if (parseInt(roomCheck.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete building with active rooms. Deactivate or reassign rooms first.',
      });
    }

    const result = await db.query(
      'UPDATE buildings SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Building not found or already deleted' });
    }
    // Audit log
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values) VALUES ($1, $2, $3, $4, $5)`,
        [req.user.userId, 'DELETE', 'buildings', req.params.id, JSON.stringify(result.rows[0])]
      );
    } catch (_) {}
    logger.info('Building deleted', { buildingId: req.params.id });
    res.json({ success: true, message: 'Building deleted successfully' });
  })
);

module.exports = router;
