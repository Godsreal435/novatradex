import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Alert, EmptyState, Skeleton, StatusBadge } from '../../components/ui';
import { KIND_LABELS, STATUS_LABELS, dateTime, money, quantity } from '../../lib/format';

const KIND_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'trade_buy', label: 'Buys' },
  { value: 'trade_sell', label: 'Sells' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function AdminLedger() {
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.admin
      .transactions({ kind, status })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [kind, status]);

  useEffect(() => {
    load();
  }, [load]);

  const transactions = data?.transactions || [];
  const total = transactions.reduce(
    (sum, tx) => sum + (tx.status === 'completed' && String(tx.kind).startsWith('deposit') ? tx.amountCents : 0),
    0
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transaction ledger</h1>
          <p>Every simulated deposit, withdrawal and trade recorded on the platform.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <Alert tone="error">{error}</Alert>

      <section className="card">
        <div className="toolbar">
          <select
            className="select select-sm"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="Filter by type"
          >
            {KIND_FILTERS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="select select-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <span className="muted small">
            {transactions.length} entr{transactions.length === 1 ? 'y' : 'ies'} · completed demo deposits{' '}
            {money(total)}
          </span>
        </div>

        {!data ? <Skeleton rows={6} /> : null}

        {data && transactions.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="right">Amount</th>
                  <th>Instrument</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="muted small">{dateTime(tx.createdAt)}</td>
                    <td>
                      <div className="cell-strong">{tx.customerName || '—'}</div>
                      <div className="cell-sub">{tx.customerEmail}</div>
                    </td>
                    <td>{KIND_LABELS[tx.kind] || tx.kind}</td>
                    <td
                      className={`right mono ${
                        tx.kind === 'withdrawal' || tx.kind === 'trade_buy' ? 'neg' : 'pos'
                      }`}
                    >
                      {money(tx.amountCents)}
                    </td>
                    <td className="small">
                      {tx.symbol ? (
                        <>
                          <div className="cell-strong">{tx.symbol}</div>
                          <div className="cell-sub">
                            {quantity(tx.quantity)} @ {money(tx.price)}
                          </div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={tx.status} label={STATUS_LABELS[tx.status]} />
                    </td>
                    <td className="mono small">{tx.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && !transactions.length ? (
          <EmptyState title="No ledger entries">Simulated transactions will appear here as customers trade.</EmptyState>
        ) : null}
      </section>
    </>
  );
}
