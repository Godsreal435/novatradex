import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/ui';
import { Alert, DemoBadge, EmptyState, Field, Skeleton, StatusBadge } from '../../components/ui';
import { STATUS_LABELS, when } from '../../lib/format';

const CATEGORIES = [
  { value: 'general', label: 'General question' },
  { value: 'account', label: 'Account access' },
  { value: 'payments', label: 'Deposit or withdrawal' },
  { value: 'security', label: 'Security concern' },
  { value: 'technical', label: 'Platform / technical' },
];

const CATEGORY_LABELS = CATEGORIES.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {});

export default function Support() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [tickets, setTickets] = useState(null);
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'general', message: '' });
  const [reply, setReply] = useState('');
  const threadEnd = useRef(null);

  const loadTickets = useCallback(
    () =>
      api
        .tickets()
        .then((payload) => setTickets(payload.tickets || []))
        .catch((err) => setError(err.message)),
    []
  );

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!ticketId) {
      setThread(null);
      return undefined;
    }
    let alive = true;
    api
      .ticket(ticketId)
      .then((payload) => {
        if (alive) setThread(payload);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [ticketId]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [thread, ticketId]);

  async function onCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.createTicket(form);
      toast.success(result?.message || 'Support request submitted.');
      setForm({ subject: '', category: 'general', message: '' });
      setComposing(false);
      await loadTickets();
      if (result?.id) navigate(`/app/support/${result.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      const payload = await api.replyTicket(ticketId, reply.trim());
      setThread(payload?.ticket ? payload : { ...thread });
      setReply('');
      const refreshed = await api.ticket(ticketId);
      setThread(refreshed);
      await loadTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support</h1>
          <p>Message the NovaTradeX team about your simulated demo account.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <DemoBadge>Demo desk</DemoBadge>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setComposing((open) => !open)}>
            {composing ? 'Close form' : 'New request'}
          </button>
        </div>
      </div>

      <Alert tone="error">{error}</Alert>

      {composing ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">New support request</h2>
              <p className="card-sub">A member of staff will reply inside this demo console</p>
            </div>
          </div>
          <form className="form" onSubmit={onCreate}>
            <Field label="Subject" htmlFor="subject">
              <input
                id="subject"
                className="input"
                required
                maxLength={120}
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                placeholder="Brief summary of the issue"
              />
            </Field>
            <Field label="Topic" htmlFor="category">
              <select
                id="category"
                className="select"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Message" htmlFor="message" hint="Include any demo reference IDs so we can find the record.">
              <textarea
                id="message"
                className="textarea"
                rows={5}
                required
                maxLength={2000}
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
              />
            </Field>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Submit request'}
            </button>
          </form>
        </section>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Your requests</h2>
              <p className="card-sub">{tickets ? `${tickets.length} conversation(s)` : 'Loading…'}</p>
            </div>
          </div>

          {!tickets ? <Skeleton rows={3} /> : null}

          {tickets && tickets.length ? (
            <div className="ticket-list">
              {tickets.map((ticket) => (
                <button
                  type="button"
                  key={ticket.id}
                  className={String(ticket.id) === String(ticketId) ? 'ticket-item active' : 'ticket-item'}
                  onClick={() => navigate(`/app/support/${ticket.id}`)}
                >
                  <div className="row-between">
                    <span className="ticket-subject">{ticket.subject}</span>
                    <StatusBadge status={ticket.status} label={STATUS_LABELS[ticket.status]} />
                  </div>
                  <div className="ticket-meta">
                    {CATEGORY_LABELS[ticket.category] || 'General'} · {ticket.message_count ?? 0} message(s) ·{' '}
                    {when(ticket.updated_at)}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {tickets && !tickets.length ? (
            <EmptyState title="No support requests yet">Open a request and the thread will appear here.</EmptyState>
          ) : null}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Conversation</h2>
              <p className="card-sub">
                {thread?.ticket ? thread.ticket.subject : 'Select a request to read the thread'}
              </p>
            </div>
            {thread?.ticket ? <StatusBadge status={thread.ticket.status} label={STATUS_LABELS[thread.ticket.status]} /> : null}
          </div>

          {!ticketId ? (
            <EmptyState title="Nothing selected">Choose a request from the list to view its messages.</EmptyState>
          ) : null}

          {ticketId && !thread ? <Skeleton rows={4} /> : null}

          {thread?.ticket ? (
            <>
              <div className="thread" ref={threadEnd}>
                {(thread.messages || []).map((message) => (
                  <div key={message.id} className={`bubble ${message.author_role === 'admin' ? 'bubble-staff' : 'bubble-mine'}`}>
                    <div className="bubble-author">
                      {message.author_role === 'admin' ? 'NovaTradeX support' : 'You'} · {when(message.created_at || message.createdAt)}
                    </div>
                    <div>{message.body}</div>
                  </div>
                ))}
                {!(thread.messages || []).length ? <p className="muted small">No messages yet.</p> : null}
              </div>

              {thread.ticket.status === 'resolved' ? (
                <Alert tone="info">This request is marked resolved. Replying will reopen it for the support team.</Alert>
              ) : null}

              <form className="form" onSubmit={onReply}>
                <Field label="Reply" htmlFor="reply">
                  <textarea
                    id="reply"
                    className="textarea"
                    rows={3}
                    maxLength={2000}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Add more detail for the support team…"
                  />
                </Field>
                <button className="btn btn-primary" type="submit" disabled={busy || !reply.trim()}>
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
              </form>
            </>
          ) : null}
        </section>
      </div>

      <Alert tone="info">
        Support runs inside the demo environment. Never send real card numbers, bank credentials or identity documents.
      </Alert>
    </>
  );
}
