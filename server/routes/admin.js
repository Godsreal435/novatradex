import express from 'express';
import crypto from 'node:crypto';
import { db, newId, audit, nowIso } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  passwordProblems,
  normalizeEmail,
  isEmail,
  createSession,
  requireAdmin,
  rateLimit,
  destroyUserSessions,
} from '../auth.js';
import { publicUser, accountFor, portfolioSummary, serializeTransaction, positionsWithValue } from '../helpers.js';
import { allQuotes } from '../market.js';

const router = express.Router();
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const ip = (req) => String(req.ip || '').slice(0, 80);
const DEMO_STARTING_BALANCE = 100_000_00;

const adminCount = () => db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

/* ================================================================== */
/* Public bootstrap endpoints (no session required)                    */
/* ================================================================== */

router.get('/setup/status', (_req, res) => {
  const count = adminCount();
  res.json({
    ownerConfigured: count > 0,
    setupAvailable: count === 0 && Boolean(process.env.OWNER_SETUP_TOKEN),
    tokenRequired: true,
  });
});

router.post(
  '/setup',
  rateLimit({ key: 'admin-setup', windowMs: 60 * 60 * 1000, max: 8 }),
  async (req, res, next) => {
    try {
      if (adminCount() > 0) {
        return res.status(409).json({
          error: 'setup_locked',
          message: 'An owner account already exists. Owner setup is permanently locked.',
        });
      }
      const expected = process.env.OWNER_SETUP_TOKEN;
      if (!expected) {
        return res.status(503).json({
          error: 'setup_unavailable',
          message: 'Owner setup is not configured on this deployment (missing setup token).',
        });
      }

      const token = String(req.body?.setupToken || '');
      if (!token || !safeEqual(token, expected)) {
        audit({
          action: 'admin_setup_failed',
          targetType: 'system',
          targetId: 'setup',
          detail: 'Invalid owner setup token presented',
          ip: ip(req),
        });
        return res.status(403).json({ error: 'invalid_setup_token', message: 'Invalid owner setup token.' });
      }

      const email = normalizeEmail(req.body?.email);
      const firstName = clean(req.body?.firstName, 60) || 'Owner';
      const lastName = clean(req.body?.lastName, 60) || 'Administrator';
      const password = req.body?.password;

      if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email', message: 'Enter a valid email address.' });
      const problems = passwordProblems(password);
      if (problems.length) return res.status(400).json({ error: 'weak_password', message: problems.join(' '), problems });

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) return res.status(409).json({ error: 'email_taken', message: 'That email is already registered.' });

      const passwordHash = await hashPassword(password);
      const adminId = newId('adm');

      db.transaction(() => {
        db.prepare(
          `INSERT INTO users (id, email, password_hash, role, status, first_name, last_name, country, is_demo,
                              created_at, updated_at, approved_at, approved_by)
           VALUES (?, ?, ?, 'admin', 'active', ?, ?, 'Global', 0, datetime('now'), datetime('now'), datetime('now'), 'owner-setup')`
        ).run(adminId, email, passwordHash, firstName, lastName);
        db.prepare('INSERT INTO accounts (id, user_id, currency, balance_cents) VALUES (?, ?, ?, 0)').run(
          newId('acc'),
          adminId,
          'USD'
        );
        audit({
          actorId: adminId,
          actorEmail: email,
          actorRole: 'admin',
          action: 'owner_setup_completed',
          targetType: 'user',
          targetId: adminId,
          detail: 'First owner administrator provisioned via setup token',
          ip: ip(req),
        });
      })();

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
      createSession(adminId, req, res);
      res.status(201).json({ user: publicUser(user), message: 'Owner account created. Setup is now locked.' });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/login', rateLimit({ key: 'admin-login', windowMs: 10 * 60 * 1000, max: 12 }), async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!isEmail(email) || !password) {
      return res.status(400).json({ error: 'invalid_request', message: 'Enter your email and password.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !ok || user.role !== 'admin') {
      audit({
        actorEmail: email,
        action: 'admin_login_failed',
        targetType: 'system',
        targetId: 'admin-login',
        detail: 'Failed private admin sign-in attempt',
        ip: ip(req),
      });
      return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'admin_inactive', message: 'This administrator account is not active.' });
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    createSession(user.id, req, res);

    audit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action: 'admin_login_success',
      targetType: 'user',
      targetId: user.id,
      detail: 'Administrator signed in',
      ip: ip(req),
    });

    res.json({ user: publicUser({ ...user, last_login_at: nowIso() }) });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Everything below is administrator-only and enforced server-side.    */
/* ------------------------------------------------------------------ */
router.use(requireAdmin);

function customerSummary(row) {
  const account = accountFor(row.id);
  const positions = positionsWithValue(row.id);
  const invested = positions.reduce((sum, p) => sum + p.valueCents, 0);
  const pending = db
    .prepare(
      "SELECT COUNT(*) AS count FROM transactions WHERE user_id = ? AND status = 'pending' AND kind IN ('deposit','withdrawal')"
    )
    .get(row.id).count;
  const tickets = db
    .prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE user_id = ? AND status <> 'resolved'")
    .get(row.id).count;
  return {
    ...publicUser(row),
    balanceCents: account.balance_cents,
    equityCents: account.balance_cents + invested,
    investedCents: invested,
    positionsCount: positions.length,
    pendingPayments: pending,
    openTickets: tickets,
  };
}

router.get('/overview', (_req, res) => {
  const counts = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM users WHERE role = 'customer' GROUP BY status`
    )
    .all()
    .reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {});

  const totalCustomers = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const totalBalances = db
    .prepare("SELECT COALESCE(SUM(a.balance_cents),0) AS total FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.role = 'customer'")
    .get().total;

  const positions = db
    .prepare("SELECT p.symbol, p.quantity FROM positions p JOIN users u ON u.id = p.user_id WHERE u.role = 'customer' AND p.quantity > 0")
    .all();
  const quotes = new Map(allQuotes().map((q) => [q.symbol, q.price]));
  const totalPositions = positions.reduce((sum, p) => sum + Math.round(p.quantity * (quotes.get(p.symbol) || 0) * 100), 0);

  const payments = db
    .prepare(
      `SELECT t.id, t.user_id, t.kind, t.status, t.amount_cents, t.method, t.reference, t.created_at,
              u.email AS customer_email, u.first_name, u.last_name
       FROM transactions t JOIN users u ON u.id = t.user_id
       WHERE t.kind IN ('deposit','withdrawal') AND t.status = 'pending'
       ORDER BY datetime(t.created_at) ASC LIMIT 8`
    )
    .all()
    .map((row) => ({
      ...serializeTransaction(row),
      customerEmail: row.customer_email,
      customerName: `${row.first_name} ${row.last_name}`.trim(),
    }));

  const pendingValue = db
    .prepare("SELECT COALESCE(SUM(ABS(amount_cents)),0) AS total FROM transactions WHERE kind IN ('deposit','withdrawal') AND status = 'pending'")
    .get().total;

  const openTickets = db
    .prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status <> 'resolved'")
    .get().count;

  const newThisWeek = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'customer' AND datetime(created_at) >= datetime('now','-7 days')")
    .get().count;

  const recentActivity = db
    .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 12')
    .all();

  res.json({
    stats: {
      totalCustomers,
      active: counts.active || 0,
      pending: counts.pending || 0,
      suspended: counts.suspended || 0,
      rejected: counts.rejected || 0,
      newThisWeek,
      pendingPayments: payments.length,
      pendingPaymentsValueCents: pendingValue,
      openTickets,
      totalDemoBalancesCents: totalBalances,
      totalDemoPositionsCents: totalPositions,
      demoCustodyValueCents: totalBalances + totalPositions,
    },
    pendingPayments: payments,
    recentActivity,
    simulated: true,
    notice: 'All figures are simulated demo values. NovaTradeX holds no client funds.',
  });
});

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

router.get('/customers', (req, res) => {
  const status = String(req.query.status || '');
  const q = clean(req.query.q, 80);
  let sql = "SELECT * FROM users WHERE role = 'customer'";
  const params = [];
  if (['pending', 'active', 'suspended', 'rejected'].includes(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (q) {
    sql += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 200';
  const customers = db.prepare(sql).all(...params).map(customerSummary);
  res.json({ customers, total: customers.length });
});

router.get('/customers/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found', message: 'Customer not found.' });

  const summary = portfolioSummary(row.id);
  const transactions = db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 60')
    .all(row.id)
    .map(serializeTransaction);
  const tickets = db
    .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY datetime(updated_at) DESC')
    .all(row.id);
  const account = accountFor(row.id);

  res.json({
    customer: publicUser(row),
    account: {
      currency: account.currency,
      balanceCents: account.balance_cents,
      availableCents: summary.availableCents,
      pendingDepositCents: summary.pendingDepositCents,
      pendingWithdrawalCents: summary.pendingWithdrawalCents,
    },
    portfolio: {
      equityCents: summary.equityCents,
      investedCents: summary.investedCents,
      pnlCents: summary.pnlCents,
      pnlPct: summary.pnlPct,
      positions: summary.positions,
      allocation: summary.allocation,
    },
    transactions,
    tickets,
  });
});

router.patch('/customers/:id/status', (req, res) => {
  const action = String(req.body?.action || '');
  const reason = clean(req.body?.reason, 240);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!row) return res.status(404).json({ error: 'not_found', message: 'Customer not found.' });
  if (row.role !== 'customer') {
    return res.status(403).json({ error: 'forbidden', message: 'Administrator accounts cannot be modified here.' });
  }
  if (!['activate', 'reject', 'suspend', 'reactivate'].includes(action)) {
    return res.status(400).json({ error: 'invalid_action', message: 'Unsupported status action.' });
  }
  if (['reject', 'suspend'].includes(action) && reason.length < 3) {
    return res.status(400).json({ error: 'reason_required', message: 'Add a short reason for the audit trail.' });
  }

  const transitions = {
    activate: ['pending', 'rejected'],
    reactivate: ['suspended'],
    reject: ['pending'],
    suspend: ['active'],
  };
  if (!transitions[action].includes(row.status)) {
    return res.status(409).json({
      error: 'invalid_transition',
      message: `Cannot ${action} an account that is currently ${row.status}.`,
    });
  }

  const nextStatus = { activate: 'active', reactivate: 'active', reject: 'rejected', suspend: 'suspended' }[action];

  db.transaction(() => {
    db.prepare(
      `UPDATE users SET status = ?, status_reason = ?, updated_at = datetime('now'),
                        approved_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE approved_at END,
                        approved_by = CASE WHEN ? = 'active' THEN ? ELSE approved_by END
       WHERE id = ?`
    ).run(nextStatus, reason || null, nextStatus, nextStatus, req.user.id, row.id);

    if (nextStatus !== 'active') {
      destroyUserSessions(row.id);
    }

    if (action === 'activate') {
      const account = accountFor(row.id);
      const hasFunding = db
        .prepare("SELECT COUNT(*) AS count FROM transactions WHERE user_id = ? AND kind = 'bonus'")
        .get(row.id).count;
      if (account.balance_cents === 0 && hasFunding === 0) {
        db.prepare("UPDATE accounts SET balance_cents = ?, updated_at = datetime('now') WHERE user_id = ?").run(
          DEMO_STARTING_BALANCE,
          row.id
        );
        db.prepare(
          `INSERT INTO transactions (id, user_id, kind, status, amount_cents, currency, method, reference, note,
                                     balance_after_cents, is_demo, reviewed_at, reviewed_by)
           VALUES (?, ?, 'bonus', 'completed', ?, 'USD', 'internal', ?, ?, ?, 1, datetime('now'), ?)`
        ).run(
          newId('txn'),
          row.id,
          DEMO_STARTING_BALANCE,
          `NTX-DEMO-WELCOME-${row.id.slice(-4).toUpperCase()}`,
          'Simulated demo starting balance — not real money',
          DEMO_STARTING_BALANCE,
          req.user.id
        );
      }
    }

    audit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: 'admin',
      action: `customer_${action}`,
      targetType: 'user',
      targetId: row.id,
      detail: reason ? `${action}: ${reason}` : action,
      ip: ip(req),
    });
  })();

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
  res.json({ customer: customerSummary(updated), message: `Account ${nextStatus}.` });
});

/* ------------------------------------------------------------------ */
/* Deposit / withdrawal review                                         */
/* ------------------------------------------------------------------ */

router.get('/payments', (req, res) => {
  const status = String(req.query.status || 'pending');
  const kind = String(req.query.kind || '');
  let sql = `SELECT t.*, u.email AS customer_email, u.first_name, u.last_name
             FROM transactions t JOIN users u ON u.id = t.user_id
             WHERE t.kind IN ('deposit','withdrawal')`;
  const params = [];
  if (['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (['deposit', 'withdrawal'].includes(kind)) {
    sql += ' AND t.kind = ?';
    params.push(kind);
  }
  sql += ' ORDER BY datetime(t.created_at) DESC LIMIT 150';

  const payments = db
    .prepare(sql)
    .all(...params)
    .map((row) => ({
      ...serializeTransaction(row),
      customerEmail: row.customer_email,
      customerName: `${row.first_name} ${row.last_name}`.trim(),
    }));

  res.json({ payments });
});

router.patch('/payments/:id', (req, res) => {
  const action = String(req.body?.action || '');
  const reason = clean(req.body?.reason, 240);
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);

  if (!row) return res.status(404).json({ error: 'not_found', message: 'Payment request not found.' });
  if (!['deposit', 'withdrawal'].includes(row.kind)) {
    return res.status(400).json({ error: 'not_a_payment', message: 'Only deposit and withdrawal requests can be reviewed.' });
  }
  if (row.status !== 'pending') {
    return res.status(409).json({ error: 'already_reviewed', message: `This request is already ${row.status}.` });
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'invalid_action', message: 'Choose approve or reject.' });
  }

  const amount = Math.abs(row.amount_cents);
  const account = accountFor(row.user_id);

  try {
    db.transaction(() => {
      let balanceAfter = account.balance_cents;

      if (action === 'approve') {
        if (row.kind === 'withdrawal') {
          if (account.balance_cents < amount) {
            const error = new Error('Customer demo balance is too low to settle this withdrawal.');
            error.statusCode = 409;
            error.code = 'insufficient_funds';
            throw error;
          }
          balanceAfter = account.balance_cents - amount;
        } else {
          balanceAfter = account.balance_cents + amount;
        }
        db.prepare("UPDATE accounts SET balance_cents = ?, updated_at = datetime('now') WHERE user_id = ?").run(
          balanceAfter,
          row.user_id
        );
      }

      db.prepare(
        `UPDATE transactions
         SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?, review_note = ?,
             balance_after_cents = CASE WHEN ? = 'approved' THEN ? ELSE balance_after_cents END
         WHERE id = ?`
      ).run(action === 'approve' ? 'approved' : 'rejected', req.user.id, reason || null, action === 'approve' ? 'approved' : 'rejected', balanceAfter, row.id);

      audit({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: 'admin',
        action: `payment_${action}d`,
        targetType: 'transaction',
        targetId: row.id,
        detail: `${row.kind} ${(amount / 100).toFixed(2)} USD ${action === 'approve' ? 'approved' : 'rejected'}${reason ? `: ${reason}` : ''}`,
        ip: ip(req),
      });
    })();
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.code, message: error.message });
    throw error;
  }

  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(row.id);
  res.json({ payment: serializeTransaction(updated), message: `Request ${action === 'approve' ? 'approved' : 'rejected'}.` });
});

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

router.get('/transactions', (req, res) => {
  const kind = String(req.query.kind || '');
  const status = String(req.query.status || '');
  let sql = `SELECT t.*, u.email AS customer_email, u.first_name, u.last_name
             FROM transactions t JOIN users u ON u.id = t.user_id WHERE 1 = 1`;
  const params = [];
  if (kind) {
    sql += ' AND t.kind = ?';
    params.push(kind);
  }
  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY datetime(t.created_at) DESC, t.rowid DESC LIMIT 200';
  const transactions = db
    .prepare(sql)
    .all(...params)
    .map((row) => ({
      ...serializeTransaction(row),
      customerEmail: row.customer_email,
      customerName: `${row.first_name} ${row.last_name}`.trim(),
    }));
  res.json({ transactions, simulated: true });
});

/* ------------------------------------------------------------------ */
/* Support desk                                                        */
/* ------------------------------------------------------------------ */

router.get('/support', (req, res) => {
  const status = String(req.query.status || '');
  let sql = `SELECT t.*, u.email AS customer_email, u.first_name, u.last_name,
                    (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count
             FROM support_tickets t JOIN users u ON u.id = t.user_id`;
  const params = [];
  if (['open', 'answered', 'resolved'].includes(status)) {
    sql += ' WHERE t.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY datetime(t.updated_at) DESC LIMIT 150';
  const tickets = db
    .prepare(sql)
    .all(...params)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      subject: row.subject,
      category: row.category,
      priority: row.priority,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      customerEmail: row.customer_email,
      customerName: `${row.first_name} ${row.last_name}`.trim(),
    }));
  res.json({ tickets });
});

router.get('/support/:id', (req, res) => {
  const ticket = db
    .prepare(
      `SELECT t.*, u.email AS customer_email, u.first_name, u.last_name
       FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`
    )
    .get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found', message: 'Ticket not found.' });
  const messages = db
    .prepare('SELECT id, author_role, author_name, body, created_at FROM support_messages WHERE ticket_id = ? ORDER BY datetime(created_at), rowid')
    .all(ticket.id);
  res.json({
    ticket: {
      id: ticket.id,
      userId: ticket.user_id,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      customerEmail: ticket.customer_email,
      customerName: `${ticket.first_name} ${ticket.last_name}`.trim(),
    },
    messages,
  });
});

router.post('/support/:id/messages', (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found', message: 'Ticket not found.' });

  const body = clean(req.body?.message, 4000);
  if (body.length < 2) return res.status(400).json({ error: 'invalid_message', message: 'Write a reply first.' });

  db.transaction(() => {
    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, author_id, author_role, author_name, body)
       VALUES (?, ?, ?, 'admin', ?, ?)`
    ).run(newId('msg'), ticket.id, req.user.id, 'NovaTradeX Support', body);
    db.prepare("UPDATE support_tickets SET status = 'answered', updated_at = datetime('now') WHERE id = ?").run(ticket.id);
  })();

  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: 'admin',
    action: 'support_reply',
    targetType: 'ticket',
    targetId: ticket.id,
    detail: 'Administrator replied to a support request',
    ip: ip(req),
  });

  res.status(201).json({ ok: true });
});

router.patch('/support/:id', (req, res) => {
  const status = String(req.body?.status || '');
  if (!['open', 'answered', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status', message: 'Unsupported ticket status.' });
  }
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found', message: 'Ticket not found.' });

  db.prepare("UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, ticket.id);
  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: 'admin',
    action: 'support_status_changed',
    targetType: 'ticket',
    targetId: ticket.id,
    detail: `Ticket marked ${status}`,
    ip: ip(req),
  });
  res.json({ ok: true, status });
});

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

router.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const entries = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ entries });
});

export default router;
