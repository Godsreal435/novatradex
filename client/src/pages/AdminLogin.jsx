import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, DemoBadge, Field } from '../components/ui';

export default function AdminLogin() {
  const { adminLogin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(null);

  useEffect(() => {
    let alive = true;
    api.admin
      .setupStatus()
      .then((status) => {
        if (alive) setSetup(status);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminLogin(form.email.trim(), form.password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            NovaTradeX
            <span className="brand-sub">Private staff console</span>
          </span>
        </Link>

        <div>
          <h2>Restricted operations area.</h2>
          <p className="small">
            This console is separate from the customer login and is limited to platform administrators. Every action
            here is authorised on the server and recorded in an append-only audit trail.
          </p>
        </div>

        <ul className="auth-points">
          <li className="auth-point">Review and approve pending customer registrations.</li>
          <li className="auth-point">Suspend, reactivate or reject customer accounts.</li>
          <li className="auth-point">Approve or reject simulated deposit and withdrawal requests.</li>
          <li className="auth-point">Inspect the demo ledger, support desk and audit log.</li>
        </ul>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <DemoBadge>Staff only</DemoBadge>
          <span className="small muted">Sessions are server-side and httpOnly.</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">Administrator access</p>
          <h1>Staff login</h1>
          <p className="auth-sub muted">Customer accounts cannot access this area.</p>

          <form className="form" onSubmit={onSubmit}>
            <Alert tone="error">{error}</Alert>

            <Field label="Administrator email" htmlFor="admin-email">
              <input
                id="admin-email"
                className="input"
                type="email"
                required
                autoComplete="username"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@novatradex.com"
              />
            </Field>

            <Field label="Password" htmlFor="admin-password">
              <input
                id="admin-password"
                className="input"
                type="password"
                required
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </Field>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Login'}
            </button>
          </form>

          {setup && !setup.ownerConfigured ? (
            <Alert tone="warn">
              Owner setup is <strong>available</strong> — no administrator exists yet.{' '}
              <Link to="/admin/setup">Complete first-owner setup</Link>
            </Alert>
          ) : null}

          {setup && setup.ownerConfigured ? (
            <div className="demo-hint">
              <strong>Demo administrator credentials</strong>
              <span className="mono small">admin@novatradex.com · NovaOwner!2024</span>
              <span className="small muted">Owner setup is permanently locked on this deployment.</span>
            </div>
          ) : null}

          <div className="auth-foot">
            <p className="muted small">
              Customer instead? <Link to="/login">Customer login</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
