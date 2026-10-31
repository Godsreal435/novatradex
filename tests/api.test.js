/**
 * NovaTradeX API regression suite (simulated demo platform).
 *
 * Boots the real Express server against a throwaway SQLite database and
 * exercises registration, approval, auth, customer/admin authorization
 * boundaries, payment review, support, and schema-level guards.
 *
 * Run with: npm test
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT || 4287);
const BASE = `http://127.0.0.1:${PORT}`;
const SETUP_TOKEN = 'test-owner-token-value';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'novatradex-test-'));
const DB_FILE = path.join(TMP_DIR, 'test.db');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* Tiny cookie-jar HTTP client                                         */
/* ------------------------------------------------------------------ */

function makeClient() {
  const jar = new Map();
  return async function request(method, urlPath, body) {
    const headers = { origin: BASE };
    if (jar.size) {
      headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (body !== undefined) headers['content-type'] = 'application/json';

    const res = await fetch(`${BASE}${urlPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!value || /expires=Thu, 01 Jan 1970/i.test(raw)) jar.delete(name);
      else jar.set(name, value);
    }

    let json = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, body: json, text, headers: res.headers };
  };
}

/* ------------------------------------------------------------------ */
/* Server lifecycle                                                    */
/* ------------------------------------------------------------------ */

let child = null;

async function waitForServer(timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not become ready in time');
}

function startServer() {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: DB_FILE,
      DEMO_SEED: 'false',
      OWNER_SETUP_TOKEN: SETUP_TOKEN,
      // keep hashing cheap for the test run
      NODE_OPTIONS: process.env.NODE_OPTIONS || '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d.toString()));
  child.stderr.on('data', (d) => (output += d.toString()));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[server exited ${code}]\n${output}`);
  });
  return () => output;
}

function stopServer() {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  child = null;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

const CUSTOMER = {
  firstName: 'Ava',
  lastName: 'Bennett',
  email: `ava.${Date.now()}@example.com`,
  country: 'United Kingdom',
  phone: '+44 7700 900123',
  password: 'StrongDemo!2024',
};

async function run() {
  console.log(`NovaTradeX API regression — database ${DB_FILE}\n`);
  const serverOutput = startServer();
  const health = await waitForServer();
  check('health endpoint responds with simulated demo mode', health.status === 'ok' && health.mode === 'simulated-demo');

  const anon = makeClient();
  const customer = makeClient();
  const admin = makeClient();

  /* --- public catalog ------------------------------------------- */
  const assets = await anon('GET', '/api/public/overview');
  const catalog = JSON.stringify(assets.body ?? {}).toLowerCase();
  check(
    'public asset catalog covers Forex, Crypto, Stocks and Gold',
    assets.status === 200 && ['forex', 'crypto', 'stocks', 'commodities'].every((cl) => catalog.includes(cl)),
    `status ${assets.status}`
  );
  check(
    'public catalog is flagged as demo-only',
    assets.body?.demoOnly === true && typeof assets.body?.notice === 'string',
    JSON.stringify(assets.body?.notice ?? '').slice(0, 120)
  );

  /* --- owner setup token gate ----------------------------------- */
  const setupStatus0 = await anon('GET', '/api/admin/setup/status');
  check(
    'setup status reports an unclaimed owner slot',
    setupStatus0.status === 200 && setupStatus0.body.ownerConfigured === false && setupStatus0.body.setupAvailable === true,
    JSON.stringify(setupStatus0.body)
  );

  const badSetup = await anon('POST', '/api/admin/setup', {
    setupToken: 'definitely-wrong',
    email: 'owner@novatradex.test',
    password: 'OwnerPass!2024',
    firstName: 'Nova',
    lastName: 'Owner',
  });
  check('owner setup rejects an invalid setup token', badSetup.status === 403, `status ${badSetup.status}`);

  const goodSetup = await admin('POST', '/api/admin/setup', {
    setupToken: SETUP_TOKEN,
    email: 'owner@novatradex.test',
    password: 'OwnerPass!2024',
    firstName: 'Nova',
    lastName: 'Owner',
  });
  check(
    'owner setup succeeds with the correct token and creates an admin',
    goodSetup.status === 201 && goodSetup.body.user?.role === 'admin',
    `status ${goodSetup.status}`
  );

  const lockedSetup = await anon('POST', '/api/admin/setup', {
    setupToken: SETUP_TOKEN,
    email: 'second.owner@novatradex.test',
    password: 'OwnerPass!2024',
    firstName: 'Second',
    lastName: 'Owner',
  });
  check('owner setup is permanently locked after the first admin', lockedSetup.status === 409, `status ${lockedSetup.status}`);

  const setupStatus1 = await anon('GET', '/api/admin/setup/status');
  check(
    'setup status now reports the owner as configured',
    setupStatus1.body.ownerConfigured === true && setupStatus1.body.setupAvailable === false,
    JSON.stringify(setupStatus1.body)
  );

  /* --- registration + role injection ---------------------------- */
  const registered = await anon('POST', '/api/auth/register', {
    ...CUSTOMER,
    role: 'admin',
    status: 'active',
    isAdmin: true,
    balanceCents: 999999999,
  });
  check(
    'registration is accepted but lands in pending review',
    registered.status === 201 && registered.body.status === 'pending',
    `status ${registered.status} ${JSON.stringify(registered.body)}`
  );

  const pendingLogin = await customer('POST', '/api/auth/login', { email: CUSTOMER.email, password: CUSTOMER.password });
  check(
    'pending registrations cannot sign in',
    pendingLogin.status === 403 && pendingLogin.body.error === 'pending_approval',
    `status ${pendingLogin.status} ${JSON.stringify(pendingLogin.body)}`
  );

  const pendingMe = await customer('GET', '/api/me/overview');
  check('no session cookie means no dashboard access', pendingMe.status === 401, `status ${pendingMe.status}`);

  /* --- admin review of registrations ---------------------------- */
  const pendingList = await admin('GET', '/api/admin/customers?status=pending');
  const created = pendingList.body?.customers?.find((c) => c.email === CUSTOMER.email);
  check('new registration appears in the admin pending queue', Boolean(created), JSON.stringify(pendingList.body).slice(0, 240));
  check(
    'client-supplied role/status are ignored (stored as customer/pending)',
    created?.role === 'customer' && created?.status === 'pending',
    `role=${created?.role} status=${created?.status}`
  );

  const activated = await admin('PATCH', `/api/admin/customers/${created.id}/status`, { action: 'activate' });
  check('admin can approve a pending registration', activated.status === 200 && activated.body.customer.status === 'active');

  const customerOverviewAfterApproval = await (async () => {
    const login = await customer('POST', '/api/auth/login', { email: CUSTOMER.email, password: CUSTOMER.password });
    check('approved customer can sign in', login.status === 200 && login.body.user.status === 'active', `status ${login.status}`);
    return customer('GET', '/api/me/overview');
  })();
  check(
    'customer dashboard loads with the demo starting balance',
    customerOverviewAfterApproval.status === 200 &&
      customerOverviewAfterApproval.body.account?.balanceCents === 10_000_000,
    `status ${customerOverviewAfterApproval.status} balance=${customerOverviewAfterApproval.body?.account?.balanceCents}`
  );
  check(
    'customer dashboard payload is explicitly flagged as simulated',
    customerOverviewAfterApproval.body?.simulated === true,
    JSON.stringify(customerOverviewAfterApproval.body?.disclaimer)
  );

  /* --- authorization boundary ----------------------------------- */
  for (const route of ['/api/admin/overview', '/api/admin/customers', '/api/admin/payments', '/api/admin/transactions']) {
    const res = await customer('GET', route);
    check(`customer session is rejected by ${route}`, res.status === 403, `status ${res.status}`);
  }
  const anonAdmin = await anon('GET', '/api/admin/overview');
  check('anonymous requests to /api/admin/overview return 401', anonAdmin.status === 401, `status ${anonAdmin.status}`);

  const customerLoginAsAdmin = await admin('POST', '/api/admin/login', {
    email: CUSTOMER.email,
    password: CUSTOMER.password,
  });
  check(
    'customer credentials are refused by the private admin login',
    customerLoginAsAdmin.status === 403 || customerLoginAsAdmin.status === 401,
    `status ${customerLoginAsAdmin.status}`
  );

  /* --- payment request lifecycle -------------------------------- */
  const rejectedCash = await customer('POST', '/api/me/transfers', { kind: 'withdrawal', amount: 5 });
  check('withdrawal requests below the minimum are rejected', rejectedCash.status === 400, `status ${rejectedCash.status}`);

  const deposit = await customer('POST', '/api/me/transfers', { kind: 'deposit', amount: 2500, method: 'Bank transfer' });
  check('customer can submit a simulated deposit request', deposit.status === 201 && deposit.body.transfer.status === 'pending');

  const payments = await admin('GET', '/api/admin/payments?status=pending');
  const pendingDeposit = payments.body?.payments?.find((p) => p.id === deposit.body.transfer.id);
  check('the deposit request appears in the admin payment queue', Boolean(pendingDeposit));

  const approvedPayment = await admin('PATCH', `/api/admin/payments/${deposit.body.transfer.id}`, { action: 'approve' });
  check('admin can approve a deposit request', approvedPayment.status === 200 && approvedPayment.body.payment.status === 'approved');

  const afterDeposit = await customer('GET', '/api/me/overview');
  check(
    'approved deposit increases the demo balance exactly once',
    afterDeposit.body?.account?.balanceCents === 10_000_000 + 250_000,
    `balance=${afterDeposit.body?.account?.balanceCents}`
  );

  const doubleApprove = await admin('PATCH', `/api/admin/payments/${deposit.body.transfer.id}`, { action: 'approve' });
  check('a reviewed payment cannot be approved twice', doubleApprove.status === 409, `status ${doubleApprove.status}`);

  const ledger = await admin('GET', '/api/admin/transactions');
  check(
    'admin ledger lists the reviewed transaction',
    ledger.status === 200 && (ledger.body?.transactions ?? []).some((t) => t.id === deposit.body.transfer.id),
    `status ${ledger.status}`
  );

  /* --- support workflow ----------------------------------------- */
  const ticket = await customer('POST', '/api/me/support', {
    subject: 'Simulated KYC question',
    category: 'account',
    message: 'How does the demo verification flow work on this platform?',
  });
  check('customer can open a support ticket', ticket.status === 201 && Boolean(ticket.body.id), `status ${ticket.status}`);

  const adminTickets = await admin('GET', '/api/admin/support');
  check(
    'support ticket is visible to administrators',
    adminTickets.status === 200 && JSON.stringify(adminTickets.body).includes('Simulated KYC question'),
    `status ${adminTickets.status}`
  );

  const adminReply = await admin('POST', `/api/admin/support/${ticket.body.id}/messages`, {
    body: 'This is a simulated environment, so no real KYC documents are required.',
  });
  check('administrator can reply to a support ticket', adminReply.status === 201 || adminReply.status === 200, `status ${adminReply.status}`);

  const customerTicket = await customer('GET', `/api/me/support/${ticket.body.id}`);
  check(
    'customer sees the administrator reply',
    customerTicket.status === 200 && JSON.stringify(customerTicket.body).includes('no real KYC documents'),
    `status ${customerTicket.status}`
  );

  const otherCustomer = makeClient();
  const strangerRegister = await otherCustomer('POST', '/api/auth/register', {
    firstName: 'Miles',
    lastName: 'Ford',
    email: `miles.${Date.now()}@example.com`,
    country: 'Canada',
    password: 'StrongDemo!2024',
  });
  if (strangerRegister.status === 201) {
    const strangerList = await admin('GET', '/api/admin/customers?status=pending');
    const stranger = strangerList.body?.customers?.find((c) => c.lastName === 'Ford');
    if (stranger) await admin('PATCH', `/api/admin/customers/${stranger.id}/status`, { action: 'activate' });
    await otherCustomer('POST', '/api/auth/login', { email: stranger?.email, password: 'StrongDemo!2024' });
    const foreignTicket = await otherCustomer('GET', `/api/me/support/${ticket.body.id}`);
    check('a different customer cannot read someone else’s ticket', foreignTicket.status === 404, `status ${foreignTicket.status}`);
  }

  /* --- suspension ------------------------------------------------ */
  const suspended = await admin('PATCH', `/api/admin/customers/${created.id}/status`, {
    action: 'suspend',
    reason: 'Regression test',
  });
  check('admin can suspend an active customer', suspended.status === 200 && suspended.body.customer.status === 'suspended');

  const blockedAfterSuspend = await customer('GET', '/api/me/overview');
  check('suspended customer sessions lose dashboard access', blockedAfterSuspend.status === 401 || blockedAfterSuspend.status === 403, `status ${blockedAfterSuspend.status}`);

  const suspendedLogin = await anon('POST', '/api/auth/login', { email: CUSTOMER.email, password: CUSTOMER.password });
  check('suspended customer cannot sign back in', suspendedLogin.status === 403, `status ${suspendedLogin.status}`);

  const reactivated = await admin('PATCH', `/api/admin/customers/${created.id}/status`, { action: 'reactivate' });
  check('admin can reactivate a suspended customer', reactivated.status === 200 && reactivated.body.customer.status === 'active');

  /* --- audit trail ----------------------------------------------- */
  const auditLog = await admin('GET', '/api/admin/audit');
  const auditActions = (auditLog.body?.entries ?? auditLog.body?.audit ?? []).map((e) => e.action);
  check(
    'audit log recorded setup, approvals and payment review',
    auditLog.status === 200 &&
      ['owner_setup_completed', 'customer_activate', 'payment_approved'].every((a) => auditActions.includes(a)),
    auditActions.slice(0, 12).join(',')
  );

  /* --- database-level guards ------------------------------------- */
  const { default: Database } = await import('better-sqlite3');
  const direct = new Database(DB_FILE, { readonly: false, fileMustExist: true });
  direct.pragma('busy_timeout = 5000');
  try {
    let roleBlocked = false;
    try {
      direct.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(created.id);
    } catch {
      roleBlocked = true;
    }
    check('database trigger blocks customer→admin role escalation', roleBlocked);

    const txId = deposit.body.transfer.id;
    let tamperBlocked = false;
    try {
      direct.prepare('UPDATE transactions SET amount_cents = 1 WHERE id = ?').run(txId);
    } catch {
      tamperBlocked = true;
    }
    check('database trigger blocks editing a settled transaction amount', tamperBlocked);

    let deleteBlocked = false;
    try {
      direct.prepare('DELETE FROM transactions WHERE id = ?').run(txId);
    } catch {
      deleteBlocked = true;
    }
    check('database trigger blocks deleting ledger rows', deleteBlocked);
  } finally {
    direct.close();
  }

  /* --- secrets in client bundle ---------------------------------- */
  const distDir = path.join(ROOT, 'dist', 'client', 'assets');
  if (fs.existsSync(distDir)) {
    const bundle = fs
      .readdirSync(distDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(distDir, f), 'utf8'))
      .join('\n');
    check(
      'client bundle contains no setup token or password hashes',
      !bundle.includes(SETUP_TOKEN) && !bundle.includes('OWNER_SETUP_TOKEN') && !bundle.includes('scrypt'),
      'bundle scan'
    );
  } else {
    console.log('  skip client bundle scan (run npm run build first)');
  }

  const tail = serverOutput();
  if (failures.length) {
    console.error('\n--- server output (tail) ---\n' + tail.split('\n').slice(-25).join('\n'));
  }
  stopServer();

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:\n' + failures.map((f) => ` - ${f}`).join('\n'));
    process.exitCode = 1;
  }
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  console.error('\nTest run crashed:', error);
  stopServer();
  exitCode = 1;
} finally {
  stopServer();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  if (exitCode) process.exitCode = exitCode;
}
