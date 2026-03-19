/**
 * Room Controller
 * Handles room management endpoints
 * Admin/Staff operations for create/update/delete
 * Read access for all authenticated users
 */
const { body, param, query } = require('express-validator');
const roomService = require('../services/roomService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation rules for creating room
 */
const createValidation = [
  body('roomNumber')
    .trim()
    .notEmpty()
    .withMessage('Room number is required')
    .isLength({ max: 50 })
    .withMessage('Room number must be less than 50 characters'),
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name must be less than 100 characters'),
  body('buildingId')
    .isUUID()
    .withMessage('Valid building ID is required'),
  body('departmentId')
    .optional()
    .isUUID()
    .withMessage('Department ID must be a valid UUID'),
  body('floor')
    .optional()
    .isInt({ min: -5, max: 100 })
    .withMessage('Floor must be a valid number'),
  body('capacity')
    .isInt({ min: 1, max: 10000 })
    .withMessage('Capacity must be between 1 and 10000'),
  body('roomType')
    .optional()
    .isIn(['lecture_hall', 'classroom', 'lab', 'seminar_room', 'conference_room', 'auditorium'])
    .withMessage('Invalid room type'),
  body('hasProjector').optional().isBoolean(),
  body('hasWhiteboard').optional().isBoolean(),
  body('hasAc').optional().isBoolean(),
  body('hasMic').optional().isBoolean(),
  body('hasVideoConferencing').optional().isBoolean(),
  body('isAccessible').optional().isBoolean(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }),
];

/**
 * Validation rules for updating room
 */
const updateValidation = [
  param('id').isUUID().withMessage('Valid room ID is required'),
  body('roomNumber')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }),
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  body('buildingId')
    .optional()
    .isUUID(),
  body('departmentId')
    .optional()
    .isUUID(),
  body('floor')
    .optional()
    .isInt({ min: -5, max: 100 }),
  body('capacity')
    .optional()
    .isInt({ min: 1, max: 10000 }),
  body('roomType')
    .optional()
    .isIn(['lecture_hall', 'classroom', 'lab', 'seminar_room', 'conference_room', 'auditorium']),
  body('hasProjector').optional().isBoolean(),
  body('hasWhiteboard').optional().isBoolean(),
  body('hasAc').optional().isBoolean(),
  body('hasMic').optional().isBoolean(),
  body('hasVideoConferencing').optional().isBoolean(),
  body('isAccessible').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }),
];

/**
 * Validation for list query
 */
const listValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 100 }),
  query('buildingId').optional().isUUID(),
  query('departmentId').optional().isUUID(),
  query('roomType')
    .optional()
    .isIn(['lecture_hall', 'classroom', 'lab', 'seminar_room', 'conference_room', 'auditorium']),
  query('minCapacity').optional().isInt({ min: 1 }).toInt(),
  query('maxCapacity').optional().isInt({ min: 1 }).toInt(),
  query('hasProjector').optional().isBoolean().toBoolean(),
  query('hasMic').optional().isBoolean().toBoolean(),
  query('isAccessible').optional().isBoolean().toBoolean(),
  query('isActive').optional().isBoolean().toBoolean(),
];

/**
 * Validation for availability check
 */
const availabilityValidation = [
  param('id').isUUID().withMessage('Valid room ID is required'),
  query('date')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Date must be in YYYY-MM-DD format'),
  query('startTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Start time must be in HH:MM format'),
  query('endTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('End time must be in HH:MM format'),
];

/**
 * Validation for finding available rooms
 */
const findAvailableValidation = [
  query('date')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Date must be in YYYY-MM-DD format'),
  query('startTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Start time must be in HH:MM format'),
  query('endTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('End time must be in HH:MM format'),
  query('minCapacity').optional().isInt({ min: 1 }).toInt(),
  query('roomType')
    .optional()
    .isIn(['lecture_hall', 'classroom', 'lab', 'seminar_room', 'conference_room', 'auditorium']),
  query('hasProjector').optional().isBoolean().toBoolean(),
  query('hasMic').optional().isBoolean().toBoolean(),
  query('buildingId').optional().isUUID(),
  query('excludeRoomId').optional().isUUID(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

/**
 * Validation for ID parameter
 */
const idValidation = [
  param('id').isUUID().withMessage('Valid room ID is required'),
];

/**
 * Create a new room
 * POST /api/rooms
 * Admin/Staff only
 */
const create = asyncHandler(async (req, res) => {
  const room = await roomService.create(req.body, req.user.userId);

  res.status(201).json({
    success: true,
    message: 'Room created successfully',
    data: { room },
  });
});

/**
 * Get all rooms
 * GET /api/rooms
 * Accessible by all authenticated users
 */
const getAll = asyncHandler(async (req, res) => {
  const result = await roomService.findAll(req.query);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

/**
 * Get room by ID
 * GET /api/rooms/:id
 */
const getById = asyncHandler(async (req, res) => {
  const room = await roomService.findById(req.params.id);

  res.json({
    success: true,
    data: { room },
  });
});

/**
 * Update room
 * PUT /api/rooms/:id
 * Admin/Staff only
 */
const update = asyncHandler(async (req, res) => {
  const room = await roomService.update(req.params.id, req.body, req.user.userId);

  res.json({
    success: true,
    message: 'Room updated successfully',
    data: { room },
  });
});

/**
 * Delete room (soft delete)
 * DELETE /api/rooms/:id
 * Admin/Staff only
 */
const remove = asyncHandler(async (req, res) => {
  await roomService.delete(req.params.id, req.user.userId);

  res.json({
    success: true,
    message: 'Room deleted successfully',
  });
});

/**
 * Check room availability
 * GET /api/rooms/:id/availability
 * REQ-4.1.1: Real-time room availability
 */
const checkAvailability = asyncHandler(async (req, res) => {
  const { date, startTime, endTime } = req.query;
  const availability = await roomService.checkAvailability(
    req.params.id,
    date,
    startTime,
    endTime
  );

  res.json({
    success: true,
    data: availability,
  });
});

/**
 * Get room's day schedule
 * GET /api/rooms/:id/schedule
 */
const getDaySchedule = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const schedule = await roomService.getDayAvailability(
    req.params.id,
    date || new Date().toISOString().split('T')[0]
  );

  res.json({
    success: true,
    data: schedule,
  });
});

/**
 * Find available rooms matching criteria
 * GET /api/rooms/available
 * REQ-4.1.9: Suggest alternative rooms
 */
const findAvailable = asyncHandler(async (req, res) => {
  const rooms = await roomService.findAvailableRooms(req.query);

  res.json({
    success: true,
    data: { rooms },
  });
});

module.exports = {
  createValidation,
  updateValidation,
  listValidation,
  availabilityValidation,
  findAvailableValidation,
  idValidation,
  create,
  getAll,
  getById,
  update,
  remove,
  checkAvailability,
  getDaySchedule,
  findAvailable,
};
