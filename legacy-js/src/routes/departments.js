/**
 * Department Routes
 * Admin-only for create/update/delete
 * Read access for all authenticated users
 */
const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { authenticate } = require('../middleware/auth');
const { isAdmin, checkPermission } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// List departments - read access for all
router.get(
  '/',
  checkPermission('departments', 'read'),
  departmentController.listValidation,
  validate,
  departmentController.getAll
);

// Get department by ID
router.get(
  '/:id',
  checkPermission('departments', 'read'),
  departmentController.idValidation,
  validate,
  departmentController.getById
);

// Get department statistics
router.get(
  '/:id/statistics',
  checkPermission('departments', 'read'),
  departmentController.idValidation,
  validate,
  departmentController.getStatistics
);

// Create department - admin only
router.post(
  '/',
  isAdmin,
  departmentController.createValidation,
  validate,
  departmentController.create
);

// Update department - admin only
router.put(
  '/:id',
  isAdmin,
  departmentController.updateValidation,
  validate,
  departmentController.update
);

// Soft delete department - admin only
router.delete(
  '/:id',
  isAdmin,
  departmentController.idValidation,
  validate,
  departmentController.remove
);

// Hard delete department - admin only with confirmation
router.delete(
  '/:id/permanent',
  isAdmin,
  departmentController.idValidation,
  validate,
  departmentController.hardDelete
);

module.exports = router;
