import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Alert, EmptyState, Skeleton, StatusBadge, useToast } from '../../components/ui';
import { dateTime, when } from '../../lib/format';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Answered' },
  { value: 'resolved', label: 'Resolved' },
];

const CATEGORY_LABELS = {
  general: 'General',
  account: 'Account',
  payments: 'Payments',
  security: 'Security',
  technical: 'Technical',
};

export default function AdminSupport() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const loadList = useCallback(() => {
    api.admin
      .tickets({ status })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [status]);

  const loadDetail = useCallback(() => {
    if (!ticketId) {
      setDetail(null);
      return;
    }
    api.admin
      .ticket(ticketId)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [ticketId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    setError('');
    setReply('');
    loadDetail();
  }, [loadDetail]);

  async function sendReply() {
    const body = reply.trim();
    if (body.length < 2) {
      setError('Write a reply first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.admin.replyTicket(ticketId, body);
      setReply('');
      toast.success('Reply sent.');
      loadDetail();
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setTicketStatus(next) {
    setBusy(true);
    setError('');
    try {
      await api.admin.setTicketStatus(ticketId, next);
      toast.success(`Ticket marked ${next}.`);
      loadDetail();
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tickets = data?.tickets || [];

  if (ticketId) {
    return (
      <>
        <div className="page-head">
          <div>
            <Link className="back-link" to="/admin/support">
              ← All tickets
            </Link>
            <h1>{detail?.ticket?.subject || 'Ticket'}</h1>
            <p className="row" style={{ gap: 8 }}>
              {detail?.ticket ? (
                <>
                  <StatusBadge status={detail.ticket.status} />
                  <span className="muted small">
                    {detail.ticket.customerName || detail.ticket.customerEmail} ·{' '}
                    {CATEGORY_LABELS[detail.ticket.category] || detail.ticket.category} · opened{' '}
                    {dateTime(detail.ticket.createdAt)}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {detail?.ticket?.status !== 'resolved' ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setTicketStatus('resolved')}
                disabled={busy}
              >
                Mark resolved
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setTicketStatus('open')}
                disabled={busy}
              >
                Reopen ticket
              </button>
            )}
          </div>
        </div>

        <Alert tone="error">{error}</Alert>

        {!detail ? (
          <Skeleton rows={4} />
        ) : (
          <section className="card">
            <div className="thread">
              {(detail.messages || []).map((message) => (
                <div
                  key={message.id}
                  className={message.author_role === 'admin' ? 'bubble bubble-staff' : 'bubble bubble-customer'}
                >
                  <div className="bubble-meta">
                    {message.author_role === 'admin' ? 'Support' : message.author_name || 'Customer'} ·{' '}
                    {when(message.created_at)}
                  </div>
                  <div className="bubble-body">{message.body}</div>
                </div>
              ))}
            </div>

            {detail.ticket.status === 'resolved' ? (
              <Alert tone="info">This ticket is resolved. Reopen it to continue the conversation.</Alert>
            ) : (
              <div className="reply-box">
                <textarea
                  className="textarea"
                  rows={4}
                  maxLength={4000}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write a reply to the customer…"
                  aria-label="Reply to customer"
                />
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={sendReply} disabled={busy}>
                    {busy ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support desk</h1>
          <p>Respond to customer questions about demo accounts, payments and the platform.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>
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
                onClick={() => setStatus(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {!data ? <Skeleton rows={5} /> : null}

        {data && tickets.length ? (
          <ul className="ticket-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  className="ticket-row"
                  onClick={() => navigate(`/admin/support/${ticket.id}`)}
                >
                  <div>
                    <div className="cell-strong">{ticket.subject}</div>
                    <div className="cell-sub">
                      {ticket.customerName || ticket.customerEmail} ·{' '}
                      {CATEGORY_LABELS[ticket.category] || ticket.category} · {ticket.messageCount} message(s) ·
                      updated {when(ticket.updatedAt)}
                    </div>
                  </div>
                  <StatusBadge status={ticket.status} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {data && !tickets.length ? (
          <EmptyState title="No tickets">Customer support requests will appear here.</EmptyState>
        ) : null}
      </section>
    </>
  );
}
