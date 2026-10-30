import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Alert, EmptyState, Field, Modal, Skeleton, Stat, StatusBadge, useToast } from '../../components/ui';
import { KIND_LABELS, STATUS_LABELS, dateTime, money, percent, quantity, when } from '../../lib/format';

const ACTIONS = {
  pending: [
    { action: 'activate', label: 'Approve account', tone: 'btn-primary' },
    { action: 'reject', label: 'Reject registration', tone: 'btn-outline', needsReason: true },
  ],
  active: [{ action: 'suspend', label: 'Suspend account', tone: 'btn-outline', needsReason: true }],
  suspended: [{ action: 'reactivate', label: 'Reactivate account', tone: 'btn-primary' }],
  rejected: [{ action: 'activate', label: 'Approve anyway', tone: 'btn-outline' }],
};

export default function AdminCustomerDetail() {
  const { customerId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    setError('');
    api.admin
      .customer(customerId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction() {
    if (!pendingAction) return;
    if (pendingAction.needsReason && reason.trim().length < 3) {
      setError('Add a short reason (at least 3 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.admin.setCustomerStatus(customerId, pendingAction.action, reason.trim());
      toast.success(result?.message || 'Customer updated.');
      setPendingAction(null);
      setReason('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <>
        <Alert tone="error">{error}</Alert>
        <Skeleton rows={6} />
      </>
    );
  }

  const { customer, account, portfolio, transactions, tickets } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <Link className="back-link" to="/admin/customers">
            ← All customers
          </Link>
          <h1>{customer.fullName || customer.email}</h1>
          <p className="row" style={{ gap: 8 }}>
            <StatusBadge status={customer.status} label={STATUS_LABELS[customer.status]} />
            <span className="muted small">Customer since {dateTime(customer.createdAt)}</span>
            {customer.lastLoginAt ? (
              <span className="muted small">Last sign-in {dateTime(customer.lastLoginAt)}</span>
            ) : null}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {(ACTIONS[customer.status] || []).map((option) => (
            <button
              key={option.action}
              type="button"
              className={`btn ${option.tone} btn-sm`}
              onClick={() => {
                setReason('');
                setPendingAction(option);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Alert tone="error">{error}</Alert>
      {customer.statusReason ? (
        <Alert tone="warn">
          Status reason on file: {customer.statusReason}
        </Alert>
      ) : null}

      <div className="stat-grid">
        <Stat label="Demo cash balance" value={money(account.balanceCents)} foot={account.currency} />
        <Stat label="Positions value" value={money(portfolio.investedCents)} foot="Simulated holdings" />
        <Stat label="Total equity" value={money(account.balanceCents + portfolio.investedCents)} foot="Cash + positions" />
        <Stat
          label="Open P&L"
          value={money(portfolio.pnlCents)}
          foot={percent(portfolio.pnlPct)}
          tone={portfolio.pnlCents >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Account details</h2>
          </div>
          <dl className="kv">
            <div>
              <dt>Email</dt>
              <dd>{customer.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{customer.phone || '—'}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{customer.country || '—'}</dd>
            </div>
            <div>
              <dt>Account tier</dt>
              <dd>{customer.accountTier || 'standard'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{customer.role}</dd>
            </div>
            <div>
              <dt>Approved</dt>
              <dd>{customer.approvedAt ? dateTime(customer.approvedAt) : '—'}</dd>
            </div>
            <div>
              <dt>Demo account</dt>
              <dd>{customer.isDemo ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Marketing opt-in</dt>
              <dd>{customer.marketingOptIn ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Portfolio</h2>
            <span className="muted small">{portfolio.positions.length} position(s)</span>
          </div>
          {portfolio.positions.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th className="right">Qty</th>
                    <th className="right">Value</th>
                    <th className="right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((position) => (
                    <tr key={position.symbol}>
                      <td>
                        <div className="cell-strong">{position.symbol}</div>
                        <div className="cell-sub">{position.name}</div>
                      </td>
                      <td className="right mono">{quantity(position.quantity, position.precision)}</td>
                      <td className="right mono">{money(position.valueCents)}</td>
                      <td className={`right mono ${position.pnlCents >= 0 ? 'pos' : 'neg'}`}>
                        {money(position.pnlCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No open positions">This customer has not placed any simulated trades.</EmptyState>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Transaction history</h2>
          <Link className="btn btn-ghost btn-sm" to="/admin/ledger">
            Platform ledger
          </Link>
        </div>
        {transactions.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="right">Amount</th>
                  <th>Reference</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{KIND_LABELS[tx.kind] || tx.kind}</td>
                    <td>
                      <StatusBadge status={tx.status} label={STATUS_LABELS[tx.status]} />
                    </td>
                    <td className="right mono">{money(tx.amountCents)}</td>
                    <td className="mono small">{tx.reference || '—'}</td>
                    <td className="muted small">{when(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No transactions yet" />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Support tickets</h2>
          <Link className="btn btn-ghost btn-sm" to="/admin/support">
            Support desk
          </Link>
        </div>
        {tickets.length ? (
          <ul className="ticket-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link className="ticket-row" to={`/admin/support/${ticket.id}`}>
                  <div>
                    <div className="cell-strong">{ticket.subject}</div>
                    <div className="cell-sub">
                      {ticket.category} · updated {when(ticket.updated_at || ticket.updatedAt)}
                    </div>
                  </div>
                  <StatusBadge status={ticket.status} label={STATUS_LABELS[ticket.status]} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No support tickets" />
        )}
      </section>

      <Modal
        open={Boolean(pendingAction)}
        title={pendingAction?.label || 'Confirm'}
        onClose={() => setPendingAction(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingAction(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={runAction} disabled={busy}>
              {busy ? 'Working…' : 'Confirm'}
            </button>
          </>
        }
      >
        <Field label={pendingAction?.needsReason ? 'Reason (required)' : 'Reason (optional)'} htmlFor="detail-reason">
          <textarea
            id="detail-reason"
            className="textarea"
            rows={3}
            maxLength={240}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </Modal>
    </>
  );
}
