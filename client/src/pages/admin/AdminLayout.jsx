import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { DemoBadge } from '../../components/ui';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true, icon: 'grid' },
  { to: '/admin/customers', label: 'Customers', icon: 'users' },
  { to: '/admin/payments', label: 'Payments', icon: 'wallet' },
  { to: '/admin/ledger', label: 'Ledger', icon: 'list' },
  { to: '/admin/support', label: 'Support desk', icon: 'help' },
  { to: '/admin/audit', label: 'Audit trail', icon: 'shield' },
];

const TITLES = {
  '/admin': ['Operations dashboard', 'Approve accounts, review requests, monitor the demo book'],
  '/admin/customers': ['Customers', 'Review registrations and manage account access'],
  '/admin/payments': ['Payment requests', 'Approve or reject simulated deposits and withdrawals'],
  '/admin/ledger': ['Ledger', 'Every simulated transaction across the platform'],
  '/admin/support': ['Support desk', 'Respond to customer requests'],
  '/admin/audit': ['Audit trail', 'Immutable record of administrative actions'],
};

function Icon({ name }) {
  const paths = {
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    users: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1.5a4 4 0 0 0-3-3.87M16.5 3.6a3.5 3.5 0 0 1 0 6.8',
    wallet: 'M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2.5-3H16l1 3M16 13h2',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5M12 17h.01',
    shield: 'M12 3l7 3v5.5c0 4.2-2.9 7.9-7 9.5-4.1-1.6-7-5.3-7-9.5V6zM9.3 12l1.9 1.9 3.6-3.6',
  };
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={paths[name] || paths.grid} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdminLayout() {
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
      .sort((a, b) => b.length - a.length)[0] || '/admin';
  const [title, subtitle] = TITLES[matchKey] || ['Operations dashboard', ''];

  async function onLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      navigate('/admin/login', { replace: true });
    }
  }

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'AD';

  return (
    <div className="app-shell admin-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'} aria-label="Administrator navigation">
        <NavLink className="brand" to="/admin">
          <span className="brand-mark admin" aria-hidden="true">
            N
          </span>
          <span>
            NovaTradeX
            <span className="brand-sub">Administrator console</span>
          </span>
        </NavLink>

        <nav>
          <p className="side-section-label">Operations</p>
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
          <span className="badge badge-admin">Administrator</span>
          <div className="side-user">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="side-user-meta">
              <div className="side-user-name">{user?.fullName || 'Administrator'}</div>
              <div className="side-user-mail">{user?.email}</div>
            </div>
          </div>
          <button type="button" className="btn btn-outline btn-sm btn-block" onClick={onLogout} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
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
          <DemoBadge>Demo environment</DemoBadge>
          <NavLink className="btn btn-ghost btn-sm" to="/">
            Public site
          </NavLink>
        </header>

        <main className="app-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
