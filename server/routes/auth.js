import express from 'express';
import { db, newId, audit, nowIso } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  passwordProblems,
  normalizeEmail,
  isEmail,
  createSession,
  clearSession,
  requireAuth,
  rateLimit,
  destroyUserSessions,
  SESSION_COOKIE,
  currentUser,
} from '../auth.js';
import { publicUser } from '../helpers.js';

const router = express.Router();

const clean = (value, max = 80) => String(value ?? '').trim().slice(0, max);


function clientIp(req) {
  return String(req.ip || '').slice(0, 80);
}

/* ------------------------------------------------------------------ */
/* Registration — customers only, always pending admin approval        */
/* ------------------------------------------------------------------ */

router.post(
  '/register',
  rateLimit({ key: 'register', windowMs: 60 * 60 * 1000, max: 12 }),
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      const password = body.password;
      const firstName = clean(body.firstName, 60);
      const lastName = clean(body.lastName, 60);
      const country = clean(body.country, 60);
      const phone = clean(body.phone, 40);
      const marketingOptIn = body.marketingOptIn ? 1 : 0;

      if (!firstName) return res.status(400).json({ error: 'invalid_first_name', message: 'Please enter your first name.' });
      if (!lastName) return res.status(400).json({ error: 'invalid_last_name', message: 'Please enter your last name.' });
      if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email', message: 'Enter a valid email address.' });
      if (!country) return res.status(400).json({ error: 'invalid_country', message: 'Please select your country of residence.' });

      const problems = passwordProblems(password);
      if (problems.length) {
        return res.status(400).json({ error: 'weak_password', message: problems.join(' '), problems });
      }

      // Role and status are assigned by the server. Any client-supplied role is ignored.
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (exists) {
        return res.status(409).json({ error: 'email_taken', message: 'An account with that email already exists.' });
      }

      const passwordHash = await hashPassword(password);
      const userId = newId('usr');

      const create = db.transaction(() => {
        db.prepare(
          `INSERT INTO users (id, email, password_hash, role, status, first_name, last_name, phone, country,
                              is_demo, marketing_opt_in, created_at, updated_at)
           VALUES (?, ?, ?, 'customer', 'pending', ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`
        ).run(userId, email, passwordHash, firstName, lastName, phone, country, marketingOptIn);

        db.prepare('INSERT INTO accounts (id, user_id, currency, balance_cents) VALUES (?, ?, ?, 0)').run(
          newId('acc'),
          userId,
          'USD'
        );

        audit({
          actorId: userId,
          actorEmail: email,
          actorRole: 'customer',
          action: 'registration_submitted',
          targetType: 'user',
          targetId: userId,
          detail: 'Customer self-registration awaiting administrator approval',
          ip: clientIp(req),
        });
      });
      create();

      return res.status(201).json({
        status: 'pending',
        message:
          'Account created. An administrator must verify your registration before you can sign in. This is a simulated demo platform — no real money is held.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ------------------------------------------------------------------ */
/* Customer login                                                      */
/* ------------------------------------------------------------------ */

router.post('/login', rateLimit({ key: 'login', windowMs: 10 * 60 * 1000, max: 15 }), async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!isEmail(email) || !password) {
      return res.status(400).json({ error: 'invalid_request', message: 'Enter your email and password.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !ok) {
      audit({
        actorEmail: email,
        action: 'login_failed',
        targetType: 'user',
        targetId: user ? user.id : '',
        detail: 'Invalid customer credentials',
        ip: clientIp(req),
      });
      return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
    }

    if (user.role !== 'customer') {
      return res.status(403).json({
        error: 'use_admin_login',
        message: 'This is an administrator account. Use the private admin sign-in.',
      });
    }

    if (user.status === 'pending') {
      return res.status(403).json({
        error: 'pending_approval',
        message: 'Your registration is awaiting administrator approval.',
      });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'registration_rejected', message: 'This registration was not approved.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'account_suspended',
        message: user.status_reason ? `Account suspended: ${user.status_reason}` : 'This account is suspended.',
      });
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    createSession(user.id, req, res);

    audit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'login_success',
      targetType: 'user',
      targetId: user.id,
      detail: 'Customer signed in',
      ip: clientIp(req),
    });

    return res.json({ user: publicUser({ ...user, last_login_at: nowIso() }) });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  const tokenUser = req.cookies?.[SESSION_COOKIE] ? currentUser(req) : null;
  clearSession(req, res);
  if (tokenUser) {
    audit({
      actorId: tokenUser.id,
      actorEmail: tokenUser.email,
      actorRole: tokenUser.role,
      action: 'logout',
      targetType: 'user',
      targetId: tokenUser.id,
      detail: 'Signed out',
      ip: clientIp(req),
    });
  }
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null, simulated: true });
});

/* ------------------------------------------------------------------ */
/* Password change                                                     */
/* ------------------------------------------------------------------ */

router.post('/password', requireAuth, rateLimit({ key: 'password', windowMs: 15 * 60 * 1000, max: 10 }), async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = req.body?.newPassword;

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const ok = await verifyPassword(currentPassword, row.password_hash);
    if (!ok) {
      return res.status(400).json({ error: 'invalid_password', message: 'Your current password is incorrect.' });
    }
    const problems = passwordProblems(newPassword);
    if (problems.length) {
      return res.status(400).json({ error: 'weak_password', message: problems.join(' '), problems });
    }

    const hash = await hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, req.user.id);
    // Invalidate every other session, keep the current one active.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    createSession(req.user.id, req, res);

    audit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'password_changed',
      targetType: 'user',
      targetId: req.user.id,
      detail: 'Password updated; all other sessions revoked',
      ip: clientIp(req),
    });

    res.json({ ok: true, message: 'Password updated. Other sessions were signed out.' });
  } catch (error) {
    next(error);
  }
});

export default router;
