/**
 * Department Controller
 * Handles department management endpoints
 * Admin-only operations as per SRS requirements
 */
const { body, param, query } = require('express-validator');
const departmentService = require('../services/departmentService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation rules for creating department
 */
const createValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Department name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be less than 100 characters'),
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Department code is required')
    .isLength({ max: 20 })
    .withMessage('Code must be less than 20 characters')
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage('Code must be alphanumeric'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('headId')
    .optional()
    .isUUID()
    .withMessage('Head ID must be a valid UUID'),
  body('contactEmail')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('contactPhone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number is required'),
];

/**
 * Validation rules for updating department
 */
const updateValidation = [
  param('id').isUUID().withMessage('Valid department ID is required'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be 1-100 characters'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage('Code must be alphanumeric'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }),
  body('headId')
    .optional()
    .isUUID(),
  body('contactEmail')
    .optional()
    .isEmail()
    .normalizeEmail(),
  body('contactPhone')
    .optional()
    .isMobilePhone(),
  body('isActive')
    .optional()
    .isBoolean(),
];

/**
 * Validation for list query
 */
const listValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  query('isActive')
    .optional()
    .isBoolean()
    .toBoolean(),
];

/**
 * Validation for ID parameter
 */
const idValidation = [
  param('id').isUUID().withMessage('Valid department ID is required'),
];

/**
 * Create a new department
 * POST /api/departments
 * Admin only
 */
const create = asyncHandler(async (req, res) => {
  const department = await departmentService.create(req.body, req.user.userId);

  res.status(201).json({
    success: true,
    message: 'Department created successfully',
    data: { department },
  });
});

/**
 * Get all departments
 * GET /api/departments
 * Accessible by all authenticated users (read permission)
 */
const getAll = asyncHandler(async (req, res) => {
  const { page, limit, search, isActive } = req.query;

  const result = await departmentService.findAll({
    page: page || 1,
    limit: limit || 20,
    search: search || '',
    isActive: isActive !== undefined ? isActive : true,
  });

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

/**
 * Get department by ID
 * GET /api/departments/:id
 */
const getById = asyncHandler(async (req, res) => {
  const department = await departmentService.findById(req.params.id);

  res.json({
    success: true,
    data: { department },
  });
});

/**
 * Update department
 * PUT /api/departments/:id
 * Admin only
 */
const update = asyncHandler(async (req, res) => {
  const department = await departmentService.update(
    req.params.id,
    req.body,
    req.user.userId
  );

  res.json({
    success: true,
    message: 'Department updated successfully',
    data: { department },
  });
});

/**
 * Delete department (soft delete)
 * DELETE /api/departments/:id
 * Admin only
 */
const remove = asyncHandler(async (req, res) => {
  await departmentService.delete(req.params.id, req.user.userId);

  res.json({
    success: true,
    message: 'Department deleted successfully',
  });
});

/**
 * Hard delete department (with confirmation)
 * DELETE /api/departments/:id/permanent
 * Admin only with confirmation code
 */
const hardDelete = asyncHandler(async (req, res) => {
  const { confirmationCode } = req.body;

  await departmentService.hardDelete(
    req.params.id,
    req.user.userId,
    confirmationCode
  );

  res.json({
    success: true,
    message: 'Department permanently deleted',
  });
});

/**
 * Get department statistics
 * GET /api/departments/:id/statistics
 */
const getStatistics = asyncHandler(async (req, res) => {
  const statistics = await departmentService.getStatistics(req.params.id);

  res.json({
    success: true,
    data: { statistics },
  });
});

module.exports = {
  createValidation,
  updateValidation,
  listValidation,
  idValidation,
  create,
  getAll,
  getById,
  update,
  remove,
  hardDelete,
  getStatistics,
};
