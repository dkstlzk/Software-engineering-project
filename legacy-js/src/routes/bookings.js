/**
 * Booking Routes
 * Mounts booking request and approval workflow endpoints
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireRole, isFacultyOrHigher, isStaffOrAdmin } = require('../middleware/rbac');
const { validate: handleValidationErrors } = require('../middleware/validation');
const bookingController = require('../controllers/bookingController');

// All routes require authentication
router.use(authenticate);

// POST /booking/request — Create a booking request (any authenticated user)
router.post(
    '/request',
    bookingController.createBookingValidation,
    handleValidationErrors,
    bookingController.createBooking
);

// GET /booking/pending/faculty — Faculty: get pending student requests
router.get(
    '/pending/faculty',
    requireRole('faculty'),
    bookingController.getPendingForFaculty
);

// GET /booking/pending/staff — Staff/Admin: get pending requests
router.get(
    '/pending/staff',
    isStaffOrAdmin,
    bookingController.getPendingForStaff
);

// GET /booking/user/:userId — Get bookings for a user
router.get(
    '/user/:userId',
    bookingController.getUserBookings
);

// GET /booking/:id — Get booking by ID
router.get(
    '/:id',
    bookingController.getBookingById
);

// POST /booking/:id/approve — Approve a booking request
router.post(
    '/:id/approve',
    isFacultyOrHigher,
    bookingController.approveRejectValidation,
    handleValidationErrors,
    bookingController.approveBooking
);

// POST /booking/:id/reject — Reject a booking request
router.post(
    '/:id/reject',
    isFacultyOrHigher,
    bookingController.approveRejectValidation,
    handleValidationErrors,
    bookingController.rejectBooking
);

module.exports = router;
