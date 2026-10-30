import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, Field, Splash } from '../components/ui';

export default function AdminSetup() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({
    setupToken: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.admin
      .setupStatus()
      .then((payload) => {
        if (alive) setStatus(payload);
      })
      .catch((err) => {
        if (alive) setLoadError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('The passwords you entered do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.admin.setup({
        setupToken: form.setupToken,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
      });
      setUser(result.user || null);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!status && !loadError) return <Splash label="Checking owner setup status…" />;

  const locked = Boolean(status?.ownerConfigured);
  const unavailable = !locked && status && !status.setupAvailable;

  return (
    <div className="auth-shell">
      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">First-owner setup</p>
          <h1>{locked ? 'Owner setup is locked' : 'Provision the first administrator'}</h1>

          {loadError ? <Alert tone="error">{loadError}</Alert> : null}

          {locked ? (
            <>
              <p className="muted">
                An administrator account already exists, so this one-time bootstrap endpoint is permanently disabled.
                Sign in with your administrator credentials instead.
              </p>
              <Link className="btn btn-primary btn-block btn-lg" to="/admin/login">
                Go to administrator login
              </Link>
            </>
          ) : null}

          {unavailable ? (
            <>
              <Alert tone="warn">
                Owner setup is disabled on this deployment because <code>OWNER_SETUP_TOKEN</code> is not configured.
                Set that environment variable and restart the server to enable first-owner provisioning.
              </Alert>
              <p className="muted small">
                No administrator can be created without the setup token, and the endpoint locks automatically once the
                first administrator exists.
              </p>
              <Link className="btn btn-outline btn-block" to="/admin/login">
                Back to administrator login
              </Link>
            </>
          ) : null}

          {!locked && !unavailable ? (
            <>
              <p className="muted">
                This endpoint is used once. It requires the server-side <code>OWNER_SETUP_TOKEN</code> and becomes
                permanently unavailable as soon as the first administrator account exists.
              '</p>

              <form className="form" onSubmit={onSubmit}>
                <Alert tone="error">{error}</Alert>

                <Field label="Owner setup token" htmlFor="setupToken" hint="Issued by the platform operator, never stored in the frontend.">
                  <input
                    id="setupToken"
                    className="input"
                    type="password"
                    required
                    autoComplete="off"
                    value={form.setupToken}
                    onChange={update('setupToken')}
                  />
                </Field>

                <div className="form-row">
                  <Field label="First name" htmlFor="ownerFirst">
                    <input id="ownerFirst" className="input" required value={form.firstName} onChange={update('firstName')} />
                  </Field>
                  <Field label="Last name" htmlFor="ownerLast">
                    <input id="ownerLast" className="input" required value={form.lastName} onChange={update('lastName')} />
                  </Field>
                </div>

                <Field label="Administrator email" htmlFor="ownerEmail">
                  <input
                    id="ownerEmail"
                    className="input"
                    type="email"
                    required
                    autoComplete="username"
                    value={form.email}
                    onChange={update('email')}
                  />
                </Field>

                <div className="form-row">
                  <Field label="Password" htmlFor="ownerPassword" hint="At least 10 characters with letters and numbers.">
                    <input
                      id="ownerPassword"
                      className="input"
                      type="password"
                      required
                      minLength={10}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={update('password')}
                    />
                  </Field>
                  <Field label="Confirm password" htmlFor="ownerConfirm">
                    <input
                      id="ownerConfirm"
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

                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
                  {busy ? 'Creating owner…' : 'Create owner account'}
                </button>
              </form>
            </>
          ) : null}

          <div className="auth-foot">
            <p className="muted small">
              <Link to="/">Back to homepage</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
