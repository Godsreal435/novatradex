import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Resolve the database location.
 * Priority: DATABASE_PATH > writable DATA_DIR / /data (container volume) > ./data
 */
function resolveDbPath() {
  if (process.env.DATABASE_PATH) {
    fs.mkdirSync(path.dirname(process.env.DATABASE_PATH), { recursive: true });
    return process.env.DATABASE_PATH;
  }
  const candidates = [process.env.DATA_DIR, '/data', path.resolve(process.cwd(), 'data')].filter(Boolean);
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return path.join(dir, 'novatradex.db');
    } catch {
      /* try next candidate */
    }
  }
  throw new Error('No writable directory available for the NovaTradeX database');
}

export const DB_PATH = resolveDbPath();
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','suspended','rejected')),
  first_name        TEXT NOT NULL DEFAULT '',
  last_name         TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  country           TEXT NOT NULL DEFAULT '',
  account_tier      TEXT NOT NULL DEFAULT 'demo-starter',
  is_demo           INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  marketing_opt_in  INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at       TEXT,
  approved_by       TEXT,
  status_reason     TEXT,
  last_login_at     TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  currency       TEXT NOT NULL DEFAULT 'USD',
  balance_cents  INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT,
  ip           TEXT NOT NULL DEFAULT '',
  user_agent   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS instruments (
  symbol       TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  asset_class  TEXT NOT NULL CHECK (asset_class IN ('forex','crypto','stocks','gold')),
  base_price   REAL NOT NULL,
  precision    INTEGER NOT NULL DEFAULT 2,
  quote_unit   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS positions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL REFERENCES instruments(symbol),
  quantity   REAL NOT NULL CHECK (quantity >= 0),
  avg_cost   REAL NOT NULL CHECK (avg_cost > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal','trade_buy','trade_sell','fee','bonus','adjustment')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','completed','cancelled')),
  amount_cents        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  method              TEXT NOT NULL DEFAULT '',
  reference           TEXT NOT NULL UNIQUE,
  note                TEXT NOT NULL DEFAULT '',
  symbol              TEXT,
  quantity            REAL,
  price               REAL,
  balance_after_cents INTEGER,
  is_demo             INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0,1)),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at         TEXT,
  reviewed_by         TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status, kind);

CREATE TABLE IF NOT EXISTS support_tickets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'general',
  priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('customer','admin','system')),
  author_name TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON support_messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * Database-level access policies.
 * These guarantees hold even if application code is bypassed:
 *  - the money ledger is append-only (amounts/ownership cannot be rewritten or deleted)
 *  - a customer row can never be escalated to admin with an UPDATE (admins are only
 *    created through the audited first-owner provisioning path)
 *  - an account can only become active with a recorded approver
 *  - audit records cannot be deleted
 */
const POLICIES = `
CREATE TRIGGER IF NOT EXISTS trg_tx_amounts_immutable
BEFORE UPDATE OF amount_cents, kind, user_id, reference, currency ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions ledger is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_tx_no_delete
BEFORE DELETE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions ledger is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_no_customer_role_elevation
BEFORE UPDATE OF role ON users
WHEN OLD.role = 'customer' AND NEW.role = 'admin'
BEGIN
  SELECT RAISE(ABORT, 'customer accounts can never be elevated to administrator');
END;

CREATE TRIGGER IF NOT EXISTS trg_active_requires_approver
BEFORE UPDATE OF status ON users
WHEN NEW.status = 'active' AND NEW.approved_by IS NULL
BEGIN
  SELECT RAISE(ABORT, 'account activation requires a recorded approver');
END;
`;

db.exec(SCHEMA);
db.exec(POLICIES);

export const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

export function getMeta(key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  db.prepare(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function audit({ actorId = null, actorEmail = '', actorRole = '', action, targetType = '', targetId = '', detail = '', ip = '' }) {
  db.prepare(
    `INSERT INTO audit_log (id, actor_id, actor_email, actor_role, action, target_type, target_id, detail, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId('aud'), actorId, actorEmail, actorRole, action, targetType, targetId, detail, ip);
}
