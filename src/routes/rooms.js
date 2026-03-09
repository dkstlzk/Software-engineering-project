/**
 * Room Routes
 * Admin/Staff for create/update/delete
 * Read access for all authenticated users
 */
const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const inventoryController = require('../controllers/inventoryController');
const roomAvailabilityController = require('../controllers/roomAvailabilityController');
const { authenticate } = require('../middleware/auth');
const { isStaffOrAdmin, checkPermission } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Slot-system-aware room availability (must be before /:id routes)
router.get(
  '/availability',
  checkPermission('rooms', 'read'),
  roomAvailabilityController.availabilityValidation,
  validate,
  roomAvailabilityController.getAvailability
);

// Find available rooms (must be before /:id routes)
router.get(
  '/available',
  checkPermission('rooms', 'read'),
  roomController.findAvailableValidation,
  validate,
  roomController.findAvailable
);

// List rooms
router.get(
  '/',
  checkPermission('rooms', 'read'),
  roomController.listValidation,
  validate,
  roomController.getAll
);

// Get room by ID
router.get(
  '/:id',
  checkPermission('rooms', 'read'),
  roomController.idValidation,
  validate,
  roomController.getById
);

// Check room availability
router.get(
  '/:id/availability',
  checkPermission('rooms', 'read'),
  roomController.availabilityValidation,
  validate,
  roomController.checkAvailability
);

// Get room schedule
router.get(
  '/:id/schedule',
  checkPermission('rooms', 'read'),
  roomController.idValidation,
  validate,
  roomController.getDaySchedule
);

// Create room - staff/admin only
router.post(
  '/',
  isStaffOrAdmin,
  roomController.createValidation,
  validate,
  roomController.create
);

// Update room - staff/admin only
router.put(
  '/:id',
  isStaffOrAdmin,
  roomController.updateValidation,
  validate,
  roomController.update
);

// Delete room - staff/admin only
router.delete(
  '/:id',
  isStaffOrAdmin,
  roomController.idValidation,
  validate,
  roomController.remove
);

// =====================================
// Room Inventory Routes
// =====================================

// Get room inventory
router.get(
  '/:roomId/inventory',
  checkPermission('inventory', 'read'),
  inventoryController.listValidation,
  validate,
  inventoryController.getRoomInventory
);

// Get room inventory summary
router.get(
  '/:roomId/inventory/summary',
  checkPermission('inventory', 'read'),
  inventoryController.getRoomSummary
);

// Add item to room inventory - staff/admin only
router.post(
  '/:roomId/inventory',
  isStaffOrAdmin,
  inventoryController.createValidation,
  validate,
  inventoryController.addItem
);

module.exports = router;
