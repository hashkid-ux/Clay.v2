/**
 * Test Routes - For debugging and verifying integrations
 * GET /api/test/email-connection - Check if email service is working
 * POST /api/test/send-otp - Send test OTP email
 */

const express = require('express');
const router = express.Router();
const emailService = require('../utils/email');
const db = require('../db/postgres');
const logger = require('../utils/logger');

/**
 * Test email service connection
 * GET /api/test/email-connection
 */
router.get('/email-connection', async (req, res) => {
  try {
    logger.info('Testing email connection...');

    const connected = await emailService.verifyConnection();

    if (connected) {
      res.json({
        success: true,
        message: '✅ Email service is working!',
        config: {
          host: process.env.SMTP_HOST || 'NOT SET',
          port: process.env.SMTP_PORT || 'NOT SET',
          user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 5)}***` : 'NOT SET',
          from: process.env.SMTP_FROM || 'DEFAULT',
        },
      });
    } else {
      res.status(503).json({
        success: false,
        message: '❌ Email service connection failed',
        error: 'Cannot connect to SMTP server. Check your credentials.',
        config: {
          host: process.env.SMTP_HOST || 'NOT SET',
          port: process.env.SMTP_PORT || 'NOT SET',
          user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 5)}***` : 'NOT SET',
        },
      });
    }
  } catch (error) {
    logger.error('Email connection test error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Send test OTP email
 * POST /api/test/send-otp
 * Body: { email, otp (optional) }
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
      });
    }

    // Validate email format
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({
        error: 'Invalid email format',
      });
    }

    // Generate or use provided OTP
    const testOTP = otp || Math.floor(100000 + Math.random() * 900000).toString();

    logger.info('Sending test OTP email', { email, otp: testOTP });

    const result = await emailService.sendOTPEmail(email, testOTP);

    if (result.success) {
      res.json({
        success: true,
        message: '✅ OTP email sent successfully!',
        email,
        otp: testOTP,
        messageId: result.messageId,
        note: 'Check your inbox (and spam folder) for the email.',
      });
    } else {
      res.status(503).json({
        success: false,
        error: result.error,
        email,
        note: 'Failed to send email. Check your SMTP configuration.',
      });
    }
  } catch (error) {
    logger.error('Send OTP test error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Test database connection
 * GET /api/test/database
 */
router.get('/database', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as current_time, COUNT(*) as user_count FROM users');

    if (result.rows && result.rows.length > 0) {
      res.json({
        success: true,
        message: '✅ Database connection successful',
        database: {
          connected: true,
          currentTime: result.rows[0].current_time,
          userCount: result.rows[0].user_count,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Database query returned no results',
      });
    }
  } catch (error) {
    logger.error('Database test error', { error: error.message });
    res.status(503).json({
      success: false,
      error: error.message,
      message: 'Database connection failed',
    });
  }
});

/**
 * Health check - All systems
 * GET /api/test/health
 */
router.get('/health', async (req, res) => {
  try {
    // Test email
    const emailConnected = await emailService.verifyConnection();

    // Test database
    let dbConnected = false;
    try {
      await db.query('SELECT 1');
      dbConnected = true;
    } catch (e) {
      logger.error('DB health check failed', { error: e.message });
    }

    const allHealthy = emailConnected && dbConnected;

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      status: allHealthy ? '✅ All systems operational' : '⚠️ Some systems offline',
      services: {
        email: emailConnected ? '✅ Working' : '❌ Failed',
        database: dbConnected ? '✅ Working' : '❌ Failed',
      },
    });
  } catch (error) {
    logger.error('Health check error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
