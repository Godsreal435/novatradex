import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Alert, DemoBadge, EmptyState, Skeleton, Stat, StatusBadge } from '../../components/ui';
import { KIND_LABELS, STATUS_LABELS, dateTime, money, when } from '../../lib/format';

const ACTION_LABELS = {
  owner_setup_completed: 'Owner account created',
  admin_login_success: 'Administrator signed in',
  admin_login_failed: 'Failed admin sign-in',
  admin_setup_failed: 'Failed owner setup attempt',
  customer_activate: 'Customer approved',
  customer_reject: 'Registration rejected',
  customer_suspend: 'Account suspended',
  customer_reactivate: 'Account reactivated',
  payment_approved: 'Payment approved',
  payment_rejected: 'Payment rejected',
  support_reply: 'Support reply sent',
  support_status_changed: 'Ticket status changed',
  customer_registered: 'New registration',
};

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.admin
      .overview()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <>
        <Alert tone="error">{error}</Alert>
        <Skeleton rows={6} />
      </>
    );
  }

  const { stats, pendingPayments, recentActivity, notice } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Operations dashboard</h1>
          <p>Platform health across customer accounts, payment requests and the support desk.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <DemoBadge>Demo data</DemoBadge>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <Alert tone="error">{error}</Alert>

      <div className="stat-grid">
        <Stat
          label="Total customers"
          value={stats.totalCustomers}
          foot={`${stats.newThisWeek} joined in the last 7 days`}
        />
        <Stat label="Active accounts" value={stats.active} foot="Trading access enabled" tone="up" />
        <Stat
          label="Awaiting approval"
          value={stats.pending}
          foot={stats.pending ? 'Registrations to review' : 'Nothing pending'}
          tone={stats.pending ? 'warn' : undefined}
        />
        <Stat
          label="Suspended"
          value={stats.suspended}
          foot={`${stats.rejected} rejected registration(s)`}
        />
      </div>

      <div className="stat-grid">
        <Stat label="Demo cash balances" value={money(stats.totalDemoBalancesCents, { short: true })} foot="Simulated, no real funds" />
        <Stat
          label="Demo positions value"
          value={money(stats.totalDemoPositionsCents, { short: true })}
          foot="Marked at simulated market prices"
        />
        <Stat
          label="Total demo custody"
          value={money(stats.demoCustodyValueCents, { short: true })}
          foot="Cash plus positions (simulated)"
        />
        <Stat
          label="Pending requests"
          value={stats.pendingPayments}
          foot={`${money(stats.pendingPaymentsValueCents)} awaiting review`}
        />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Payment requests</h2>
              <p className="card-sub">Oldest pending first</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/admin/payments">
              Review queue
            </Link>
          </div>

          {pendingPayments.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Type</th>
                    <th className="right">Amount</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <div className="cell-strong">{payment.customerName || '—'}</div>
                        <div className="cell-sub">{payment.customerEmail}</div>
                      </td>
                      <td>
                        <StatusBadge status={payment.status} label={KIND_LABELS[payment.kind] || payment.kind} />
                      </td>
                      <td className="right mono">{money(payment.amountCents)}</td>
                      <td className="muted small">{when(payment.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No payment requests">Deposit and withdrawal requests will appear here.</EmptyState>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Recent admin activity</h2>
              <p className="card-sub">Append-only audit log</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/admin/audit">
              Full trail
            </Link>
          </div>

          {recentActivity.length ? (
            <ul className="activity">
              {recentActivity.map((entry) => (
                <li key={entry.id}>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <div className="activity-title">{ACTION_LABELS[entry.action] || entry.action}</div>
                    <div className="activity-meta">
                      {entry.actor_email || 'system'} · {dateTime(entry.created_at)}
                    </div>
                    {entry.detail ? <div className="activity-detail">{entry.detail}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet">Administrative actions are recorded here.</EmptyState>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Quick actions</h2>
            <p className="card-sub">Common operations</p>
          </div>
        </div>
        <div className="quick-grid">
          <Link className="quick" to="/admin/customers?status=pending">
            <strong>Approve registrations</strong>
            <span>{stats.pending} waiting</span>
          </Link>
          <Link className="quick" to="/admin/payments">
            <strong>Review payments</strong>
            <span>{stats.pendingPayments} pending</span>
          </Link>
          <Link className="quick" to="/admin/support">
            <strong>Support desk</strong>
            <span>{stats.openTickets} open ticket(s)</span>
          </Link>
          <Link className="quick" to="/admin/ledger">
            <strong>Transaction ledger</strong>
            <span>All simulated activity</span>
          </Link>
        </div>
      </section>

      <Alert tone="info">{notice}</Alert>
    </>
  );
}
