import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useToast } from '../../components/ui';
import { Alert, DemoBadge, Field, StatusBadge } from '../../components/ui';
import { COUNTRIES } from '../../lib/countries';
import { STATUS_LABELS, dateTime } from '../../lib/format';

export default function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    country: 'United States',
    marketingOptIn: false,
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      country: user.country || 'United States',
      marketingOptIn: Boolean(user.marketingOptIn),
    });
  }, [user]);

  async function onSaveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    try {
      const result = await api.updateProfile(profile);
      if (result?.user) setUser(result.user);
      toast.success(result?.message || 'Profile updated.');
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(event) {
    event.preventDefault();
    setPasswordError('');
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const result = await api.changePassword(passwords.currentPassword, passwords.newPassword);
      toast.success(result?.message || 'Password updated.');
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profile settings</h1>
          <p>Manage your contact details and password. Your email address is your sign-in identity.</p>
        </div>
        <DemoBadge>Demo account</DemoBadge>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Account details</h2>
              <p className="card-sub">Used for demo correspondence only</p>
            </div>
          </div>

          <form className="form" onSubmit={onSaveProfile}>
            <Alert tone="error">{profileError}</Alert>

            <div className="form-row">
              <Field label="First name" htmlFor="firstName">
                <input
                  id="firstName"
                  className="input"
                  required
                  maxLength={60}
                  value={profile.firstName}
                  onChange={(event) => setProfile({ ...profile, firstName: event.target.value })}
                />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <input
                  id="lastName"
                  className="input"
                  required
                  maxLength={60}
                  value={profile.lastName}
                  onChange={(event) => setProfile({ ...profile, lastName: event.target.value })}
                />
              </Field>
            </div>

            <Field label="Email address" htmlFor="email" hint="Contact an administrator to change your sign-in email.">
              <input id="email" className="input" value={user.email} disabled readOnly />
            </Field>

            <Field label="Phone (optional)" htmlFor="phone">
              <input
                id="phone"
                className="input"
                maxLength={40}
                value={profile.phone}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                placeholder="+1 555 0100"
              />
            </Field>

            <Field label="Country" htmlFor="country">
              <select
                id="country"
                className="select"
                value={profile.country}
                onChange={(event) => setProfile({ ...profile, country: event.target.value })}
              >
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </Field>

            <label className="check" htmlFor="marketingOptIn">
              <input
                id="marketingOptIn"
                type="checkbox"
                checked={profile.marketingOptIn}
                onChange={(event) => setProfile({ ...profile, marketingOptIn: event.target.checked })}
              />
              <span>Send me demo product updates by email</span>
            </label>

            <button className="btn btn-primary" type="submit" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Security</h2>
                <p className="card-sub">Passwords are hashed with scrypt on the server</p>
              </div>
            </div>

            <form className="form" onSubmit={onChangePassword}>
              <Alert tone="error">{passwordError}</Alert>

              <Field label="Current password" htmlFor="currentPassword">
                <input
                  id="currentPassword"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={passwords.currentPassword}
                  onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                />
              </Field>

              <Field label="New password" htmlFor="newPassword" hint="At least 10 characters with letters and numbers.">
                <input
                  id="newPassword"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                  value={passwords.newPassword}
                  onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                />
              </Field>

              <Field label="Confirm new password" htmlFor="confirmPassword">
                <input
                  id="confirmPassword"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                  value={passwords.confirm}
                  onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                />
              </Field>

              <button className="btn btn-outline" type="submit" disabled={savingPassword}>
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Account status</h2>
                <p className="card-sub">Set by NovaTradeX administrators</p>
              </div>
              <StatusBadge status={user.status} label={STATUS_LABELS[user.status]} />
            </div>
            <div className="kv">
              <span>Role</span>
              <strong>{user.role === 'admin' ? 'Administrator' : 'Customer'}</strong>
            </div>
            <div className="kv">
              <span>Demo account</span>
              <strong>{user.isDemo ? 'Yes — simulated' : 'No'}</strong>
            </div>
            <div className="kv">
              <span>Registered</span>
              <strong>{dateTime(user.createdAt)}</strong>
            </div>
            <div className="kv">
              <span>Last sign-in</span>
              <strong>{user.lastLoginAt ? dateTime(user.lastLoginAt) : '—'}</strong>
            </div>
            {user.statusReason ? (
              <Alert tone="warn">Administrator note: {user.statusReason}</Alert>
            ) : null}
          </section>
        </div>
      </div>

      <Alert tone="info">
        This is a demonstration platform. Profile data is stored in the demo database only and is wiped when the demo
        environment is rebuilt.
      </Alert>
    </>
  );
}
