import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  getProperties, updatePropertyInputs, formatCurrency,
  getPropertyEvents, addPropertyEvent, deletePropertyEvent, getTaxSummary,
  getAccounts, linkPropertyAccount, unlinkPropertyAccount, getPropertyFinancials,
} from '../services/api.js';
import PropertyInputModal    from '../components/PropertyInputModal.jsx';
import RefinanceCalculator   from '../components/RefinanceCalculator.jsx';
import MortgagePaydownChart  from '../components/MortgagePaydownChart.jsx';
import ErrorBoundary         from '../components/ErrorBoundary.jsx';

const PIE_COLORS = ['#4f46e5', '#818cf8', '#a78bfa', '#c4b5fd', '#6366f1', '#8b5cf6', '#7c3aed', '#a5b4fc'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
// ─── Helpers ─────────────────────────────────────────────────────────────────
// The backend now supplies `effective` (actual when a bank account is linked,
// otherwise the estimate) plus a `source` flag.
function effCashFlow(p) {
  return p.effective?.monthlyCashFlow ?? p.cashFlow?.monthly ?? null;
}
function effCoc(p) {
  if (p.effective?.cocReturn != null) return p.effective.cocReturn;
  const down   = p.userInputs?.downPayment;
  const annual = p.cashFlow?.annual;
  if (!down || down <= 0 || annual == null) return null;
  return (annual / down) * 100;
}
function isVerified(p) {
  return p.effective?.source === 'actual';
}

// Small badge showing whether a figure is bank-verified or estimated
function SourceBadge({ verified, className = '' }) {
  return (
    <span
      title={verified
        ? 'Calculated from real bank transactions'
        : 'Calculated from the figures you entered'}
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
        verified ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
      } ${className}`}
    >
      {verified ? '🏦 Verified' : 'Estimated'}
    </span>
  );
}

function cocReturn(p) {
  return effCoc(p);
}

function shortAddress(address) {
  return (address || '').split(',')[0];
}

// ─── Summary Bar ─────────────────────────────────────────────────────────────
function SummaryBar({ properties }) {
  const totalValue    = properties.reduce((s, p) => s + (p.estimatedValue || 0), 0);
  const totalEquity   = properties.reduce((s, p) => s + (p.equity?.currentEquity || 0), 0);
  const monthlyCF     = properties.reduce((s, p) => s + (effCashFlow(p) || 0), 0);
  const anyVerified   = properties.some(isVerified);

  const metrics = [
    { label: 'Portfolio Value',   value: formatCurrency(totalValue),   color: 'text-indigo-600' },
    { label: 'Total Equity',      value: formatCurrency(totalEquity),  color: 'text-indigo-600' },
    { label: 'Monthly Cash Flow', value: `${monthlyCF >= 0 ? '+' : ''}${formatCurrency(monthlyCF)}`, color: monthlyCF >= 0 ? 'text-emerald-600' : 'text-red-500', note: anyVerified ? '🏦 includes bank-verified figures' : 'Estimated from your entries' },
    { label: 'Annual Cash Flow',  value: `${monthlyCF >= 0 ? '+' : ''}${formatCurrency(monthlyCF * 12)}`, color: monthlyCF >= 0 ? 'text-emerald-600' : 'text-red-500' },
    { label: 'Properties',        value: properties.length,            color: 'text-gray-900' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {metrics.map(m => (
        <div key={m.label} className="card">
          <p className="text-xs text-gray-400 mb-1">{m.label}</p>
          <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          {m.note && <p className="text-[10px] text-gray-400 mt-0.5">{m.note}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Rankings Table ──────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'address',      label: 'Property',      sortable: true  },
  { key: 'value',        label: 'Value',         sortable: true  },
  { key: 'equity',       label: 'Equity',        sortable: true,  hideMobile: true },
  { key: 'ltv',          label: 'LTV',           sortable: true,  hideMobile: true },
  { key: 'cashFlow',     label: 'Cash Flow/mo',  sortable: true  },
  { key: 'capRate',      label: 'Cap Rate',      sortable: true,  hideMobile: true },
  { key: 'coc',          label: 'CoC Return',    sortable: true  },
  { key: 'appreciation', label: 'Appreciation',  sortable: true,  hideMobile: true },
  { key: 'actions',      label: '',              sortable: false, hideMobile: true },
];

function sortValue(p, key) {
  switch (key) {
    case 'address':      return p.address || '';
    case 'value':        return p.estimatedValue || 0;
    case 'equity':       return p.equity?.currentEquity ?? -Infinity;
    case 'ltv':          return parseFloat(p.equity?.ltv) || Infinity;
    case 'cashFlow':     return effCashFlow(p) ?? -Infinity;
    case 'capRate':      return parseFloat(p.capRate) || -Infinity;
    case 'coc':          return cocReturn(p) ?? -Infinity;
    case 'appreciation': return p.appreciation ?? -Infinity;
    default:             return 0;
  }
}

function RankingsTable({ properties, onEdit }) {
  const [sortKey, setSortKey] = useState('cashFlow');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (!COLUMNS.find(c => c.key === key)?.sortable) return;
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...properties].sort((a, b) => {
    const va = sortValue(a, sortKey);
    const vb = sortValue(b, sortKey);
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="card overflow-x-auto">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Performance Rankings</h2>
      <table className="w-full text-sm min-w-[560px] sm:min-w-[700px]">
        <thead>
          <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`pb-3 font-medium ${col.key !== 'address' ? 'text-right' : ''} ${col.sortable ? 'cursor-pointer hover:text-gray-600 select-none' : ''} ${col.hideMobile ? 'hidden sm:table-cell' : ''}`}
              >
                {col.label}
                {sortKey === col.key && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map(p => {
            const coc = cocReturn(p);
            const ltv = parseFloat(p.equity?.ltv);
            return (
              <tr key={p.propertyId || p._id} className="hover:bg-gray-50">
                <td className="py-3">
                  <p className="font-medium text-gray-900 max-w-[180px] truncate">{shortAddress(p.address)}</p>
                </td>
                <td className="py-3 text-right font-semibold">{formatCurrency(p.estimatedValue)}</td>
                <td className="py-3 text-right hidden sm:table-cell">
                  {p.equity?.currentEquity != null
                    ? <span className="font-semibold text-indigo-600">{formatCurrency(p.equity.currentEquity)}</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 text-right hidden sm:table-cell">
                  {p.equity?.ltv != null
                    ? <span className={`font-medium ${ltv < 80 ? 'text-emerald-600' : 'text-amber-500'}`}>{p.equity.ltv}%</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 text-right">
                  {(() => {
                    const cf = effCashFlow(p);
                    if (cf == null) return <span className="text-gray-300 text-xs">Not set</span>;
                    return (
                      <span className="inline-flex flex-col items-end">
                        <span className={`font-semibold ${cf >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {cf >= 0 ? '+' : ''}{formatCurrency(cf)}
                        </span>
                        <SourceBadge verified={isVerified(p)} />
                      </span>
                    );
                  })()}
                </td>
                <td className="py-3 text-right hidden sm:table-cell">
                  {p.capRate
                    ? <span className="font-medium text-gray-700"
                        title={p.capRateSource === 'actual' ? 'From your rent and operating expenses' : 'Market estimate'}>
                        {p.capRate}%{p.capRateSource !== 'actual' && <span className="text-gray-300 text-xs"> est</span>}
                      </span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 text-right">
                  {coc != null
                    ? <span className={`font-semibold ${coc >= 8 ? 'text-emerald-600' : coc >= 5 ? 'text-amber-500' : 'text-red-500'}`}>{coc.toFixed(1)}%</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 text-right hidden sm:table-cell">
                  {p.appreciation != null
                    ? <span className={`font-medium ${p.appreciation >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {p.appreciation >= 0 ? '+' : ''}{formatCurrency(p.appreciation)}
                      </span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 text-right hidden sm:table-cell">
                  <button
                    onClick={() => onEdit(p)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50 transition-colors"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Market Rent Comparison (Feature 9) ──────────────────────────────────────
function MarketRentComparison({ property }) {
  const low    = property.estimatedRentLow    ?? property.data?.estimatedRentLow;
  const high   = property.estimatedRentHigh   ?? property.data?.estimatedRentHigh;
  const median = property.estimatedRentMedian ?? property.data?.estimatedRentMedian
              ?? property.estimatedMonthlyRent ?? property.data?.estimatedMonthlyRent;
  const rent   = property.userInputs?.actualMonthlyRent;

  if (!median) return null;

  let status;
  if (!rent) {
    status = { color: 'text-indigo-600', label: 'Enter your rent to compare' };
  } else if (rent > median + 100 || rent >= median) {
    const diff = rent - median;
    status = { color: 'text-emerald-600', label: `✅ ${diff >= 0 ? 'Above' : 'At'} median (${diff >= 0 ? '+' : ''}${formatCurrency(diff)})` };
  } else if (median - rent <= 100) {
    status = { color: 'text-gray-600', label: 'At market' };
  } else {
    status = { color: 'text-amber-600', label: `Below market by ${formatCurrency(median - rent)} — consider raising rent` };
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 text-sm">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Market Rent Analysis (via RentCast)</p>
      <div className="space-y-1">
        {low != null && high != null && (
          <p className="flex justify-between"><span className="text-gray-500">Market range</span><span className="font-medium">{formatCurrency(low)} — {formatCurrency(high)}/mo</span></p>
        )}
        <p className="flex justify-between"><span className="text-gray-500">Market median</span><span className="font-medium">{formatCurrency(median)}/mo</span></p>
        <p className="flex justify-between">
          <span className="text-gray-500">Your rent</span>
          <span className={`font-semibold ${status.color}`}>{rent ? `${formatCurrency(rent)}/mo · ` : ''}{status.label}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Events Tab (Feature 5) ──────────────────────────────────────────────────
const EVENT_META = {
  vacancy: { icon: '🏠', label: 'Vacancy' },
  expense: { icon: '🔧', label: 'Expense' },
  income:  { icon: '💰', label: 'Income'  },
};

function EventsTab({ property, onChanged }) {
  const propId = property.propertyId || property._id;
  const [events, setEvents]   = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ type: 'expense', date: '', amount: '', description: '', category: 'other' });
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getPropertyEvents(propId);
      setEvents(res.events || []);
    } catch (_) { setEvents([]); }
  }, [propId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.date || !form.amount) { setError('Date and amount are required.'); return; }
    setSaving(true);
    setError('');
    try {
      // Vacancy defaults to the monthly rent as lost income
      const amount = form.type === 'vacancy' && !form.amount && property.userInputs?.actualMonthlyRent
        ? property.userInputs.actualMonthlyRent
        : parseFloat(form.amount);
      await addPropertyEvent(propId, { ...form, amount });
      setShowAdd(false);
      setForm({ type: 'expense', date: '', amount: '', description: '', category: 'other' });
      await load();
      // Vacancy events change which months feed the averages — reload the
      // property so the recomputed actuals appear right away.
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add event.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm('Remove this event?')) return;
    try {
      await deletePropertyEvent(propId, eventId);
      setEvents(prev => prev.filter(ev => ev._id !== eventId));
      if (onChanged) await onChanged();
    } catch (_) {}
  };

  // Annual summary for current year
  const year = new Date().getFullYear();
  const rent = property.userInputs?.actualMonthlyRent || 0;
  const yearEvents  = (events || []).filter(e => new Date(e.date).getFullYear() === year);
  const vacancyLoss = yearEvents.filter(e => e.type === 'vacancy').reduce((s, e) => s + e.amount, 0);
  const oneTimeExp  = yearEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const oneTimeInc  = yearEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const scheduled   = rent * 12;

  if (events === null) return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Event Log</p>
        <button onClick={() => setShowAdd(s => !s)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">
          {showAdd ? 'Cancel' : '+ Add Event'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="vacancy">Vacancy</option>
              <option value="expense">One-Time Expense</option>
              <option value="income">One-Time Income</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
            <input
              type="number" min="0" step="any" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder={form.type === 'vacancy' && rent ? `Lost rent: ${rent}` : '0'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {form.type === 'expense' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="roof">Roof</option>
                <option value="hvac">HVAC</option>
                <option value="plumbing">Plumbing</option>
                <option value="appliance">Appliance</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              type="text" maxLength={200} value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder={form.type === 'vacancy' ? 'Vacant — tenant turnover' : 'HVAC replacement'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="col-span-2 text-red-500 text-sm">{error}</p>}
          <div className="col-span-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Save event'}
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No events logged. Track vacancies and one-time expenses here.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium text-right">Amount</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {events.map(ev => {
              const meta = EVENT_META[ev.type] || EVENT_META.expense;
              const negative = ev.type !== 'income';
              return (
                <tr key={ev._id}>
                  <td className="py-2 text-gray-500">
                    {new Date(ev.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-2">{meta.icon} {meta.label}</td>
                  <td className="py-2 text-gray-600 max-w-[200px] truncate">{ev.description || '—'}</td>
                  <td className={`py-2 text-right font-semibold ${negative ? 'text-red-500' : 'text-emerald-600'}`}>
                    {negative ? '-' : '+'}{formatCurrency(ev.amount)}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => handleDelete(ev._id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {rent > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">{year} Summary</p>
          <p className="flex justify-between">
            <span className="text-gray-500" title="Your monthly rent × 12">Expected Income</span>
            <span className="font-medium">{formatCurrency(scheduled)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-gray-500" title="Expected income adjusted for the vacancy and income events you logged below">
              Adjusted for logged events
            </span>
            <span className="font-medium">
              {formatCurrency(scheduled - vacancyLoss + oneTimeInc)}
              {vacancyLoss > 0 && <span className="text-red-500 text-xs"> (vacancy: -{formatCurrency(vacancyLoss)})</span>}
            </span>
          </p>
          <p className="flex justify-between"><span className="text-gray-500">One-Time Expenses</span><span className="font-medium text-red-500">-{formatCurrency(oneTimeExp)}</span></p>
          <p className="flex justify-between border-t border-gray-200 pt-1.5">
            <span className="font-semibold text-gray-800" title="Rental income after logged vacancies and one-time events. Does not subtract mortgage or recurring expenses.">
              Total income for {year}
            </span>
            {(() => {
              const total = scheduled - vacancyLoss + oneTimeInc - oneTimeExp;
              return <span className={`font-bold ${total >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{total >= 0 ? '+' : ''}{formatCurrency(total)}</span>;
            })()}
          </p>
          <p className="text-xs text-gray-400 pt-1">Income only — mortgage and recurring expenses are not subtracted here.</p>

          {/* True annual net cash flow, after all recurring expenses */}
          {(() => {
            const monthlyNet = property.effective?.monthlyCashFlow ?? property.cashFlow?.monthly ?? null;
            if (monthlyNet == null) return null;
            const annualNet = monthlyNet * 12 - oneTimeExp + oneTimeInc - vacancyLoss;
            const verified  = property.effective?.source === 'actual';
            return (
              <p className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5">
                <span className="font-semibold text-gray-800" title="Net cash flow after mortgage and all recurring expenses, adjusted for logged events">
                  {verified && '🏦 '}Net cash flow for {year}
                </span>
                <span className="text-right">
                  <span className={`font-bold ${annualNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {annualNet >= 0 ? '+' : ''}{formatCurrency(annualNet)}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {formatCurrency(monthlyNet)}/mo {verified ? 'bank-verified' : 'estimated'} × 12
                    {(oneTimeExp > 0 || vacancyLoss > 0) && ', adjusted for events'}
                  </span>
                </span>
              </p>
            );
          })()}

          {property.actuals?.monthlyRent != null && (
            <p className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5">
              <span className="text-gray-500" title="Averaged from real deposits in the linked bank account">
                🏦 Actual rent received (bank avg)
              </span>
              <span className="font-semibold text-emerald-600">{formatCurrency(property.actuals.monthlyRent)}/mo</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pre-warm cache for property financials.
 *
 * The Banking tab fetches several months of transactions from Plaid, which
 * takes a moment. Expanding a property card is a strong signal the user may
 * open that tab, so the request is kicked off then — by the time they click
 * Banking, the data is usually already in flight or resolved.
 *
 * Stores the in-flight promise (not just the result) so a click mid-fetch
 * reuses the same request instead of issuing a second one.
 */
const financialsPrewarm = new Map();   // propId -> Promise

export function prewarmFinancials(propId) {
  if (!propId || financialsPrewarm.has(propId)) return;
  const p = getPropertyFinancials(propId).catch(err => {
    financialsPrewarm.delete(propId);   // let a real attempt retry
    throw err;
  });
  financialsPrewarm.set(propId, p);
  // Keep it briefly — long enough to cover the click, short enough to stay fresh
  setTimeout(() => financialsPrewarm.delete(propId), 30_000);
}

// ─── Banking Tab — linked account & actual vs estimated ──────────────────────
function BankingTab({ property, onChanged }) {
  const propId = property.propertyId || property._id;
  const linked = !!property.linkedAccountId;

  const [accounts,   setAccounts]   = useState(null);   // available accounts for picker
  const [showPicker, setShowPicker] = useState(false);
  const [fin,        setFin]        = useState(null);   // financials payload
  const [finError,   setFinError]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [logging,    setLogging]    = useState(null);   // date_amount key being logged
  const [justLinked, setJustLinked] = useState(false);
  const [lastLogged, setLastLogged] = useState(null);   // { eventId, exp } for undo

  // Load financials when linked
  useEffect(() => {
    if (!linked) { setFin(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFinError('');
      try {
        // Reuse the prewarmed request if the card was expanded a moment ago
        const pending = financialsPrewarm.get(propId);
        const data = await (pending || getPropertyFinancials(propId));
        if (!cancelled) setFin(data);
      } catch (err) {
        if (!cancelled) setFinError(err.response?.data?.error || 'Could not load account data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [linked, propId]);

  const openPicker = async () => {
    setShowPicker(true);
    if (accounts === null) {
      try {
        const res = await getAccounts();
        // Only depository accounts make sense for a property
        setAccounts((res.accounts || []).filter(a => a.type === 'depository'));
      } catch (_) { setAccounts([]); }
    }
  };

  const handleLink = async (account) => {
    try {
      await linkPropertyAccount(propId, {
        accountId:   account.account_id,
        itemId:      account.itemId,
        accountName: [account.institutionName, account.name, account.mask ? '••' + account.mask : '']
          .filter(Boolean).join(' '),
      });
      setShowPicker(false);
      setJustLinked(true);
      setTimeout(() => setJustLinked(false), 4000);
      onChanged();
    } catch (err) {
      setFinError(err.response?.data?.error || 'Failed to link account.');
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm('Unlink this bank account from the property?')) return;
    await unlinkPropertyAccount(propId);
    setFin(null);
    onChanged();
  };

  const handleLogExpense = async (exp) => {
    const key = `${exp.date}_${exp.amount}`;
    setLogging(key);
    try {
      const res = await addPropertyEvent(propId, {
        type:        'expense',
        date:        exp.date,
        amount:      exp.amount,
        description: exp.name,
        category:    'other',
      });
      setFin(prev => prev ? {
        ...prev,
        largeExpenses: prev.largeExpenses.filter(e => `${e.date}_${e.amount}` !== key),
      } : prev);
      // Offer a quick undo in case it was logged by mistake
      setLastLogged({ eventId: res?.event?._id, exp });
    } catch (_) {} finally {
      setLogging(null);
    }
  };

  const handleUndoLog = async () => {
    if (!lastLogged?.eventId) return;
    try {
      await deletePropertyEvent(propId, lastLogged.eventId);
      // Put the suggestion back in the list
      setFin(prev => prev ? {
        ...prev,
        largeExpenses: [lastLogged.exp, ...prev.largeExpenses],
      } : prev);
      onChanged();
    } catch (_) {} finally {
      setLastLogged(null);
    }
  };

  // ── Not linked: show the link CTA / picker ──
  if (!linked) {
    return (
      <div className="space-y-4">
        {!showPicker ? (
          <div className="bg-indigo-50 rounded-xl p-5 text-center">
            <p className="text-sm font-semibold text-indigo-900 mb-1">Link a bank account to this property</p>
            <p className="text-xs text-indigo-600 mb-4 max-w-sm mx-auto">
              If this property has its own dedicated account, link it to see actual cash flow from real
              transactions, vacancy alerts, and reserve tracking.
            </p>
            <button onClick={openPicker} className="btn-primary text-sm">Link Bank Account</button>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Choose the account for this property</p>
              <button onClick={() => setShowPicker(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
            {accounts === null ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No bank accounts connected yet. Connect one from the Dashboard first.
              </p>
            ) : (
              <div className="space-y-2">
                {accounts.map(a => (
                  <button
                    key={a.account_id}
                    onClick={() => handleLink(a)}
                    className="w-full text-left bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-lg px-4 py-3 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {a.name} {a.mask && <span className="text-gray-400">••{a.mask}</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {a.institutionName} · {a.subtype} · {formatCurrency(a.balances?.current)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {finError && <p className="text-red-500 text-sm">{finError}</p>}
      </div>
    );
  }

  // ── Linked: show financials ──
  return (
    <div className="space-y-4">
      {justLinked && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
          ✓ Bank account linked successfully. Analyzing your transactions…
        </div>
      )}

      {/* Linked account header */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400">Linked account</p>
          <p className="text-sm font-medium text-gray-900 truncate">🏦 {property.linkedAccountName || 'Bank account'}</p>
        </div>
        <button onClick={handleUnlink} className="text-xs text-gray-400 hover:text-red-500 shrink-0 ml-3">Unlink</button>
      </div>

      {loading && (
        /* Skeleton mirroring the real layout so the tab feels responsive
           while transactions are fetched, instead of a blank spinner. */
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <div className="h-3 w-24 bg-gray-100 rounded mb-2" />
              <div className="h-5 w-20 bg-gray-200 rounded" />
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <div className="h-3 w-28 bg-gray-100 rounded mb-2" />
              <div className="h-5 w-20 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="h-3 w-32 bg-gray-200 rounded mb-3" />
            <div className="h-4 w-full bg-gray-100 rounded mb-2" />
            <div className="h-2 w-full bg-gray-200 rounded" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center pt-1">Analyzing your transactions…</p>
        </div>
      )}
      {finError && <p className="text-red-500 text-sm">{finError}</p>}

      {fin && !loading && (
        <>
          {/* Actual vs estimated */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <p className="text-xs text-gray-400 mb-0.5">Estimated Cash Flow</p>
              <p className={`font-bold ${fin.estimated.monthlyCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {fin.estimated.monthlyCashFlow != null
                  ? `${fin.estimated.monthlyCashFlow >= 0 ? '+' : ''}${formatCurrency(fin.estimated.monthlyCashFlow)}/mo`
                  : '—'}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <p className="text-xs text-gray-400 mb-0.5">Actual Cash Flow <span className="text-gray-300">({fin.actual.monthsAnalyzed}mo avg)</span></p>
              <p className={`font-bold ${fin.actual.monthlyCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {fin.actual.monthlyCashFlow != null
                  ? `${fin.actual.monthlyCashFlow >= 0 ? '+' : ''}${formatCurrency(fin.actual.monthlyCashFlow)}/mo`
                  : '—'}
              </p>
              {fin.difference != null && (
                <p className={`text-xs mt-0.5 ${fin.difference >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {fin.difference >= 0 ? '+' : ''}{formatCurrency(fin.difference)} vs estimate
                </p>
              )}
              {fin.actual.excludedCount > 0 && (
                <p className="text-xs text-gray-400 mt-1" title={`Excluded: ${fin.actual.excludedMonths.join(', ')}`}>
                  Excludes {fin.actual.excludedCount} logged vacancy month{fin.actual.excludedCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Vacancy alerts — per rent source so multifamily partial vacancies are clear */}
          {fin.unloggedVacancies?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-1.5">
              <p className="font-semibold">⚠ Missing rent payments detected</p>
              {fin.unloggedVacancies.slice(0, 6).map((v, i) => (
                <p key={i}>
                  <span className="font-medium">{v.month}</span>
                  {v.source
                    ? <> — no payment from <span className="font-medium">{v.source}</span> (usually {formatCurrency(v.expectedAmount)})</>
                    : <> — no rent-sized deposit found</>}
                </p>
              ))}
              <p className="text-xs text-amber-700 pt-1">
                {fin.rentSources?.length > 1
                  ? 'This property receives rent from more than one payer, so this may be a partial shortfall rather than a full vacancy. Log a vacancy event for just the missing amount.'
                  : 'If a unit was vacant, log a vacancy event in the Events tab for the rent that was not collected. If your property manager simply deposited late or netted out a large repair, no vacancy event is needed.'}
              </p>
            </div>
          )}

          {/* Detected rent sources */}
          {fin.rentSources?.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
                Rent Deposits Detected ({fin.rentSources.length} {fin.rentSources.length === 1 ? 'payer' : 'payers'})
              </p>
              <div className="space-y-1.5">
                {fin.rentSources.map((s, i) => (
                  <p key={i} className="flex justify-between items-baseline">
                    <span className="text-gray-600 truncate max-w-[55%]">{s.label}</span>
                    <span className="text-right">
                      <span className="font-semibold text-emerald-600">{formatCurrency(s.avgAmount)}/mo avg</span>
                      <span className="block text-xs text-gray-400">
                        {s.varies
                          ? `${formatCurrency(s.minAmount)}–${formatCurrency(s.maxAmount)} · ${s.count} deposits`
                          : `${s.count} deposits`}
                      </span>
                    </span>
                  </p>
                ))}
              </div>
              {fin.rentSources.some(x => x.varies) && (
                <p className="text-xs text-gray-400 mt-2">
                  Amounts vary month to month — typical when a property manager collects rent and
                  nets out their fees and repairs before depositing. These figures are net of those deductions.
                </p>
              )}
            </div>
          )}

          {/* Reserve status */}
          {fin.reserve.monthsOfReserve != null && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Cash Reserve</p>
                <p className="text-xs text-gray-400">Recommended: {fin.reserve.recommendedMonths} months</p>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-semibold text-gray-900">{formatCurrency(fin.reserve.balance)}</span>
                <span className={`font-bold ${fin.reserve.monthsOfReserve >= 6 ? 'text-emerald-600' : fin.reserve.monthsOfReserve >= 3 ? 'text-amber-500' : 'text-red-500'}`}>
                  {fin.reserve.monthsOfReserve} months of expenses
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${fin.reserve.monthsOfReserve >= 6 ? 'bg-emerald-500' : fin.reserve.monthsOfReserve >= 3 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, (fin.reserve.monthsOfReserve / fin.reserve.recommendedMonths) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Undo banner for a mistakenly logged event */}
          {lastLogged && (
            <div className="bg-gray-800 text-white rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
              <span className="truncate">
                Logged <span className="font-medium">{lastLogged.exp.name}</span> ({formatCurrency(lastLogged.exp.amount)}) as a one-time expense.
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={handleUndoLog} className="underline font-medium hover:text-gray-200">Undo</button>
                <button onClick={() => setLastLogged(null)} className="text-gray-400 hover:text-white">✕</button>
              </div>
            </div>
          )}

          {/* Large expense suggestions */}
          {fin.largeExpenses.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Detected Large Expenses</p>
              <div className="space-y-2">
                {fin.largeExpenses.map(exp => {
                  const key = `${exp.date}_${exp.amount}`;
                  return (
                    <div key={key} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{exp.name}</p>
                        <p className="text-xs text-gray-400">{new Date(exp.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {formatCurrency(exp.amount)}</p>
                      </div>
                      <button
                        onClick={() => handleLogExpense(exp)}
                        disabled={logging === key}
                        className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                      >
                        {logging === key ? 'Logging…' : 'Log as event'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monthly actuals */}
          {fin.months.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[460px]">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium text-right">Rent In</th>
                    <th className="pb-2 font-medium text-right">Mortgage</th>
                    <th className="pb-2 font-medium text-right">Other Exp.</th>
                    <th className="pb-2 font-medium text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fin.months.map(m => (
                    <tr key={m.month} className={!m.complete ? 'opacity-50' : ''}>
                      <td className="py-2 text-gray-600">
                        {m.month}
                        {!m.complete && <span className="text-xs text-gray-400"> (partial)</span>}
                        {fin.actual.excludedMonths?.includes(m.month) && (
                          <span className="text-xs text-gray-400" title="Logged as a vacancy — excluded from the average"> (vacancy, excluded)</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-emerald-600">{m.rentIncome ? `+${formatCurrency(m.rentIncome)}` : '—'}</td>
                      <td className="py-2 text-right text-gray-600">{m.mortgage ? formatCurrency(m.mortgage) : '—'}</td>
                      <td className="py-2 text-right text-gray-600">{m.otherExpenses ? formatCurrency(m.otherExpenses) : '—'}</td>
                      <td className={`py-2 text-right font-semibold ${m.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {m.net >= 0 ? '+' : ''}{formatCurrency(m.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* What we detected — transparency so the user can sanity-check it */}
          {fin.detection && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">What CapRate Detected</p>
              {fin.detection.mortgage ? (
                <p className="flex justify-between items-baseline">
                  <span className="text-gray-500">Mortgage payment</span>
                  <span className="text-right">
                    <span className="font-semibold text-gray-900">{formatCurrency(fin.detection.mortgage.amount)}/mo</span>
                    <span className="block text-xs text-gray-400">
                      {fin.detection.mortgage.label} · {fin.detection.mortgage.occurrences} payments
                    </span>
                  </span>
                </p>
              ) : (
                <p className="text-amber-600 text-xs">
                  No recurring mortgage payment detected. If the mortgage is paid from a different account,
                  that is expected — otherwise add your mortgage details so it can be matched.
                </p>
              )}

              {fin.detection.recurringSeries?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1.5">Other recurring payments (not counted as one-time expenses)</p>
                  <div className="space-y-1">
                    {fin.detection.recurringSeries.map((s, i) => (
                      <p key={i} className="flex justify-between text-xs">
                        <span className="text-gray-500 truncate max-w-[60%]">{s.label}</span>
                        <span className="font-medium text-gray-700">{formatCurrency(s.amount)}/mo</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">
            Rent and recurring payments are detected from transaction patterns — a charge is treated as recurring
            when the same amount appears across three or more months. The mortgage principal/interest split uses
            the calculated amortization, since bank transactions only show the total payment.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Property Detail Card ────────────────────────────────────────────────────
function PropertyDetailCard({ property, onEdit, onRefinance, onChanged, expanded, setExpanded, tab, setTab }) {

  const inputs = property.userInputs || {};
  const cf     = property.cashFlow;
  const eq     = property.equity;

  const TABS = [
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'equity',   label: 'Equity' },
    { id: 'paydown',  label: 'Paydown Chart' },
    { id: 'events',   label: 'Events' },
    { id: 'banking',  label: property.linkedAccountId ? '🏦 Banking' : 'Banking' },
  ];

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{property.address}</p>
          <p className="text-sm text-gray-400">
            {formatCurrency(property.estimatedValue)}
            {property.capRate
              ? <span title={property.capRateSource === 'actual'
                  ? 'From your rent and operating expenses'
                  : property.capRateSource === 'rentcast'
                    ? 'Market estimate from RentCast'
                    : 'Estimated from market rent (40% expense ratio)'}>
                  {' '}· {property.capRate}% cap
                  {property.capRateSource !== 'actual' && <span className="text-gray-300"> (est.)</span>}
                </span>
              : <span title="Add your monthly rent to calculate cap rate"> · add rent for cap rate</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onRefinance(property)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
          >
            Refinance Calculator
          </button>
          <button
            onClick={() => {
              setExpanded(e => {
                const next = !e;
                // Expanding is a strong hint the Banking tab may be opened next —
                // start fetching its data now so the tab renders instantly.
                if (next && property.linkedAccountId) {
                  prewarmFinancials(property.propertyId || property._id);
                }
                return next;
              });
            }}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            {expanded ? 'Collapse ↑' : 'Details ↓'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'cashflow' && (
            <div className="space-y-4">
              {inputs.actualMonthlyRent ? (
                <div className="text-sm space-y-1.5 max-w-sm">
                  <p className="flex justify-between"><span className="text-gray-500">Monthly Income</span><span className="font-semibold text-emerald-600">{formatCurrency(inputs.actualMonthlyRent)}</span></p>
                  <p className="text-xs text-gray-400 uppercase tracking-wide pt-2">Monthly Expenses</p>
                  {inputs.monthlyMortgage    ? <p className="flex justify-between pl-3"><span className="text-gray-500">Mortgage</span><span className="font-medium">{formatCurrency(inputs.monthlyMortgage)}</span></p> : null}
                  {inputs.monthlyPropertyTax ? <p className="flex justify-between pl-3"><span className="text-gray-500">Property Tax</span><span className="font-medium">{formatCurrency(inputs.monthlyPropertyTax)}</span></p> : null}
                  {inputs.monthlyInsurance   ? <p className="flex justify-between pl-3"><span className="text-gray-500">Insurance</span><span className="font-medium">{formatCurrency(inputs.monthlyInsurance)}</span></p> : null}
                  {inputs.monthlyHOA         ? <p className="flex justify-between pl-3"><span className="text-gray-500">HOA</span><span className="font-medium">{formatCurrency(inputs.monthlyHOA)}</span></p> : null}
                  {inputs.monthlyMaintenance ? <p className="flex justify-between pl-3"><span className="text-gray-500">Maintenance</span><span className="font-medium">{formatCurrency(inputs.monthlyMaintenance)}</span></p> : null}
                  <p className="flex justify-between pl-3 border-t border-gray-100 pt-1.5"><span className="text-gray-500">Total Expenses</span><span className="font-semibold">{formatCurrency(cf?.totalExpenses)}</span></p>
                  <p className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                    <span className="font-semibold text-gray-800">Net Cash Flow</span>
                    <span className={`font-bold ${cf?.monthly >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{cf?.monthly >= 0 ? '+' : ''}{formatCurrency(cf?.monthly)}/mo</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-gray-500">Annual Cash Flow</span>
                    <span className={`font-semibold ${cf?.annual >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{cf?.annual >= 0 ? '+' : ''}{formatCurrency(cf?.annual)}/yr</span>
                  </p>

                  {/* Actual vs estimated — shown once a bank account is linked */}
                  {property.actuals?.monthlyCashFlow != null && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-1.5">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                        Verified against your bank
                      </p>
                      <p className="flex justify-between">
                        <span className="text-gray-500">Estimated (above)</span>
                        <span className="font-medium">{cf?.monthly >= 0 ? '+' : ''}{formatCurrency(cf?.monthly)}/mo</span>
                      </p>
                      <p className="flex justify-between">
                        <span className="text-gray-500">
                          Actual <span className="text-gray-400">({property.actuals.monthsAnalyzed}mo avg)</span>
                        </span>
                        <span className={`font-bold ${property.actuals.monthlyCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {property.actuals.monthlyCashFlow >= 0 ? '+' : ''}{formatCurrency(property.actuals.monthlyCashFlow)}/mo
                        </span>
                      </p>
                      {cf?.monthly != null && (() => {
                        const diff = property.actuals.monthlyCashFlow - cf.monthly;
                        return (
                          <p className="flex justify-between border-t border-gray-100 pt-1.5">
                            <span className="text-gray-500">Variance</span>
                            <span className={`font-semibold ${Math.abs(diff) < 50 ? 'text-gray-600' : diff >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {diff >= 0 ? '+' : ''}{formatCurrency(diff)}/mo
                            </span>
                          </p>
                        );
                      })()}
                      {property.actuals.vacancyCount > 0 && (
                        <p className="text-xs text-amber-600">
                          {property.actuals.vacancyCount} month{property.actuals.vacancyCount > 1 ? 's' : ''} with no rent detected — see the Banking tab.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-indigo-50 rounded-xl p-4 text-sm text-indigo-700">
                  Add your rent and expenses to see the full cash flow breakdown.
                  <button onClick={() => onEdit(property)} className="ml-2 underline font-medium">Add details</button>
                </div>
              )}
              <MarketRentComparison property={property} />
            </div>
          )}

          {tab === 'equity' && (
            eq ? (
              <div className="text-sm space-y-1.5 max-w-sm">
                <p className="flex justify-between"><span className="text-gray-500">Current Value</span><span className="font-semibold">{formatCurrency(property.estimatedValue)}</span></p>
                <p className="flex justify-between"><span className="text-gray-500">Remaining Mortgage</span><span className="font-medium">{formatCurrency(eq.remainingBalance)}</span></p>
                <p className="flex justify-between border-t border-gray-100 pt-1.5"><span className="font-semibold text-gray-800">Current Equity</span><span className="font-bold text-indigo-600">{formatCurrency(eq.currentEquity)}</span></p>
                <p className="flex justify-between pl-3"><span className="text-gray-500">From Paydown</span><span className="font-medium">{formatCurrency(eq.equityFromPaydown)}</span></p>
                <p className="flex justify-between pl-3"><span className="text-gray-500">From Appreciation</span><span className="font-medium">{formatCurrency(eq.equityFromAppreciation)}</span></p>
                <p className="flex justify-between border-t border-gray-100 pt-1.5"><span className="text-gray-500">LTV Ratio</span><span className={`font-semibold ${parseFloat(eq.ltv) < 80 ? 'text-emerald-600' : 'text-amber-500'}`}>{eq.ltv}%</span></p>
                {eq.yearsOwned && <p className="flex justify-between"><span className="text-gray-500">Time Owned</span><span className="font-medium">{eq.yearsOwned} years</span></p>}
              </div>
            ) : (
              <div className="bg-indigo-50 rounded-xl p-4 text-sm text-indigo-700">
                Add purchase price, down payment, and interest rate for equity tracking.
                <button onClick={() => onEdit(property)} className="ml-2 underline font-medium">Add details</button>
              </div>
            )
          )}

          {tab === 'paydown' && <MortgagePaydownChart property={property} />}

          {tab === 'events' && <EventsTab property={property} onChanged={onChanged} />}

          {tab === 'banking' && <BankingTab property={property} onChanged={onChanged} />}
        </div>
      )}
    </div>
  );
}

// ─── Portfolio Charts ────────────────────────────────────────────────────────
function PortfolioCharts({ properties }) {
  const cfData = properties
    .filter(p => effCashFlow(p) != null)
    .map(p => ({ name: shortAddress(p.address), cashFlow: effCashFlow(p) }));

  const eqData = properties
    .filter(p => p.equity?.currentEquity > 0)
    .map(p => ({ name: shortAddress(p.address), value: p.equity.currentEquity }));

  if (!cfData.length && !eqData.length) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {cfData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Cash Flow by Property</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cfData}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${v}`} width={55} />
              <Tooltip formatter={v => [formatCurrency(v), 'Monthly cash flow']} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }} />
              <Bar dataKey="cashFlow" radius={[6, 6, 0, 0]}>
                {cfData.map((d, i) => (
                  <Cell key={i} fill={d.cashFlow >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {eqData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Equity Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={eqData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                {eqData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => [formatCurrency(v), 'Equity']} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Tax Summary Export (Feature 6) ──────────────────────────────────────────
function TaxExport({ properties }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear]       = useState(currentYear - 1);
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await getTaxSummary(year);
      const rows = [[
        'Property', 'Month', 'Income Source',
        'Rental Income', 'Mortgage Payment', 'Property Tax', 'Insurance',
        'HOA', 'Maintenance', 'One-Time Expenses', 'Net Cash Flow',
      ]];
      for (const prop of data.properties || []) {
        const src = prop.incomeSource === 'actual' ? 'Bank deposits' : 'Entered estimate';
        for (const m of prop.months) {
          rows.push([`"${prop.address}"`, m.month, src, m.rentalIncome, m.mortgage, m.propertyTax, m.insurance, m.hoa, m.maintenance, m.oneTimeExpenses, m.netCashFlow]);
        }
        const t = prop.annualTotals;
        rows.push([`"${prop.address} ANNUAL TOTAL"`, year, src, t.rentalIncome, t.mortgage, t.propertyTax, t.insurance, t.hoa, t.maintenance, t.oneTimeExpenses, t.netCashFlow]);
      }
      // Trailing note so the figures are not mistaken for filing-ready values
      rows.push([]);
      rows.push(['"NOTE: Informational summary only, not tax advice. Income reflects bank deposits where a"']);
      rows.push(['"bank account is linked; expenses reflect the figures entered in CapRate. The mortgage column"']);
      rows.push(['"is the total payment — only the interest portion is deductible. Verify all figures with a"']);
      rows.push(['"qualified tax professional before filing."']);
      const csv  = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `caprate-tax-summary-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) {} finally {
      setLoading(false);
    }
  };

  // Depreciation helper for the first property with a value (shown per PRD)
  const depreciationRows = properties
    .filter(p => p.estimatedValue || p.userInputs?.purchasePrice)
    .map(p => {
      const value = p.estimatedValue || p.userInputs?.purchasePrice;
      return {
        address:  shortAddress(p.address),
        value,
        land:     Math.round(value * 0.2),
        basis:    Math.round(value * 0.8),
        annual:   Math.round((value * 0.8) / 27.5),
      };
    });

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Income &amp; Expense Summary</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            A monthly breakdown per property to share with your accountant.
            {properties.some(p => p.linkedAccountId) && ' Rental income comes from your linked bank deposits; expenses come from the figures you entered.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={handleExport} disabled={loading} className="btn-primary text-sm disabled:opacity-50">
            {loading ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Prominent disclaimer — this export is informational, not filing-ready */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">Informational summary — not tax advice</p>
        <p className="text-xs text-amber-800 leading-relaxed">
          These figures are a starting point for your accountant, not filing-ready values.
          Rental income reflects bank deposits where an account is linked; expenses reflect the
          figures you entered in CapRate. The mortgage column shows the total payment — only the
          interest portion is deductible, and your lender&apos;s year-end statement is the correct
          source for that split. Verify everything with a qualified tax professional before filing.
        </p>
      </div>

      {depreciationRows.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 text-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Depreciation Estimate</p>

          {/* Desktop table */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-gray-400 text-xs">
                  <th className="pb-1 font-medium">Property</th>
                  <th className="pb-1 font-medium text-right">Value</th>
                  <th className="pb-1 font-medium text-right">Land (20%)</th>
                  <th className="pb-1 font-medium text-right">Depreciable Basis</th>
                  <th className="pb-1 font-medium text-right">Annual (/27.5 yrs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {depreciationRows.map(row => (
                  <tr key={row.address}>
                    <td className="py-1.5 max-w-[160px] truncate">{row.address}</td>
                    <td className="py-1.5 text-right">{formatCurrency(row.value)}</td>
                    <td className="py-1.5 text-right text-gray-500">-{formatCurrency(row.land)}</td>
                    <td className="py-1.5 text-right">{formatCurrency(row.basis)}</td>
                    <td className="py-1.5 text-right font-semibold text-indigo-600">{formatCurrency(row.annual)}/yr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked */}
          <div className="sm:hidden space-y-3">
            {depreciationRows.map(row => (
              <div key={row.address} className="bg-white rounded-lg p-3 space-y-1.5">
                <p className="font-medium text-gray-900 truncate">{row.address}</p>
                <div className="flex justify-between"><span className="text-gray-500">Value</span><span className="font-medium">{formatCurrency(row.value)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Land (20%)</span><span className="text-gray-500">-{formatCurrency(row.land)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Depreciable Basis</span><span className="font-medium">{formatCurrency(row.basis)}</span></div>
                <div className="flex justify-between border-t border-gray-100 pt-1.5"><span className="text-gray-500">Annual (/27.5 yrs)</span><span className="font-semibold text-indigo-600">{formatCurrency(row.annual)}/yr</span></div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-2">⚠ A rough estimate using a 20% land allocation over 27.5 years. Actual depreciable basis depends on your closing statement, improvements, and land assessment — confirm with your tax advisor.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function RealEstate() {
  const navigate = useNavigate();
  const [properties,    setProperties]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [propertyModal, setPropertyModal] = useState({ open: false, property: null });
  const [refiModal,     setRefiModal]     = useState(null);
  const [cardState,     setCardState]     = useState({});  // per-property { expanded, tab } — survives reloads

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProperties();
      setProperties(res.properties || []);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveInputs = async (inputs) => {
    const prop = propertyModal.property;
    await updatePropertyInputs(prop.propertyId || prop._id, inputs);
    await load();
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (properties.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Real Estate Portfolio</h1>
        <div className="card text-center py-16 text-gray-400">
          <p className="text-lg mb-1">No properties yet</p>
          <p className="text-sm mb-4">Add your first property from the Dashboard to start tracking your portfolio.</p>
          <button onClick={() => navigate('/')} className="btn-primary text-sm">Go to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Real Estate Portfolio</h1>
          <p className="text-gray-500 text-sm mt-1">Performance, equity, and cash flow across your properties</p>
        </div>
        <button onClick={() => navigate('/deal-analyzer')} className="btn-primary text-sm">
          Deal Analyzer →
        </button>
      </div>

      <ErrorBoundary section="Portfolio Summary">
        <SummaryBar properties={properties} />
      </ErrorBoundary>

      <ErrorBoundary section="Performance Rankings">
        <RankingsTable
          properties={properties}
          onEdit={(p) => setPropertyModal({ open: true, property: p })}
        />
      </ErrorBoundary>

      <ErrorBoundary section="Property Details">
        <div className="space-y-4">
          {properties.map(p => {
            const pid = p.propertyId || p._id;
            return (
              <PropertyDetailCard
                key={pid}
                property={p}
                onEdit={(prop) => setPropertyModal({ open: true, property: prop })}
                onRefinance={(prop) => setRefiModal(prop)}
                onChanged={load}
                expanded={!!cardState[pid]?.expanded}
                setExpanded={(fnOrVal) => setCardState(s => {
                  const cur = s[pid] || { expanded: false, tab: 'cashflow' };
                  const next = typeof fnOrVal === 'function' ? fnOrVal(cur.expanded) : fnOrVal;
                  return { ...s, [pid]: { ...cur, expanded: next } };
                })}
                tab={cardState[pid]?.tab || 'cashflow'}
                setTab={(t) => setCardState(s => ({
                  ...s,
                  [pid]: { ...(s[pid] || { expanded: true }), tab: t },
                }))}
              />
            );
          })}
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Portfolio Charts">
        <PortfolioCharts properties={properties} />
      </ErrorBoundary>

      <ErrorBoundary section="Tax Summary">
        <TaxExport properties={properties} />
      </ErrorBoundary>

      {/* Modals */}
      <PropertyInputModal
        property={propertyModal.property}
        isOpen={propertyModal.open}
        onClose={() => setPropertyModal({ open: false, property: null })}
        onSave={handleSaveInputs}
      />

      {refiModal && (
        <RefinanceCalculator
          property={refiModal}
          onClose={() => setRefiModal(null)}
        />
      )}
    </div>
  );
}
