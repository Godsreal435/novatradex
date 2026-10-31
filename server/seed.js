import { db, newId, audit, getMeta, setMeta } from './db.js';
import { hashPassword } from './auth.js';
import { quote } from './market.js';

/**
 * Seeded demo data.
 *
 * Every seeded account is flagged `is_demo = 1` and shown with a DEMO badge in the
 * product. Nothing here represents real money, real custody or real execution.
 */
const DEMO_EMAIL = process.env.DEMO_CUSTOMER_EMAIL || 'demo@novatradex.com';
const DEMO_PASSWORD = process.env.DEMO_CUSTOMER_PASSWORD || 'DemoTrader!2024';
const DEMO_ADMIN = {
  email: process.env.DEMO_ADMIN_EMAIL || 'admin@novatradex.com',
  password: process.env.DEMO_ADMIN_PASSWORD || 'NovaOwner!2024',
};

const toCents = (value) => Math.round(value * 100);

function upsertInstrument(instrument) {
  db.prepare(
    `INSERT INTO instruments (symbol, name, asset_class, base_price, precision, quote_unit)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       name = excluded.name,
       asset_class = excluded.asset_class,
       base_price = excluded.base_price,
       precision = excluded.precision,
       quote_unit = excluded.quote_unit`
  ).run(instrument.symbol, instrument.name, instrument.assetClass, instrument.basePrice, instrument.precision, instrument.quoteUnit);
}

export function ensureInstruments(instruments) {
  const run = db.transaction((list) => list.forEach(upsertInstrument));
  run(instruments);
}

function makeUser({ email, password, firstName, lastName, role, status, isDemo, approvedBy, country, phone }) {
  const id = newId(role === 'admin' ? 'adm' : 'usr');
  const hash = password; // already-hashed value passed in
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, status, first_name, last_name, phone, country, is_demo,
                        created_at, updated_at, approved_at, approved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)`
  ).run(
    id,
    email,
    hash,
    role,
    status,
    firstName,
    lastName,
    phone || '',
    country || '',
    isDemo ? 1 : 0,
    status === 'active' || status === 'suspended' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
    approvedBy || null
  );
  db.prepare('INSERT INTO accounts (id, user_id, currency, balance_cents) VALUES (?, ?, ?, ?)').run(
    newId('acc'),
    id,
    'USD',
    0
  );
  return id;
}

function ledger(userId, entry) {
  db.prepare(
    `INSERT INTO transactions (id, user_id, kind, status, amount_cents, currency, method, reference, note,
                               symbol, quantity, price, balance_after_cents, is_demo, created_at, reviewed_at, reviewed_by)
     VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(
    newId('txn'),
    userId,
    entry.kind,
    entry.status,
    entry.amountCents,
    entry.method || '',
    entry.reference,
    entry.note || '',
    entry.symbol || null,
    entry.quantity ?? null,
    entry.price ?? null,
    entry.balanceAfter ?? null,
    entry.createdAt,
    entry.reviewedAt || null,
    entry.reviewedBy || null
  );
}

function addPosition(userId, symbol, quantity, avgCost, createdAt) {
  db.prepare(
    `INSERT INTO positions (id, user_id, symbol, quantity, avg_cost, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(newId('pos'), userId, symbol, quantity, avgCost, createdAt, createdAt);
}

const daysAgo = (days, hour = 10) => {
  const d = new Date(Date.now() - days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().replace('T', ' ').slice(0, 19);
};

export async function seedDemoData() {
  const resetKey = 'customer_balances_zeroed_v1';

  if (!getMeta(resetKey)) {
    db.transaction(() => {
      db.prepare(`
        UPDATE accounts
        SET balance_cents = 0, updated_at = datetime('now')
        WHERE user_id IN (
          SELECT id FROM users WHERE role = 'customer'
        )
      `).run();

      setMeta(resetKey, new Date().toISOString());

      audit({
        actorEmail: 'system',
        actorRole: 'system',
        action: 'customer_balances_reset_to_zero',
        targetType: 'system',
        targetId: resetKey,
        detail: 'All existing customer cash balances reset to zero.',
      });
    })();
  }
 
  if (process.env.DEMO_SEED === 'false') return { seeded: false, reason: 'disabled' };

  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (existing.count > 0) return { seeded: false, reason: 'already-populated' };

  const demoHash = await hashPassword(DEMO_PASSWORD);
  const adminHash = await hashPassword(DEMO_ADMIN.password);
  const sampleHash = await hashPassword('SamplePass!2024');

  const seed = db.transaction(() => {
    /* ---- demo administrator (setup is locked once any admin exists) */
    const demoAdminId = newId('adm');
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role, status, first_name, last_name, country, is_demo,
                          created_at, updated_at, approved_at, approved_by)
       VALUES (?, ?, ?, 'admin', 'active', 'Nova', 'Owner', 'Global', 1, datetime('now'), datetime('now'), datetime('now'), 'seed:owner')`
    ).run(demoAdminId, DEMO_ADMIN.email, adminHash);
    db.prepare('INSERT INTO accounts (id, user_id, currency, balance_cents) VALUES (?, ?, ?, 0)').run(
      newId('acc'),
      demoAdminId,
      'USD'
    );
    audit({
      actorId: demoAdminId,
      actorEmail: DEMO_ADMIN.email,
      actorRole: 'admin',
      action: 'owner_setup_completed',
      targetType: 'user',
      targetId: demoAdminId,
      detail: 'Demo owner administrator seeded — owner setup endpoint is now locked',
    });

    /* ---- primary demo trader -------------------------------------- */
    const demoId = makeUser({
      email: DEMO_EMAIL,
      password: demoHash,
      firstName: 'Ava',
      lastName: 'Mercer',
      role: 'customer',
      status: 'active',
      isDemo: true,
      approvedBy: 'seed:demo',
      country: 'United Kingdom',
      phone: '+44 20 7946 0958',
    });

    

    const holdings = [
      { symbol: 'EUR/USD', quantity: 50_000, avgCost: 1.082, at: daysAgo(30) },
      { symbol: 'BTC/USD', quantity: 0.75, avgCost: 64_800, at: daysAgo(26) },
      { symbol: 'NVDA', quantity: 120, avgCost: 112.4, at: daysAgo(19) },
      { symbol: 'XAU/USD', quantity: 15, avgCost: 2340.1, at: daysAgo(12) },
    ];

    holdings.forEach((holding, index) => {
      const current = quote(holding.symbol);
      const price = current ? current.price : holding.avgCost;
      const notional = toCents(holding.quantity * price);
      
      addPosition(demoId, holding.symbol, holding.quantity, holding.avgCost, holding.at);
      ledger(demoId, {
        kind: 'trade_buy',
        status: 'completed',
        amountCents: -notional,
        method: 'simulated-execution',
        reference: `NTX-DEMO-TRADE-${String(index + 1).padStart(3, '0')}`,
        note: `Simulated market buy · ${holding.symbol}`,
        symbol: holding.symbol,
        quantity: holding.quantity,
        price,
        
        createdAt: holding.at,
      });
    });

    

    /* A pending withdrawal and deposit so the admin review queue is demonstrable. */
    ledger(demoId, {
      kind: 'deposit',
      status: 'pending',
      amountCents: 5_000_00,
      method: 'Bank transfer',
      reference: 'NTX-DEMO-DEP-4471',
      note: 'Simulated deposit request awaiting review',
      createdAt: daysAgo(3, 9),
    });

    ledger(demoId, {
      kind: 'withdrawal',
      status: 'pending',
      amountCents: 2_500_00,
      method: 'Bank transfer',
      reference: 'NTX-DEMO-WDR-8820',
      note: 'Simulated withdrawal request awaiting review',
      createdAt: daysAgo(2, 15),
    });

    const ticketId = newId('tkt');
    db.prepare(
      `INSERT INTO support_tickets (id, user_id, subject, category, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'answered', ?, ?)`
    ).run(
      ticketId,
      demoId,
      'How do I enable two-factor authentication?',
      'security',
      'normal',
      daysAgo(5, 11),
      daysAgo(4, 9)
    );
    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, author_id, author_role, author_name, body, created_at)
       VALUES (?, ?, ?, 'customer', ?, ?, ?)`
    ).run(newId('msg'), ticketId, demoId, 'Ava Mercer', 'I would like to add an extra layer of security to my demo account. Where can I enable 2FA?', daysAgo(5, 11));
    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, author_id, author_role, author_name, body, created_at)
       VALUES (?, ?, NULL, 'system', ?, ?, ?)`
    ).run(
      newId('msg'),
      ticketId,
      'NovaTradeX Support',
      'Two-factor authentication is on the roadmap for this demo build. Sessions are already protected with httpOnly cookies and server-side role checks.',
      daysAgo(4, 9)
    );

    /* ---- sample customers for the admin console -------------------- */
    const pendingId = makeUser({
      email: 'jordan.lee@example.com',
      password: sampleHash,
      firstName: 'Jordan',
      lastName: 'Lee',
      role: 'customer',
      status: 'pending',
      isDemo: true,
      country: 'Singapore',
      phone: '+65 6123 4567',
    });
    audit({
      actorId: null,
      actorEmail: 'system',
      actorRole: 'system',
      action: 'registration_submitted',
      targetType: 'user',
      targetId: pendingId,
      detail: 'Sample demo registration awaiting administrator review',
    });

    const activeId = makeUser({
      email: 'amara.okafor@example.com',
      password: sampleHash,
      firstName: 'Amara',
      lastName: 'Okafor',
      role: 'customer',
      status: 'active',
      isDemo: true,
      approvedBy: 'seed:demo',
      country: 'Nigeria',
      phone: '+234 802 555 0110',
    });
    ledger(activeId, {
      kind: 'deposit',
      status: 'pending',
      amountCents: 10_000_00,
      method: 'Card',
      reference: 'NTX-DEMO-DEP-9931',
      note: 'Simulated deposit request awaiting review',
      createdAt: daysAgo(1, 14),
    });

    db.prepare(
      `INSERT INTO support_tickets (id, user_id, subject, category, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
    ).run(newId('tkt'), activeId, 'Portfolio value does not include my pending deposit', 'account', 'normal', daysAgo(1, 16), daysAgo(1, 16));

    audit({
      actorId: null,
      actorEmail: 'system',
      actorRole: 'system',
      action: 'demo_data_seeded',
      targetType: 'system',
      targetId: 'seed',
      detail: 'Seeded demo customers, simulated ledger entries and support tickets',
    });
  });

  seed();
  return { seeded: true, demoEmail: DEMO_EMAIL };
}

export const DEMO_ACCOUNT = { email: DEMO_EMAIL, password: DEMO_PASSWORD };
