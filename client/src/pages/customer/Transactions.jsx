import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Alert, DemoBadge, EmptyState, Skeleton, StatusBadge } from '../../components/ui';
import { KIND_LABELS, STATUS_LABELS, dateTime, money, price, quantity } from '../../lib/format';

const KINDS = [
  { key: '', label: 'All types' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'withdrawal', label: 'Withdrawals' },
  { key: 'trade_buy', label: 'Buys' },
  { key: 'trade_sell', label: 'Sells' },
  { key: 'bonus', label: 'Demo credit' },
  { key: 'fee', label: 'Fees' },
];

const STATUSES = [
  { key: '', label: 'Any status' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function Transactions() {
  const [filters, setFilters] = useState({ kind: '', status: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .transactions(filters)
      .then((payload) => {
        if (alive) {
          setData(payload);
          setError('');
        }
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [filters]);

  const rows = data?.transactions || [];
  const inflow = rows.filter((row) => row.amountCents > 0).reduce((sum, row) => sum + row.amountCents, 0);
  const outflow = rows.filter((row) => row.amountCents < 0).reduce((sum, row) => sum + Math.abs(row.amountCents), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p>Complete simulated ledger for your demo account — sample data only.</p>
        </div>
        <DemoBadge>Sample transactions</DemoBadge>
      </div>

      <section className="card card-flat">
        <div className="toolbar">
          <label className="row small muted" htmlFor="kind-filter" style={{ gap: 8 }}>
            Type
            <select
              id="kind-filter"
              className="select input-sm"
              value={filters.kind}
              onChange={(event) => setFilters((prev) => ({ ...prev, kind: event.target.value }))}
            >
              {KINDS.map((item) => (
                <option key={item.key || 'all'} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="row small muted" htmlFor="status-filter" style={{ gap: 8 }}>
            Status
            <select
              id="status-filter"
              className="select input-sm"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              {STATUSES.map((item) => (
                <option key={item.key || 'any'} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="spacer" />
          <span className="small muted">
            {rows.length} record(s) · in {money(inflow)} · out {money(outflow)}
          </span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Ledger entries</h2>
            <p className="card-sub">Newest first. Entries are append-only server side.</p>
          </div>
        </div>

        <Alert tone="error">{error}</Alert>

        {!data && !error ? <Skeleton rows={5} /> : null}

        {data && rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Detail</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="small muted">{dateTime(row.createdAt)}</td>
                    <td className="cell-strong">{KIND_LABELS[row.kind] || row.kind}</td>
                    <td>
                      {row.symbol ? (
                        <>
                          <div>{row.symbol}</div>
                          <div className="cell-sub">
                            {quantity(row.quantity)} @ {price(row.price)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div>{row.method || '—'}</div>
                          {row.note ? <div className="cell-sub">{row.note}</div> : null}
                        </>
                      )}
                    </td>
                    <td className="mono small">{row.reference || '—'}</td>
                    <td className={`num ${row.amountCents >= 0 ? 'pos' : 'neg'}`}>
                      {money(row.amountCents)}
                      {row.balanceAfterCents !== null && row.balanceAfterCents !== undefined ? (
                        <div className="cell-sub">bal {money(row.balanceAfterCents)}</div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && !rows.length ? (
          <EmptyState title="No matching transactions">
            Adjust the filters, or submit a simulated deposit request to create your first entry.
          </EmptyState>
        ) : null}
      </section>

      <Alert tone="info">
        This ledger is sample data for a demonstration platform. Values are not redeemable, do not represent real
        holdings, and no real-money processing takes place. Any P&amp;L shown elsewhere is calculated from simulated
        quotes and is not an indication of future results.
      </Alert>
    </>
  );
}
