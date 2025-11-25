/**
 * Passport Google OAuth 2.0 Configuration
 * Handles Google login/registration flow
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db/postgres');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8080/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const googleId = profile.id;
        const picture = profile.photos?.[0]?.value;

        if (!email) {
          logger.warn('❌ Google OAuth - no email provided');
          return done(null, false, { message: 'No email provided by Google' });
        }

        logger.info('🔍 Google OAuth - authenticating user', { email, googleId });

        // Check if user exists by email or google_id
        const existingUser = await db.query(
          `SELECT * FROM users WHERE email = $1 OR google_id = $2`,
          [email, googleId]
        );

        if (existingUser.rows.length > 0) {
          // User exists - update google credentials
          const user = existingUser.rows[0];
          
          await db.query(
            `UPDATE users 
             SET google_id = $1, 
                 google_refresh_token = $2,
                 name = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [googleId, refreshToken, name, user.id]
          );

          logger.info('✅ Existing user authenticated via Google', {
            userId: user.id,
            email,
          });

          return done(null, user);
        }

        // Create new user
        const newUserId = uuidv4();
        const newClientId = uuidv4();

        // Create client (company) for new user
        const clientResult = await db.query(
          `INSERT INTO clients (id, name, email, active, created_at)
           VALUES ($1, $2, $3, true, NOW())
           RETURNING id`,
          [newClientId, `${name}'s Company`, email]
        );

        // Create user
        const newUserResult = await db.query(
          `INSERT INTO users 
           (id, client_id, email, name, google_id, google_refresh_token, is_active, is_verified, role, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, true, true, 'admin', NOW())
           RETURNING *`,
          [newUserId, newClientId, email, name, googleId, refreshToken]
        );

        const newUser = newUserResult.rows[0];

        logger.info('✅ New user created via Google OAuth', {
          userId: newUserId,
          email,
          clientId: newClientId,
        });

        return done(null, newUser);
      } catch (error) {
        logger.error('❌ Google OAuth strategy error', {
          error: error.message,
          stack: error.stack,
        });
        return done(error);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, client_id, role, is_active, is_verified FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return done(null, false);
    }

    done(null, result.rows[0]);
  } catch (error) {
    logger.error('❌ Deserialize user error', { error: error.message });
    done(error);
  }
});

module.exports = passport;
