import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/ui';
import { Alert, EmptyState, Field, Modal, Skeleton, StatusBadge } from '../../components/ui';
import { STATUS_LABELS, dateTime, money, when } from '../../lib/format';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

const ACTIONS = {
  active: null,
  pending: [
    { action: 'activate', label: 'Approve account', tone: 'btn-primary' },
    { action: 'reject', label: 'Reject', tone: 'btn-outline', needsReason: true },
  ],
  suspended: [{ action: 'reactivate', label: 'Reactivate', tone: 'btn-primary' }],
  rejected: [{ action: 'activate', label: 'Approve anyway', tone: 'btn-outline' }],
};

export default function AdminCustomers() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [search, setSearch] = useState(params.get('q') || '');
  const [query, setQuery] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState('');
  const toast = useToast();

  const load = useCallback(() => {
    setError('');
    api.admin
      .customers({ status, q: query })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [status, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const counts = useMemo(() => {
    const list = data?.customers || [];
    return {
      total: list.length,
      pending: list.filter((c) => c.status === 'pending').length,
    };
  }, [data]);

  function applyFilter(next) {
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set('status', next);
    else nextParams.delete('status');
    setParams(nextParams, { replace: true });
  }

  async function runAction() {
    if (!pendingAction) return;
    const { customer, action, needsReason } = pendingAction;
    if (needsReason && reason.trim().length < 3) {
      setError('Add a short reason (at least 3 characters) for the audit trail.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.admin.setCustomerStatus(customer.id, action, reason.trim());
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

  const selected = pendingAction?.customer;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>Approve registrations, suspend abusive accounts and inspect demo balances.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <Alert tone="error">{error}</Alert>

      <section className="card">
        <div className="toolbar">
          <div className="tabs">
            {FILTERS.map((filter) => (
              <button
                key={filter.value || 'all'}
                type="button"
                className={status === filter.value ? 'tab active' : 'tab'}
                onClick={() => applyFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <input
            className="input input-search"
            type="search"
            placeholder="Search name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search customers"
          />
        </div>

        {!data ? <Skeleton rows={5} /> : null}

        {data && data.customers.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="right">Demo cash</th>
                  <th className="right">Equity</th>
                  <th className="right">Pending</th>
                  <th>Registered</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="cell-strong">{customer.fullName || 'Unnamed customer'}</div>
                      <div className="cell-sub">{customer.email}</div>
                    </td>
                    <td>
                      <StatusBadge status={customer.status} label={STATUS_LABELS[customer.status]} />
                      {customer.statusReason ? <div className="cell-sub">{customer.statusReason}</div> : null}
                    </td>
                    <td className="right mono">{money(customer.balanceCents)}</td>
                    <td className="right mono">{money(customer.equityCents)}</td>
                    <td className="right mono">{customer.pendingPayments || '—'}</td>
                    <td className="muted small">{dateTime(customer.createdAt)}</td>
                    <td className="right">
                      <div className="row-actions">
                        <Link className="btn btn-ghost btn-sm" to={`/admin/customers/${customer.id}`}>
                          Open
                        </Link>
                        {(ACTIONS[customer.status] || []).map((option) => (
                          <button
                            key={option.action}
                            type="button"
                            className={`btn ${option.tone} btn-sm`}
                            onClick={() => {
                              setReason('');
                              setPendingAction({ customer, ...option });
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && !data.customers.length ? (
          <EmptyState title="No customers match this view">
            {counts.total ? 'Try a different filter or search term.' : 'Registrations will appear here.'}
          </EmptyState>
        ) : null}
      </section>

      <Modal
        open={Boolean(pendingAction)}
        title={pendingAction?.label || 'Confirm action'}
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
        <p className="muted">
          {selected ? (
            <>
              Apply <strong>{pendingAction?.label}</strong> to <strong>{selected.fullName || selected.email}</strong>?
            </>
          ) : null}
        </p>
        <Field
          label={pendingAction?.needsReason ? 'Reason (required)' : 'Reason (optional)'}
          htmlFor="reason"
          hint="Stored in the append-only audit trail."
        >
          <textarea
            id="reason"
            className="textarea"
            rows={3}
            maxLength={240}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Verified demo registration details"
          />
        </Field>
        {pendingAction?.action === 'activate' ? (
          <Alert tone="info">
            Approving grants trading access. A new demo account receives a simulated starting balance — no real funds.
          </Alert>
        ) : null}
        {['suspend', 'reject'].includes(pendingAction?.action) ? (
          <Alert tone="warn">Existing sessions for this customer are revoked immediately.</Alert>
        ) : null}
      </Modal>
    </>
  );
}
