import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { DemoBadge } from '../../components/ui';

const NAV = [
  { to: '/app', label: 'Overview', end: true, icon: 'grid' },
  { to: '/app/trade', label: 'Trade', icon: 'chart' },
  { to: '/app/transfers', label: 'Deposits & withdrawals', icon: 'wallet' },
  { to: '/app/transactions', label: 'Transactions', icon: 'list' },
  { to: '/app/support', label: 'Support', icon: 'help' },
  { to: '/app/settings', label: 'Profile settings', icon: 'gear' },
];

const TITLES = {
  '/app': ['Overview', 'Your demo account at a glance'],
  '/app/trade': ['Trade', 'Execute simulated orders against demo prices'],
  '/app/transfers': ['Deposits & withdrawals', 'Submit requests for administrator review'],
  '/app/transactions': ['Transactions', 'Simulated account ledger'],
  '/app/support': ['Support', 'Open and follow up on requests'],
  '/app/settings': ['Profile settings', 'Contact details and account security'],
};

function Icon({ name }) {
  const paths = {
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    chart: 'M4 19V5M4 19h16M8 15l3.5-4.5L15 14l4-6',
    wallet: 'M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2.5-3H16l1 3M16 13h2',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5M12 17h.01',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 3.1 14a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 2.9-1.2 2 2 0 1 1 4 0A1.7 1.7 0 0 0 16.9 4.2l.1-.1A2 2 0 1 1 19.8 7l-.1.1A1.7 1.7 0 0 0 20.9 10a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.5 1z',
  };
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={paths[name] || paths.grid} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CustomerLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const matchKey =
    Object.keys(TITLES)
      .filter((key) => location.pathname === key || location.pathname.startsWith(`${key}/`))
      .sort((a, b) => b.length - a.length)[0] || '/app';
  const [title, subtitle] = TITLES[matchKey] || ['Overview', ''];

  async function onLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      navigate('/login', { replace: true });
    }
  }

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'NT';

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'} aria-label="Customer navigation">
        <NavLink className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            NovaTradeX
            <span className="brand-sub">Demo trading account</span>
          </span>
        </NavLink>

        <nav>
          <p className="side-section-label">Account</p>
          <div className="side-nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="side-footer">
          <DemoBadge>Simulated account</DemoBadge>
          <div className="side-user">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="side-user-meta">
              <div className="side-user-name">{user?.fullName || 'Customer'}</div>
              <div className="side-user-mail">{user?.email}</div>
            </div>
          </div>
          <button type="button" className="btn btn-outline btn-sm btn-block" onClick={onLogout} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      </aside>

      {menuOpen ? <div className="scrim open" onClick={() => setMenuOpen(false)} role="presentation" /> : null}

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            ≡
          </button>
          <div>
            <div className="topbar-title">{title}</div>
            <div className="topbar-sub">{subtitle}</div>
          </div>
          <div className="spacer" />
          <DemoBadge />
          <NavLink className="btn btn-ghost btn-sm" to="/app/support">
            Support
          </NavLink>
        </header>

        <main className="app-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
