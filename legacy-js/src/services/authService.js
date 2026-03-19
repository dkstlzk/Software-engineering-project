/**
 * Authentication Service
 * Handles user authentication, JWT token management, and password operations
 * Implements security requirements from NFR-5.3.1 and NFR-5.3.2
 */
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const config = require('../config');
const logger = require('../utils/logger');
const tokenService = require('./tokenService');

class AuthService {
  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User data and tokens
   */
  async login(email, password) {
    // Get user with role information
    const result = await db.query(
      `SELECT u.*, r.name as role_name, r.permissions
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new Error('Account is temporarily locked. Please try again later.');
    }

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is deactivated. Please contact administrator.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed login attempts
      await this.incrementFailedAttempts(user.id, user.failed_login_attempts);
      throw new Error('Invalid email or password');
    }

    // Reset failed attempts on successful login
    await db.query(
      `UPDATE users SET 
        failed_login_attempts = 0,
        locked_until = NULL,
        last_login = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Generate tokens (delegated to TokenService)
    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.generateRefreshToken(user.id);

    // Log successful login
    await this.logAudit(user.id, 'LOGIN', 'users', user.id, null, null);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} createdBy - ID of user creating this account (optional)
   * @returns {Promise<Object>} Created user data
   */
  async register(userData, createdBy = null) {
    const {
      email,
      password,
      firstName,
      lastName,
      roleId,
      departmentId,
      employeeId,
      studentId,
      phone,
    } = userData;

    // Check if email already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(
      password,
      config.security.bcryptSaltRounds
    );

    // Insert user
    const result = await db.query(
      `INSERT INTO users (
        email, password_hash, first_name, last_name, 
        role_id, department_id, employee_id, student_id, phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        email,
        passwordHash,
        firstName,
        lastName,
        roleId,
        departmentId || null,
        employeeId || null,
        studentId || null,
        phone || null,
      ]
    );

    const user = result.rows[0];

    // Log user creation
    if (createdBy) {
      await this.logAudit(createdBy, 'CREATE_USER', 'users', user.id, null, {
        email: user.email,
        role_id: user.role_id,
      });
    }

    return this.sanitizeUser(user);
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New access token
   */
  async refreshAccessToken(refreshToken) {
    // Delegated to TokenService for validation
    const user = await tokenService.validateRefreshToken(refreshToken);

    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Generate new access token via TokenService
    const accessToken = tokenService.generateAccessToken(user);

    return { accessToken };
  }

  /**
   * Logout user by revoking refresh token
   * @param {string} refreshToken - Refresh token to revoke
   * @param {string} userId - User ID
   */
  async logout(refreshToken, userId) {
    // Delegated to TokenService
    await tokenService.revokeToken(refreshToken, userId);
    await this.logAudit(userId, 'LOGOUT', 'users', userId, null, null);
  }

  /**
   * Logout from all devices by revoking all refresh tokens
   * @param {string} userId - User ID
   */
  async logoutAll(userId) {
    // Delegated to TokenService
    await tokenService.revokeAllUserTokens(userId);
    await this.logAudit(userId, 'LOGOUT_ALL', 'users', userId, null, null);
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Get current user
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(
      currentPassword,
      result.rows[0].password_hash
    );

    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(
      newPassword,
      config.security.bcryptSaltRounds
    );

    // Update password
    await db.query(
      `UPDATE users SET 
        password_hash = $1, 
        password_changed_at = NOW(),
        updated_at = NOW()
       WHERE id = $2`,
      [newPasswordHash, userId]
    );

    // Revoke all refresh tokens for security
    await this.logoutAll(userId);

    await this.logAudit(userId, 'CHANGE_PASSWORD', 'users', userId, null, null);
  }

  /**
   * Get user by ID with role information
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User data
   */
  async getUserById(userId) {
    const result = await db.query(
      `SELECT u.*, r.name as role_name, r.permissions, d.name as department_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return this.sanitizeUser(result.rows[0]);
  }

  /**
   * Increment failed login attempts and lock if necessary
   * @param {string} userId - User ID
   * @param {number} currentAttempts - Current failed attempts
   */
  async incrementFailedAttempts(userId, currentAttempts) {
    const newAttempts = currentAttempts + 1;
    let lockedUntil = null;

    // Lock account after 5 failed attempts for 15 minutes
    if (newAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }

    await db.query(
      `UPDATE users SET 
        failed_login_attempts = $1,
        locked_until = $2
       WHERE id = $3`,
      [newAttempts, lockedUntil, userId]
    );
  }

  /**
   * Log audit event
   * @param {string} userId - User performing action
   * @param {string} action - Action type
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {Object} oldValues - Previous values
   * @param {Object} newValues - New values
   */
  async logAudit(userId, action, entityType, entityId, oldValues, newValues) {
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          action,
          entityType,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
        ]
      );
    } catch (error) {
      logger.error('Failed to log audit', { error: error.message });
    }
  }

  /**
   * Remove sensitive fields from user object
   * @param {Object} user - User object
   * @returns {Object} Sanitized user
   */
  sanitizeUser(user) {
    const {
      password_hash,
      failed_login_attempts,
      locked_until,
      ...sanitizedUser
    } = user;
    return sanitizedUser;
  }
}

module.exports = new AuthService();
