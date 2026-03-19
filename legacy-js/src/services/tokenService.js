/**
 * Token Service
 * Handles JWT access token and refresh token management
 * Separated from AuthService as per class diagram (TokenService class)
 * 
 * Methods (from UML):
 * - generateAccessToken(user): string
 * - generateRefreshToken(userId): string
 * - validateToken(token): TokenPayload
 * - revokeToken(token): void
 * - revokeAllUserTokens(userId): void
 * - isTokenExpired(token): boolean
 * - hashToken(token): string
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const config = require('../config');
const logger = require('../utils/logger');

class TokenService {
  /**
   * Generate JWT access token
   * @param {Object} user - User object with role info
   * @returns {string} JWT access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role_name,
        permissions: user.permissions,
        departmentId: user.department_id,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  /**
   * Generate and store refresh token
   * @param {string} userId - User ID
   * @returns {Promise<string>} Refresh token
   */
  async generateRefreshToken(userId) {
    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);

    // Calculate expiry
    const expiresAt = new Date();
    const daysMatch = config.jwt.refreshExpiresIn.match(/(\d+)d/);
    if (daysMatch) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(daysMatch[1]));
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 days
    }

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    return token;
  }

  /**
   * Validate JWT access token
   * @param {string} token - JWT token string
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  validateToken(token) {
    return jwt.verify(token, config.jwt.secret);
  }

  /**
   * Check if a JWT token is expired
   * @param {string} token - JWT token string
   * @returns {boolean} True if expired
   */
  isTokenExpired(token) {
    try {
      jwt.verify(token, config.jwt.secret);
      return false;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return true;
      }
      throw error;
    }
  }

  /**
   * Validate refresh token and get associated user
   * @param {string} refreshToken - Refresh token string
   * @returns {Promise<Object>} User with role data
   * @throws {Error} If token is invalid or expired
   */
  async validateRefreshToken(refreshToken) {
    const tokenHash = this.hashToken(refreshToken);

    const result = await db.query(
      `SELECT rt.*, u.*, r.name as role_name, r.permissions
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE rt.token_hash = $1 
         AND rt.is_revoked = false 
         AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    return result.rows[0];
  }

  /**
   * Revoke a specific refresh token
   * @param {string} refreshToken - Refresh token to revoke
   * @param {string} userId - User ID (for safety check)
   */
  async revokeToken(refreshToken, userId) {
    const tokenHash = this.hashToken(refreshToken);

    await db.query(
      `UPDATE refresh_tokens 
       SET is_revoked = true, revoked_at = NOW()
       WHERE token_hash = $1 AND user_id = $2`,
      [tokenHash, userId]
    );
  }

  /**
   * Revoke all refresh tokens for a user (logout all devices)
   * @param {string} userId - User ID
   */
  async revokeAllUserTokens(userId) {
    await db.query(
      `UPDATE refresh_tokens 
       SET is_revoked = true, revoked_at = NOW()
       WHERE user_id = $1 AND is_revoked = false`,
      [userId]
    );
  }

  /**
   * Clean up expired tokens (maintenance)
   * @returns {Promise<number>} Number of tokens cleaned
   */
  async cleanupExpiredTokens() {
    const result = await db.query(
      `DELETE FROM refresh_tokens 
       WHERE expires_at < NOW() OR is_revoked = true
       RETURNING id`
    );
    return result.rowCount;
  }

  /**
   * Hash token for secure storage
   * @param {string} token - Token to hash
   * @returns {string} SHA-256 hash of token
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

module.exports = new TokenService();
