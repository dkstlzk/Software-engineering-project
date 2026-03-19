/**
 * Authentication Middleware
 * Validates JWT tokens and attaches user information to requests
 * Implements NFR-5.3.1: Role-based system security
 */
const tokenService = require('../services/tokenService');
const logger = require('../utils/logger');

/**
 * Authenticate JWT token
 * Extracts and validates token from Authorization header
 */
const authenticate = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid token.',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token via TokenService
    const decoded = tokenService.validateToken(token);

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions,
      departmentId: decoded.departmentId,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token has expired. Please login again.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Please login again.',
      });
    }

    logger.error('Authentication error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 * Useful for endpoints that have different behavior for authenticated vs anonymous users
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = tokenService.validateToken(token);

      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions,
        departmentId: decoded.departmentId,
      };
    }

    next();
  } catch (error) {
    // Token invalid/expired but we continue without user context
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth,
};
