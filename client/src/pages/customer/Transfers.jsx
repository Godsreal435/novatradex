import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useToast } from '../../components/ui';
import { Alert, DemoBadge, EmptyState, Field, Skeleton, Stat, StatusBadge } from '../../components/ui';
import { KIND_LABELS, STATUS_LABELS, money, when } from '../../lib/format';

const METHODS = ['Bank transfer', 'Debit card', 'Crypto (demo)', 'Internal transfer'];

export default function Transfers() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('deposit');
  const [form, setForm] = useState({ amount: '', method: METHODS[0], note: '' });
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState('');

  const load = () =>
    api
      .transfers()
      .then(setData)
      .catch((err) => setError(err.message));

  useEffect(() => {
    let alive = true;
    api
      .transfers()
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.createTransfer({
        kind,
        amount: Number(form.amount),
        method: form.method,
        note: form.note,
      });
      toast.success(result?.message || 'Request submitted for review.');
      setForm({ amount: '', method: form.method, note: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest(id) {
    setCancelling(id);
    setError('');
    try {
      await api.cancelTransfer(id);
      toast.info('Request cancelled.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling('');
    }
  }

  if (!data) return error ? <Alert tone="error">{error}</Alert> : <Skeleton rows={5} />;

  const pending = data.transfers.filter((item) => item.status === 'pending');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Deposits &amp; withdrawals</h1>
          <p>Submit simulated requests. An administrator reviews every request; no real funds move.</p>
        </div>
        <DemoBadge>No real money</DemoBadge>
      </div>

      <section className="stat-grid">
        <Stat label="Demo cash balance" value={money(data.account.balanceCents)} foot={data.account.currency} />
        <Stat label="Available for withdrawal" value={money(data.account.availableCents)} foot="After pending withdrawals" />
        <Stat label="Pending deposits" value={money(data.account.pendingDepositCents)} foot="Awaiting review" />
        <Stat label="Pending withdrawals" value={money(data.account.pendingWithdrawalCents)} foot="Awaiting review" />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">New request</h2>
              <p className="card-sub">Amounts are in USD and strictly simulated</p>
            </div>
          </div>

          <div className="tabs" role="tablist" aria-label="Request type">
            {[
              { key: 'deposit', label: 'Deposit' },
              { key: 'withdrawal', label: 'Withdrawal' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                className={kind === option.key ? 'tab active' : 'tab'}
                onClick={() => setKind(option.key)}
                aria-pressed={kind === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form className="form" onSubmit={onSubmit}>
            <Alert tone="error">{error}</Alert>

            <Field label="Amount (USD)" htmlFor="amount" hint="Minimum 10.00, maximum 1,000,000.00.">
              <input
                id="amount"
                className="input"
                type="number"
                min="10"
                max="1000000"
                step="0.01"
                required
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="500.00"
              />
            </Field>

            <Field label="Method" htmlFor="method">
              <select
                id="method"
                className="select"
                value={form.method}
                onChange={(event) => setForm({ ...form, method: event.target.value })}
              >
                {METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Note to reviewer (optional)" htmlFor="note">
              <textarea
                id="note"
                className="textarea"
                rows={3}
                maxLength={240}
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="Anything the administrator should know."
              />
            </Field>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : `Request ${kind === 'deposit' ? 'deposit' : 'withdrawal'}`}
            </button>
          </form>

          <Alert tone="warn">
            NovaTradeX is a demo. Requests are approved or rejected inside this environment only, and no payment
            provider, bank or blockchain is ever contacted.
          </Alert>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Pending review</h2>
              <p className="card-sub">{pending.length} request(s) awaiting an administrator</p>
            </div>
          </div>

          {pending.length ? (
            <div className="stack">
              {pending.map((request) => (
                <div className="row-between" key={request.id}>
                  <div>
                    <div className="cell-strong">
                      {KIND_LABELS[request.kind] || request.kind} · {money(Math.abs(request.amountCents))}
                    </div>
                    <div className="cell-sub">
                      {request.method} · {request.reference} · {when(request.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() => cancelRequest(request.id)}
                    disabled={cancelling === request.id}
                  >
                    {cancelling === request.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No pending requests">
              Submit a deposit or withdrawal request and it will appear here for review.
            </EmptyState>
          )}

          <div className="divider" />
          <p className="small muted">{data.notice}</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Request history</h2>
            <p className="card-sub">Every simulated deposit and withdrawal you have submitted</p>
          </div>
        </div>

        {data.transfers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {data.transfers.map((request) => (
                  <tr key={request.id}>
                    <td className="cell-strong">{KIND_LABELS[request.kind] || request.kind}</td>
                    <td className="mono small">{request.reference || '—'}</td>
                    <td className="small">{request.method || '—'}</td>
                    <td className={`num ${request.amountCents >= 0 ? 'pos' : 'neg'}`}>
                      {money(Math.abs(request.amountCents))}
                    </td>
                    <td>
                      <StatusBadge status={request.status} label={STATUS_LABELS[request.status]} />
                    </td>
                    <td className="small muted">{when(request.createdAt)}</td>
                    <td className="small muted">
                      {request.reviewedAt ? `${when(request.reviewedAt)} · ${request.reviewedBy || 'admin'}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No requests yet">Your simulated deposit and withdrawal requests will be listed here.</EmptyState>
        )}
      </section>
    </>
  );
}
