# NovaTradeX

A simulated multi-asset brokerage platform — Forex, Cryptocurrency, Stocks and Gold — built as a
full-stack demo (React + Vite client, Express API, SQLite database).

> **Demo only.** Every balance, price, trade and transfer in NovaTradeX is simulated. No real money is
> custodyied, transferred or invested, and no real profit is implied. Do not use this build to accept
> real deposits without the licensing, custody and regulatory infrastructure that a live broker requires.

## Features

**Public site** — premium navy/royal-blue landing page with asset-class sections, plus exactly two
primary calls to action: *Login* and *Create Account*.

**Customer** — self-registration (lands in `pending`), approval-gated sign-in, dashboard with demo
balance and portfolio, simulated trading, deposit/withdrawal requests, transaction history, support
tickets with threaded replies, and profile/password settings.

**Administrator** — separate private sign-in plus a one-time, token-gated first-owner setup that locks
permanently once any admin exists. Console covers stats, customer management (approve/reject/suspend/
reactivate), payment review, full ledger, support inbox and audit trail.

## Security model

- Passwords hashed with `scrypt` (per-user salt, constant-time compare).
- Opaque session tokens in the database, delivered as `httpOnly`, `sameSite=lax` cookies — no tokens
  in `localStorage` and nothing sensitive in the client bundle.
- Role and status are assigned by the server: client-supplied `role`, `status` or balance fields are
  ignored on registration.
- Every `/api/admin/*` route is behind `requireAdmin`; a customer cookie receives `403`, no cookie `401`.
- Database triggers enforce the invariants that application code cannot be trusted to keep:
  customer→admin role escalation, mutating a settled transaction amount, deleting ledger or audit rows,
  and activating an account without an approver.
- Rate limits on login, registration, setup and transfer/support endpoints; same-origin guard on
  mutating requests; CSP and hardening headers; `no-store` on all API responses.

## Local development

```bash
npm install
npm run build     # client -> dist/client
npm start         # http://localhost:3000
```

`npm run dev` builds then starts. `npm test` runs the API regression suite (`tests/api.test.js`, 46
checks) against a throwaway database — no fixtures or external services required.

## Configuration

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
| --- | --- |
| `PORT` / `HOST` | Listen port (default `3000`) and interface (`0.0.0.0`) |
| `DATABASE_PATH` | Explicit SQLite file. Otherwise falls back to `DATA_DIR`, then `/data`, then `./data` |
| `DATA_DIR` | Directory for the SQLite file |
| `DEMO_SEED` | `false` disables demo seeding (used by the tests) |
| `OWNER_SETUP_TOKEN` | Required by `/admin/setup`; without it the setup endpoint returns `503` |
| `DEMO_*_EMAIL` / `DEMO_*_PASSWORD` | Override the seeded demo credentials |

## Demo credentials (seeded)

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@novatradex.com` | `NovaOwner!2024` |
| Customer | `demo@novatradex.com` | `DemoTrader!2024` |

The seed also creates additional sample customers with pending/active/suspended states so the admin
queues are populated. To claim the owner slot yourself instead, deploy with `DEMO_SEED=false` and set
`OWNER_SETUP_TOKEN`, then visit `/admin/setup`.

## Storage and persistence

SQLite is a real database with foreign keys, CHECK constraints, triggers and a WAL journal. However the
default deployment path is inside the container: **if no volume is mounted, all data (users, tickets,
ledger) resets on every redeploy**. Mount a persistent disk at `/data` (and optionally set
`DATA_DIR=/data`) for data that survives deployments.

For a production financial system the natural next step is Postgres with row-level security plus a
managed KYC/payments provider; this build deliberately stops at a safe, clearly-labelled simulation.
