import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Alert, EmptyState, Field, Modal, Skeleton, StatusBadge, useToast } from '../../components/ui';
import { KIND_LABELS, STATUS_LABELS, dateTime, money } from '../../lib/format';

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: '', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const KIND_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
];

export default function AdminPayments() {
  const [status, setStatus] = useState('pending');
  const [kind, setKind] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    setError('');
    api.admin
      .payments({ status, kind })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [status, kind]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitReview(action) {
    if (!review) return;
    const trimmed = reason.trim();
    if (action === 'reject' && trimmed.length < 3) {
      setError('A reason of at least 3 characters is required to reject a request.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.admin.reviewPayment(review.id, action, trimmed);
      toast.success(result?.message || `Request ${action === 'approve' ? 'approved' : 'rejected'}.`);
      setReview(null);
      setReason('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const payments = data?.payments || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payment requests</h1>
          <p>Approve or reject simulated deposits and withdrawals. No real money moves in this demo.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <Alert tone="error">{error}</Alert>

      <section className="card">
        <div className="toolbar">
          <div className="tabs">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value || 'all'}
                type="button"
                className={status === filter.value ? 'tab active' : 'tab'}
                onClick={() => setStatus(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="spacer" />
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
        </div>

        {!data ? <Skeleton rows={5} /> : null}

        {data && payments.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="right">Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <div className="cell-strong">{payment.customerName || '—'}</div>
                      <div className="cell-sub">{payment.customerEmail}</div>
                    </td>
                    <td>{KIND_LABELS[payment.kind] || payment.kind}</td>
                    <td className={`right mono ${payment.kind === 'withdrawal' ? 'neg' : 'pos'}`}>
                      {money(payment.amountCents)}
                    </td>
                    <td className="muted small">{payment.method || '—'}</td>
                    <td>
                      <StatusBadge status={payment.status} label={STATUS_LABELS[payment.status]} />
                      {payment.note ? <div className="cell-sub">{payment.note}</div> : null}
                    </td>
                    <td className="muted small">{dateTime(payment.createdAt)}</td>
                    <td className="right">
                      {payment.status === 'pending' ? (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setReason('');
                              setReview(payment);
                            }}
                          >
                            Review
                          </button>
                        </div>
                      ) : (
                        <span className="muted small">
                          {payment.reviewedAt ? dateTime(payment.reviewedAt) : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && !payments.length ? (
          <EmptyState title="Nothing in this queue">
            {status === 'pending' ? 'All payment requests have been reviewed.' : 'No requests match this filter.'}
          </EmptyState>
        ) : null}
      </section>

      <Modal
        open={Boolean(review)}
        title="Review payment request"
        onClose={() => setReview(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setReview(null)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => submitReview('reject')}
              disabled={busy}
            >
              Reject
            </button>
            <button type="button" className="btn btn-primary" onClick={() => submitReview('approve')} disabled={busy}>
              Approve
            </button>
          </>
        }
      >
        {review ? (
          <>
            <dl className="kv">
              <div>
                <dt>Customer</dt>
                <dd>
                  {review.customerName || '—'} ({review.customerEmail})
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{KIND_LABELS[review.kind] || review.kind}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd className="mono">{money(review.amountCents)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{review.method || '—'}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{dateTime(review.createdAt)}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd className="mono small">{review.reference || '—'}</dd>
              </div>
            </dl>

            {review.kind === 'withdrawal' ? (
              <Alert tone="warn">
                Approving a withdrawal debits the simulated balance. Ensure the demo balance covers the amount.
              </Alert>
            ) : (
              <Alert tone="info">Approving a deposit credits the simulated demo balance.</Alert>
            )}

            <Field label="Review note" htmlFor="payment-reason" hint="Required when rejecting; stored in the audit trail.">
              <textarea
                id="payment-reason"
                className="textarea"
                rows={3}
                maxLength={240}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Simulated funding confirmed"
              />
            </Field>
          </>
        ) : null}
      </Modal>
    </>
  );
}
