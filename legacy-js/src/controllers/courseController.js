/**
 * Course Controller
 * Handles course management and slot system mapping endpoints
 */
const { body, param, query } = require('express-validator');
const courseService = require('../services/courseService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation rules for creating a course
 */
const createValidation = [
    body('courseCode')
        .trim()
        .notEmpty()
        .withMessage('Course code is required')
        .isLength({ max: 20 }),
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Course name is required')
        .isLength({ max: 200 }),
    body('slotSystemId')
        .isUUID()
        .withMessage('Valid slot system ID is required'),
    body('departmentId')
        .optional()
        .isUUID()
        .withMessage('Department ID must be a valid UUID'),
    body('credits')
        .optional()
        .isInt({ min: 1, max: 12 }),
    body('instructor')
        .optional()
        .trim()
        .isLength({ max: 200 }),
    body('studentCount')
        .optional()
        .isInt({ min: 0 }),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 }),
];

/**
 * Validation for mapping course to slot system
 */
const mapSlotSystemValidation = [
    body('courseId')
        .isUUID()
        .withMessage('Valid course ID is required'),
    body('slotSystemId')
        .isUUID()
        .withMessage('Valid slot system ID is required'),
];

/**
 * Validation for ID parameter
 */
const idValidation = [
    param('id').isUUID().withMessage('Valid course ID is required'),
];

/**
 * Validation for list query
 */
const listValidation = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('slotSystemId').optional().isUUID(),
    query('departmentId').optional().isUUID(),
];

/**
 * Create a new course
 * POST /api/courses
 */
const create = asyncHandler(async (req, res) => {
    const course = await courseService.create(req.body);

    res.status(201).json({
        success: true,
        message: 'Course created successfully',
        data: { course },
    });
});

/**
 * Map course to slot system
 * POST /api/courses/map-slot-system
 */
const mapSlotSystem = asyncHandler(async (req, res) => {
    const { courseId, slotSystemId } = req.body;
    const course = await courseService.mapSlotSystem(courseId, slotSystemId);

    res.json({
        success: true,
        message: 'Course mapped to slot system successfully',
        data: { course },
    });
});

/**
 * Get all courses
 * GET /api/courses
 */
const getAll = asyncHandler(async (req, res) => {
    const result = await courseService.findAll(req.query);

    res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
    });
});

/**
 * Get course by ID
 * GET /api/courses/:id
 */
const getById = asyncHandler(async (req, res) => {
    const course = await courseService.findById(req.params.id);

    res.json({
        success: true,
        data: { course },
    });
});

module.exports = {
    createValidation,
    mapSlotSystemValidation,
    idValidation,
    listValidation,
    create,
    mapSlotSystem,
    getAll,
    getById,
};
