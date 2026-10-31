import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Alert, DemoBadge, EmptyState, Skeleton, Stat, StatusBadge } from '../../components/ui';
import { KIND_LABELS, STATUS_LABELS, money, percent, price, quantity, when } from '../../lib/format';

const CLASS_LABELS = { forex: 'Forex', crypto: 'Crypto', stocks: 'Stocks', gold: 'Gold' };

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .overview()
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

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Skeleton rows={6} />;

  const { account, portfolio, recentTransactions, pendingRequests, openTickets, market, user } = data;
  const cash = account.balanceCents;
  const equity = portfolio.equityCents;
  const pnl = portfolio.pnlCents;
  const first = user?.firstName || 'there';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome back, {first}</h1>
          <p>Your demo trading workspace. Prices, balances and transfers are simulated.</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <DemoBadge>Demo balance</DemoBadge>
          <Link className="btn btn-primary btn-sm" to="/app/trade">
            Place demo order
          </Link>
          <Link className="btn btn-outline btn-sm" to="/app/transfers">
            Request funds
          </Link>
        </div>
      </div>

  <section className="stat-grid balance-stat-grid">
  <Stat
    label="Total equity (simulated)"
    value={money(equity)}
    foot={`Cash ${money(cash)} + positions ${money(portfolio.investedCents)}`}
  />
  <Stat
    label="Cash demo balance"
    value={money(cash)}
    foot={`Available ${money(account.availableCents)}`}
  />
</section>

<section className="stat-grid">
  <Stat
    label="Position P&L (simulated)"
    value={money(pnl)}
    tone={pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : undefined}
    foot={`${percent(portfolio.pnlPct)} on cost basis`}
  />
  <Stat
    label="Pending requests"
    value={money(account.pendingDepositCents + account.pendingWithdrawalCents)}
    foot={`Deposits ${money(account.pendingDepositCents)} · Withdrawals ${money(account.pendingWithdrawalCents)}`}
  />
</section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Portfolio</h2>
              <p className="card-sub">Simulated positions valued at demo prices</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/app/trade">
              Trade
            </Link>
          </div>

          {portfolio.positions.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th className="num">Quantity</th>
                    <th className="num">Avg cost</th>
                    <th className="num">Last</th>
                    <th className="num">Value</th>
                    <th className="num">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((position) => (
                    <tr key={position.symbol}>
                      <td>
                        <div className="cell-strong">{position.symbol}</div>
                        <div className="cell-sub">
                          {position.name} · {CLASS_LABELS[position.assetClass] || position.assetClass}
                        </div>
                      </td>
                      <td className="num">{quantity(position.quantity)}</td>
                      <td className="num">{price(position.avgCost, position.precision)}</td>
                      <td className="num">{price(position.price, position.precision)}</td>
                      <td className="num">{money(position.valueCents)}</td>
                      <td className={`num ${position.pnlCents > 0 ? 'pos' : position.pnlCents < 0 ? 'neg' : ''}`}>
                        {money(position.pnlCents)}
                        <div className="cell-sub">{percent(position.pnlPct)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No open positions yet">
              Positions appear here after you place a simulated buy order.
            </EmptyState>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Allocation</h2>
              <p className="card-sub">Share of invested demo capital by market</p>
            </div>
          </div>
          {portfolio.allocation.length ? (
            <div className="stack">
              {portfolio.allocation.map((slice) => (
                <div className="alloc-row" key={slice.assetClass}>
                  <div className="alloc-meta">
                    <span>{CLASS_LABELS[slice.assetClass] || slice.assetClass}</span>
                    <span className="muted">{money(slice.valueCents)} · {slice.pct}%</span>
                  </div>
                  <div className="alloc-track">
                    <div className="alloc-fill" style={{ width: `${Math.max(2, slice.pct)}%` }} />
                  </div>
                </div>
              ))}
              {portfolio.allocation.length === 0 ? null : null}
            </div>
          ) : (
            <EmptyState title="Nothing allocated yet">
              Buy a demo position to see how your capital is distributed.
            </EmptyState>
          )}

          <div className="divider" />
          <p className="small muted">
            {openTickets > 0
              ? `You have ${openTickets} open support ${openTickets === 1 ? 'request' : 'requests'}.`
              : 'No open support requests.'}{' '}
            <Link to="/app/support">Open the support desk</Link>
          </p>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Recent activity</h2>
              <p className="card-sub">Sample transactions from your demo ledger</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/app/transactions">
              View all
            </Link>
          </div>
          {recentTransactions.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Reference</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <div className="cell-strong">{KIND_LABELS[tx.kind] || tx.kind}</div>
                        <div className="cell-sub">{tx.symbol ? `${tx.symbol} · ${quantity(tx.quantity)}` : tx.method}</div>
                      </td>
                      <td className="mono small">{tx.reference || '—'}</td>
                      <td className={`num ${tx.amountCents >= 0 ? 'pos' : 'neg'}`}>{money(tx.amountCents)}</td>
                      <td>
                        <StatusBadge status={tx.status} label={STATUS_LABELS[tx.status]} />
                      </td>
                      <td className="small muted">{when(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No transactions yet">
              Your demo ledger starts empty until the platform credits your account.
            </EmptyState>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Pending requests</h2>
              <p className="card-sub">Awaiting administrator review</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/app/transfers">
              Manage
            </Link>
          </div>
          {pendingRequests.length ? (
            <div className="stack">
              {pendingRequests.map((req) => (
                <div className="row-between" key={req.id}>
                  <div>
                    <div className="cell-strong">
                      {KIND_LABELS[req.kind] || req.kind} · {money(Math.abs(req.amountCents))}
                    </div>
                    <div className="cell-sub">
                      {req.method} · {when(req.createdAt)}
                    </div>
                  </div>
                  <StatusBadge status={req.status} label={STATUS_LABELS[req.status]} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing pending">New deposit or withdrawal requests will appear here.</EmptyState>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Market snapshot</h2>
            <p className="card-sub">Simulated quotes across Forex, Crypto, Stocks and Gold</p>
          </div>
          <DemoBadge>Prices are simulated</DemoBadge>
        </div>
        <div className="grid-4">
          {(market || []).slice(0, 8).map((quote) => (
            <div className="quote-row" key={quote.symbol}>
              <div>
                <div className="quote-sym">{quote.symbol}</div>
                <div className="quote-name">{quote.name}</div>
              </div>
              <div className="quote-price">
                {price(quote.price, quote.precision)}
                <span className={`quote-delta ${quote.dayChangePct >= 0 ? 'pos' : 'neg'}`}>
                  {percent(quote.dayChangePct)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Alert tone="info">{data.notice}</Alert>
    </>
  );
}
