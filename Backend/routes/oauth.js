/**
 * OAuth Routes - Google Authentication
 * Mounted at /api/auth in server.js
 * GET  /api/auth/google - Start Google auth
 * GET  /api/auth/google/callback - Google callback (from Google OAuth)
 * GET  /api/auth/profile - Get current user profile from JWT token
 */

const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const db = require('../db/postgres');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Start Google OAuth flow
 * GET /api/oauth/google
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: true,
  })
);

/**
 * Google OAuth Callback
 * GET /api/oauth/google/callback
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login?error=auth_failed',
    session: true,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      if (!user || !user.id) {
        logger.warn('❌ Google callback - invalid user object', { user });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=invalid_user`);
      }

      // Validate user has required fields for JWT
      if (!user.email || !user.client_id || !user.role) {
        logger.error('❌ Google callback - incomplete user data', {
          userId: user.id,
          hasEmail: !!user.email,
          hasClientId: !!user.client_id,
          hasRole: !!user.role,
        });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=incomplete_profile`);
      }

      // Generate JWT token with all required fields
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          clientId: user.client_id,
          role: user.role,
          name: user.name,
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: process.env.JWT_EXPIRY || '24h' }
      );

      // Update last login timestamp
      await db.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );

      // Log successful authentication
      logger.info('✅ User authenticated via Google OAuth', {
        userId: user.id,
        email: user.email,
        clientId: user.client_id,
      });

      // Redirect to frontend with secure token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/dashboard?token=${encodeURIComponent(token)}`;

      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('❌ OAuth callback error', { 
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/login?error=callback_error`);
    }
  }
);

/**
 * Get current user profile (from token)
 * GET /api/oauth/profile
 */
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    const user = await db.query(
      `SELECT id, name, email, role, is_verified, client_id, created_at 
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (!user.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRecord = user.rows[0];

    // Get client info
    const client = await db.query(
      'SELECT id, name, active FROM clients WHERE id = $1',
      [userRecord.client_id]
    );

    res.json({
      user: userRecord,
      client: client.rows[0] || null,
    });
  } catch (error) {
    logger.error('❌ Get profile error', { error: error.message });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

/**
 * Verify token
 * POST /api/oauth/verify-token
 */
router.post('/verify-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ 
      success: true, 
      userId: decoded.userId,
      email: decoded.email,
      clientId: decoded.clientId,
    });
  } catch (error) {
    logger.warn('❌ Token verification failed', { error: error.message });
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

/**
 * Refresh token
 * POST /api/oauth/refresh
 */
router.post('/refresh', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        clientId: decoded.clientId,
        role: decoded.role,
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({ token: newToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * Logout
 * POST /api/oauth/logout
 */
router.post('/logout', (req, res) => {
  try {
    req.logout((err) => {
      if (err) {
        logger.error('❌ Logout error', { error: err.message });
        return res.status(500).json({ error: 'Logout failed' });
      }

      logger.info('✅ User logged out');
      res.json({ message: 'Logged out successfully' });
    });
  } catch (error) {
    logger.error('❌ Logout error', { error: error.message });
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
