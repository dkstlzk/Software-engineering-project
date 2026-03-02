/**
 * Authentication Controller
 * Handles user authentication endpoints
 */
const { body } = require('express-validator');
const authService = require('../services/authService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Validation rules for login
 */
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/**
 * Validation rules for registration
 */
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 100 })
    .withMessage('First name must be less than 100 characters'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 100 })
    .withMessage('Last name must be less than 100 characters'),
  body('roleId')
    .isUUID()
    .withMessage('Valid role ID is required'),
  body('departmentId')
    .optional()
    .isUUID()
    .withMessage('Department ID must be a valid UUID'),
  body('employeeId')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Employee ID must be less than 50 characters'),
  body('studentId')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Student ID must be less than 50 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number is required'),
];

/**
 * Validation rules for password change
 */
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
];

/**
 * Login user
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await authService.login(email, password);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

/**
 * Register new user (admin only)
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body, req.user?.userId);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: { user },
  });
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token is required',
    });
  }

  const result = await authService.refreshAccessToken(refreshToken);

  res.json({
    success: true,
    data: {
      accessToken: result.accessToken,
    },
  });
});

/**
 * Logout user
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await authService.logout(refreshToken, req.user.userId);
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * Logout from all devices
 * POST /api/auth/logout-all
 */
const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.userId);

  res.json({
    success: true,
    message: 'Logged out from all devices',
  });
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.user.userId);

  res.json({
    success: true,
    data: { user },
  });
});

/**
 * Change password
 * POST /api/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(req.user.userId, currentPassword, newPassword);

  res.json({
    success: true,
    message: 'Password changed successfully. Please login again.',
  });
});

module.exports = {
  loginValidation,
  registerValidation,
  changePasswordValidation,
  login,
  register,
  refreshToken,
  logout,
  logoutAll,
  getProfile,
  changePassword,
};
