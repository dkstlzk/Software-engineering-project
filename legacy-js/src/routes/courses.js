/**
 * Course Routes
 * Admin/Staff for create and map operations
 * Read access for all authenticated users
 */
const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate } = require('../middleware/auth');
const { isStaffOrAdmin } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Map course to slot system - staff/admin only
router.post(
    '/map-slot-system',
    isStaffOrAdmin,
    courseController.mapSlotSystemValidation,
    validate,
    courseController.mapSlotSystem
);

// List courses
router.get(
    '/',
    courseController.listValidation,
    validate,
    courseController.getAll
);

// Get course by ID
router.get(
    '/:id',
    courseController.idValidation,
    validate,
    courseController.getById
);

// Create course - staff/admin only
router.post(
    '/',
    isStaffOrAdmin,
    courseController.createValidation,
    validate,
    courseController.create
);

module.exports = router;
