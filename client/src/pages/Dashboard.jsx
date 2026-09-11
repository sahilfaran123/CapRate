import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import {
  createLinkToken, exchangePublicToken,
  getAccounts, getInvestmentAccounts, getProperties,
  saveSnapshot, removeItem, removeProperty,
  updatePropertyInputs, addProperty,
  formatCurrency, formatPercent,
} from '../services/api.js';
import PropertyInputModal from '../components/PropertyInputModal.jsx';
import ErrorBoundary      from '../components/ErrorBoundary.jsx';
import { summarizeNetWorth } from '../utils/netWorth.js';

// ─── Sub-components ─────────────────────────────────────────────────────────
function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {action}
    </div>
  );
}

/**
 * Hover/focus tooltip. A real button rather than a bare `title` attribute so it
 * is keyboard reachable and readable on touch devices, where hover never fires.
 */
function InfoTip({ text, align = 'center' }) {
  const position = align === 'left'
    ? 'left-0'
    : align === 'right'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <span className="relative inline-flex group align-middle ml-1.5">
      <button
        type="button"
        aria-label={text}
        onClick={e => e.preventDefault()}
        className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-[10px] font-semibold leading-none
                   flex items-center justify-center transition-colors
                   hover:border-indigo-400 hover:text-indigo-500
                   focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${position} bottom-full mb-2 w-64 z-30
                    rounded-lg bg-gray-900 text-white text-xs font-normal leading-relaxed
                    px-3 py-2 shadow-lg normal-case tracking-normal text-left
                    opacity-0 invisible transition-opacity duration-150
                    group-hover:opacity-100 group-hover:visible
                    group-focus-within:opacity-100 group-focus-within:visible`}
      >
        {text}
      </span>
    </span>
  );
}

function StatCard({ label, value, sub, color = 'text-gray-900', tooltip, tooltipAlign, size = 'md' }) {
  return (
    <div className="card">
      <p className="stat-label flex items-center">
        <span>{label}</span>
        {tooltip && <InfoTip text={tooltip} align={tooltipAlign} />}
      </p>
      <p className={`font-bold ${size === 'lg' ? 'text-3xl md:text-4xl' : 'text-2xl'} ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Plaid Link Button ───────────────────────────────────────────────────────
/**
 * Single Plaid Link instance shared across the whole Dashboard.
 *
 * Plaid's script warns when Link is embedded more than once per page, so the
 * hook is mounted ONCE here and the resulting `connect` handler is passed to
 * however many buttons need it. The token is still created lazily on click so
 * no Plaid script loads for users who never connect an account.
 */
function useConnectAccount(onSuccess) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading,   setLoading]   = useState(false);

  const connect = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await createLinkToken();
      setLinkToken(data.linkToken);
    } catch (err) {
      console.error('Failed to create link token:', err);
      setLoading(false);
    }
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, meta) => {
      try {
        await exchangePublicToken({
          publicToken,
          institutionId:   meta.institution?.institution_id,
          institutionName: meta.institution?.name || 'Unknown',
        });
        onSuccess();
      } catch (err) {
        console.error('Failed to connect account:', err);
      }
    },
  });

  // Open Link as soon as the token is ready
  useEffect(() => {
    if (ready && linkToken) {
      open();
      setLoading(false);
      setLinkToken(null);   // reset so a later click creates a fresh token
    }
  }, [ready, linkToken, open]);

  return { connect, loading };
}

/** Presentational button — no Plaid hook of its own. */
function ConnectButton({ onClick, loading, label, variant = 'primary' }) {
  const styles = variant === 'primary'
    ? 'btn-primary text-sm disabled:opacity-70'
    : 'text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg px-4 py-2 hover:bg-indigo-50 transition-colors disabled:opacity-70';

  return (
    <button onClick={onClick} disabled={loading} className={styles}>
      {loading ? 'Loading…' : label}
    </button>
  );
}

// ─── Banking Account Card ────────────────────────────────────────────────────
function BankAccountCard({ account, onDisconnect, navigate }) {
  const balance  = account.balances?.current ?? 0;
  const available = account.balances?.available;
  const isCredit  = account.type === 'credit';

  return (
    <div className="card hover:shadow-md transition-shadow cursor-pointer group"
         onClick={() => navigate(`/analysis?accountId=${account.account_id}&accountName=${encodeURIComponent(account.name)}&type=banking`)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{account.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{account.institutionName}</p>
        </div>
        <span className={`tag ${isCredit ? 'bg-orange-50 text-orange-700' : 'bg-indigo-50 text-indigo-700'}`}>
          {account.subtype || account.type}
        </span>
      </div>

      {/* Credit balances are money owed, so they read as negative here to match
          how they are treated in the net worth totals above. */}
      <p className={`text-2xl font-bold ${isCredit ? 'text-red-500' : 'text-gray-900'}`}>
        {isCredit && balance > 0 ? `−${formatCurrency(balance)}` : formatCurrency(balance)}
      </p>
      {isCredit ? (
        <p className="text-xs text-gray-400 mt-1">Owed — subtracted from net worth</p>
      ) : available !== null && available !== undefined && (
        <p className="text-xs text-gray-400 mt-1">Available: {formatCurrency(available)}</p>
      )}

      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs text-indigo-500 group-hover:text-indigo-700 font-medium">View analysis →</span>
        <button
          onClick={e => { e.stopPropagation(); onDisconnect(account.itemId); }}
          className="text-xs text-gray-300 hover:text-red-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

// ─── Investment Account Card ─────────────────────────────────────────────────
function InvestmentCard({ account, navigate }) {
  const value = account.balances?.current ?? 0;
  return (
    <div className="card hover:shadow-md transition-shadow cursor-pointer group"
         onClick={() => navigate(`/analysis?accountId=${account.account_id}&accountName=${encodeURIComponent(account.name)}&type=investment`)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{account.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{account.institutionName}</p>
        </div>
        <span className="tag bg-purple-50 text-purple-700">{account.subtype || 'investment'}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{formatCurrency(value)}</p>
      <div className="mt-4 pt-4 border-t border-gray-50">
        <span className="text-xs text-indigo-500 group-hover:text-indigo-700 font-medium">View performance →</span>
      </div>
    </div>
  );
}

// ─── Property Card ───────────────────────────────────────────────────────────
function PropertyCard({ property, onEdit, onRemove }) {
  const inputs      = property.userInputs || {};
  const value       = property.estimatedValue;
  const cashFlow    = property.cashFlow;
  const equity      = property.equity;
  const rent        = inputs.actualMonthlyRent;
  const estRent     = property.estimatedMonthlyRent;
  const apprecAmt   = property.appreciation;
  const apprecPct   = property.appreciationPercent;
  const apprecLabel = property.appreciationLabel;
  const hasFlow     = rent && (inputs.monthlyMortgage || inputs.monthlyHOA);

  return (
    <div className="card hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 mr-2">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{property.address}</p>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{property.provider}</p>
        </div>
        <button
          onClick={() => onRemove(property.propertyId || property._id)}
          className="text-gray-300 hover:text-red-400 transition-colors text-xs shrink-0"
        >✕</button>
      </div>

      {/* Current Value */}
      <p className="text-2xl font-bold text-gray-900">{value ? formatCurrency(value) : '—'}</p>

      {/* Appreciation */}
      {apprecAmt != null && (
        <div className="mt-1">
          <p className={`text-sm font-semibold ${apprecAmt >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {apprecAmt >= 0 ? '+' : ''}{formatCurrency(apprecAmt)} ({formatPercent(apprecPct)})
          </p>
          {apprecLabel && <p className="text-xs text-gray-400">{apprecLabel}</p>}
        </div>
      )}

      {/* Metrics */}
      <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">

        {/* Rent */}
        {rent ? (
          <p className="text-sm flex justify-between">
            <span className="text-gray-500">Actual rent</span>
            <span className="font-semibold text-emerald-600">{formatCurrency(rent)}/mo ✓</span>
          </p>
        ) : estRent ? (
          <p className="text-sm flex justify-between">
            <span className="text-gray-500">Est. rent</span>
            <span className="font-medium text-gray-700">{formatCurrency(estRent)}/mo</span>
          </p>
        ) : null}

        {/* Cash Flow — prefers bank-verified actuals when available */}
        {(() => {
          const eff      = property.effective?.monthlyCashFlow ?? (hasFlow ? cashFlow?.monthly : null);
          const verified = property.effective?.source === 'actual';
          if (eff == null) return null;
          return (
            <p className="text-sm flex justify-between items-start">
              <span className="text-gray-500">Cash flow</span>
              <span className="flex flex-col items-end">
                <span className={`font-semibold ${eff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {eff >= 0 ? '+' : ''}{formatCurrency(eff)}/mo
                </span>
                <span
                  title={verified
                    ? 'Averaged from real transactions in the linked bank account'
                    : 'Calculated from the figures you entered — link a bank account to verify'}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${
                    verified ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {verified ? '🏦 Bank-verified' : 'Estimated'}
                </span>
              </span>
            </p>
          );
        })()}

        {/* Cash-on-Cash Return — uses effective (actual when linked) */}
        {(() => {
          const coc = property.effective?.cocReturn ??
            ((cashFlow?.annual != null && inputs.downPayment > 0)
              ? (cashFlow.annual / inputs.downPayment) * 100
              : null);
          if (coc == null) return null;
          const color = coc >= 8 ? 'text-emerald-600' : coc >= 5 ? 'text-amber-500' : 'text-red-500';
          return (
            <p className="text-sm flex justify-between">
              <span className="text-gray-500">CoC return</span>
              <span className={`font-semibold ${color}`}>{coc.toFixed(1)}%</span>
            </p>
          );
        })()}

        {/* Equity section */}
        {equity?.currentEquity != null ? (
          <>
            <div className="pt-1.5 mt-1 border-t border-gray-50">
              <p className="text-sm flex justify-between">
                <span className="text-gray-500">Current equity</span>
                <span className="font-semibold text-indigo-600">{formatCurrency(equity.currentEquity)}</span>
              </p>
              <p className="text-sm flex justify-between mt-1">
                <span className="text-gray-500">Remaining balance</span>
                <span className="font-medium text-gray-700">{formatCurrency(equity.remainingBalance)}</span>
              </p>
              <p className="text-sm flex justify-between mt-1">
                <span className="text-gray-500">LTV</span>
                <span className={`font-medium ${parseFloat(equity.ltv) < 80 ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {equity.ltv}%
                </span>
              </p>
              {/* Equity breakdown bar */}
              {value > 0 && (
                <div className="mt-2">
                  <div className="flex text-xs text-gray-400 justify-between mb-1">
                    <span>Equity breakdown</span>
                    <span>{formatCurrency(equity.currentEquity)} / {formatCurrency(value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                    {/* Down payment portion */}
                    <div
                      className="h-full bg-indigo-300"
                      style={{ width: `${Math.min(100, (inputs.downPayment / value) * 100)}%` }}
                      title="Down payment"
                    />
                    {/* Principal paid portion */}
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${Math.min(100, (equity.equityFromPaydown / value) * 100)}%` }}
                      title="Principal paid"
                    />
                    {/* Appreciation portion */}
                    {equity.equityFromAppreciation > 0 && (
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.min(100, (equity.equityFromAppreciation / value) * 100)}%` }}
                        title="Appreciation"
                      />
                    )}
                  </div>
                  <div className="flex gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-300 inline-block" />Down payment
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Paydown
                    </span>
                    {equity.equityFromAppreciation > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Appreciation
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : inputs.purchasePrice && inputs.downPayment && !inputs.interestRate ? (
          <p className="text-xs text-amber-500 mt-1">Add interest rate for equity tracking</p>
        ) : null}

        {property.capRate && (
          <p className="text-sm flex justify-between pt-1">
            <span className="text-gray-500">Cap rate</span>
            <span className="font-medium text-indigo-600"
              title={property.capRateSource === 'actual'
                ? 'From your rent and operating expenses'
                : 'Market estimate'}>
              {property.capRate}%
              {property.capRateSource !== 'actual' && <span className="text-gray-400 text-xs"> est</span>}
            </span>
          </p>
        )}
      </div>

      <button
        onClick={() => onEdit(property)}
        className="mt-4 w-full text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition-colors"
      >
        {rent ? 'Edit details' : 'Add financial details'}
      </button>

      {property.lastRefreshed && (
        <p className="text-xs text-gray-300 mt-2 text-center">
          Updated {new Date(property.lastRefreshed).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ─── Add Property Form ───────────────────────────────────────────────────────
function AddPropertyForm({ onAdded, onClose }) {
  const [form, setForm]     = useState({ address: '', city: '', state: '', zipCode: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.address || !form.city || !form.state) {
      setError('Address, city, and state are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await addProperty({ ...form });
      onAdded();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add property. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Add Property</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
            <input
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              placeholder="123 Main St"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                value={form.city}
                onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                placeholder="New York"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                value={form.state}
                onChange={e => setForm(p => ({ ...p, state: e.target.value.toUpperCase() }))}
                placeholder="NY"
                maxLength={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              value={form.zipCode}
              onChange={e => setForm(p => ({ ...p, zipCode: e.target.value }))}
              placeholder="10001"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Looking up…' : 'Add Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [bankAccounts,       setBankAccounts]       = useState([]);
  const [investAccounts,     setInvestAccounts]     = useState([]);
  const [properties,         setProperties]         = useState([]);
  const [loading,            setLoading]            = useState(true);
  const [expiredConnections, setExpiredConnections] = useState([]);
  const [showAddProperty,    setShowAddProperty]    = useState(false);
  const [propertyModal,      setPropertyModal]      = useState({ open: false, property: null });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [acctData, investData, propData] = await Promise.allSettled([
        getAccounts(),
        getInvestmentAccounts(),
        getProperties(),
      ]);

      if (acctData.status === 'fulfilled') {
        const all = acctData.value.accounts || [];
        setBankAccounts(all.filter(a => a.type !== 'investment'));
        if (acctData.value.expiredConnections?.length) {
          setExpiredConnections(acctData.value.expiredConnections);
        }
      }
      if (investData.status === 'fulfilled') {
        setInvestAccounts(investData.value.accounts || []);
      }
      if (propData.status === 'fulfilled') {
        setProperties(propData.value.properties || []);
      }

      // Save snapshot at most once per day — not on every Dashboard load.
      // Each call hits Plaid for every connected account, so calling it on every
      // mount causes rapid 429 rate-limit errors. The nightly cron handles the
      // regular schedule; this is just a fallback for users who don't leave the
      // app open overnight.
      const SNAP_KEY = 'finsync_last_snapshot';
      const lastSnap = localStorage.getItem(SNAP_KEY);
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (!lastSnap || parseInt(lastSnap) < oneDayAgo) {
        saveSnapshot()
          .then(() => localStorage.setItem(SNAP_KEY, Date.now().toString()))
          .catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // One Plaid Link instance for the entire Dashboard
  const { connect, loading: connecting } = useConnectAccount(loadAll);

  // ── Net worth ──
  // Two figures: equity-adjusted (what you actually own) and gross (face value).
  const nw = summarizeNetWorth({ bankAccounts, investAccounts, properties });

  const totalCashFlow = properties.reduce((s, p) => s + (p.effective?.monthlyCashFlow ?? p.cashFlow?.monthly ?? 0), 0);

  const handleDisconnect = async (itemId) => {
    if (!window.confirm('Disconnect this account?')) return;
    await removeItem(itemId);
    loadAll();
  };

  const handleRemoveProperty = async (propertyId) => {
    if (!window.confirm('Remove this property?')) return;
    await removeProperty(propertyId);
    setProperties(prev => prev.filter(p => (p.propertyId || p._id) !== propertyId));
  };

  const handleSavePropertyInputs = async (inputs) => {
    const prop = propertyModal.property;
    await updatePropertyInputs(prop.propertyId || prop._id, inputs);
    await loadAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading your financial data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Expired token warning */}
      {expiredConnections.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-amber-500 text-lg">⚠️</span>
            <div>
              <p className="text-sm font-medium text-amber-800">Reconnect needed</p>
              <p className="text-sm text-amber-700 mt-0.5">
                These connections have expired. Reconnect to restore data, or remove if no longer needed.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {expiredConnections.map(item => (
              <div key={item.itemId || item.name} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-amber-100">
                <span className="text-sm font-medium text-gray-800">{item.name || item}</span>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Remove ${item.name || item} from CapRate? This frees up a connection slot.`)) return;
                    try {
                      await removeItem(item.itemId);
                      setExpiredConnections(prev => prev.filter(e => (e.itemId || e) !== (item.itemId || item)));
                      await loadAll();
                    } catch (_) {}
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net Worth Summary */}
      <section>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Overview</h1>

        {/* Headline — the two ways to read the same portfolio */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            size="lg"
            label="True Net Worth"
            color="text-indigo-600"
            value={formatCurrency(nw.trueNetWorth)}
            tooltipAlign="left"
            tooltip="What you actually own after debt. Cash and investments, plus your equity in each property (estimated value minus the remaining mortgage), minus credit card and loan balances."
            sub={nw.totalDebt > 0
              ? `After ${formatCurrency(nw.totalDebt)} of debt`
              : 'No debt recorded'}
          />
          <StatCard
            size="lg"
            label="Gross Asset Value"
            color="text-gray-900"
            value={formatCurrency(nw.grossAssetValue)}
            tooltip="Everything you own at face value — cash, investments, and the full estimated market value of every property, before subtracting any debt. Useful for sizing the portfolio, not for knowing what you'd keep."
            sub={nw.totalDebt > 0
              ? `${formatCurrency(nw.totalDebt)} higher — debt not subtracted`
              : 'Same as net worth — no debt recorded'}
          />
        </div>

        {/* Warn when the headline is overstated by missing mortgage data */}
        {nw.propsMissingEquity > 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            ⚠ {nw.propsMissingEquity} {nw.propsMissingEquity === 1 ? 'property is' : 'properties are'} counted
            at full value because mortgage details are missing — add purchase price, down payment, rate, and
            term to get a true equity-adjusted figure.
          </p>
        )}

        {/* Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mt-4">
          <StatCard
            label="Cash &amp; Banking"
            value={formatCurrency(nw.cashTotal)}
            tooltipAlign="left"
            tooltip="Checking and savings balances only. Credit cards and loans are counted under Debts instead, since they are money you owe rather than money you have."
          />
          <StatCard label="Investments" value={formatCurrency(nw.investTotal)} />
          <StatCard
            label="Real Estate (Equity)"
            color="text-indigo-600"
            value={formatCurrency(nw.propEquityTotal)}
            tooltip="Your ownership stake across all properties — estimated value minus the remaining mortgage balance on each."
            sub={totalCashFlow !== 0
              ? `${totalCashFlow >= 0 ? '+' : ''}${formatCurrency(totalCashFlow)}/mo cash flow`
              : undefined}
          />
          <StatCard
            label="Real Estate (Gross)"
            value={formatCurrency(nw.propGrossTotal)}
            tooltip="Total estimated market value of your properties before subtracting mortgage debt."
            sub={nw.mortgageDebt > 0 ? `${formatCurrency(nw.mortgageDebt)} still owed` : undefined}
          />
          <StatCard
            label="Debts"
            color={nw.totalDebt > 0 ? 'text-red-500' : 'text-gray-900'}
            value={nw.totalDebt > 0 ? `−${formatCurrency(nw.totalDebt)}` : formatCurrency(0)}
            tooltipAlign="right"
            tooltip="Everything you owe: remaining mortgage balances on your properties, plus credit card and loan balances from connected accounts."
            sub={nw.accountDebt > 0 && nw.mortgageDebt > 0
              ? `${formatCurrency(nw.mortgageDebt)} mortgages · ${formatCurrency(nw.accountDebt)} cards & loans`
              : undefined}
          />
        </div>
      </section>

      {/* Real Estate — portfolio first (CapRate is built for real estate investors) */}
      <section>
        <SectionHeader
          title="Real Estate Portfolio"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/real-estate')}
                className="border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Full portfolio →
              </button>
              <button onClick={() => setShowAddProperty(true)} className="btn-primary text-sm">
                + Add Property
              </button>
            </div>
          }
        />
        <ErrorBoundary section="Real Estate">
          {properties.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <p className="text-lg mb-1">No properties added</p>
              <p className="text-sm">Add a property to track its value, cash flow, and equity.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {properties.map(p => (
                <PropertyCard
                  key={p.propertyId || p._id}
                  property={p}
                  onEdit={(prop) => setPropertyModal({ open: true, property: prop })}
                  onRemove={handleRemoveProperty}
                />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </section>

      {/* Banking */}
      <section>
        <SectionHeader
          title="Bank Accounts"
          action={<ConnectButton onClick={connect} loading={connecting} label="+ Connect Bank" />}
        />
        <ErrorBoundary section="Bank Accounts">
          {bankAccounts.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-3xl mb-3">🏦</div>
              <p className="text-lg font-medium text-gray-700 mb-1">No bank accounts connected</p>
              <p className="text-sm text-gray-400 max-w-sm mx-auto mb-5">
                Link a checking, savings, or credit card account to track balances and spending.
                Connect the account a property pays from to compare estimated and actual cash flow.
              </p>
              <ConnectButton onClick={connect} loading={connecting} label="+ Connect Bank" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {bankAccounts.map(a => (
                <BankAccountCard key={a.account_id} account={a} onDisconnect={handleDisconnect} navigate={navigate} />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </section>

      {/* Investments — always rendered so the feature is discoverable even
          before any brokerage account has been connected. */}
      <section>
        <SectionHeader
          title="Investment Accounts"
          action={<ConnectButton onClick={connect} loading={connecting} label="+ Connect Brokerage" variant="secondary" />}
        />
        <ErrorBoundary section="Investment Accounts">
          {investAccounts.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-3xl mb-3">📈</div>
              <p className="text-lg font-medium text-gray-700 mb-1">No investment accounts connected</p>
              <p className="text-sm text-gray-400 max-w-sm mx-auto mb-5">
                Connect a brokerage or retirement account — Fidelity, Schwab, Robinhood, Vanguard and
                most major providers are supported — to see your holdings and returns alongside your
                real estate in one net worth picture.
              </p>
              <ConnectButton onClick={connect} loading={connecting} label="+ Connect Brokerage" variant="secondary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {investAccounts.map(a => (
                <InvestmentCard key={a.account_id} account={a} navigate={navigate} />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </section>

      {/* Modals */}
      {showAddProperty && (
        <AddPropertyForm
          onAdded={() => { setShowAddProperty(false); loadAll(); }}
          onClose={() => setShowAddProperty(false)}
        />
      )}

      <PropertyInputModal
        property={propertyModal.property}
        isOpen={propertyModal.open}
        onClose={() => setPropertyModal({ open: false, property: null })}
        onSave={handleSavePropertyInputs}
      />
    </div>
  );
}
