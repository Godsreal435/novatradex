import express from 'express';
import { db, newId, audit } from '../db.js';
import { requireAuth, rateLimit } from '../auth.js';
import { quote, allQuotes, isValidSymbol } from '../market.js';
import {
  publicUser,
  accountFor,
  portfolioSummary,
  serializeTransaction,
} from '../helpers.js';

const router = express.Router();
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const ip = (req) => String(req.ip || '').slice(0, 80);

router.use(requireAuth);

function txList(userId, { limit = 50, status = null, kind = null } = {}) {
  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [userId];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (kind) {
    sql += ' AND kind = ?';
    params.push(kind);
  }
  sql += ' ORDER BY datetime(created_at) DESC, rowid DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 50, 200));
  return db.prepare(sql).all(...params).map(serializeTransaction);
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

router.get('/overview', (req, res) => {
  const summary = portfolioSummary(req.user.id);
  const pendingRequests = txList(req.user.id, { limit: 10, status: 'pending' });
  const openTickets = db
    .prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE user_id = ? AND status <> 'resolved'")
    .get(req.user.id).count;

  res.json({
    user: publicUser(req.user),
    account: {
      currency: summary.currency,
      balanceCents: summary.balanceCents,
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
    recentTransactions: txList(req.user.id, { limit: 6 }),
    pendingRequests,
    openTickets,
    market: allQuotes(),
    simulated: true,
    notice:
      'All balances, positions, trades, deposits and withdrawals on NovaTradeX are simulated demo data. No real money is held, transferred or traded.',
  });
});

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

router.get('/transactions', (req, res) => {
  res.json({
    transactions: txList(req.user.id, {
      limit: req.query.limit,
      status: req.query.status ? String(req.query.status) : null,
      kind: req.query.kind ? String(req.query.kind) : null,
    }),
    simulated: true,
  });
});

/* ------------------------------------------------------------------ */
/* Deposit / withdrawal requests                                       */
/* ------------------------------------------------------------------ */

router.get('/transfers', (req, res) => {
  const transfers = db
    .prepare(
      `SELECT * FROM transactions
       WHERE user_id = ? AND kind IN ('deposit','withdrawal')
       ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 100`
    )
    .all(req.user.id)
    .map(serializeTransaction);
  const summary = portfolioSummary(req.user.id);
  res.json({
    transfers,
    account: {
      currency: summary.currency,
      balanceCents: summary.balanceCents,
      availableCents: summary.availableCents,
      pendingDepositCents: summary.pendingDepositCents,
      pendingWithdrawalCents: summary.pendingWithdrawalCents,
    },
    simulated: true,
    notice: 'Requests are reviewed by an administrator. This demo never moves real funds.',
  });
});

router.post('/transfers', rateLimit({ key: 'transfers', windowMs: 60 * 60 * 1000, max: 20 }), (req, res) => {
  const kind = String(req.body?.kind || '');
  const amount = Number(req.body?.amount);
  const method = clean(req.body?.method, 40) || 'Bank transfer';
  const note = clean(req.body?.note, 240);

  if (!['deposit', 'withdrawal'].includes(kind)) {
    return res.status(400).json({ error: 'invalid_kind', message: 'Choose a deposit or withdrawal request.' });
  }
  if (!Number.isFinite(amount) || amount < 10 || amount > 1_000_000) {
    return res.status(400).json({ error: 'invalid_amount', message: 'Enter an amount between 10 and 1,000,000 USD.' });
  }

  const amountCents = Math.round(amount * 100);
  const account = accountFor(req.user.id);

  if (kind === 'withdrawal') {
    const pending = db
      .prepare(
        "SELECT COALESCE(SUM(-amount_cents),0) AS total FROM transactions WHERE user_id = ? AND kind = 'withdrawal' AND status = 'pending'"
      )
      .get(req.user.id).total;
    const available = account.balance_cents - Math.abs(pending);
    if (amountCents > available) {
      return res.status(400).json({
        error: 'insufficient_funds',
        message: 'The requested withdrawal exceeds your available demo balance.',
      });
    }
  }

  const reference = `NTX-${kind === 'deposit' ? 'DEP' : 'WDR'}-${Date.now().toString().slice(-8)}`;
  const id = newId('txn');

  db.prepare(
    `INSERT INTO transactions (id, user_id, kind, status, amount_cents, currency, method, reference, note, is_demo)
     VALUES (?, ?, ?, 'pending', ?, 'USD', ?, ?, ?, 1)`
  ).run(id, req.user.id, kind, kind === 'deposit' ? amountCents : -amountCents, method, reference, note);

  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: `${kind}_requested`,
    targetType: 'transaction',
    targetId: id,
    detail: `Simulated ${kind} request of ${(amountCents / 100).toFixed(2)} USD via ${method}`,
    ip: ip(req),
  });

  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.status(201).json({
    transfer: serializeTransaction(row),
    message:
      'Request submitted for administrator review. This is a simulated request — no real funds will move.',
  });
});

router.post('/transfers/:id/cancel', (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found', message: 'Request not found.' });
  if (row.status !== 'pending' || !['deposit', 'withdrawal'].includes(row.kind)) {
    return res.status(409).json({ error: 'not_cancellable', message: 'Only pending requests can be cancelled.' });
  }
  db.prepare("UPDATE transactions SET status = 'cancelled', reviewed_at = datetime('now'), reviewed_by = 'customer' WHERE id = ?").run(row.id);
  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: 'transfer_cancelled',
    targetType: 'transaction',
    targetId: row.id,
    detail: `${row.kind} request cancelled by customer`,
    ip: ip(req),
  });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Simulated trading                                                   */
/* ------------------------------------------------------------------ */

router.post('/trades', rateLimit({ key: 'trades', windowMs: 60 * 1000, max: 30 }), (req, res) => {
  const symbol = String(req.body?.symbol || '').toUpperCase();
  const side = String(req.body?.side || '').toLowerCase();
  const quantity = Number(req.body?.quantity);

  if (!isValidSymbol(symbol)) {
    return res.status(400).json({ error: 'invalid_symbol', message: 'Unknown instrument.' });
  }
  if (!['buy', 'sell'].includes(side)) {
    return res.status(400).json({ error: 'invalid_side', message: 'Choose buy or sell.' });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'invalid_quantity', message: 'Enter a quantity greater than zero.' });
  }

  const market = quote(symbol);
  const executionPrice = side === 'buy' ? market.ask : market.bid;
  const notionalCents = Math.round(quantity * executionPrice * 100);

  if (notionalCents < 1000) {
    return res.status(400).json({ error: 'order_too_small', message: 'Minimum order size is 10.00 USD.' });
  }
  if (notionalCents > 5_000_000_00) {
    return res.status(400).json({ error: 'order_too_large', message: 'Maximum single demo order is 5,000,000 USD.' });
  }

  const account = accountFor(req.user.id);
  const position = db.prepare('SELECT * FROM positions WHERE user_id = ? AND symbol = ?').get(req.user.id, symbol);

  try {
    const result = db.transaction(() => {
      if (side === 'buy') {
        if (notionalCents > account.balance_cents) {
          const error = new Error('Insufficient demo balance for this order.');
          error.statusCode = 400;
          error.code = 'insufficient_funds';
          throw error;
        }

        const newBalance = account.balance_cents - notionalCents;
        db.prepare("UPDATE accounts SET balance_cents = ?, updated_at = datetime('now') WHERE user_id = ?").run(
          newBalance,
          req.user.id
        );

        if (position) {
          const totalQty = position.quantity + quantity;
          const newAvg = (position.quantity * position.avg_cost + quantity * executionPrice) / totalQty;
          db.prepare("UPDATE positions SET quantity = ?, avg_cost = ?, updated_at = datetime('now') WHERE id = ?").run(
            totalQty,
            newAvg,
            position.id
          );
        } else {
          db.prepare(
            `INSERT INTO positions (id, user_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?, ?)`
          ).run(newId('pos'), req.user.id, symbol, quantity, executionPrice);
        }

        return newBalance;
      }

      if (!position || position.quantity < quantity) {
        const error = new Error('You do not hold enough of this instrument to sell.');
        error.statusCode = 400;
        error.code = 'insufficient_position';
        throw error;
      }

      const newBalance = account.balance_cents + notionalCents;
      db.prepare("UPDATE accounts SET balance_cents = ?, updated_at = datetime('now') WHERE user_id = ?").run(
        newBalance,
        req.user.id
      );

      const remaining = position.quantity - quantity;
      if (remaining <= 0.0000001) {
        db.prepare('DELETE FROM positions WHERE id = ?').run(position.id);
      } else {
        db.prepare("UPDATE positions SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(remaining, position.id);
      }
      return newBalance;
    })();

    const txId = newId('txn');
    const reference = `NTX-TRD-${Date.now().toString().slice(-9)}`;
    db.prepare(
      `INSERT INTO transactions (id, user_id, kind, status, amount_cents, currency, method, reference, note,
                                 symbol, quantity, price, balance_after_cents, is_demo, reviewed_at, reviewed_by)
       VALUES (?, ?, ?, 'completed', ?, 'USD', 'simulated-execution', ?, ?, ?, ?, ?, ?, 1, datetime('now'), 'simulator')`
    ).run(
      txId,
      req.user.id,
      side === 'buy' ? 'trade_buy' : 'trade_sell',
      side === 'buy' ? -notionalCents : notionalCents,
      reference,
      `Simulated ${side} · ${symbol}`,
      symbol,
      quantity,
      executionPrice,
      result
    );

    audit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: `demo_trade_${side}`,
      targetType: 'transaction',
      targetId: txId,
      detail: `${side} ${quantity} ${symbol} @ ${executionPrice} (simulated)`,
      ip: ip(req),
    });

    const summary = portfolioSummary(req.user.id);
    res.status(201).json({
      executed: {
        id: txId,
        symbol,
        side,
        quantity,
        price: executionPrice,
        notionalCents,
        simulated: true,
      },
      portfolio: {
        equityCents: summary.equityCents,
        balanceCents: summary.balanceCents,
        investedCents: summary.investedCents,
        pnlCents: summary.pnlCents,
        positions: summary.positions,
        allocation: summary.allocation,
        pnlPct: summary.pnlPct,
      },
      message: 'Simulated order filled locally. No real market order was placed.',
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.code || 'rejected', message: error.message });
    }
    throw error;
  }
});

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

router.patch('/profile', (req, res) => {
  const firstName = clean(req.body?.firstName, 60);
  const lastName = clean(req.body?.lastName, 60);
  const phone = clean(req.body?.phone, 40);
  const country = clean(req.body?.country, 60);
  const marketingOptIn = req.body?.marketingOptIn ? 1 : 0;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'invalid_name', message: 'First and last name are required.' });
  }
  if (!country) {
    return res.status(400).json({ error: 'invalid_country', message: 'Country is required.' });
  }

  db.prepare(
    `UPDATE users SET first_name = ?, last_name = ?, phone = ?, country = ?, marketing_opt_in = ?,
                      updated_at = datetime('now')
     WHERE id = ?`
  ).run(firstName, lastName, phone, country, marketingOptIn, req.user.id);

  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: 'profile_updated',
    targetType: 'user',
    targetId: req.user.id,
    detail: 'Customer updated profile details',
    ip: ip(req),
  });

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(fresh), message: 'Profile updated.' });
});

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

function ticketFor(userId, ticketId) {
  return db.prepare('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?').get(ticketId, userId);
}

router.get('/support', (req, res) => {
  const tickets = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count
       FROM support_tickets t WHERE t.user_id = ?
       ORDER BY datetime(t.updated_at) DESC`
    )
    .all(req.user.id);
  res.json({ tickets });
});

router.post('/support', rateLimit({ key: 'support', windowMs: 60 * 60 * 1000, max: 15 }), (req, res) => {
  const subject = clean(req.body?.subject, 140);
  const category = ['general', 'account', 'payments', 'security', 'technical'].includes(req.body?.category)
    ? req.body.category
    : 'general';
  const priority = ['low', 'normal', 'high'].includes(req.body?.priority) ? req.body.priority : 'normal';
  const message = clean(req.body?.message, 4000);

  if (subject.length < 4) {
    return res.status(400).json({ error: 'invalid_subject', message: 'Add a subject of at least 4 characters.' });
  }
  if (message.length < 10) {
    return res.status(400).json({ error: 'invalid_message', message: 'Describe your request in at least 10 characters.' });
  }

  const ticketId = newId('tkt');
  const authorName = `${req.user.first_name} ${req.user.last_name}`.trim();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO support_tickets (id, user_id, subject, category, priority, status) VALUES (?, ?, ?, ?, ?, 'open')`
    ).run(ticketId, req.user.id, subject, category, priority);
    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, author_id, author_role, author_name, body)
       VALUES (?, ?, ?, 'customer', ?, ?)`
    ).run(newId('msg'), ticketId, req.user.id, authorName, message);
  })();

  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: 'support_ticket_opened',
    targetType: 'ticket',
    targetId: ticketId,
    detail: subject,
    ip: ip(req),
  });

  res.status(201).json({ id: ticketId, message: 'Support request submitted.' });
});

router.get('/support/:id', (req, res) => {
  const ticket = ticketFor(req.user.id, req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found', message: 'Ticket not found.' });
  const messages = db
    .prepare('SELECT id, author_role, author_name, body, created_at FROM support_messages WHERE ticket_id = ? ORDER BY datetime(created_at), rowid')
    .all(ticket.id);
  res.json({ ticket, messages });
});

router.post('/support/:id/messages', rateLimit({ key: 'support-reply', windowMs: 60 * 60 * 1000, max: 40 }), (req, res) => {
  const ticket = ticketFor(req.user.id, req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found', message: 'Ticket not found.' });
  if (ticket.status === 'resolved') {
    return res.status(409).json({ error: 'ticket_resolved', message: 'This ticket is resolved. Open a new request.' });
  }
  const body = clean(req.body?.message, 4000);
  if (body.length < 2) return res.status(400).json({ error: 'invalid_message', message: 'Write a message first.' });

  const authorName = `${req.user.first_name} ${req.user.last_name}`.trim();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, author_id, author_role, author_name, body)
       VALUES (?, ?, ?, 'customer', ?, ?)`
    ).run(newId('msg'), ticket.id, req.user.id, authorName, body);
    db.prepare("UPDATE support_tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(ticket.id);
  })();

  res.status(201).json({ ok: true });
});

export default router;
