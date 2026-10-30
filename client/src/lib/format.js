const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Cents (integer, as stored by the API) -> "$1,234.56" */
export function money(cents, { short = false } = {}) {
  const value = Number(cents || 0) / 100;
  return short && Math.abs(value) >= 100_000 ? compact.format(value) : currency.format(value);
}

export function signedMoney(cents) {
  const value = Number(cents || 0);
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
}

export function percent(value, digits = 2) {
  const n = Number(value || 0);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`;
}

export function quantity(value, digits = 4) {
  const n = Number(value || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function price(value, precision = 2) {
  const n = Number(value || 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

export function when(iso) {
  if (!iso) return '—';
  const date = new Date(String(iso).includes('T') ? iso : `${String(iso).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return String(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 8) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTime(iso) {
  if (!iso) return '—';
  const date = new Date(String(iso).includes('T') ? iso : `${String(iso).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const KIND_LABELS = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  trade_buy: 'Buy',
  trade_sell: 'Sell',
  fee: 'Fee',
  bonus: 'Demo credit',
  adjustment: 'Adjustment',
};

export const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
  active: 'Active',
  suspended: 'Suspended',
  open: 'Open',
  answered: 'Answered',
  resolved: 'Resolved',
};

export const cx = (...parts) => parts.filter(Boolean).join(' ');
