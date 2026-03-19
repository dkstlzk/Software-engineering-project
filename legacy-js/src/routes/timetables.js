/**
 * Timetable Routes
 * Admin/Staff for upload
 * Read access for all authenticated users
 */
const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');
const { authenticate } = require('../middleware/auth');
const { isStaffOrAdmin } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Upload timetable - staff/admin only
router.post(
    '/upload',
    isStaffOrAdmin,
    timetableController.uploadValidation,
    validate,
    timetableController.upload
);

// List timetable entries
router.get(
    '/',
    timetableController.listValidation,
    validate,
    timetableController.getAll
);

// Get timetable entry by ID
router.get(
    '/:id',
    timetableController.idValidation,
    validate,
    timetableController.getById
);

module.exports = router;
