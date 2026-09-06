import User from '../models/User.js';
import BalanceSnapshot from '../models/BalanceSnapshot.js';
import Conversation    from '../models/Conversation.js';
import { issueTokens, verifyRefreshToken, setTokenCookies, clearTokenCookies } from '../services/tokenService.js';
import { sanitizeString } from '../utils/validation.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/emailService.js';
import { plaidClient } from '../services/plaidClient.js';
import logger from '../utils/logger.js';

// ── Register ──────────────────────────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      await new Promise(r => setTimeout(r, 200));
      return res.status(409).json({ error: 'Unable to create account with these details' });
    }

    const user = new User({
      email: email.toLowerCase().trim(),
      name:  sanitizeString(name || ''),
    });
    await user.setPassword(password);
    await user.save();

    const { accessToken, refreshToken } = issueTokens(user._id.toString());
    await user.setRefreshToken(refreshToken);
    setTokenCookies(res, accessToken, refreshToken);

    sendWelcomeEmail(user.email, user.name).catch(() => {});

    logger.info('User registered', { userId: user._id });
    res.status(201).json({ message: 'Account created successfully', user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash +refreshTokenHash +failedLoginAttempts +lockedUntil');

    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$dummy';
    if (!user) {
      try { const { default: argon2 } = await import('argon2'); await argon2.verify(dummyHash, password); } catch (_) {}
      logger.warn('Login attempt for unknown email', { ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.isLocked()) {
      const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(423).json({ error: `Account temporarily locked. Try again in ${remaining} minutes.` });
    }

    const valid = await user.verifyPassword(password);
    if (!valid) {
      await user.recordFailedLogin();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = issueTokens(user._id.toString());
    await user.setRefreshToken(refreshToken);
    await user.recordSuccessfulLogin(ip);
    setTokenCookies(res, accessToken, refreshToken);

    logger.info('User logged in', { userId: user._id, ip });
    res.json({ message: 'Login successful', user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// ── Refresh Token ─────────────────────────────────────────────────────────────
export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    let payload;
    try { payload = verifyRefreshToken(token); }
    catch (_) { clearTokenCookies(res); return res.status(401).json({ error: 'Invalid or expired refresh token' }); }

    if (payload.type !== 'refresh') {
      clearTokenCookies(res);
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const user = await User.findById(payload.sub).select('+refreshTokenHash');
    if (!user) { clearTokenCookies(res); return res.status(401).json({ error: 'User not found' }); }

    const valid = await user.verifyRefreshToken(token);
    if (!valid) {
      clearTokenCookies(res);
      logger.warn('Refresh token reuse detected', { userId: user._id, ip: req.ip });
      return res.status(401).json({ error: 'Token already used' });
    }

    const { accessToken, refreshToken: newRefresh } = issueTokens(user._id.toString());
    await user.setRefreshToken(newRefresh);
    setTokenCookies(res, accessToken, newRefresh);
    res.json({ message: 'Token refreshed' });
  } catch (err) {
    next(err);
  }
};

// ── Logout ────────────────────────────────────────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    if (req.userId) {
      await User.findByIdAndUpdate(req.userId, { refreshTokenHash: null });
    }
    clearTokenCookies(res);
    logger.info('User logged out', { userId: req.userId });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Request Password Reset ────────────────────────────────────────────────────
export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    const GENERIC_MSG = 'If an account exists with that email, a reset link has been sent.';

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      await new Promise(r => setTimeout(r, 300));
      return res.json({ message: GENERIC_MSG });
    }

    const rawToken = await user.createPasswordResetToken();

    try {
      await sendPasswordResetEmail(user.email, rawToken);
      logger.info('Password reset email sent', { userId: user._id });
    } catch (emailErr) {
      logger.error('Failed to send reset email', { userId: user._id, error: emailErr.message });
      if (process.env.NODE_ENV === 'development') {
        logger.info('DEV: Reset token (email failed)', { token: rawToken });
      }
    }

    res.json({ message: GENERIC_MSG });
  } catch (err) {
    next(err);
  }
};

// ── Reset Password ────────────────────────────────────────────────────────────
export const resetPassword = async (req, res, next) => {
  try {
    const { email, token, newPassword } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordReset');
    const INVALID_MSG = 'Reset link is invalid or has expired.';

    if (!user) return res.status(400).json({ error: INVALID_MSG });

    const valid = await user.verifyAndConsumeResetToken(token);
    if (!valid) {
      logger.warn('Invalid password reset attempt', { userId: user._id, ip: req.ip });
      return res.status(400).json({ error: INVALID_MSG });
    }

    await user.setPassword(newPassword);
    user.refreshTokenHash = null;
    await user.save();
    clearTokenCookies(res);

    logger.info('Password reset completed', { userId: user._id });
    res.json({ message: 'Password updated successfully. Please log in again.' });
  } catch (err) {
    next(err);
  }
};

// ── Get Me ────────────────────────────────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// ── Delete Account ────────────────────────────────────────────────────────────
export const deleteAccount = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Step 1 — Revoke all Plaid tokens at the source
    for (const item of user.plaidItems || []) {
      try {
        await plaidClient.itemRemove({ access_token: item.accessToken });
        logger.info('Plaid token revoked', { userId: req.userId, institution: item.institutionName });
      } catch (_) {
        // Token may already be expired — continue regardless
      }
    }

    // Step 2 — Delete all user data from MongoDB
    await Promise.all([
      User.findByIdAndDelete(req.userId),
      BalanceSnapshot.deleteMany({ userId: req.userId.toString() }),
      Conversation.deleteMany({ userId: req.userId.toString() }),
    ]);

    // Step 3 — Clear auth cookies
    clearTokenCookies(res);

    logger.info('Account deleted', { userId: req.userId });
    res.json({ message: 'Account deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
