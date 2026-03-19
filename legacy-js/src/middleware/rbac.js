/**
 * Role-Based Access Control (RBAC) Middleware
 * Implements permission checking based on user roles
 * Based on SRS Section 2.3 User Classes and NFR-5.3.1
 * 
 * Role Hierarchy:
 * - Admin: Full system access, conflict resolution
 * - Staff (LHC Staff): Room management, booking approvals
 * - Faculty: Room requests, student request verification
 * - Student: Room booking requests (requires faculty verification)
 */
const logger = require('../utils/logger');
const permissionService = require('../services/permissionService');

/**
 * Permission check middleware factory
 * Delegates to PermissionService for centralized role-permission resolution.
 * @param {string} resource - Resource name (e.g., 'rooms', 'bookings')
 * @param {string} action - Action type (e.g., 'create', 'read', 'update', 'delete')
 * @returns {Function} Express middleware
 */
const checkPermission = (resource, action) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const { permissions, role } = req.user;

      // Delegate permission check to PermissionService
      if (!permissionService.hasAccess(role, resource, action, permissions)) {
        logger.warn('Permission denied', {
          userId: req.user.userId,
          role,
          resource,
          action,
        });

        return res.status(403).json({
          success: false,
          error: `Access denied. You do not have permission to ${action} ${resource}.`,
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Permission verification failed',
      });
    }
  };
};

/**
 * Role check middleware factory
 * @param {...string} allowedRoles - Allowed role names
 * @returns {Function} Express middleware
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const { role } = req.user;

      if (!allowedRoles.includes(role)) {
        logger.warn('Role check failed', {
          userId: req.user.userId,
          role,
          required: allowedRoles,
        });

        return res.status(403).json({
          success: false,
          error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        });
      }

      next();
    } catch (error) {
      logger.error('Role check error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Role verification failed',
      });
    }
  };
};

/**
 * Check if user is admin
 */
const isAdmin = requireRole('admin');

/**
 * Check if user is staff or admin
 */
const isStaffOrAdmin = requireRole('admin', 'staff');

/**
 * Check if user is faculty or higher (faculty, staff, admin)
 */
const isFacultyOrHigher = requireRole('admin', 'staff', 'faculty');

/**
 * Check if user can verify student requests (faculty only)
 */
const canVerifyStudentRequests = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const { role } = req.user;

  // Delegate to PermissionService
  if (permissionService.canVerifyStudentRequests(role)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Only faculty members can verify student booking requests',
  });
};

/**
 * Check if user can approve/reject booking requests (staff or admin)
 */
const canApproveBookings = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const { role } = req.user;

  // Delegate to PermissionService
  if (permissionService.canApproveBookings(role)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Only staff members can approve or reject booking requests',
  });
};

/**
 * Check if user can resolve booking conflicts (admin only)
 */
const canResolveConflicts = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const { role } = req.user;

  // Delegate to PermissionService
  if (permissionService.canResolveConflicts(role)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Only administrators can resolve booking conflicts',
  });
};

/**
 * Check ownership or admin access
 * For operations where users can access their own resources or admin can access all
 * @param {Function} getOwnerId - Function to extract owner ID from request
 * @returns {Function} Express middleware
 */
const checkOwnershipOrAdmin = (getOwnerId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Admin can access all resources
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user owns the resource
      const ownerId = await getOwnerId(req);
      
      if (ownerId === req.user.userId) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access your own resources.',
      });
    } catch (error) {
      logger.error('Ownership check error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Ownership verification failed',
      });
    }
  };
};

/**
 * Middleware to check department-level access
 * Users can only access resources in their own department (except admin)
 * @param {Function} getDepartmentId - Function to extract department ID from request
 * @returns {Function} Express middleware
 */
const checkDepartmentAccess = (getDepartmentId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Admin and staff can access all departments
      if (req.user.role === 'admin' || req.user.role === 'staff') {
        return next();
      }

      // Check department access
      const resourceDeptId = await getDepartmentId(req);
      
      // If no department restriction on resource, allow access
      if (!resourceDeptId) {
        return next();
      }

      // Check if user belongs to the same department
      if (resourceDeptId === req.user.departmentId) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access resources in your department.',
      });
    } catch (error) {
      logger.error('Department access check error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Department access verification failed',
      });
    }
  };
};

/**
 * Permission definitions for reference
 * These match the permissions structure in seed.js
 */
const PERMISSIONS = {
  USERS: {
    CREATE: 'users:create',
    READ: 'users:read',
    UPDATE: 'users:update',
    DELETE: 'users:delete',
  },
  DEPARTMENTS: {
    CREATE: 'departments:create',
    READ: 'departments:read',
    UPDATE: 'departments:update',
    DELETE: 'departments:delete',
  },
  ROOMS: {
    CREATE: 'rooms:create',
    READ: 'rooms:read',
    UPDATE: 'rooms:update',
    DELETE: 'rooms:delete',
  },
  BUILDINGS: {
    CREATE: 'buildings:create',
    READ: 'buildings:read',
    UPDATE: 'buildings:update',
    DELETE: 'buildings:delete',
  },
  INVENTORY: {
    CREATE: 'inventory:create',
    READ: 'inventory:read',
    UPDATE: 'inventory:update',
    DELETE: 'inventory:delete',
  },
  ALLOCATIONS: {
    CREATE: 'allocations:create',
    READ: 'allocations:read',
    UPDATE: 'allocations:update',
    DELETE: 'allocations:delete',
    REQUEST_CHANGE: 'allocations:request_change',
  },
  BOOKINGS: {
    CREATE: 'bookings:create',
    READ: 'bookings:read',
    UPDATE: 'bookings:update',
    DELETE: 'bookings:delete',
    APPROVE: 'bookings:approve',
    REJECT: 'bookings:reject',
    VERIFY_STUDENT: 'bookings:verify_student',
    RESOLVE_CONFLICTS: 'bookings:resolve_conflicts',
  },
};

module.exports = {
  checkPermission,
  requireRole,
  isAdmin,
  isStaffOrAdmin,
  isFacultyOrHigher,
  canVerifyStudentRequests,
  canApproveBookings,
  canResolveConflicts,
  checkOwnershipOrAdmin,
  checkDepartmentAccess,
  PERMISSIONS,
};
