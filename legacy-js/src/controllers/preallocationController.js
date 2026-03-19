/**
 * Preallocation Controller
 * Handles preallocation trigger and booking query endpoints
 */
const { body, query } = require('express-validator');
const preallocationService = require('../services/preallocationService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation for running preallocation
 */
const runValidation = [
    body('slotSystemId')
        .isUUID()
        .withMessage('Valid slot system ID is required'),
    body('startDate')
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage('Start date must be in YYYY-MM-DD format'),
    body('endDate')
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage('End date must be in YYYY-MM-DD format'),
];

/**
 * Validation for booking list query
 */
const listValidation = [
    query('slotSystemId').optional().isUUID(),
    query('roomId').optional().isUUID(),
    query('courseId').optional().isUUID(),
    query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

/**
 * Trigger preallocation
 * POST /api/preallocations/run
 */
const run = asyncHandler(async (req, res) => {
    const { slotSystemId, startDate, endDate } = req.body;
    const result = await preallocationService.preallocate(slotSystemId, startDate, endDate);

    res.status(200).json({
        success: true,
        message: `Preallocation complete: ${result.bookingsCreated.length} bookings created, ${result.warnings.length} warnings, ${result.errors.length} errors`,
        data: result,
    });
});

/**
 * List bookings
 * GET /api/preallocations/bookings
 */
const getBookings = asyncHandler(async (req, res) => {
    const bookings = await preallocationService.findBookings(req.query);

    res.json({
        success: true,
        data: { bookings },
    });
});

module.exports = {
    runValidation,
    listValidation,
    run,
    getBookings,
};
