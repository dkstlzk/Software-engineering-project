/**
 * Slot System Controller
 * Handles slot system management endpoints
 * Admin/Staff operations for create, upload, delete
 * Read access for all authenticated users
 */
const { body, param } = require('express-validator');
const slotSystemService = require('../services/slotSystemService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation rules for creating a slot system
 */
const createValidation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Slot system name is required')
        .isLength({ max: 100 })
        .withMessage('Name must be less than 100 characters'),
    body('programType')
        .trim()
        .notEmpty()
        .withMessage('Program type is required (e.g., BTech, MTech, MBA)')
        .isLength({ max: 50 }),
    body('yearGroup')
        .optional()
        .trim()
        .isLength({ max: 50 }),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 }),
];

/**
 * Validation rules for uploading slots
 */
const uploadValidation = [
    param('id').isUUID().withMessage('Valid slot system ID is required'),
    body('slots')
        .isArray({ min: 1 })
        .withMessage('Slots array is required with at least one entry'),
    body('slots.*.slotCode')
        .trim()
        .notEmpty()
        .withMessage('Slot code is required'),
    body('slots.*.day')
        .trim()
        .notEmpty()
        .withMessage('Day is required'),
    body('slots.*.startTime')
        .matches(/^\d{2}:\d{2}$/)
        .withMessage('Start time must be in HH:MM format'),
    body('slots.*.endTime')
        .matches(/^\d{2}:\d{2}$/)
        .withMessage('End time must be in HH:MM format'),
];

/**
 * Validation for ID parameter
 */
const idValidation = [
    param('id').isUUID().withMessage('Valid slot system ID is required'),
];

/**
 * Create a new slot system
 * POST /api/slot-systems
 */
const create = asyncHandler(async (req, res) => {
    const slotSystem = await slotSystemService.create(req.body);

    res.status(201).json({
        success: true,
        message: 'Slot system created successfully',
        data: { slotSystem },
    });
});

/**
 * Upload slots to a slot system
 * POST /api/slot-systems/:id/upload
 */
const upload = asyncHandler(async (req, res) => {
    const result = await slotSystemService.uploadSlots(req.params.id, req.body.slots);

    res.status(200).json({
        success: true,
        message: `Processed ${result.totalProcessed} rows: ${result.inserted.length} inserted, ${result.errors.length} errors`,
        data: result,
    });
});

/**
 * Get all slot systems
 * GET /api/slot-systems
 */
const getAll = asyncHandler(async (req, res) => {
    const slotSystems = await slotSystemService.findAll();

    res.json({
        success: true,
        data: { slotSystems },
    });
});

/**
 * Get slot system by ID
 * GET /api/slot-systems/:id
 */
const getById = asyncHandler(async (req, res) => {
    const slotSystem = await slotSystemService.findById(req.params.id);

    res.json({
        success: true,
        data: { slotSystem },
    });
});

/**
 * Delete slot system
 * DELETE /api/slot-systems/:id
 */
const remove = asyncHandler(async (req, res) => {
    await slotSystemService.delete(req.params.id);

    res.json({
        success: true,
        message: 'Slot system deleted successfully',
    });
});

module.exports = {
    createValidation,
    uploadValidation,
    idValidation,
    create,
    upload,
    getAll,
    getById,
    remove,
};
