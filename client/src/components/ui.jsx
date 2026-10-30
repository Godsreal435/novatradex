import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'info') => {
      if (!message) return;
      counter.current += 1;
      const id = counter.current;
      setToasts((list) => [...list.slice(-3), { id, message: String(message), tone }]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
      info: (m) => push(m, 'info'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-tone={toast.tone} onClick={() => dismiss(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const noopToasts = { push: () => {}, success: () => {}, error: () => {}, info: () => {} };

export function useToast() {
  return useContext(ToastContext) || noopToasts;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

const STATUS_TONE = {
  active: 'active',
  approved: 'approved',
  completed: 'completed',
  filled: 'completed',
  pending: 'pending',
  open: 'open',
  answered: 'answered',
  resolved: 'resolved',
  suspended: 'suspended',
  rejected: 'rejected',
  cancelled: 'cancelled',
  filled_out: 'completed',
};

export function StatusBadge({ status, label }) {
  const key = String(status || '').toLowerCase();
  const tone = STATUS_TONE[key] || 'pending';
  const text = label || key.charAt(0).toUpperCase() + key.slice(1);
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

export function DemoBadge({ children = 'Simulated' }) {
  return (
    <span className="badge badge-demo">
      <span className="pill-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Alert({ tone = 'info', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="spinner" aria-hidden="true" />
      <span className="muted small">{label || 'Loading…'}</span>
    </span>
  );
}

export function Splash({ label = 'Loading your workspace…' }) {
  return (
    <div className="splash">
      <div className="spinner" aria-hidden="true" />
      <p className="muted">{label}</p>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children ? <span className="muted small">{children}</span> : null}
    </div>
  );
}

/*
 * Loading placeholder used while a panel fetch is in flight. It keeps the layout
 * stable instead of collapsing the page.
 */
export function Skeleton({ rows = 3 }) {
  return (
    <div className="stack">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" />
      ))}
    </div>
  );
}

export function Notice({ children, tone = 'info' }) {
  if (!children) return null;
  return <div className="notice-line">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({ open, title, onClose, children, actions, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={wide ? 'modal modal-wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <div>{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

export function Stat({ label, value, foot, tone }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={tone ? `stat-value ${tone}` : 'stat-value'}>{value}</span>
      {foot ? <span className="stat-foot">{foot}</span> : null}
    </div>
  );
}
