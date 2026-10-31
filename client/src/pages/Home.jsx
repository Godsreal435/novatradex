import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { DemoBadge } from '../components/ui';
import { price, percent, cx } from '../lib/format';

const ASSETS = [
  { id: 'forex', icon: '↗', name: 'Forex', description: 'Explore major and minor currency pairs.' },
  { id: 'crypto', icon: '₿', name: 'Cryptocurrency', description: 'Explore Bitcoin, Ethereum and other digital assets.' },
  { id: 'stocks', icon: '▥', name: 'Stocks', description: 'Discover global equity markets.' },
  { id: 'gold', icon: 'Au', name: 'Gold & Metals', description: 'Explore gold, silver and precious metals.' },
];

function PublicNav() {
  const { user } = useAuth();

  return (
    <header className="public-nav">
      <div className="public-nav-inner">
        <Link className="brand" to="/">
          <span className="brand-mark">N</span>
          <span>
            NovaTradeX
            <span className="brand-sub">Trading platform</span>
          </span>
        </Link>

        <nav className="nav-actions">
          <a className="btn btn-ghost" href="#markets">Markets</a>
          <a className="btn btn-ghost" href="#platform">Platform</a>
          {user ? (
            <Link className="btn btn-primary" to={user.role === 'admin' ? '/admin' : '/app'}>
              Open Dashboard
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">Log in</Link>
              <Link className="btn btn-primary" to="/register">Get Started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function MarketConsole({ instruments }) {
  return (
    <div className="console">
      <div className="console-head">
        <div>
          <span className="console-title">Market Watch</span>
          <p className="small muted">Explore available markets</p>
        </div>
        <DemoBadge />
      </div>

      <div className="console-body">
        {instruments.slice(0, 6).map((item) => {
          const up = (item.changePct ?? 0) >= 0;
          return (
            <div className="quote-row" key={item.symbol}>
              <span>
                <strong className="quote-sym">{item.symbol}</strong>
                <span className="quote-name">{item.name}</span>
              </span>
              <span className="num">
                <strong className="quote-price">
                  {price(item.price, item.precision)}
                </strong>
                <span className={cx('quote-delta', up ? 'pos' : 'neg')}>
                  {up ? '▲' : '▼'} {percent(item.changePct)}
                </span>
              </span>
            </div>
          );
        })}
        {!instruments.length && (
          <p className="muted small">Market information is loading.</p>
        )}
      </div>

      <div className="console-foot">
        Illustrative demo prices. Not live exchange quotes.
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.publicOverview()
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });

    return () => {
      alive = false;
    };
  }, []);

  const instruments = data?.instruments || [];

  return (
    <div>
      <PublicNav />

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <p className="eyebrow">
                <span className="pill-dot" /> YOUR MARKETS. YOUR PLATFORM.
              </p>

              <h1>
                One platform.
                <br />
                <span className="grad">More ways to trade.</span>
              </h1>

              <p className="hero-lede">
                Discover Forex, cryptocurrency, stocks and precious metals
                through one streamlined trading dashboard.
              </p>

              <div className="hero-actions">
                <Link className="btn btn-primary btn-lg" to="/register">
                  Open an Account
                </Link>
                <Link className="btn btn-outline btn-lg" to="/login">
                  Sign In
                </Link>
              </div>

              <p className="hero-note">
                <DemoBadge>Demo platform</DemoBadge>{' '}
                Explore the platform using simulated funds and prices.
              </p>
            </div>

            <MarketConsole instruments={instruments} />
          </div>
        </section>

        <section className="section section-alt" id="markets">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">MARKET OPPORTUNITIES</p>
              <h2>Explore multiple markets</h2>
              <p className="muted">
                Access different asset categories from one convenient account.
              </p>
            </div>

            <div className="grid-4">
              {ASSETS.map((asset, index) => (
                <article className="asset-card" key={asset.id}>
                  <div className="row-between">
                    <span className="asset-icon">{asset.icon}</span>
                    <span className="feature-index">0{index + 1}</span>
                  </div>
                  <h3>{asset.name}</h3>
                  <p className="small muted">{asset.description}</p>
                  <a className="btn btn-ghost" href="/login">
                    Explore market →
                  </a>
                </article>
              ))}
            </div>

            {error && (
              <p className="muted small">
                Market preview temporarily unavailable.
              </p>
            )}
          </div>
        </section>

        <section className="section" id="platform">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">THE NOVATRADEX PLATFORM</p>
              <h2>Everything in one place</h2>
              <p className="muted">
                A simple way to access your account and explore the platform.
              </p>
            </div>

            <div className="grid-3">
              <article className="feature">
                <span className="feature-index">01</span>
                <h3>Easy account access</h3>
                <p className="small muted">
                  Register for an account and access your personal dashboard
                  after administrator approval.
                </p>
              </article>

              <article className="feature">
                <span className="feature-index">02</span>
                <h3>Portfolio overview</h3>
                <p className="small muted">
                  View your account balance, activity and portfolio information
                  from one dashboard.
                </p>
              </article>

              <article className="feature">
                <span className="feature-index">03</span>
                <h3>Account management</h3>
                <p className="small muted">
                  Keep track of account activity and requests through your
                  personal workspace.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="cta-band">
              <div>
                <p className="eyebrow">GET STARTED</p>
                <h2>Your trading journey starts here.</h2>
                <p className="muted">
                  Create your NovaTradeX demo account and explore the platform.
                </p>
              </div>
              <div className="hero-actions">
                <Link className="btn btn-primary btn-lg" to="/register">
                  Create Account
                </Link>
                <Link className="btn btn-outline btn-lg" to="/login">
                  Log In
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="disclaimer">
              <h3>Platform information</h3>
              <p className="small muted">
                NovaTradeX currently operates as a simulated trading
                demonstration. Market prices, balances and transactions are
                simulated. This platform does not currently accept or hold
                real-money deposits or execute live market trades.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <span className="brand">
                <span className="brand-mark">N</span>
                NovaTradeX
              </span>
              <p className="small muted">
                Explore markets through one streamlined platform.
              </p>
            </div>

            <div>
              <p className="label">Account</p>
              <div className="footer-links">
                <Link to="/login">Log in</Link>
                <Link to="/register">Create account</Link>
              </div>
            </div>

            <div>
              <p className="label">Markets</p>
              <div className="footer-links">
                <a href="#markets">Forex</a>
                <a href="#markets">Crypto</a>
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
            © {new Date().getFullYear()} NovaTradeX. Simulated platform.
          </p>
        </div>
      </footer>
    </div>
  );
}
