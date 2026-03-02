/**
 * Allocation Controller
 * Handles room allocation endpoints
 * Implements booking policies and approval workflows
 */
const { body, param, query } = require('express-validator');
const allocationService = require('../services/allocationService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation rules for creating allocation
 */
const createValidation = [
  body('roomId')
    .isUUID()
    .withMessage('Valid room ID is required'),
  body('slotId')
    .isUUID()
    .withMessage('Valid slot ID is required'),
  body('courseId')
    .optional()
    .isUUID()
    .withMessage('Course ID must be a valid UUID'),
  body('instructorId')
    .optional()
    .isUUID()
    .withMessage('Instructor ID must be a valid UUID'),
  body('academicYearId')
    .optional()
    .isUUID()
    .withMessage('Academic year ID must be a valid UUID'),
  body('effectiveFrom')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Effective from date must be in YYYY-MM-DD format'),
  body('effectiveUntil')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Effective until date must be in YYYY-MM-DD format'),
];

/**
 * Validation rules for updating allocation
 */
const updateValidation = [
  param('id').isUUID().withMessage('Valid allocation ID is required'),
  body('roomId').optional().isUUID(),
  body('slotId').optional().isUUID(),
  body('courseId').optional().isUUID(),
  body('instructorId').optional().isUUID(),
  body('academicYearId').optional().isUUID(),
  body('effectiveFrom')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/),
  body('effectiveUntil')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/),
  body('isActive').optional().isBoolean(),
];

/**
 * Validation for list query
 */
const listValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('roomId').optional().isUUID(),
  query('courseId').optional().isUUID(),
  query('instructorId').optional().isUUID(),
  query('academicYearId').optional().isUUID(),
  query('isActive').optional().isBoolean().toBoolean(),
];

/**
 * Validation for policy check
 */
const policyValidation = [
  body('bookingDate')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Booking date must be in YYYY-MM-DD format'),
  body('startTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('End time must be in HH:MM format'),
  body('roomId')
    .isUUID()
    .withMessage('Valid room ID is required'),
  body('facultyVerifierId')
    .optional()
    .isUUID()
    .withMessage('Faculty verifier ID must be a valid UUID'),
];

/**
 * Validation for weekly schedule
 */
const weeklyScheduleValidation = [
  param('roomId').isUUID().withMessage('Valid room ID is required'),
  query('weekStart')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Week start must be in YYYY-MM-DD format'),
];

/**
 * Create a new allocation
 * POST /api/allocations
 * Admin/Staff only
 */
const create = asyncHandler(async (req, res) => {
  const allocation = await allocationService.createAllocation(req.body, req.user.userId);

  res.status(201).json({
    success: true,
    message: 'Allocation created successfully',
    data: { allocation },
  });
});

/**
 * Get all allocations
 * GET /api/allocations
 */
const getAll = asyncHandler(async (req, res) => {
  const result = await allocationService.findAll(req.query);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

/**
 * Get allocation by ID
 * GET /api/allocations/:id
 */
const getById = asyncHandler(async (req, res) => {
  const allocation = await allocationService.findById(req.params.id);

  res.json({
    success: true,
    data: { allocation },
  });
});

/**
 * Update allocation
 * PUT /api/allocations/:id
 * Admin/Staff only
 */
const update = asyncHandler(async (req, res) => {
  const allocation = await allocationService.update(
    req.params.id,
    req.body,
    req.user.userId
  );

  res.json({
    success: true,
    message: 'Allocation updated successfully',
    data: { allocation },
  });
});

/**
 * Delete allocation
 * DELETE /api/allocations/:id
 * Admin/Staff only
 */
const remove = asyncHandler(async (req, res) => {
  await allocationService.delete(req.params.id, req.user.userId);

  res.json({
    success: true,
    message: 'Allocation deleted successfully',
  });
});

/**
 * Validate booking against policies
 * POST /api/allocations/validate-policy
 * Returns whether a booking request complies with policies
 */
const validatePolicy = asyncHandler(async (req, res) => {
  const validation = await allocationService.validateBookingPolicy(req.body, req.user.role);

  res.json({
    success: true,
    data: validation,
  });
});

/**
 * Get policies for current user's role
 * GET /api/allocations/policies
 */
const getPolicies = asyncHandler(async (req, res) => {
  const policies = await allocationService.getPoliciesForRole(req.user.role);

  res.json({
    success: true,
    data: { policies },
  });
});

/**
 * Get room's weekly schedule
 * GET /api/allocations/room/:roomId/weekly
 */
const getWeeklySchedule = asyncHandler(async (req, res) => {
  const { weekStart } = req.query;
  const schedule = await allocationService.getRoomWeeklySchedule(
    req.params.roomId,
    weekStart || new Date().toISOString().split('T')[0]
  );

  res.json({
    success: true,
    data: schedule,
  });
});

/**
 * Get all allocation policies (admin view)
 * GET /api/allocations/policies/all
 */
const getAllPolicies = asyncHandler(async (req, res) => {
  const policies = await allocationService.getAllPolicies();

  res.json({
    success: true,
    data: { policies },
  });
});

/**
 * Update allocation policy for a role
 * PUT /api/allocations/policies/:roleName
 */
const updatePolicyValidation = [
  body('maxBookingDurationHours').optional().isInt({ min: 1 }),
  body('maxAdvanceBookingDays').optional().isInt({ min: 1 }),
  body('minNoticeHours').optional().isInt({ min: 0 }),
  body('approvalChain').optional().isArray(),
  body('maxConcurrentBookings').optional().isInt({ min: 1 }),
  body('allowedRoomTypes').optional().isArray(),
  body('priorityLevel').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean(),
];

const updatePolicyByRole = asyncHandler(async (req, res) => {
  const policy = await allocationService.updatePolicy(
    req.params.roleName,
    req.body,
    req.user.userId
  );

  res.json({
    success: true,
    message: 'Allocation policy updated successfully',
    data: policy,
  });
});

module.exports = {
  createValidation,
  updateValidation,
  listValidation,
  policyValidation,
  weeklyScheduleValidation,
  updatePolicyValidation,
  create,
  getAll,
  getById,
  update,
  remove,
  validatePolicy,
  getPolicies,
  getAllPolicies,
  updatePolicyByRole,
  getWeeklySchedule,
};
