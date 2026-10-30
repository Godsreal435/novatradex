import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { DemoBadge } from '../components/ui';
import { price, percent, cx } from '../lib/format';

const ASSET_COPY = {
  forex: {
    icon: 'FX',
    points: ['24/5 simulated market access', 'Major and minor pairs', 'Position sizing in one place'],
  },
  crypto: {
    icon: '₿',
    points: ['Always-on demo markets', 'BTC, ETH and SOL', 'Same ledger as every other asset'],
  },
  stocks: {
    icon: 'EQ',
    points: ['Global equity names', 'Fractional position sizing', 'Portfolio marked to demo prices'],
  },
  gold: {
    icon: 'Au',
    points: ['Gold and silver spot', 'Hedge-style demo positions', 'Precious metals in one portfolio'],
  },
};

function PublicNav() {
  const { user } = useAuth();
  return (
    <header className="public-nav">
      <div className="public-nav-inner">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            NovaTradeX
            <span className="brand-sub">Simulated trading demo</span>
          </span>
        </Link>

        <nav className="nav-actions" aria-label="Primary">
          <a className="btn btn-ghost" href="#markets">
            Markets
          </a>
          {user ? (
            <Link className="btn btn-outline" to={user.role === 'admin' ? '/admin' : '/app'}>
              Open workspace
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">
                Login
              </Link>
              <Link className="btn btn-primary" to="/register">
                Create Account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function MarketConsole({ instruments }) {
  const rows = instruments.slice(0, 6);
  return (
    <aside className="console" aria-label="Simulated market console">
      <div className="console-head">
        <span className="console-title">Market console</span>
        <DemoBadge />
      </div>
      <div className="console-body">
        {rows.map((quote) => {
          const up = (quote.changePct ?? 0) >= 0;
          return (
            <div className="quote-row" key={quote.symbol}>
              <span>
                <span className="quote-sym">{quote.symbol}</span>
                <span className="quote-name">{quote.name}</span>
              </span>
              <span className="num">
                <span className="quote-price">{price(quote.price, quote.precision)}</span>
                <span className={cx('quote-delta', up ? 'pos' : 'neg')}>
                  {up ? '▲' : '▼'} {percent(quote.changePct)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="console-foot">
        Illustrative prices generated for the demo — not live exchange quotes.
      </div>
    </aside>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .publicOverview()
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const assetClasses = data?.assetClasses || [];
  const instruments = data?.instruments || [];

  return (
    <div>
      <PublicNav />

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <p className="eyebrow">
                <span className="pill-dot" aria-hidden="true" /> Multi-asset brokerage demo
              </p>
              <h1>
                Trade four markets with one <span className="grad">institutional-grade</span> ledger.
              </h1>
              <p className="hero-lede">
                NovaTradeX is a complete brokerage workspace — Forex, cryptocurrency, equities and precious metals in a
                single portfolio, with an administrator review desk for account approvals and payment requests. Every
                balance here is simulated demo capital.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary btn-lg" to="/register">
                  Create Account
                </Link>
                <Link className="btn btn-outline btn-lg" to="/login">
                  Login
                </Link>
              </div>
              <p className="hero-note">
                <DemoBadge>Demo environment</DemoBadge>{' '}
                No real money is deposited, withdrawn, held or traded on this platform.
              </p>
            </div>

            <MarketConsole instruments={instruments.length ? instruments : []} />
          </div>
        </section>

        <section className="section section-alt" id="markets">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Markets</p>
              <h2>Four asset classes, one account</h2>
              <p className="muted">
                Each market below is available in the demo with simulated quotes, position sizing and settlement into a
                single demo ledger.
              </p>
            </div>

            <div className="grid-4">
              {assetClasses.map((asset, index) => {
                const copy = ASSET_COPY[asset.id] || { icon: '•', points: [] };
                const symbols = instruments.filter((i) => i.assetClass === asset.id);
                return (
                  <article className="asset-card" key={asset.id}>
                    <div className="row-between">
                      <span className="asset-icon">{copy.icon}</span>
                      <span className="feature-index">0{index + 1}</span>
                    </div>
                    <h3>{asset.label}</h3>
                    <p className="small muted">{asset.headline}</p>
                    <p className="small">{asset.blurb}</p>
                    <div className="asset-tags">
                      {symbols.map((s) => (
                        <span className="tag" key={s.symbol}>
                          {s.symbol}
                        </span>
                      ))}
                    </div>
                    <ul className="check">
                      {copy.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>

            {error ? <p className="muted small">Market preview unavailable: {error}</p> : null}
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Platform</p>
              <h2>Built like a brokerage, labelled like a demo</h2>
            </div>
            <div className="grid-3">
              <article className="feature">
                <span className="feature-index">01</span>
                <h3>Reviewed onboarding</h3>
                <p className="small muted">
                  New registrations are created as pending customer accounts. An administrator approves access from a
                  separate, private admin console before the trading dashboard opens.
                </p>
              </article>
              <article className="feature">
                <span className="feature-index">02</span>
                <h3>Ledger-first accounting</h3>
                <p className="small muted">
                  Balances, positions, trades and payment requests are derived from an append-only simulated ledger, so
                  the portfolio always reconciles with transaction history.
                </p>
              </article>
              <article className="feature">
                <span className="feature-index">03</span>
                <h3>Server-enforced roles</h3>
                <p className="small muted">
                  Sessions live in httpOnly cookies and every customer and administrator action is authorised on the
                  server. Roles cannot be changed from the browser.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="cta-band">
              <div>
                <h2>Open a simulated account in under a minute</h2>
                <p className="muted">
                  Registration is free, uses demo capital only, and requires administrator approval before trading.
                </p>
              </div>
              <div className="hero-actions">
                <Link className="btn btn-primary btn-lg" to="/register">
                  Create Account
                </Link>
                <Link className="btn btn-ghost btn-lg" to="/login">
                  Login
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="disclaimer">
              <h3>Important demo disclosure</h3>
              <ul>
                <li>NovaTradeX is a product demonstration, not a licensed broker or financial institution.</li>
                <li>
                  All balances, positions, prices, trades, deposits and withdrawals are simulated sample data. No real
                  money is accepted, transferred or held.
                </li>
                <li>Nothing shown here is investment advice, and no profit or performance figure is real.</li>
                <li>
                  Real-money brokerage activity requires licensing, segregated client funds, KYC/AML controls and
                  regulatory approval that this demo does not provide.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <span className="brand">
                <span className="brand-mark" aria-hidden="true">
                  N
                </span>
                NovaTradeX
              </span>
              <p className="small muted">Simulated multi-asset trading platform for demonstration purposes.</p>
            </div>
            <div>
              <p className="label">Account</p>
              <div className="footer-links">
                <Link to="/login">Login</Link>
                <Link to="/register">Create Account</Link>
              </div>
            </div>
            <div>
              <p className="label">Markets</p>
              <div className="footer-links">
                <a href="#markets">Forex</a>
                <a href="#markets">Cryptocurrency</a>
                <a href="#markets">Stocks</a>
                <a href="#markets">Gold</a>
              </div>
            </div>
            <div>
              <p className="label">Staff</p>
              <div className="footer-links">
                <Link to="/admin/login">Admin login</Link>
              </div>
            </div>
          </div>
          <p className="footer-legal">
            © {new Date().getFullYear()} NovaTradeX demo. Simulated data only — not a financial service, and no real
            funds are processed.
          </p>
        </div>
      </footer>
    </div>
  );
}
