import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Alert, EmptyState, Skeleton } from '../../components/ui';
import { dateTime } from '../../lib/format';

const ACTION_TONE = {
  admin_login_failed: 'neg',
  admin_setup_failed: 'neg',
  customer_reject: 'neg',
  customer_suspend: 'neg',
  payment_rejected: 'neg',
  customer_activate: 'pos',
  customer_reactivate: 'pos',
  payment_approved: 'pos',
  owner_setup_completed: 'pos',
};

export default function AdminAudit() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    setError('');
    api.admin
      .audit()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const entries = (data?.entries || []).filter((entry) => {
    if (!filter) return true;
    const needle = filter.toLowerCase();
    return (
      String(entry.action || '').toLowerCase().includes(needle) ||
      String(entry.actor_email || '').toLowerCase().includes(needle) ||
      String(entry.detail || '').toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit trail</h1>
          <p>Append-only record of authentication, approval and payment decisions.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <Alert tone="error">{error}</Alert>

      <section className="card">
        <div className="toolbar">
          <input
            className="input input-search"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by action, actor or detail"
            aria-label="Filter audit entries"
          />
          <div className="spacer" />
          <span className="muted small">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
        </div>

        {!data ? <Skeleton rows={6} /> : null}

        {data && entries.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="muted small">{dateTime(entry.created_at)}</td>
                    <td className={ACTION_TONE[entry.action] || ''}>
                      <span className="mono small">{entry.action}</span>
                    </td>
                    <td>
                      <div className="cell-sub">{entry.actor_email || 'system'}</div>
                      <div className="cell-sub">{entry.actor_role || '—'}</div>
                    </td>
                    <td className="small">
                      {entry.target_type ? (
                        <>
                          {entry.target_type}
                          {entry.target_id ? <div className="cell-sub mono">{entry.target_id}</div> : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="small">{entry.detail || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && !entries.length ? (
          <EmptyState title="No audit entries">Administrative actions are recorded here automatically.</EmptyState>
        ) : null}
      </section>
    </>
  );
}
