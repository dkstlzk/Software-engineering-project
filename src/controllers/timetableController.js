/**
 * Timetable Controller
 * Handles timetable upload and query endpoints
 */
const { body, param, query } = require('express-validator');
const timetableService = require('../services/timetableService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation for timetable upload
 */
const uploadValidation = [
    body('slotSystemId')
        .isUUID()
        .withMessage('Valid slot system ID is required'),
    body('entries')
        .isArray({ min: 1 })
        .withMessage('Entries array is required with at least one row'),
    body('entries.*.subject_code')
        .trim()
        .notEmpty()
        .withMessage('Subject code is required'),
];

/**
 * Validation for ID parameter
 */
const idValidation = [
    param('id').isUUID().withMessage('Valid timetable entry ID is required'),
];

/**
 * Validation for slot system query
 */
const listValidation = [
    query('slotSystemId').isUUID().withMessage('Valid slot system ID is required'),
];

/**
 * Upload timetable
 * POST /api/timetables/upload
 */
const upload = asyncHandler(async (req, res) => {
    const { slotSystemId, entries } = req.body;
    const result = await timetableService.upload(slotSystemId, entries);

    res.status(200).json({
        success: true,
        message: `Processed ${result.totalProcessed} entries: ${result.inserted.length} inserted, ${result.warnings.length} warnings, ${result.errors.length} errors`,
        data: result,
    });
});

/**
 * List timetable entries
 * GET /api/timetables?slotSystemId=...
 */
const getAll = asyncHandler(async (req, res) => {
    const entries = await timetableService.findBySlotSystem(req.query.slotSystemId);

    res.json({
        success: true,
        data: { entries },
    });
});

/**
 * Get timetable entry by ID
 * GET /api/timetables/:id
 */
const getById = asyncHandler(async (req, res) => {
    const entry = await timetableService.findById(req.params.id);

    res.json({
        success: true,
        data: { entry },
    });
});

module.exports = {
    uploadValidation,
    idValidation,
    listValidation,
    upload,
    getAll,
    getById,
};
