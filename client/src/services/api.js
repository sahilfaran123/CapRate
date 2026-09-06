import axios from 'axios';

const api = axios.create({
  baseURL:         '/api',
  withCredentials: true,   // Always send cookies with every request
  headers:         { 'Content-Type': 'application/json' },
});

// Auto-handle 401 token expiry — attempt refresh then retry once
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        return api(original); // Retry original request with new cookie
      } catch (_) {
        // Refresh failed — redirect to login
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

// ─── Plaid ────────────────────────────────────────────────────────────────────
export const createLinkToken     = ()                             => api.post('/plaid/link-token').then(r => r.data);
export const exchangePublicToken = (payload)                      => api.post('/plaid/exchange-public-token', payload).then(r => r.data);
export const getAccounts         = ()                             => api.get('/plaid/accounts').then(r => r.data);
export const getTransactions     = (startDate, endDate)           => api.get('/plaid/transactions', { params: { startDate, endDate } }).then(r => r.data);
export const removeItem          = (itemId)                       => api.delete(`/plaid/item/${itemId}`).then(r => r.data);

// ─── Investments ──────────────────────────────────────────────────────────────
export const getInvestmentAccounts     = ()                       => api.get('/investments/accounts').then(r => r.data);
export const getHoldings               = ()                       => api.get('/investments/holdings').then(r => r.data);
export const getInvestmentTransactions = (startDate, endDate)     => api.get('/investments/transactions', { params: { startDate, endDate } }).then(r => r.data);

// ─── Real Estate ──────────────────────────────────────────────────────────────
export const getProperties        = (forceRefresh = false)        => api.get('/real-estate/properties', { params: { forceRefresh } }).then(r => r.data);
export const addProperty          = (payload)                     => api.post('/real-estate/add', payload).then(r => r.data);
export const updatePropertyInputs = (propertyId, inputs)          => api.put(`/real-estate/property/${propertyId}/inputs`, inputs).then(r => r.data);
export const refreshProperty      = (propertyId)                  => api.post(`/real-estate/property/${propertyId}/refresh`).then(r => r.data);
export const removeProperty       = (propertyId)                  => api.delete(`/real-estate/property/${propertyId}`).then(r => r.data);

// ─── Balance History ──────────────────────────────────────────────────────────
export const saveSnapshot                = ()                     => api.post('/balance-history/snapshot').then(r => r.data);
export const getBankingHistory           = (days = 90)            => api.get('/balance-history/banking',    { params: { days } }).then(r => r.data);
export const getInvestmentHistory        = (days = 90)            => api.get('/balance-history/investment', { params: { days } }).then(r => r.data);
export const getAccountBankingHistory    = (accountId, days)      => api.get(`/balance-history/banking/${accountId}`,    { params: { days } }).then(r => r.data);
export const getAccountInvestmentHistory = (accountId, days)      => api.get(`/balance-history/investment/${accountId}`, { params: { days } }).then(r => r.data);

// ─── AI Advisor ───────────────────────────────────────────────────────────────
export const getConversations   = ()                              => api.get('/advisor/conversations').then(r => r.data);
export const getConversation    = (id)                            => api.get(`/advisor/conversations/${id}`).then(r => r.data);
export const deleteConversation = (id)                            => api.delete(`/advisor/conversations/${id}`).then(r => r.data);

export async function streamChat({ message, conversationId, onDelta, onDone, onError }) {
  try {
    const response = await fetch('/api/advisor/chat', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ message, conversationId }),
    });

    if (!response.ok) {
      const err = await response.json();
      onError?.(err.error || 'Request failed');
      return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'delta') onDelta?.(parsed.text);
          if (parsed.type === 'done')  onDone?.(parsed);
          if (parsed.type === 'error') onError?.(parsed.message);
        } catch (_) {}
      }
    }
  } catch (err) {
    onError?.(err.message);
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export const formatCurrency = (value, compact = false) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (compact && Math.abs(value) >= 1_000_000) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
};

export const formatDate = (date) => date
  ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';

export const formatPercent = (value) => value !== null && value !== undefined
  ? `${parseFloat(value) >= 0 ? '+' : ''}${parseFloat(value).toFixed(2)}%`
  : '—';

// ─── Real Estate: Events & Tax Summary (PRD Features 5-6) ────────────────────
export const getPropertyEvents = (propertyId) =>
  api.get(`/real-estate/property/${propertyId}/events`).then(r => r.data);

export const addPropertyEvent = (propertyId, event) =>
  api.post(`/real-estate/property/${propertyId}/event`, event).then(r => r.data);

export const deletePropertyEvent = (propertyId, eventId) =>
  api.delete(`/real-estate/property/${propertyId}/event/${eventId}`).then(r => r.data);

export const getTaxSummary = (year) =>
  api.get('/real-estate/tax-summary', { params: { year } }).then(r => r.data);

// ─── Real Estate: Property ↔ Bank Account Linking ────────────────────────────
export const linkPropertyAccount = (propertyId, payload) =>
  api.put(`/real-estate/property/${propertyId}/link-account`, payload).then(r => r.data);

export const unlinkPropertyAccount = (propertyId) =>
  api.delete(`/real-estate/property/${propertyId}/link-account`).then(r => r.data);

export const getPropertyFinancials = (propertyId) =>
  api.get(`/real-estate/property/${propertyId}/financials`).then(r => r.data);
