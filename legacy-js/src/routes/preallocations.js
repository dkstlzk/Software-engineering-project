/**
 * Preallocation Routes
 * Admin/Staff for running preallocation
 * Read access for all authenticated users
 */
const express = require('express');
const router = express.Router();
const preallocationController = require('../controllers/preallocationController');
const { authenticate } = require('../middleware/auth');
const { isStaffOrAdmin } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Run preallocation - staff/admin only
router.post(
    '/run',
    isStaffOrAdmin,
    preallocationController.runValidation,
    validate,
    preallocationController.run
);

// List bookings
router.get(
    '/bookings',
    preallocationController.listValidation,
    validate,
    preallocationController.getBookings
);

module.exports = router;
