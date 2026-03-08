/**
 * Slot System Routes
 * Admin/Staff for create, upload, delete
 * Read access for all authenticated users
 */
const express = require('express');
const router = express.Router();
const slotSystemController = require('../controllers/slotSystemController');
const { authenticate } = require('../middleware/auth');
const { isStaffOrAdmin } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// List all slot systems
router.get(
    '/',
    slotSystemController.getAll
);

// Get slot system by ID
router.get(
    '/:id',
    slotSystemController.idValidation,
    validate,
    slotSystemController.getById
);

// Create slot system - staff/admin only
router.post(
    '/',
    isStaffOrAdmin,
    slotSystemController.createValidation,
    validate,
    slotSystemController.create
);

// Upload slots to a slot system - staff/admin only
router.post(
    '/:id/upload',
    isStaffOrAdmin,
    slotSystemController.uploadValidation,
    validate,
    slotSystemController.upload
);

// Delete slot system - staff/admin only
router.delete(
    '/:id',
    isStaffOrAdmin,
    slotSystemController.idValidation,
    validate,
    slotSystemController.remove
);

module.exports = router;
