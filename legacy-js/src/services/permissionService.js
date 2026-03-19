/**
 * Permission Service
 * Centralized permission checking and access control logic
 * As per class diagram: PermissionService / RolePermissionMatrix classes
 * 
 * Methods (from UML):
 * - checkPermission(userId, resource, action): boolean
 * - hasAccess(role, resource, action): boolean
 * - getRolePermissions(roleName): Object
 * - validateAccess(permissions, resource, action): boolean
 * - getPermissionMatrix(): Object
 * - isResourceOwner(userId, resourceOwnerId): boolean
 * - canAccessDepartment(userRole, userDeptId, resourceDeptId): boolean
 */
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Role Permission Matrix
 * Defines all permissions per role as per class diagram RolePermissionMatrix
 * 
 * Roles: admin, staff, faculty, student
 * Resources: users, departments, rooms, buildings, inventory, allocations, bookings, etc.
 * Actions: create, read, update, delete, approve, reject, verify_student, resolve_conflicts
 */
const ROLE_PERMISSION_MATRIX = {
  admin: {
    users: { create: true, read: true, update: true, delete: true },
    departments: { create: true, read: true, update: true, delete: true },
    rooms: { create: true, read: true, update: true, delete: true },
    buildings: { create: true, read: true, update: true, delete: true },
    inventory: { create: true, read: true, update: true, delete: true },
    allocations: { create: true, read: true, update: true, delete: true },
    bookings: {
      create: true, read: true, update: true, delete: true,
      approve: true, reject: true, resolve_conflicts: true,
    },
    courses: { create: true, read: true, update: true, delete: true },
    slots: { create: true, read: true, update: true, delete: true },
    academic_years: { create: true, read: true, update: true, delete: true },
    holidays: { create: true, read: true, update: true, delete: true },
    timetable: { upload: true, read: true },
    audit_logs: { read: true },
    notifications: { create: true, read: true, broadcast: true },
    reports: { generate: true, read: true },
    allocation_policies: { create: true, read: true, update: true, delete: true },
  },
  staff: {
    users: { create: false, read: true, update: false, delete: false },
    departments: { create: false, read: true, update: false, delete: false },
    rooms: { create: true, read: true, update: true, delete: false },
    buildings: { create: false, read: true, update: false, delete: false },
    inventory: { create: true, read: true, update: true, delete: true },
    allocations: { create: true, read: true, update: true, delete: false },
    bookings: {
      create: true, read: true, update: false, delete: false,
      approve: true, reject: true, resolve_conflicts: false,
    },
    courses: { create: false, read: true, update: false, delete: false },
    slots: { create: true, read: true, update: true, delete: false },
    academic_years: { create: false, read: true, update: false, delete: false },
    holidays: { create: false, read: true, update: false, delete: false },
    notifications: { create: true, read: true, broadcast: false },
    reports: { generate: true, read: true },
    allocation_policies: { create: false, read: true, update: false, delete: false },
  },
  faculty: {
    users: { create: false, read: true, update: false, delete: false },
    departments: { create: false, read: true, update: false, delete: false },
    rooms: { create: false, read: true, update: false, delete: false },
    buildings: { create: false, read: true, update: false, delete: false },
    inventory: { create: false, read: true, update: false, delete: false },
    allocations: { create: false, read: true, update: false, delete: false, request_change: true },
    bookings: {
      create: true, read: true, update: false, delete: false,
      approve: false, reject: false, verify_student: true, resolve_conflicts: false,
    },
    courses: { create: false, read: true, update: false, delete: false },
    slots: { create: false, read: true, update: false, delete: false },
    academic_years: { create: false, read: true, update: false, delete: false },
    holidays: { create: false, read: true, update: false, delete: false },
    notifications: { create: false, read: true, broadcast: false },
    allocation_policies: { create: false, read: true, update: false, delete: false },
  },
  student: {
    users: { create: false, read: false, update: false, delete: false },
    departments: { create: false, read: true, update: false, delete: false },
    rooms: { create: false, read: true, update: false, delete: false },
    buildings: { create: false, read: true, update: false, delete: false },
    inventory: { create: false, read: true, update: false, delete: false },
    allocations: { create: false, read: true, update: false, delete: false },
    bookings: {
      create: true, read: true, update: false, delete: false,
      approve: false, reject: false, verify_student: false, resolve_conflicts: false,
    },
    courses: { create: false, read: true, update: false, delete: false },
    slots: { create: false, read: true, update: false, delete: false },
    academic_years: { create: false, read: true, update: false, delete: false },
    holidays: { create: false, read: true, update: false, delete: false },
    notifications: { create: false, read: true, broadcast: false },
    allocation_policies: { create: false, read: true, update: false, delete: false },
  },
};

class PermissionService {
  /**
   * Check if a user has a specific permission
   * @param {string} userId - User ID
   * @param {string} resource - Resource name (e.g., 'rooms', 'departments')
   * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete')
   * @returns {Promise<boolean>} Whether user has the permission
   */
  async checkPermission(userId, resource, action) {
    try {
      const result = await db.query(
        `SELECT r.name as role_name, r.permissions
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 AND u.is_active = true`,
        [userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const { role_name, permissions } = result.rows[0];
      return this.hasAccess(role_name, resource, action, permissions);
    } catch (error) {
      logger.error('Permission check error', { userId, resource, action, error: error.message });
      return false;
    }
  }

  /**
   * Check if a role has access to a resource action
   * First checks DB permissions, then falls back to the static matrix
   * @param {string} roleName - Role name
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @param {Object} dbPermissions - Permissions stored in database (optional)
   * @returns {boolean} Whether role has access
   */
  hasAccess(roleName, resource, action, dbPermissions = null) {
    // First check DB-stored permissions if available
    if (dbPermissions && dbPermissions[resource] && dbPermissions[resource][action] !== undefined) {
      return !!dbPermissions[resource][action];
    }

    // Fall back to static matrix
    return this.validateAccess(roleName, resource, action);
  }

  /**
   * Validate access against the static role permission matrix
   * @param {string} roleName - Role name
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {boolean} Whether access is allowed
   */
  validateAccess(roleName, resource, action) {
    const rolePerms = ROLE_PERMISSION_MATRIX[roleName];
    if (!rolePerms) return false;

    const resourcePerms = rolePerms[resource];
    if (!resourcePerms) return false;

    return !!resourcePerms[action];
  }

  /**
   * Get all permissions for a role
   * @param {string} roleName - Role name
   * @returns {Object} Permission object for the role
   */
  getRolePermissions(roleName) {
    return ROLE_PERMISSION_MATRIX[roleName] || {};
  }

  /**
   * Get the full permission matrix for all roles
   * @returns {Object} Complete permission matrix
   */
  getPermissionMatrix() {
    return { ...ROLE_PERMISSION_MATRIX };
  }

  /**
   * Check if a user is the owner of a resource
   * @param {string} userId - User ID
   * @param {string} resourceOwnerId - Resource owner's user ID
   * @returns {boolean} Whether user owns the resource
   */
  isResourceOwner(userId, resourceOwnerId) {
    return userId === resourceOwnerId;
  }

  /**
   * Check department-level access
   * Admin and staff can access all departments.
   * Faculty and students can only access their own department's resources.
   * @param {string} userRole - User's role
   * @param {string} userDeptId - User's department ID
   * @param {string} resourceDeptId - Resource's department ID
   * @returns {boolean} Whether access is allowed
   */
  canAccessDepartment(userRole, userDeptId, resourceDeptId) {
    // Admin and staff can access all departments
    if (userRole === 'admin' || userRole === 'staff') {
      return true;
    }

    // If no department restriction on resource, allow
    if (!resourceDeptId) {
      return true;
    }

    // Faculty and students can only access own department
    return userDeptId === resourceDeptId;
  }

  /**
   * Check if a role can verify student booking requests
   * @param {string} roleName - Role name
   * @returns {boolean}
   */
  canVerifyStudentRequests(roleName) {
    return this.validateAccess(roleName, 'bookings', 'verify_student');
  }

  /**
   * Check if a role can approve/reject bookings
   * @param {string} roleName - Role name
   * @returns {boolean}
   */
  canApproveBookings(roleName) {
    return this.validateAccess(roleName, 'bookings', 'approve') &&
           this.validateAccess(roleName, 'bookings', 'reject');
  }

  /**
   * Check if a role can resolve booking conflicts
   * @param {string} roleName - Role name
   * @returns {boolean}
   */
  canResolveConflicts(roleName) {
    return this.validateAccess(roleName, 'bookings', 'resolve_conflicts');
  }
}

module.exports = new PermissionService();
module.exports.ROLE_PERMISSION_MATRIX = ROLE_PERMISSION_MATRIX;
