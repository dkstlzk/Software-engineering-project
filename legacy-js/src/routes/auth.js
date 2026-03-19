/**
 * Authentication Routes
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/rbac');
const { validate } = require('../middleware/validation');

// Public routes
router.post(
  '/login',
  authController.loginValidation,
  validate,
  authController.login
);

router.post('/refresh', authController.refreshToken);

// Protected routes
router.post(
  '/register',
  authenticate,
  isAdmin,
  authController.registerValidation,
  validate,
  authController.register
);

router.post('/logout', authenticate, authController.logout);

router.post('/logout-all', authenticate, authController.logoutAll);

router.get('/me', authenticate, authController.getProfile);

router.post(
  '/change-password',
  authenticate,
  authController.changePasswordValidation,
  validate,
  authController.changePassword
);

module.exports = router;
