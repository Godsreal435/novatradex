import { db } from './db.js';
import { quote } from './market.js';

export const toCents = (value) => Math.round(Number(value) * 100);

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    phone: user.phone,
    country: user.country,
    accountTier: user.account_tier,
    isDemo: Boolean(user.is_demo),
    marketingOptIn: Boolean(user.marketing_opt_in),
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    approvedAt: user.approved_at,
    statusReason: user.status_reason,
  };
}

export function accountFor(userId) {
  return (
    db.prepare('SELECT id, currency, balance_cents FROM accounts WHERE user_id = ?').get(userId) || {
      id: null,
      currency: 'USD',
      balance_cents: 0,
    }
  );
}

export function pendingCents(userId, kind) {
  const row = db
    .prepare("SELECT COALESCE(SUM(-amount_cents), 0) AS total FROM transactions WHERE user_id = ? AND kind = ? AND status = 'pending'")
    .get(userId, kind);
  // deposits are stored positive, withdrawals negative
  return kind === 'deposit' ? Math.abs(row.total) : Math.abs(row.total);
}

export function positionsWithValue(userId) {
  const rows = db
    .prepare(
      `SELECT p.id, p.symbol, p.quantity, p.avg_cost, i.name, i.asset_class, i.precision, i.quote_unit
       FROM positions p JOIN instruments i ON i.symbol = p.symbol
       WHERE p.user_id = ? AND p.quantity > 0
       ORDER BY i.asset_class, p.symbol`
    )
    .all(userId);

  return rows.map((row) => {
    const q = quote(row.symbol);
    const price = q ? q.price : row.avg_cost;
    const valueCents = Math.round(row.quantity * price * 100);
    const costCents = Math.round(row.quantity * row.avg_cost * 100);
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      assetClass: row.asset_class,
      precision: row.precision,
      quoteUnit: row.quote_unit,
      quantity: row.quantity,
      avgCost: row.avg_cost,
      price,
      dayChangePct: q ? q.dayChangePct : 0,
      valueCents,
      costCents,
      pnlCents: valueCents - costCents,
      pnlPct: costCents ? Number((((valueCents - costCents) / costCents) * 100).toFixed(2)) : 0,
      simulated: true,
    };
  });
}

export function serializeTransaction(row) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    note: row.note,
    symbol: row.symbol,
    quantity: row.quantity,
    price: row.price,
    balanceAfterCents: row.balance_after_cents,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
  };
}

export function portfolioSummary(userId) {
  const account = accountFor(userId);
  const positions = positionsWithValue(userId);
  const investedCents = positions.reduce((sum, p) => sum + p.valueCents, 0);
  const pnlCents = positions.reduce((sum, p) => sum + p.pnlCents, 0);
  const costCents = positions.reduce((sum, p) => sum + p.costCents, 0);
  const pendingWithdrawals = pendingCents(userId, 'withdrawal');
  const pendingDeposits = pendingCents(userId, 'deposit');

  const byClass = new Map();
  for (const position of positions) {
    const current = byClass.get(position.assetClass) || 0;
    byClass.set(position.assetClass, current + position.valueCents);
  }

  return {
    currency: account.currency,
    balanceCents: account.balance_cents,
    availableCents: Math.max(0, account.balance_cents - pendingWithdrawals),
    pendingDepositCents: pendingDeposits,
    pendingWithdrawalCents: pendingWithdrawals,
    investedCents,
    costCents,
    pnlCents,
    pnlPct: costCents ? Number(((pnlCents / costCents) * 100).toFixed(2)) : 0,
    equityCents: account.balance_cents + investedCents,
    positions,
    allocation: [...byClass.entries()].map(([assetClass, valueCents]) => ({
      assetClass,
      valueCents,
      pct: investedCents ? Number(((valueCents / investedCents) * 100).toFixed(1)) : 0,
    })),
    simulated: true,
  };
}
