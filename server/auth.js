import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db, newId, audit } from './db.js';

const scrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_COOKIE = 'ntx_session';
export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

/* ------------------------------------------------------------------ */
/* Passwords                                                           */
/* ------------------------------------------------------------------ */

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function passwordProblems(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 10) problems.push('Use at least 10 characters.');
  if (!/[A-Za-z]/.test(password || '')) problems.push('Include at least one letter.');
  if (!/[0-9]/.test(password || '')) problems.push('Include at least one number.');
  if ((password || '').length > 200) problems.push('Password is too long.');
  return problems;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createSession(userId, req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, datetime('now'), ?, datetime('now'), ?, ?)`
  ).run(
    newId('ses'),
    userId,
    hashToken(token),
    expiresAt.toISOString().replace('T', ' ').slice(0, 19),
    String(req.ip || '').slice(0, 80),
    String(req.get('user-agent') || '').slice(0, 240)
  );
  setSessionCookie(req, res, token, expiresAt);
  return token;
}

function setSessionCookie(req, res, token, expiresAt) {
  const secure = req.secure || String(req.get('x-forwarded-proto') || '').split(',')[0] === 'https';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export function destroyUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function currentUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string' || token.length < 20) return null;

  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.role, u.status, u.first_name, u.last_name,
              u.phone, u.country, u.account_tier, u.is_demo, u.marketing_opt_in, u.created_at, u.last_login_at,
              u.approved_at, u.status_reason
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(hashToken(token));

  if (!row) return null;
  if (new Date(`${row.expires_at.replace(' ', 'T')}Z`).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  if (row.status !== 'active') return null;

  db.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?").run(row.session_id);

  const account = db
    .prepare('SELECT id, currency, balance_cents FROM accounts WHERE user_id = ?')
    .get(row.id) || { currency: 'USD', balance_cents: 0 };

  const { session_id: _ignored, ...user } = row;
  return { ...user, account };
}

export function sessionCookieAgeMs() {
  return SESSION_TTL_HOURS * 3600 * 1000;
}

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

export function attachUser(req, _res, next) {
  req.user = currentUser(req);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthenticated', message: 'Please sign in to continue.' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthenticated', message: 'Please sign in to continue.' });
  }
  if (req.user.role !== 'admin') {
    audit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'admin_access_denied',
      targetType: 'route',
      targetId: `${req.method} ${req.originalUrl}`,
      detail: 'Customer session attempted to reach an administrator endpoint',
      ip: req.ip || '',
    });
    return res.status(403).json({ error: 'forbidden', message: 'Administrator access required.' });
  }
  next();
}

/* ------------------------------------------------------------------ */
/* Abuse protection                                                    */
/* ------------------------------------------------------------------ */

const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 10, key = 'default' } = {}) {
  return (req, res, next) => {
    const identity = `${key}:${req.ip || 'unknown'}`;
    const now = Date.now();
    const bucket = buckets.get(identity);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(identity, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retry = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({
        error: 'rate_limited',
        message: `Too many attempts. Please try again in ${retry} seconds.`,
      });
    }
    next();
  };
}

/** Reject cross-site state-changing requests (defence-in-depth next to SameSite cookies). */
export function sameOriginGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // same-origin form posts / server-to-server tests
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'bad_origin', message: 'Invalid request origin.' });
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  if (originHost !== host) {
    return res.status(403).json({ error: 'bad_origin', message: 'Cross-site request blocked.' });
  }
  next();
}

// Housekeeping: drop expired sessions at most once every 10 minutes.
let lastSweep = 0;
export function sweepSessions() {
  if (Date.now() - lastSweep < 10 * 60 * 1000) return;
  lastSweep = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}
