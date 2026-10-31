/**
 * Real-browser smoke test for NovaTradeX.
 *
 * Boots the production server (`node server/index.js`, NODE_ENV=production) against a
 * throwaway SQLite file, then drives Chromium through the public site, both login
 * journeys and the unauthenticated route guards.
 *
 * Run: node tests/ui.smoke.cjs
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('/opt/appjet/browser/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = '/opt/appjet/browser-binaries/chromium-1234/chrome-linux64/chrome';

const CUSTOMER = { email: 'demo@novatradex.com', password: 'DemoTrader!2024' };
const ADMIN = { email: 'admin@novatradex.com', password: 'NovaOwner!2024' };

const failures = [];
const passes = [];

function check(name, condition, detail) {
  if (condition) {
    passes.push(name);
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for a text fragment, returning false instead of throwing. */
async function waitForText(page, text, timeout = 20000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** Read any visible validation/error banner so a failed sign-in reports *why*. */
async function alertText(page) {
  const alerts = await page.locator('.alert').allInnerTexts().catch(() => []);
  return alerts.join(' / ').replace(/\s+/g, ' ').trim();
}

async function signIn(page, { email, password }) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

/**
 * Submit the form and wait for the post-login landmark.
 * Retries once only when no error banner appeared (a hydration race swallows the
 * first click); a visible alert is a genuine credential failure and is reported.
 */
async function signInAndWait(page, url, credentials, expectText) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('button[type="submit"]').waitFor({ state: 'visible', timeout: 20000 });
    await signIn(page, credentials);
    if (await waitForText(page, expectText, 15000)) return { ok: true, attempt };
    const alert = await alertText(page);
    if (alert) return { ok: false, alert };
    await sleep(500);
  }
  return { ok: false, alert: (await alertText(page)) || 'form submit produced no navigation and no error' };
}

async function waitForHealth(deadlineMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === 'ok') return body;
      }
    } catch {
      /* server not up yet */
    }
    await sleep(250);
  }
  throw new Error('server did not become healthy in time');
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novatradex-ui-'));
  if (!fs.existsSync(path.join(ROOT, 'dist/client/index.html'))) {
    throw new Error('dist/client/index.html is missing — run `npm run build` first');
  }

  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST: '0.0.0.0',
      DATABASE_PATH: path.join(dir, 'ui.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
  server.on('exit', (code) => { serverLog += `\n[server exited with code ${code}]`; });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const health = await waitForHealth();
    check('production server boots and reports healthy', health.status === 'ok');
    check('health payload declares simulated demo mode', health.mode === 'simulated-demo', JSON.stringify(health));

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    /* ---- public homepage ---- */
    const home = await page.goto(BASE, { waitUntil: 'networkidle' });
    check('homepage responds 200', home.status() === 200, `status ${home.status()}`);
    check('homepage renders the brand', await page.getByText('NovaTradeX').first().isVisible());

    for (const section of ['Forex', 'Cryptocurrency', 'Stocks', 'Gold']) {
      const visible = await page.getByText(section, { exact: false }).first().isVisible().catch(() => false);
      check(`homepage shows the ${section} section`, visible);
    }

    const loginCta = page.getByRole('link', { name: 'Login', exact: true }).first();
    const registerCta = page.getByRole('link', { name: 'Create Account', exact: true }).first();
    check('homepage has a Login CTA', await loginCta.isVisible());
    check('homepage has a Create Account CTA', await registerCta.isVisible());
    check('Login CTA targets /login', (await loginCta.getAttribute('href')) === '/login');
    check('Create Account CTA targets /register', (await registerCta.getAttribute('href')) === '/register');

    const otherPrimaries = await page.evaluate(() => {
      const allowed = new Set(['login', 'create account']);
      return [...document.querySelectorAll('.btn-primary')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.textContent.trim().toLowerCase())
        .filter((label) => label && !allowed.has(label));
    });
    check('no primary buttons besides Login and Create Account', otherPrimaries.length === 0, otherPrimaries.join(', '));

    /* ---- auth screens ---- */
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    check('/login shows the customer sign-in form', await page.locator('input[type="email"]').isVisible());

    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
    check('/register shows the registration form', await page.locator('input[type="email"]').isVisible());
    check('/register states approval is required', (await page.content()).toLowerCase().includes('approv'));

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    check('/admin/login shows the administrator form', await page.locator('input[type="email"]').isVisible());

    /* ---- unauthenticated guards ---- */
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
    check('/app redirects an anonymous visitor to /login', page.url().includes('/login'), page.url());

    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    check('/admin redirects an anonymous visitor to /admin/login', page.url().includes('/admin/login'), page.url());

    /* ---- customer login journey ---- */
    const customerLogin = await signInAndWait(page, `${BASE}/login`, CUSTOMER, 'Cash demo balance');
    if (!customerLogin.ok) {
      check('seeded customer reaches the dashboard', false, `${page.url()} — alert: ${customerLogin.alert}`);
    } else {
      check('seeded customer reaches the dashboard', page.url().includes('/app'), page.url());
      check('dashboard greets the customer', await waitForText(page, 'Welcome back,', 10000));
    }
    check('dashboard labels the balance as demo', await waitForText(page, 'Demo balance', 10000));
    check('dashboard labels prices as simulated', await waitForText(page, 'simulated', 10000));

    await page.goto(`${BASE}/app/transfers`, { waitUntil: 'networkidle' });
    check('transfers page warns that money movement is simulated', (await page.content()).toLowerCase().includes('simulat'));

    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    check('a customer is blocked from the admin console', page.url().includes('/admin/login'), page.url());

    await context.close();

    /* ---- administrator journey ---- */
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    adminPage.on('pageerror', (error) => pageErrors.push(error.message));

    await adminPage.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await signIn(adminPage, ADMIN);
    const adminDashboard = await waitForText(adminPage, 'Operations dashboard');
    if (!adminDashboard) {
      check('seeded administrator reaches the console', false, `${adminPage.url()} — alert: ${await alertText(adminPage)}`);
      check('admin dashboard renders', false, 'dashboard heading never appeared');
    } else {
      check('seeded administrator reaches the console', adminPage.url().endsWith('/admin'), adminPage.url());
      check('admin dashboard renders', true);
    }

    for (const [route, needle] of [
      ['/admin/customers', 'Customer'],
      ['/admin/payments', ''],
      ['/admin/ledger', ''],
      ['/admin/support', ''],
    ]) {
      await adminPage.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      const onLoginScreen = await adminPage.locator('input[type="email"]').isVisible().catch(() => false);
      const body = (await adminPage.content()).toLowerCase();
      check(`admin route ${route} stays authenticated`, !onLoginScreen, adminPage.url());
      check(`admin route ${route} renders without an error screen`, !body.includes('something went wrong'), route);
      if (needle) check(`admin route ${route} lists customers`, body.includes(needle.toLowerCase()));
      check(`admin route ${route} carries a demo label`, body.includes('demo') || body.includes('simulat'));
    }

    await adminContext.close();

    /* ---- mobile viewport ---- */
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(BASE, { waitUntil: 'networkidle' });
    const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('homepage does not overflow a 390px viewport', overflow <= 2, `${overflow}px horizontal overflow`);
    check('mobile homepage still exposes the Login control', await mobilePage.getByRole('link', { name: 'Login', exact: true }).first().isVisible());
    await mobile.close();

    check('no uncaught page errors during the walkthrough', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    await sleep(200);
    if (!server.killed || server.exitCode === null) server.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
    if (failures.length) console.log(`\n--- server output ---\n${serverLog.trim()}`);
  }

  console.log(`\n${passes.length} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(` - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nUI smoke run crashed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
