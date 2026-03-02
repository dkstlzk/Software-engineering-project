// allocation routes - for room booking policies and allocations
// admin/staff for create/update/delete, read access for all authenticated users
const express= require('express');
const router= express.Router();
const allocationController= require('../controllers/allocationController');
const { authenticate }= require('../middleware/auth');
const { isStaffOrAdmin, isAdmin, checkPermission }= require('../middleware/rbac');
const { validate }= require('../middleware/validation');

// all routes require authentication
router.use(authenticate);

// get booking policies for current user
router.get(
  '/policies',
  allocationController.getPolicies
);

// get all allocation policies (admin only)
router.get(
  '/policies/all',
  isAdmin,
  allocationController.getAllPolicies
);

// update allocation policy for a role (admin only)
router.put(
  '/policies/:roleName',
  isAdmin,
  allocationController.updatePolicyValidation,
  validate,
  allocationController.updatePolicyByRole
);

// validate booking against policies
router.post(
  '/validate-policy',
  allocationController.policyValidation,
  validate,
  allocationController.validatePolicy
);

// get room's weekly schedule
router.get(
  '/room/:roomId/weekly',
  checkPermission('allocations', 'read'),
  allocationController.weeklyScheduleValidation,
  validate,
  allocationController.getWeeklySchedule
);

// list allocations
router.get(
  '/',
  checkPermission('allocations', 'read'),
  allocationController.listValidation,
  validate,
  allocationController.getAll
);

// get allocation by ID
router.get(
  '/:id',
  checkPermission('allocations', 'read'),
  allocationController.getById
);

// create allocation - staff/admin only
router.post(
  '/',
  isStaffOrAdmin,
  allocationController.createValidation,
  validate,
  allocationController.create
);

// update allocation - staff/admin only
router.put(
  '/:id',
  isStaffOrAdmin,
  allocationController.updateValidation,
  validate,
  allocationController.update
);

// delete allocation - staff/admin only
router.delete(
  '/:id',
  isStaffOrAdmin,
  allocationController.remove
);

module.exports=router;
