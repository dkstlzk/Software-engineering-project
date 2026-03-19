/**
 * Inventory Controller
 * Handles room inventory management endpoints
 * Staff can create/update/delete inventory items
 */
const { body, param, query } = require('express-validator');
const inventoryService = require('../services/inventoryService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation rules for creating inventory item
 */
const createValidation = [
  param('roomId').isUUID().withMessage('Valid room ID is required'),
  body('itemName')
    .trim()
    .notEmpty()
    .withMessage('Item name is required')
    .isLength({ max: 100 })
    .withMessage('Item name must be less than 100 characters'),
  body('itemDescription')
    .optional()
    .trim()
    .isLength({ max: 500 }),
  body('quantity')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Quantity must be a non-negative integer'),
  body('status')
    .optional()
    .isIn(['available', 'in_use', 'maintenance', 'damaged'])
    .withMessage('Invalid status'),
  body('serialNumber')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  body('purchaseDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid purchase date'),
  body('warrantyExpiry')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid warranty expiry date'),
  body('lastMaintenance')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid last maintenance date'),
  body('nextMaintenance')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid next maintenance date'),
];

/**
 * Validation rules for updating inventory item
 */
const updateValidation = [
  param('id').isUUID().withMessage('Valid item ID is required'),
  body('itemName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }),
  body('itemDescription')
    .optional()
    .trim()
    .isLength({ max: 500 }),
  body('quantity')
    .optional()
    .isInt({ min: 0 }),
  body('status')
    .optional()
    .isIn(['available', 'in_use', 'maintenance', 'damaged']),
  body('serialNumber')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  body('purchaseDate')
    .optional()
    .isISO8601()
    .toDate(),
  body('warrantyExpiry')
    .optional()
    .isISO8601()
    .toDate(),
  body('lastMaintenance')
    .optional()
    .isISO8601()
    .toDate(),
  body('nextMaintenance')
    .optional()
    .isISO8601()
    .toDate(),
];

/**
 * Validation for listing items
 */
const listValidation = [
  param('roomId').isUUID().withMessage('Valid room ID is required'),
  query('status')
    .optional()
    .isIn(['available', 'in_use', 'maintenance', 'damaged']),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 }),
];

/**
 * Add item to room inventory
 * POST /api/rooms/:roomId/inventory
 * Staff only
 */
const addItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.addItem(
    req.params.roomId,
    req.body,
    req.user.userId
  );

  res.status(201).json({
    success: true,
    message: 'Inventory item added successfully',
    data: { item },
  });
});

/**
 * Get room inventory
 * GET /api/rooms/:roomId/inventory
 */
const getRoomInventory = asyncHandler(async (req, res) => {
  const items = await inventoryService.getByRoom(req.params.roomId, req.query);

  res.json({
    success: true,
    data: { items },
  });
});

/**
 * Get inventory item by ID
 * GET /api/inventory/:id
 */
const getById = asyncHandler(async (req, res) => {
  const item = await inventoryService.findById(req.params.id);

  res.json({
    success: true,
    data: { item },
  });
});

/**
 * Update inventory item
 * PUT /api/inventory/:id
 * Staff only
 */
const update = asyncHandler(async (req, res) => {
  const item = await inventoryService.update(
    req.params.id,
    req.body,
    req.user.userId
  );

  res.json({
    success: true,
    message: 'Inventory item updated successfully',
    data: { item },
  });
});

/**
 * Delete inventory item
 * DELETE /api/inventory/:id
 * Staff only
 */
const remove = asyncHandler(async (req, res) => {
  await inventoryService.delete(req.params.id, req.user.userId);

  res.json({
    success: true,
    message: 'Inventory item deleted successfully',
  });
});

/**
 * Update item status
 * PATCH /api/inventory/:id/status
 * Staff only
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const item = await inventoryService.updateStatus(
    req.params.id,
    status,
    req.user.userId
  );

  res.json({
    success: true,
    message: 'Status updated successfully',
    data: { item },
  });
});

/**
 * Get items needing maintenance
 * GET /api/inventory/maintenance-due
 * Staff only
 */
const getMaintenanceDue = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const items = await inventoryService.getMaintenanceDue(parseInt(days));

  res.json({
    success: true,
    data: { items },
  });
});

/**
 * Get room inventory summary
 * GET /api/rooms/:roomId/inventory/summary
 */
const getRoomSummary = asyncHandler(async (req, res) => {
  const summary = await inventoryService.getRoomSummary(req.params.roomId);

  res.json({
    success: true,
    data: { summary },
  });
});

module.exports = {
  createValidation,
  updateValidation,
  listValidation,
  addItem,
  getRoomInventory,
  getById,
  update,
  remove,
  updateStatus,
  getMaintenanceDue,
  getRoomSummary,
};
