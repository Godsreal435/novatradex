import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Field, DemoBadge } from '../components/ui';
import { COUNTRIES } from '../lib/countries';
import { AuthAside } from './Login';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  country: '',
  password: '',
  confirmPassword: '',
  marketingOptIn: true,
  accepted: false,
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  async function onSubmit(event) {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('The passwords you entered do not match.');
      return;
    }
    if (!form.accepted) {
      setError('Please confirm that you understand this is a simulated demo platform.');
      return;
    }

    setBusy(true);
    try {
      // Only profile fields are sent. Role and status are decided by the server.
      const result = await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        country: form.country,
        password: form.password,
        marketingOptIn: form.marketingOptIn,
      });
      setDone(result?.message || 'Account created and awaiting administrator approval.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-shell">
        <main className="auth-main">
          <div className="auth-card">
            <p className="eyebrow">Registration received</p>
            <h1>Your account is pending approval</h1>
            <p className="muted">{done}</p>
            <Alert tone="info">
              Status: <strong>pending</strong>. An administrator reviews new registrations in the staff console. Demo
              balances are credited only by the platform, and no real funds are involved.
            </Alert>
            <Link className="btn btn-primary btn-block btn-lg" to="/login">
              Go to login
            </Link>
            <div className="auth-foot">
              <p className="muted small">
                Already approved? <Link to="/login">Sign in</Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <AuthAside />
      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">Create account</p>
          <h1>Open your demo account</h1>
          <p className="auth-sub muted">
            Registration is free. New accounts start as <strong>pending</strong> until an administrator approves them.
          </p>

          <form className="form" onSubmit={onSubmit}>
            <Alert tone="error">{error}</Alert>

            <div className="form-row">
              <Field label="First name" htmlFor="firstName">
                <input
                  id="firstName"
                  className="input"
                  required
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={update('firstName')}
                />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <input
                  id="lastName"
                  className="input"
                  required
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={update('lastName')}
                />
              </Field>
            </div>

            <Field label="Email address" htmlFor="email">
              <input
                id="email"
                className="input"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={update('email')}
                placeholder="you@example.com"
              />
            </Field>

            <div className="form-row">
              <Field label="Country of residence" htmlFor="country">
                <select id="country" className="select" required value={form.country} onChange={update('country')}>
                  <option value="">Select a country</option>
                  {COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Phone (optional)" htmlFor="phone">
                <input
                  id="phone"
                  className="input"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="+1 555 000 1234"
                />
              </Field>
            </div>

            <div className="form-row">
              <Field label="Password" htmlFor="password" hint="At least 10 characters with letters and numbers.">
                <input
                  id="password"
                  className="input"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={update('password')}
                />
              </Field>
              <Field label="Confirm password" htmlFor="confirmPassword">
                <input
                  id="confirmPassword"
                  className="input"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={update('confirmPassword')}
                />
              </Field>
            </div>

            <label className="check">
              <input type="checkbox" checked={form.marketingOptIn} onChange={update('marketingOptIn')} />
              <span>Send me product updates about this demo platform (optional).</span>
            </label>

            <label className="check">
              <input type="checkbox" checked={form.accepted} onChange={update('accepted')} />
              <span>
                I understand NovaTradeX is a simulated environment: balances, trades and transfers are demo data and no
                real money is handled.
              </span>
            </label>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="auth-foot">
            <p className="muted small">
              Already have an account? <Link to="/login">Login</Link>
            </p>
            <p className="muted small row" style={{ gap: 8, justifyContent: 'center' }}>
              <DemoBadge>Customer accounts only</DemoBadge>
              <span>Staff accounts are provisioned separately.</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
