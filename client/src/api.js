/**
 * Browser API client.
 * Every call is same-origin and sends the httpOnly session cookie — no tokens or
 * secrets are ever held in client-side storage.
 */

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function query(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the NovaTradeX server. Check your connection and try again.', {
      status: 0,
      code: 'network_error',
    });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 200) };
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.message || `Request failed (${response.status}).`, {
      status: response.status,
      code: payload?.error || 'error',
      payload,
    });
  }
  return payload || {};
}

export const api = {
  /* session ------------------------------------------------------- */
  me: () => request('/auth/me'),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (form) => request('/auth/register', { method: 'POST', body: form }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),

  /* public -------------------------------------------------------- */
  publicOverview: () => request('/public/overview'),

  /* customer ------------------------------------------------------ */
  overview: () => request('/me/overview'),
  transactions: (params) => request(`/me/transactions${query(params)}`),
  transfers: () => request('/me/transfers'),
  createTransfer: (form) => request('/me/transfers', { method: 'POST', body: form }),
  cancelTransfer: (id) => request(`/me/transfers/${id}/cancel`, { method: 'POST' }),
  trade: (form) => request('/me/trades', { method: 'POST', body: form }),
  updateProfile: (form) => request('/me/profile', { method: 'PATCH', body: form }),
  tickets: () => request('/me/support'),
  ticket: (id) => request(`/me/support/${id}`),
  createTicket: (form) => request('/me/support', { method: 'POST', body: form }),
  replyTicket: (id, message) => request(`/me/support/${id}/messages`, { method: 'POST', body: { message } }),

  /* admin --------------------------------------------------------- */
  admin: {
    setupStatus: () => request('/admin/setup/status'),
    setup: (form) => request('/admin/setup', { method: 'POST', body: form }),
    login: (email, password) => request('/admin/login', { method: 'POST', body: { email, password } }),
    overview: () => request('/admin/overview'),
    customers: (params) => request(`/admin/customers${query(params)}`),
    customer: (id) => request(`/admin/customers/${id}`),
    setCustomerStatus: (id, action, reason) =>
      request(`/admin/customers/${id}/status`, { method: 'PATCH', body: { action, reason } }),
    payments: (params) => request(`/admin/payments${query(params)}`),
    reviewPayment: (id, action, reason) =>
      request(`/admin/payments/${id}`, { method: 'PATCH', body: { action, reason } }),
    transactions: (params) => request(`/admin/transactions${query(params)}`),
    tickets: (params) => request(`/admin/support${query(params)}`),
    ticket: (id) => request(`/admin/support/${id}`),
    replyTicket: (id, message) => request(`/admin/support/${id}/messages`, { method: 'POST', body: { message } }),
    setTicketStatus: (id, status) => request(`/admin/support/${id}`, { method: 'PATCH', body: { status } }),
    audit: () => request('/admin/audit'),
  },
};
