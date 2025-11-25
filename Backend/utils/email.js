/**
 * Email Service - Handles OTP and verification emails
 * Uses Gmail SMTP via nodemailer
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Initialize email transporter
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' ? true : false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // For Railway compatibility
  },
});

/**
 * Verify email connection
 * @returns {Promise<boolean>}
 */
async function verifyConnection() {
  try {
    await transporter.verify();
    logger.info('✅ Email service connected', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER ? '***' : 'NOT SET',
    });
    return true;
  } catch (error) {
    logger.error('❌ Email service connection failed', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      error: error.message,
    });
    return false;
  }
}

/**
 * Send OTP verification email
 * @param {string} email - Recipient email
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendOTPEmail(email, otp) {
  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@caly.com',
      to: email,
      subject: '🔐 Caly Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; text-align: center; color: white; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 28px;">Caly</h1>
          </div>
          
          <h2 style="color: #333; margin-top: 0;">Email Verification</h2>
          
          <p style="color: #666; font-size: 16px;">Your verification code is:</p>
          
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <p style="margin: 0; color: #333; font-size: 14px; margin-bottom: 10px;">Enter this code to verify your email:</p>
            <p style="margin: 0; color: #007bff; font-size: 48px; letter-spacing: 8px; font-weight: bold; font-family: monospace;">${otp}</p>
          </div>
          
          <p style="color: #999; font-size: 12px; margin: 20px 0;">This code expires in 10 minutes.</p>
          
          <p style="color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
            If you didn't request this code, you can safely ignore this email. Your account remains secure.
          </p>
        </div>
      `,
    });

    logger.info('✅ OTP email sent successfully', {
      email,
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    logger.error('❌ Failed to send OTP email', {
      email,
      error: error.message,
      code: error.code,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send verification/welcome email
 * @param {string} email - Recipient email
 * @param {string} companyName - Company name
 * @param {string} userName - User's name
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendWelcomeEmail(email, companyName, userName) {
  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@caly.com',
      to: email,
      subject: '✅ Welcome to Caly',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; text-align: center; color: white; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 28px;">Caly</h1>
          </div>
          
          <h2 style="color: #333;">Welcome to Caly, ${userName}!</h2>
          
          <p style="color: #666; font-size: 16px;">Your company <strong>${companyName}</strong> is now verified and ready to go.</p>
          
          <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff;">
            <p style="margin: 0; color: #333;"><strong>Next Steps:</strong></p>
            <ul style="margin: 10px 0 0 0; color: #666; padding-left: 20px;">
              <li>Log in to your dashboard</li>
              <li>Configure your Shopify integration</li>
              <li>Set up Exotel phone lines</li>
              <li>Start handling customer calls</li>
            </ul>
          </div>
          
          <p style="color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
            Need help? Contact us at support@caly.ai
          </p>
        </div>
      `,
    });

    logger.info('✅ Welcome email sent', { email });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    logger.error('❌ Failed to send welcome email', {
      email,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  verifyConnection,
  sendOTPEmail,
  sendWelcomeEmail,
  transporter,
};
