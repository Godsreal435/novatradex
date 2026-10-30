import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Alert, DemoBadge, EmptyState, Field, Skeleton } from '../../components/ui';
import { useToast } from '../../components/ui';
import { money, percent, price, quantity } from '../../lib/format';

const CLASSES = [
  { key: 'all', label: 'All markets' },
  { key: 'forex', label: 'Forex' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'gold', label: 'Gold' },
];

export default function Trade() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState('buy');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .overview()
      .then((payload) => {
        setData(payload);
        setSymbol((current) => current || payload.market?.[0]?.symbol || '');
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    let alive = true;
    api
      .overview()
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setSymbol(payload.market?.[0]?.symbol || '');
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const instruments = useMemo(() => {
    const list = data?.market || [];
    return filter === 'all' ? list : list.filter((item) => item.assetClass === filter);
  }, [data, filter]);

  const selected = (data?.market || []).find((item) => item.symbol === symbol);
  const numericQty = Number(qty);
  const executionPrice = selected ? (side === 'buy' ? selected.ask : selected.bid) : 0;
  const notionalCents = Number.isFinite(numericQty) ? Math.round(numericQty * executionPrice * 100) : 0;

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.trade({ symbol, side, quantity: numericQty });
      toast.success(result?.message || 'Simulated order filled.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <Alert tone="error">{error}</Alert> : <Skeleton rows={6} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trade</h1>
          <p>Execute simulated orders. Nothing here touches a real exchange or real money.</p>
        </div>
        <DemoBadge>Simulated execution</DemoBadge>
      </div>

      <div className="grid-3">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Order ticket</h2>
              <p className="card-sub">Filled instantly at the demo quote</p>
            </div>
          </div>

          <form className="form" onSubmit={onSubmit}>
            <Alert tone="error">{error}</Alert>

            <Field label="Instrument" htmlFor="symbol">
              <select
                id="symbol"
                className="select"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              >
                {(data.market || []).map((item) => (
                  <option key={item.symbol} value={item.symbol}>
                    {item.symbol} — {item.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="tabs" role="tablist" aria-label="Order side">
              {['buy', 'sell'].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={side === option ? 'tab active' : 'tab'}
                  onClick={() => setSide(option)}
                  aria-pressed={side === option}
                >
                  {option === 'buy' ? 'Buy' : 'Sell'}
                </button>
              ))}
            </div>

            <Field label="Quantity" htmlFor="qty" hint="Minimum order value is 10.00 USD.">
              <input
                id="qty"
                className="input"
                type="number"
                min="0"
                step="any"
                required
                value={qty}
                onChange={(event) => setQty(event.target.value)}
              />
            </Field>

            <div className="kv">
              <span>Reference price</span>
              <strong>{selected ? price(executionPrice, selected.precision) : '—'}</strong>
            </div>
            <div className="kv">
              <span>Estimated value</span>
              <strong>{money(notionalCents)}</strong>
            </div>
            <div className="kv">
              <span>Available demo cash</span>
              <strong>{money(data.account.availableCents)}</strong>
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy || !symbol}>
              {busy ? 'Filling order…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || 'instrument'}`}
            </button>
          </form>

          <p className="small muted">
            Demo orders are recorded in your simulated ledger with an append-only audit trail.
          </p>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Market watch</h2>
              <p className="card-sub">Simulated quotes by asset class</p>
            </div>
          </div>

          <div className="tabs" role="tablist" aria-label="Asset class filter">
            {CLASSES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={filter === item.key ? 'tab active' : 'tab'}
                onClick={() => setFilter(item.key)}
                aria-pressed={filter === item.key}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="stack">
            {instruments.map((item) => (
              <button
                type="button"
                key={item.symbol}
                className="quote-row"
                onClick={() => setSymbol(item.symbol)}
                style={{ textAlign: 'left', width: '100%' }}
              >
                <div>
                  <div className="quote-sym">{item.symbol}</div>
                  <div className="quote-name">{item.name}</div>
                </div>
                <div className="quote-price">
                  {price(item.price, item.precision)}
                  <span className={`quote-delta ${item.dayChangePct >= 0 ? 'pos' : 'neg'}`}>
                    {percent(item.dayChangePct)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Open positions</h2>
            <p className="card-sub">Valued at current demo quotes</p>
          </div>
          <DemoBadge>Mark-to-market is simulated</DemoBadge>
        </div>
        {data.portfolio.positions.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="num">Quantity</th>
                  <th className="num">Avg cost</th>
                  <th className="num">Last</th>
                  <th className="num">Market value</th>
                  <th className="num">Unrealised P&L</th>
                </tr>
              </thead>
              <tbody>
                {data.portfolio.positions.map((position) => (
                  <tr key={position.symbol}>
                    <td>
                      <div className="cell-strong">{position.symbol}</div>
                      <div className="cell-sub">{position.name}</div>
                    </td>
                    <td className="num">{quantity(position.quantity)}</td>
                    <td className="num">{price(position.avgCost, position.precision)}</td>
                    <td className="num">{price(position.price, position.precision)}</td>
                    <td className="num">{money(position.valueCents)}</td>
                    <td className={`num ${position.pnlCents >= 0 ? 'pos' : 'neg'}`}>
                      {money(position.pnlCents)}
                      <div className="cell-sub">{percent(position.pnlPct)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No open positions">Place a demo order to open your first position.</EmptyState>
        )}
      </section>

      <Alert tone="info">
        Simulated trading only. Quotes are generated for demonstration, fills are immediate, and no orders reach a real
        market. Past performance of demo data implies nothing about real results.
      </Alert>
    </>
  );
}
