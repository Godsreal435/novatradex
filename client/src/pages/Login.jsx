import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Field } from '../components/ui';

export function AuthAside({ role = 'customer' }) {
  const points =
    role === 'admin'
      ? [
          'Private staff console — separate from the customer login.',
          'Approve or reject registrations, suspend accounts and review payment requests.',
          'Every administrative action is written to an append-only audit trail.',
        ]
      : [
          'One portfolio across Forex, cryptocurrency, equities and gold.',
          'Deposit and withdrawal requests reviewed by an administrator.',
          'Append-only ledger keeps every balance reconciled.',
        ];

  return (
    <aside className="auth-aside">
      <Link className="brand" to="/">
        <span className="brand-mark" aria-hidden="true">
          N
        </span>
        <span>
          NovaTradeX
          <span className="brand-sub">{role === 'admin' ? 'Staff console' : 'Customer portal'}</span>
        </span>
      </Link>

      <div>
      <h2>{role === 'admin' ? 'Operations access for platform staff.' : 'A clearer view of the financial markets.'}</h2>
        <p className="small">
          Access your portfolio, review account activity and manage account requests in one secure workspace.
        </p>
      </div>

      <ul className="auth-points">
        {points.map((point) => (
          <li className="auth-point" key={point}>
            {point}
          </li>
        ))}
      </ul>

   
    </aside>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = location.state?.from || '/app';

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form.email.trim(), form.password);
      if (user?.role === 'admin') navigate('/admin', { replace: true });
      else navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <AuthAside />
      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">Customer login</p>
          <h1>Welcome back</h1>
          <p className="auth-sub muted">Sign in to your trading workspace.</p>

          <form className="form" onSubmit={onSubmit}>
            <Alert tone="error">{error}</Alert>

            <Field label="Email address" htmlFor="email">
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </Field>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Login'}
            </button>
          </form>

          <div className="auth-foot">
            <p className="muted small">
              New to NovaTradeX? <Link to="/register">Create an account</Link>
            </p>
            <p className="muted small">
              Platform staff? <Link to="/admin/login">Administrator login</Link>
            </p>
          </div>

        
        </div>
      </main>
    </div>
  );
}
