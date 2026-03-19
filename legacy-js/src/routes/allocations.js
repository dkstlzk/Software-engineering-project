/**
 * Allocation Routes
 * Admin/Staff for create/update/delete
 * Read access for all authenticated users
 */
const express = require('express');
const router = express.Router();
const allocationController = require('../controllers/allocationController');
const { authenticate } = require('../middleware/auth');
const { isStaffOrAdmin, isAdmin, checkPermission } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Get booking policies for current user
router.get(
  '/policies',
  allocationController.getPolicies
);

// Get all allocation policies (admin only)
router.get(
  '/policies/all',
  isAdmin,
  allocationController.getAllPolicies
);

// Update allocation policy for a role (admin only)
router.put(
  '/policies/:roleName',
  isAdmin,
  allocationController.updatePolicyValidation,
  validate,
  allocationController.updatePolicyByRole
);

// Validate booking against policies
router.post(
  '/validate-policy',
  allocationController.policyValidation,
  validate,
  allocationController.validatePolicy
);

// Get room's weekly schedule
router.get(
  '/room/:roomId/weekly',
  checkPermission('allocations', 'read'),
  allocationController.weeklyScheduleValidation,
  validate,
  allocationController.getWeeklySchedule
);

// List allocations
router.get(
  '/',
  checkPermission('allocations', 'read'),
  allocationController.listValidation,
  validate,
  allocationController.getAll
);

// Get allocation by ID
router.get(
  '/:id',
  checkPermission('allocations', 'read'),
  allocationController.getById
);

// Create allocation - staff/admin only
router.post(
  '/',
  isStaffOrAdmin,
  allocationController.createValidation,
  validate,
  allocationController.create
);

// Update allocation - staff/admin only
router.put(
  '/:id',
  isStaffOrAdmin,
  allocationController.updateValidation,
  validate,
  allocationController.update
);

// Delete allocation - staff/admin only
router.delete(
  '/:id',
  isStaffOrAdmin,
  allocationController.remove
);

module.exports = router;
