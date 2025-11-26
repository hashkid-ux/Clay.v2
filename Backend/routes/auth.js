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

    // ✅ PHASE 2 FIX 2.4: Create client (company) INACTIVE until email verified
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

    // ✅ PHASE 2 FIX 2.4: Set is_active to FALSE until email verified
    const userResult = await db.query(
      `INSERT INTO users 
       (id, client_id, email, password_hash, name, role, otp_code, otp_expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7, false)
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

    logger.info('Company registered (awaiting email verification)', { 
      clientId,
      userId,
      email,
      companyName,
      is_active: false
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

    // Find user with client info
    const userResult = await db.query(
      `SELECT u.id, u.email, u.password_hash, u.name, 
              u.client_id, u.role, u.is_active,
              c.name as company_name, c.active as company_active
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

    // ✅ PHASE 2 FIX 2.4: Check if user is active
    if (!user.is_active) {
      logger.warn('Login attempt - user inactive', { email, ip: req.ip });
      return res.status(401).json({ error: 'Account is inactive. Please verify your email.' });
    }

    // ✅ PHASE 2 FIX 2.4: Check if company is active
    if (!user.company_active) {
      logger.warn('Login attempt - company inactive', { email, clientId: user.client_id, ip: req.ip });
      return res.status(401).json({ error: 'Company account is not active. Please contact support.' });
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

    logger.info('✅ User logged in successfully', { 
      userId: user.id, 
      email, 
      clientId: user.client_id,
      ip: req.ip 
    });

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
 * Returns new access token if refresh token is valid and not blacklisted
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // ✅ PHASE 2 FIX 2.1: Check if token is blacklisted (on logout)
    const decoded = await JWTUtils.verifyRefreshToken(refreshToken);

    // Generate new access token
    const tokenPayload = {
      userId: decoded.userId,
      email: decoded.email,
      client_id: decoded.client_id,
      role: decoded.role,
      companyName: decoded.companyName
    };

    const newAccessToken = JWTUtils.signToken(tokenPayload);

    logger.info('✅ Token refreshed successfully', {
      userId: decoded.userId,
      email: decoded.email
    });

    res.json({
      token: newAccessToken,
      accessToken: newAccessToken,
      expiresIn: '24h'
    });

  } catch (error) {
    logger.warn('🚫 Refresh token failed', { error: error.message });
    
    if (error.message === 'Token has been revoked') {
      return res.status(401).json({ 
        error: 'Session has been invalidated. Please login again.' 
      });
    }

    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * POST /api/auth/logout - Logout and blacklist refresh token
 * Requires auth
 * Body: { refreshToken }
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Blacklist the refresh token if provided (prevents reuse)
    if (refreshToken) {
      await JWTUtils.blacklistRefreshToken(refreshToken);
    }

    logger.info('✅ User logged out successfully', { 
      userId: req.user.id,
      email: req.user.email
    });

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

/**
 * ✅ PHASE 2 FIX 2.2: Password reset endpoints
 */

/**
 * POST /api/auth/forgot-password - Request password reset
 * Body: { email }
 * Returns: { message: 'Reset link sent to email' }
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Find user - but don't reveal if email exists (security)
    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Return success even if email not found (security best practice)
      return res.json({ 
        message: 'If that email exists, a reset link has been sent.' 
      });
    }

    const user = userResult.rows[0];

    // Generate secure reset token
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Save reset token to database
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, reset_token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [user.id, resetToken, expiresAt]
    );

    // Send reset email
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    
    try {
      await emailService.sendPasswordResetEmail(email, resetLink);
      logger.info('✅ Password reset email sent', { email });
    } catch (emailError) {
      logger.warn('⚠️  Failed to send password reset email', { 
        email,
        error: emailError.message 
      });
      // Still return success - don't reveal email sending issues
    }

    res.json({ 
      message: 'If that email exists, a reset link has been sent.' 
    });

  } catch (error) {
    logger.error('Error in forgot-password', { error: error.message });
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /api/auth/reset-password - Reset password with token
 * Body: { email, reset_token, new_password }
 * Returns: { message: 'Password reset successful' }
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, reset_token, new_password } = req.body;

    // Validation
    if (!email || !reset_token || !new_password) {
      return res.status(400).json({ error: 'Email, token, and password required' });
    }

    // Validate new password strength
    const passwordValidation = PasswordUtils.validatePasswordStrength(new_password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password too weak',
        details: passwordValidation.errors 
      });
    }

    // Find user
    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify reset token exists, is valid, and not used
    const tokenResult = await db.query(
      `SELECT id FROM password_reset_tokens 
       WHERE user_id = $1 AND reset_token = $2 AND expires_at > NOW() AND used_at IS NULL
       LIMIT 1`,
      [user.id, reset_token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }

    const tokenRecord = tokenResult.rows[0];

    // Hash new password
    const hashedPassword = await PasswordUtils.hashPassword(new_password);

    // Update password in transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Update user password
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [hashedPassword, user.id]
      );

      // Mark token as used
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [tokenRecord.id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Send confirmation email
    try {
      await emailService.sendPasswordResetConfirmationEmail(email);
      logger.info('✅ Password reset confirmation email sent', { email });
    } catch (emailError) {
      logger.warn('⚠️  Failed to send confirmation email', { 
        email,
        error: emailError.message 
      });
    }

    logger.info('✅ Password reset successful', { userId: user.id, email });

    res.json({ 
      message: 'Password reset successful. Please login with your new password.' 
    });

  } catch (error) {
    logger.error('Error in reset-password', { error: error.message });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;

