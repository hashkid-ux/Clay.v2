// Backend/auth/jwtUtils.js - JWT token management
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

class JWTUtils {
  /**
   * Sign a JWT token
   * @param {object} payload - Data to encode in token
   * @param {string} expiresIn - Token expiry (default: 24h)
   * @returns {string} - JWT token
   */
  static signToken(payload, expiresIn = JWT_EXPIRY) {
    try {
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn });
      return token;
    } catch (error) {
      logger.error('Error signing JWT', { error: error.message });
      throw error;
    }
  }

  /**
   * Sign a refresh token (longer lived)
   * @param {object} payload - Data to encode
   * @returns {string} - Refresh token
   */
  static signRefreshToken(payload) {
    try {
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
      return token;
    } catch (error) {
      logger.error('Error signing refresh token', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify a JWT token
   * @param {string} token - JWT token to verify
   * @returns {object} - Decoded token payload
   */
  static verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.debug('Token expired', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        logger.debug('Invalid token', { error: error.message });
        throw new Error('Invalid token');
      }
      logger.error('Error verifying token', { error: error.message });
      throw error;
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token
   * @returns {object} - Decoded payload
   */
  static decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('Error decoding token', { error: error.message });
      return null;
    }
  }

  /**
   * Generate both access and refresh tokens
   * @param {object} payload - User data
   * @returns {object} - { accessToken, refreshToken }
   */
  static generateTokenPair(payload) {
    try {
      const accessToken = this.signToken(payload, JWT_EXPIRY);
      const refreshToken = this.signRefreshToken(payload);
      return { accessToken, refreshToken };
    } catch (error) {
      logger.error('Error generating token pair', { error: error.message });
      throw error;
    }
  }
}

module.exports = JWTUtils;
