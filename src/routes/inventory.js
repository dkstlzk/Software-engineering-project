// inventory routes - for individual inventory item operations
const express= require('express');
const router= express.Router();
const inventoryController= require('../controllers/inventoryController');
const { authenticate }= require('../middleware/auth');
const { isStaffOrAdmin, checkPermission }= require('../middleware/rbac');
const { validate }= require('../middleware/validation');
const { param, query, body }= require('express-validator');

// all routes require authentication
router.use(authenticate);

// get items needing maintenance - staff/admin only
router.get(
  '/maintenance-due',
  isStaffOrAdmin,
  [query('days').optional().isInt({ min: 1, max: 365 }).toInt()],
  validate,
  inventoryController.getMaintenanceDue
);

// get inventory item by ID
router.get(
  '/:id',
  checkPermission('inventory', 'read'),
  [param('id').isUUID().withMessage('Valid item ID is required')],
  validate,
  inventoryController.getById
);

// update inventory item - staff/admin only
router.put(
  '/:id',
  isStaffOrAdmin,
  inventoryController.updateValidation,
  validate,
  inventoryController.update
);

// update item status - staff/admin only
router.patch(
  '/:id/status',
  isStaffOrAdmin,
  [
    param('id').isUUID().withMessage('Valid item ID is required'),
    body('status')
      .isIn(['available', 'in_use', 'maintenance', 'damaged'])
      .withMessage('Invalid status'),
  ],
  validate,
  inventoryController.updateStatus
);

// delete inventory item - staff/admin only
router.delete(
  '/:id',
  isStaffOrAdmin,
  [param('id').isUUID().withMessage('Valid item ID is required')],
  validate,
  inventoryController.remove
);

module.exports=router;
