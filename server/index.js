import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DB_PATH, db } from './db.js';
import { attachUser, sameOriginGuard, sweepSessions } from './auth.js';
import { INSTRUMENTS, allQuotes, ASSET_CLASSES } from './market.js';
import { seedDemoData, ensureInstruments } from './seed.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIST = path.join(ROOT, 'dist', 'client');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '128kb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
      "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/admin/setup/status') || req.path.startsWith('/public')) {
    res.set('Cache-Control', 'no-store');
    return next();
  }
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(sameOriginGuard);
app.use(attachUser);
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) sweepSessions();
  next();
});

/* ------------------------------------------------------------------ */
/* Public endpoints                                                    */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  res.json({
    status: 'ok',
    app: 'NovaTradeX',
    mode: 'simulated-demo',
    database: 'sqlite',
    users,
    time: new Date().toISOString(),
  });
});

app.get('/api/public/overview', (_req, res) => {
  res.json({
    assetClasses: ASSET_CLASSES,
    instruments: allQuotes(),
    demoOnly: true,
    notice:
      'NovaTradeX is a simulated trading demo. Balances, prices, trades and transfers are illustrative only and no real money is handled.',
  });
});

app.get('/api/market/instruments', (_req, res) => {
  res.json({ instruments: allQuotes(), simulated: true });
});

/* ------------------------------------------------------------------ */
/* API routers                                                         */
/* ------------------------------------------------------------------ */

app.use('/api/auth', authRoutes);
app.use('/api/me', customerRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Unknown API endpoint.' });
});

/* ------------------------------------------------------------------ */
/* Static SPA                                                          */
/* ------------------------------------------------------------------ */

const hasClientBuild = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

if (hasClientBuild) {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
      },
    })
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(503).type('html').send(
      `<!doctype html><html><head><title>NovaTradeX</title>
       <style>body{background:#050914;color:#e8eefb;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0}
       code{background:#0d1730;padding:2px 6px;border-radius:4px}</style></head>
       <body><div><h1>NovaTradeX API is running</h1>
       <p>The web client has not been built yet. Run <code>npm run build</code> and restart.</p></div></body></html>`
    );
  });
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

app.use((error, req, res, _next) => {
  const status = error.statusCode || 500;
  if (status >= 500) {
    console.error('[novatradex] request failed:', error);
    if (req.path.startsWith('/api')) {
      return res.status(500).json({ error: 'server_error', message: 'Something went wrong. Please try again.' });
    }
    return res.status(500).send('Server error');
  }
  res.status(status).json({ error: error.code || 'bad_request', message: error.message });
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function start() {
  ensureInstruments(INSTRUMENTS);
  const seedResult = await seedDemoData();

  app.listen(PORT, HOST, () => {
    console.log(`[novatradex] listening on http://${HOST}:${PORT}`);
    console.log(`[novatradex] database: ${DB_PATH}`);
    console.log(`[novatradex] client build: ${hasClientBuild ? CLIENT_DIST : 'missing (API only)'}`);
    if (seedResult.seeded) {
      console.log('[novatradex] demo data seeded');
    }
  });
}

start().catch((error) => {
  console.error('[novatradex] failed to start', error);
  process.exit(1);
});
