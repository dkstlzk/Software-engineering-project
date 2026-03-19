/**
 * Booking Controller
 * Thin controller for booking request operations
 * Delegates business logic to bookingService and approvalService
 */
const { body, param, query } = require('express-validator');
const bookingService = require('../services/bookingService');
const approvalService = require('../services/approvalService');
const { asyncHandler } = require('../utils/errorHandler');
const { ApiError } = require('../utils/errorHandler');

/**
 * Validation middleware for booking creation
 */
const createBookingValidation = [
    body('roomId').isUUID().withMessage('Valid room ID is required'),
    body('bookingDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be in YYYY-MM-DD format'),
    body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('Start time must be in HH:MM format'),
    body('endTime').matches(/^\d{2}:\d{2}$/).withMessage('End time must be in HH:MM format'),
    body('eventTitle').trim().isLength({ min: 1, max: 200 }).withMessage('Event title is required (max 200 chars)'),
    body('eventType').optional().isIn(['class', 'quiz', 'exam', 'seminar', 'meeting', 'speaker_session', 'cultural_event', 'other'])
        .withMessage('Invalid event type'),
    body('expectedAttendees').optional().isInt({ min: 1 }).withMessage('Expected attendees must be positive'),
    body('facultyVerifierId').optional().isUUID().withMessage('Valid faculty verifier ID is required'),
];

/**
 * Validation middleware for approve/reject
 */
const approveRejectValidation = [
    param('id').isUUID().withMessage('Valid booking ID is required'),
    body('remarks').optional().trim().isLength({ max: 500 }),
    body('reason').optional().trim().isLength({ max: 500 }),
];

/**
 * POST /booking/request — Create a booking request
 */
const createBooking = asyncHandler(async (req, res) => {
    const errors = require('express-validator').validationResult(req);
    if (!errors.isEmpty()) {
        throw ApiError.badRequest('Validation failed', errors.array());
    }

    const booking = await bookingService.create(req.body, {
        userId: req.user.userId,
        role: req.user.role,
    });

    res.status(201).json({
        success: true,
        data: booking,
        message: 'Booking request created successfully',
    });
});

/**
 * GET /booking/:id — Get booking by ID
 */
const getBookingById = asyncHandler(async (req, res) => {
    const booking = await bookingService.findById(req.params.id);

    // Check authorization: requester, assigned faculty, or staff/admin
    const { userId, role } = req.user;
    const isOwner = booking.requester_id === userId;
    const isAssignedFaculty = booking.faculty_verifier_id === userId;
    const isStaffOrAdmin = role === 'staff' || role === 'admin';

    if (!isOwner && !isAssignedFaculty && !isStaffOrAdmin) {
        throw ApiError.forbidden('You do not have access to this booking request');
    }

    res.json({ success: true, data: booking });
});

/**
 * GET /booking/user/:userId — Get bookings for a user
 */
const getUserBookings = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // Only the user themselves or admin can view
    if (userId !== req.user.userId && req.user.role !== 'admin') {
        throw ApiError.forbidden('You can only view your own booking requests');
    }

    const result = await bookingService.findByUser(userId, {
        status: req.query.status,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
    });

    res.json({ success: true, ...result });
});

/**
 * GET /booking/pending/faculty — Get pending requests for the logged-in faculty
 */
const getPendingForFaculty = asyncHandler(async (req, res) => {
    const requests = await bookingService.findPendingForFaculty(req.user.userId);
    res.json({ success: true, data: requests });
});

/**
 * GET /booking/pending/staff — Get pending requests for staff approval
 */
const getPendingForStaff = asyncHandler(async (req, res) => {
    const requests = await bookingService.findPendingForStaff();
    res.json({ success: true, data: requests });
});

/**
 * POST /booking/:id/approve — Approve a booking request
 */
const approveBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { remarks } = req.body;
    const { userId, role } = req.user;

    let updatedBooking;

    if (role === 'faculty') {
        updatedBooking = await approvalService.facultyApprove(id, userId, remarks);
    } else if (role === 'staff' || role === 'admin') {
        updatedBooking = await approvalService.staffApprove(id, userId, remarks);
    } else {
        throw ApiError.forbidden('You do not have permission to approve booking requests');
    }

    res.json({
        success: true,
        data: updatedBooking,
        message: 'Booking request approved successfully',
    });
});

/**
 * POST /booking/:id/reject — Reject a booking request
 */
const rejectBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason, remarks } = req.body;
    const { userId, role } = req.user;

    if (!reason || !reason.trim()) {
        throw ApiError.badRequest('Rejection reason is required');
    }

    let updatedBooking;

    if (role === 'faculty') {
        updatedBooking = await approvalService.facultyReject(id, userId, reason);
    } else if (role === 'staff' || role === 'admin') {
        updatedBooking = await approvalService.staffReject(id, userId, reason);
    } else {
        throw ApiError.forbidden('You do not have permission to reject booking requests');
    }

    res.json({
        success: true,
        data: updatedBooking,
        message: 'Booking request rejected',
    });
});

module.exports = {
    createBookingValidation,
    approveRejectValidation,
    createBooking,
    getBookingById,
    getUserBookings,
    getPendingForFaculty,
    getPendingForStaff,
    approveBooking,
    rejectBooking,
};
