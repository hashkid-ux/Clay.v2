// Backend/routes/auth.js - Authentication endpoints
const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../utils/logger');
const JWTUtils = require('../auth/jwtUtils');
const PasswordUtils = require('../auth/passwordUtils');
const { authMiddleware } = require('../auth/authMiddleware');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../utils/email');

/**
 * POST /api/auth/register - Register a new company with admin user
 * Body: { email, password, companyName, firstName, lastName, phone }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, companyName, firstName, lastName, phone } = req.body;

    // Validation
    if (!email || !password || !companyName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordValidation = PasswordUtils.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password too weak',
        details: passwordValidation.errors 
      });
    }

    // Check if email already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Create client (company) first
    const clientId = uuidv4();
    const clientResult = await db.query(
      `INSERT INTO clients (id, name, email, active, created_at) 
       VALUES ($1, $2, $3, false, NOW()) 
       RETURNING id, name, email`,
      [clientId, companyName, email]
    );

    const client = clientResult.rows[0];

    // Hash password
    const passwordHash = await PasswordUtils.hashPassword(password);

    // Create admin user for this company
    const userId = uuidv4();
    const otp = PasswordUtils.generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const userResult = await db.query(
      `INSERT INTO users 
       (id, client_id, email, password_hash, name, role, otp_code, otp_expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7, true)
       RETURNING id, email, name, client_id`,
      [userId, clientId, email, passwordHash, (firstName + ' ' + lastName).trim() || 'Admin User', otp, otpExpiresAt]
    );

    const user = userResult.rows[0];

    // Send verification email with OTP
    try {
      const emailResult = await emailService.sendOTPEmail(email, otp);
      if (!emailResult.success) {
        logger.warn('Failed to send verification email', {
          email,
          error: emailResult.error,
        });
      }
    } catch (emailError) {
      logger.error('Error sending verification email', {
        email,
        error: emailError.message,
      });
      // Continue anyway - user can request resend
    }

    // Log audit event
    await db.query(
      `INSERT INTO audit_logs (client_id, event_type, payload, user_id, ip_address)
       VALUES ($1, 'user_registered', $2, $3, $4)`,
      [clientId, JSON.stringify({ email, companyName }), userId, req.ip]
    );

    logger.info('Company registered', { 
      clientId,
      userId,
      email,
      companyName 
    });

    res.status(201).json({
      message: 'Registration successful. Check your email for verification code.',
      userId: user.id,
      clientId: user.client_id,
      email: user.email
    });

  } catch (error) {
    logger.error('Error registering user', { error: error.message });
    res.status(500).json({ error: 'Failed to register' });
  }
});

/**
 * POST /api/auth/verify-email - Verify email with OTP
 * Body: { email, otp }
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }

    // Find user
    const userResult = await db.query(
      'SELECT id, client_id, otp_code, otp_expires_at FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check OTP
    if (user.otp_code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (new Date() > user.otp_expires_at) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    // Mark as verified
    await db.query(
      `UPDATE users 
       SET is_active = true, otp_code = NULL, otp_expires_at = NULL
       WHERE id = $1`,
      [user.id]
    );

    // Activate client (company)
    await db.query(
      'UPDATE clients SET active = true WHERE id = $1',
      [user.client_id]
    );

    logger.info('Email verified', { userId: user.id, email });

    res.json({
      message: 'Email verified successfully. You can now log in.',
      verified: true
    });

  } catch (error) {
    logger.error('Error verifying email', { error: error.message });
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

/**
 * POST /api/auth/login - Login with email and password
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const userResult = await db.query(
      `SELECT u.id, u.email, u.password_hash, u.name, 
              u.client_id, u.role, u.is_active,
              c.name as company_name
       FROM users u
       JOIN clients c ON u.client_id = c.id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      logger.warn('Login attempt - user not found', { email, ip: req.ip });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      logger.warn('Login attempt - user inactive', { email, ip: req.ip });
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Verify password
    const isPasswordValid = await PasswordUtils.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      logger.warn('Login attempt - invalid password', { email, ip: req.ip });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      client_id: user.client_id,
      role: user.role,
      companyName: user.company_name
    };

    const { accessToken, refreshToken } = JWTUtils.generateTokenPair(tokenPayload);

    // Update last login
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    logger.info('User logged in', { userId: user.id, email, ip: req.ip });

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        clientId: user.client_id,
        companyName: user.company_name,
        role: user.role
      }
    });

  } catch (error) {
    logger.error('Error during login', { error: error.message });
    res.status(500).json({ error: 'Failed to log in' });
  }
});

/**
 * POST /api/auth/refresh - Refresh access token
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = JWTUtils.verifyToken(refreshToken);

    // Generate new access token
    const tokenPayload = {
      userId: decoded.userId,
      email: decoded.email,
      client_id: decoded.client_id,
      role: decoded.role,
      companyName: decoded.companyName
    };

    const newAccessToken = JWTUtils.signToken(tokenPayload);

    res.json({
      accessToken: newAccessToken,
      expiresIn: '24h'
    });

  } catch (error) {
    logger.warn('Refresh token failed', { error: error.message });
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * POST /api/auth/logout - Logout and blacklist refresh token
 * Requires auth
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Optional: blacklist the refresh token
      // await db.query(
      //   'INSERT INTO refresh_token_blacklist (user_id, token_jti, expires_at) VALUES ($1, $2, $3)',
      //   [req.user.id, decoded.jti, new Date(decoded.exp * 1000)]
      // );
    }

    logger.info('User logged out', { userId: req.user.id });

    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    logger.error('Error during logout', { error: error.message });
    res.status(500).json({ error: 'Failed to log out' });
  }
});

/**
 * GET /api/auth/me - Get current authenticated user
 * Requires auth
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userResult = await db.query(
      `SELECT u.id, u.email, u.name, u.client_id, u.role,
              c.name as company_name, c.active as company_active
       FROM users u
       JOIN clients c ON u.client_id = c.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        clientId: user.client_id,
        companyName: user.company_name,
        companyActive: user.company_active,
        role: user.role
      }
    });

  } catch (error) {
    logger.error('Error fetching user profile', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * POST /api/auth/request-otp - Request a new OTP for email verification
 * Body: { email }
 */
router.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const otp = PasswordUtils.generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Update OTP in database
    await db.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
      [otp, otpExpiresAt, userId]
    );

    // Send email
    try {
      const emailResult = await emailService.sendOTPEmail(email, otp);
      if (!emailResult.success) {
        logger.warn('Failed to send OTP email', {
          email,
          error: emailResult.error,
        });
      }
    } catch (emailError) {
      logger.error('Error sending OTP email', { error: emailError.message });
    }

    logger.info('OTP requested', { email });

    res.json({
      message: 'OTP sent to your email. Check your inbox.'
    });

  } catch (error) {
    logger.error('Error requesting OTP', { error: error.message });
    res.status(500).json({ error: 'Failed to request OTP' });
  }
});

/**
 * POST /api/auth/refresh - Refresh JWT token
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = JWTUtils.verifyToken(refreshToken);

    // Issue new access token
    const newToken = JWTUtils.generateToken({
      userId: decoded.userId,
      email: decoded.email,
      client_id: decoded.client_id,
      role: decoded.role,
      companyName: decoded.companyName
    });

    res.json({
      token: newToken,
      expiresIn: '24h'
    });

  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

module.exports = router;
