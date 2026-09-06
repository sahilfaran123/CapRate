import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getAccounts, getTransactions, getInvestmentAccounts,
  getHoldings, getProperties, getBankingHistory,
  getAccountBankingHistory, updatePropertyInputs,
  formatCurrency, formatDate,
} from '../services/api.js';
import BalanceChart from '../components/BalanceChart.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import PropertyInputModal from '../components/PropertyInputModal.jsx';

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'banking',     label: 'Banking & Transactions' },
  { id: 'investments', label: 'Investment Performance' },
  { id: 'realestate',  label: 'Real Estate Portfolio' },
];

// ─── Shared ───────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color = 'text-gray-900', bg = 'bg-white' }) {
  return (
    <div className={`${bg} rounded-xl border border-gray-100 p-5 shadow-sm`}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Banking Tab ──────────────────────────────────────────────────────────────
function BankingTab({ accountId, accountName, navigate }) {
  const [bankAccounts,   setBankAccounts]   = useState([]);
  const [transactions,   setTransactions]   = useState([]);
  const [chartData,      setChartData]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [days,           setDays]           = useState(90);
  const [search,         setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const end   = new Date();
        const start = new Date(end - days * 86400000);
        const fmt   = d => d.toISOString().split('T')[0];

        const [acctRes, txRes, histRes] = await Promise.allSettled([
          getAccounts(),
          getTransactions( fmt(start), fmt(end)),
          accountId
            ? getAccountBankingHistory( accountId, days)
            : getBankingHistory( days),
        ]);

        if (acctRes.status === 'fulfilled') {
          setBankAccounts((acctRes.value.accounts || []).filter(a => a.type !== 'investment'));
        }
        if (txRes.status === 'fulfilled') {
          let txs = txRes.value.transactions || [];
          if (accountId) txs = txs.filter(t => t.account_id === accountId);
          setTransactions(txs);
        }
        if (histRes.status === 'fulfilled') {
          setChartData(histRes.value.history || []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId, days]);

  // Build account summary from transactions
  const accountSummary = (() => {
    const map = {};
    transactions.forEach(tx => {
      const acct = bankAccounts.find(a => a.account_id === tx.account_id);
      if (!map[tx.account_id]) {
        map[tx.account_id] = {
          accountId:   tx.account_id,
          accountName: acct?.name || 'Unknown',
          income:      0,
          expenses:    0,
          txCount:     0,
        };
      }
      if (tx.amount < 0) map[tx.account_id].income   += Math.abs(tx.amount);
      else               map[tx.account_id].expenses  += tx.amount;
      map[tx.account_id].txCount++;
    });
    return Object.values(map);
  })();

  const selectedAccount = accountId ? bankAccounts.find(a => a.account_id === accountId) : null;

  // Derive unique categories from transactions for the dropdown
  const uniqueCategories = [...new Set(
    transactions
      .map(tx => tx.personal_finance_category?.primary || tx.category?.[0] || 'Uncategorized')
      .filter(Boolean)
  )].sort();

  const filteredTxs = transactions.filter(tx => {
    const txCategory = tx.personal_finance_category?.primary || tx.category?.[0] || 'Uncategorized';
    const matchesSearch = !search ||
      tx.name?.toLowerCase().includes(search.toLowerCase()) ||
      tx.merchant_name?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || txCategory === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalIncome   = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalExpenses = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      {/* Back button when in account-specific view */}
      {accountId && (
        <button onClick={() => navigate('/analysis?tab=banking')}
          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1">
          ← All accounts
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {selectedAccount ? selectedAccount.name : 'Banking Overview'}
          </h2>
          {selectedAccount && (
            <p className="text-gray-500 text-sm mt-0.5">{selectedAccount.institutionName}</p>
          )}
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 6 months</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard label="Total Income"   value={formatCurrency(totalIncome)}   color="text-emerald-600" />
        <SummaryCard label="Total Expenses" value={formatCurrency(totalExpenses)} color="text-red-500" />
        <SummaryCard
          label="Net Cash Flow"
          value={formatCurrency(totalIncome - totalExpenses)}
          color={totalIncome - totalExpenses >= 0 ? 'text-emerald-600' : 'text-red-500'}
        />
      </div>

      {/* Balance chart */}
      <BalanceChart
        data={chartData}
        valueKey="balance"
        title={accountId ? `${accountName} balance` : 'Total balance across all accounts'}
      />

      {/* Account summary table (aggregate view only) */}
      {!accountId && accountSummary.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Account Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                  <th className="pb-3 font-medium">Account</th>
                  <th className="pb-3 font-medium text-right">Income</th>
                  <th className="pb-3 font-medium text-right">Expenses</th>
                  <th className="pb-3 font-medium text-right">Net</th>
                  <th className="pb-3 font-medium text-right">Transactions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {accountSummary.map(s => (
                  <tr key={s.accountId}
                    onClick={() => navigate(`/analysis?accountId=${s.accountId}&accountName=${encodeURIComponent(s.accountName)}&type=banking`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors">
                    <td className="py-3 font-medium text-indigo-600 hover:text-indigo-800">
                      {s.accountName} <span className="text-gray-300">→</span>
                    </td>
                    <td className="py-3 text-right text-emerald-600">{formatCurrency(s.income)}</td>
                    <td className="py-3 text-right text-red-500">{formatCurrency(s.expenses)}</td>
                    <td className={`py-3 text-right font-semibold ${s.income - s.expenses >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(s.income - s.expenses)}
                    </td>
                    <td className="py-3 text-right text-gray-500">{s.txCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transactions */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Transactions</h3>
            {categoryFilter !== 'all' && (
              <p className="text-sm text-indigo-600 mt-0.5">
                Filtering by: <span className="font-medium">{categoryFilter}</span>
                <button
                  onClick={() => setCategoryFilter('all')}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >✕ clear</button>
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="all">All categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search merchants…"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        {filteredTxs.length === 0 ? (
          <p className="text-gray-400 text-sm py-6 text-center">
            {categoryFilter !== 'all'
              ? `No transactions found in "${categoryFilter}".`
              : 'No transactions found.'
            }
          </p>
        ) : (
          <>
            {/* Category summary when filtering */}
            {categoryFilter !== 'all' && (
              <div className="bg-indigo-50 rounded-lg p-4 mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-800">{categoryFilter}</p>
                  <p className="text-xs text-indigo-600 mt-0.5">{filteredTxs.length} transactions</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-indigo-700">
                    {formatCurrency(filteredTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))}
                  </p>
                  <p className="text-xs text-indigo-500">total spent</p>
                </div>
              </div>
            )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium">Category</th>
                  <th className="pb-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTxs.slice(0, 100).map(tx => (
                  <tr key={tx.transaction_id} className="hover:bg-gray-50">
                    <td className="py-2.5 text-gray-500">{formatDate(tx.date)}</td>
                    <td className="py-2.5 font-medium text-gray-900 max-w-xs truncate">
                      {tx.merchant_name || tx.name}
                    </td>
                    <td className="py-2.5 text-gray-400 text-xs">
                      <button
                        onClick={() => {
                          const cat = tx.personal_finance_category?.primary || tx.category?.[0] || 'Uncategorized';
                          setCategoryFilter(cat);
                          setSearch('');
                        }}
                        className="hover:text-indigo-600 hover:underline transition-colors text-left"
                        title="Filter by this category"
                      >
                        {tx.personal_finance_category?.primary || tx.category?.[0] || '—'}
                      </button>
                    </td>
                    <td className={`py-2.5 text-right font-semibold ${tx.amount < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {tx.amount < 0 ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTxs.length > 100 && (
              <p className="text-xs text-gray-400 text-center mt-4">Showing 100 of {filteredTxs.length} transactions</p>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Investment Tab ───────────────────────────────────────────────────────────
function InvestmentsTab({ accountId, navigate }) {
  const [accounts,  setAccounts]  = useState([]);
  const [holdings,  setHoldings]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [acctRes, holdRes] = await Promise.allSettled([
          getInvestmentAccounts(),
          getHoldings(),
        ]);
        if (acctRes.status === 'fulfilled') setAccounts(acctRes.value.accounts || []);
        if (holdRes.status === 'fulfilled') setHoldings(holdRes.value.holdings || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Loader />;

  const selectedAccount = accountId ? accounts.find(a => a.account_id === accountId) : null;
  const viewHoldings    = accountId
    ? holdings.filter(h => h.account_id === accountId)
    : holdings;

  /**
   * Determines whether a holding's cost basis is trustworthy enough to
   * show gain/loss. Plaid sandbox (and some real brokers) return $0 or $1
   * as a placeholder, which produces absurd percentages.
   *
   * Rules:
   *  - cost_basis must exist and be > 1 (filters out $0 and $1 placeholders)
   *  - The implied gain % must be < 1000% (filters out obviously bad data)
   *  - Cash / money-market positions never show gain/loss (price ≈ $1/unit)
   */
  function isValidCostBasis(holding) {
    const cost  = holding.cost_basis;
    const value = holding.institution_value || 0;
    const price = holding.institution_price || 0;
    const type  = holding.security?.type?.toLowerCase() || '';
    const name  = (holding.security?.name || '').toLowerCase();

    // No cost basis provided
    if (!cost || cost <= 1) return false;

    // Cash / money-market / USD positions — gain/loss is meaningless
    if (
      type === 'cash'         ||
      type === 'money market' ||
      price === 1             ||
      name.includes('u s dollar') ||
      name.includes('us dollar')  ||
      name.includes('money market')
    ) return false;

    // Absurd percentage — clearly bad data
    const pct = ((value - cost) / cost) * 100;
    if (Math.abs(pct) > 1000) return false;

    return true;
  }

  // Only include holdings with valid cost basis in totals
  const validHoldings  = viewHoldings.filter(isValidCostBasis);
  const totalValue     = (selectedAccount ? [selectedAccount] : accounts)
    .reduce((s, a) => s + (a.balances?.current || 0), 0);
  const totalCostBasis = validHoldings.reduce((s, h) => s + (h.cost_basis || 0), 0);
  const totalGainLoss  = validHoldings.reduce((s, h) =>
    s + ((h.institution_value || 0) - (h.cost_basis || 0)), 0);
  const gainPct        = totalCostBasis > 0
    ? ((totalGainLoss / totalCostBasis) * 100).toFixed(2)
    : null;
  const hasCostBasisData = validHoldings.length > 0;

  return (
    <div className="space-y-6">
      {accountId && (
        <button onClick={() => navigate('/analysis?tab=investments')}
          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1">
          ← All accounts
        </button>
      )}

      <h2 className="text-2xl font-bold text-gray-900">
        {selectedAccount ? selectedAccount.name : 'Investment Portfolio'}
      </h2>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Portfolio Value" value={formatCurrency(totalValue)} color="text-indigo-600" />
        <SummaryCard
          label="Total Gain/Loss"
          value={hasCostBasisData
            ? `${totalGainLoss >= 0 ? '+' : ''}${formatCurrency(totalGainLoss)}`
            : '—'
          }
          sub={hasCostBasisData && gainPct
            ? `${totalGainLoss >= 0 ? '+' : ''}${gainPct}% on ${validHoldings.length} positions`
            : 'Cost basis unavailable'
          }
          color={hasCostBasisData
            ? totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-500'
            : 'text-gray-400'
          }
        />
        <SummaryCard
          label="Cost Basis"
          value={hasCostBasisData ? formatCurrency(totalCostBasis) : '—'}
          sub={!hasCostBasisData ? 'Not reported by broker' : undefined}
          color="text-purple-600"
        />
        <SummaryCard
          label="Holdings"
          value={viewHoldings.length}
          color="text-orange-500"
          sub={!accountId ? `${accounts.length} accounts` : undefined}
        />
      </div>

      {/* Account cards (aggregate view) */}
      {!accountId && accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map(acct => {
            const acctHoldings      = holdings.filter(h => h.account_id === acct.account_id);
            const acctValidHoldings = acctHoldings.filter(isValidCostBasis);
            const acctValue         = acct.balances?.current || 0;
            const acctCostBasis     = acctValidHoldings.reduce((s, h) => s + (h.cost_basis || 0), 0);
            const acctGL            = acctValidHoldings.reduce((s, h) =>
              s + ((h.institution_value || 0) - (h.cost_basis || 0)), 0);
            const acctGLPct         = acctCostBasis > 0
              ? ((acctGL / acctCostBasis) * 100).toFixed(2)
              : null;
            const acctHasCostBasis  = acctValidHoldings.length > 0;
            const top3              = [...acctHoldings]
              .sort((a, b) => (b.institution_value || 0) - (a.institution_value || 0))
              .slice(0, 3);

            return (
              <div key={acct.account_id}
                onClick={() => navigate(`/analysis?accountId=${acct.account_id}&accountName=${encodeURIComponent(acct.name)}&type=investment`)}
                className="card cursor-pointer hover:shadow-md hover:border-indigo-200 border border-gray-100 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{acct.name}</p>
                    <p className="text-xs text-gray-400">{acct.institutionName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(acctValue)}</p>
                    {acctHasCostBasis && acctGLPct ? (
                      <p className={`text-xs font-semibold ${acctGL >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {acctGL >= 0 ? '+' : ''}{formatCurrency(acctGL)} ({acctGL >= 0 ? '+' : ''}{acctGLPct}%)
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Cost basis unavailable</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Holdings</p>
                    <p className="font-medium">{acctHoldings.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cost basis</p>
                    <p className="font-medium">
                      {acctHasCostBasis ? formatCurrency(acctCostBasis) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cash</p>
                    <p className="font-medium">{formatCurrency(acct.balances?.available || 0)}</p>
                  </div>
                </div>

                {top3.length > 0 && (
                  <div className="pt-3 border-t border-gray-50">
                    <p className="text-xs text-gray-400 mb-2">Top holdings</p>
                    {top3.map((h, i) => (
                      <div key={i} className="flex justify-between text-xs py-0.5">
                        <span className="text-gray-700">{h.security?.ticker_symbol || h.security?.name || '—'}</span>
                        <span className="font-medium">{formatCurrency(h.institution_value || 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Holdings table */}
      {viewHoldings.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Holdings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                  <th className="pb-3 font-medium">Security</th>
                  <th className="pb-3 font-medium text-right">Quantity</th>
                  <th className="pb-3 font-medium text-right">Price</th>
                  <th className="pb-3 font-medium text-right">Value</th>
                  <th className="pb-3 font-medium text-right">Cost Basis</th>
                  <th className="pb-3 font-medium text-right">Gain/Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {viewHoldings
                  .sort((a, b) => (b.institution_value || 0) - (a.institution_value || 0))
                  .map((h, i) => {
                    const value       = h.institution_value || 0;
                    const cost        = h.cost_basis || 0;
                    const gl          = value - cost;
                    const glPct       = cost > 0 ? ((gl / cost) * 100).toFixed(2) : null;
                    const showGL      = isValidCostBasis(h);
                    const isCash      = (h.security?.type || '').toLowerCase() === 'cash'
                                     || (h.institution_price || 0) === 1
                                     || (h.security?.name || '').toLowerCase().includes('dollar');

                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2.5">
                          <p className="font-medium text-gray-900">
                            {h.security?.ticker_symbol || (isCash ? 'CASH' : '—')}
                          </p>
                          <p className="text-xs text-gray-400 truncate max-w-xs">
                            {h.security?.name || '—'}
                          </p>
                        </td>
                        <td className="py-2.5 text-right text-gray-700">
                          {h.quantity != null ? h.quantity.toFixed(isCash ? 2 : 4) : '—'}
                        </td>
                        <td className="py-2.5 text-right text-gray-700">
                          {isCash ? '$1.00' : formatCurrency(h.institution_price)}
                        </td>
                        <td className="py-2.5 text-right font-semibold">
                          {formatCurrency(value)}
                        </td>
                        <td className="py-2.5 text-right text-gray-500">
                          {isCash
                            ? <span className="text-gray-300 text-xs">N/A</span>
                            : showGL
                              ? formatCurrency(cost)
                              : <span className="text-gray-300 text-xs">Not reported</span>
                          }
                        </td>
                        <td className="py-2.5 text-right">
                          {isCash ? (
                            <span className="text-gray-300 text-xs">N/A</span>
                          ) : showGL ? (
                            <span className={`font-semibold ${gl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {gl >= 0 ? '+' : ''}{formatCurrency(gl)}
                              <span className="text-xs ml-1 font-normal">
                                ({gl >= 0 ? '+' : ''}{glPct}%)
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">Not reported</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {accounts.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          <p>No investment accounts connected yet.</p>
          <p className="text-sm mt-1">Connect an account from the Dashboard.</p>
        </div>
      )}
    </div>
  );
}

// ─── Real Estate Tab ──────────────────────────────────────────────────────────
function RealEstateTab() {
  const [properties,    setProperties]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [propertyModal, setPropertyModal] = useState({ open: false, property: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProperties();
      setProperties(res.properties || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;

  const totalValue     = properties.reduce((s, p) => s + (p.estimatedValue || 0), 0);
  const totalAppreciation = properties.reduce((s, p) => s + (p.appreciation || 0), 0);
  const totalCashFlow  = properties.reduce((s, p) => s + (p.cashFlow?.monthly || 0), 0);
  const totalAnnual    = totalCashFlow * 12;
  const propertiesWithCap = properties.filter(p => p.capRate);
  const avgCapRate     = propertiesWithCap.length
    ? (propertiesWithCap.reduce((s, p) => s + parseFloat(p.capRate), 0) / propertiesWithCap.length).toFixed(2)
    : null;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Real Estate Portfolio</h2>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Properties"          value={properties.length} />
        <SummaryCard label="Total Value"         value={formatCurrency(totalValue)} color="text-indigo-600" />
        <SummaryCard
          label="Total Appreciation"
          value={`${totalAppreciation >= 0 ? '+' : ''}${formatCurrency(totalAppreciation)}`}
          color={totalAppreciation >= 0 ? 'text-emerald-600' : 'text-red-500'}
        />
        <SummaryCard
          label="Monthly Cash Flow"
          value={`${totalCashFlow >= 0 ? '+' : ''}${formatCurrency(totalCashFlow)}`}
          sub={`Annual: ${totalCashFlow >= 0 ? '+' : ''}${formatCurrency(totalAnnual)}`}
          color={totalCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}
        />
      </div>

      {/* Property table — desktop only */}
      {properties.length > 0 ? (
        <>
          <div className="card overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="pb-3 font-medium">Address</th>
                <th className="pb-3 font-medium text-right">Value</th>
                <th className="pb-3 font-medium text-right">Appreciation</th>
                <th className="pb-3 font-medium text-right">Current Equity</th>
                <th className="pb-3 font-medium text-right">Cash Flow/mo</th>
                <th className="pb-3 font-medium text-right">LTV</th>
                <th className="pb-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {properties.map(p => {
                const cf      = p.cashFlow;
                const inputs  = p.userInputs || {};
                const equity  = p.equity;
                const hasFlow = inputs.actualMonthlyRent && (inputs.monthlyMortgage || inputs.monthlyHOA);

                return (
                  <tr key={p.propertyId || p._id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium text-gray-900 max-w-xs">{p.address}</p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">{p.provider}</p>
                    </td>
                    <td className="py-3 text-right font-semibold">{formatCurrency(p.estimatedValue)}</td>
                    <td className="py-3 text-right">
                      {p.appreciation != null ? (
                        <div>
                          <p className={`font-semibold ${p.appreciation >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {p.appreciation >= 0 ? '+' : ''}{formatCurrency(p.appreciation)}
                          </p>
                          <p className="text-xs text-gray-400">{p.appreciationLabel}</p>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 text-right">
                      {equity?.currentEquity != null ? (
                        <div>
                          <p className="font-semibold text-indigo-600">{formatCurrency(equity.currentEquity)}</p>
                          <p className="text-xs text-gray-400">
                            {formatCurrency(equity.equityFromPaydown)} paydown
                            {equity.equityFromAppreciation != null && ` + ${formatCurrency(equity.equityFromAppreciation)} appreciation`}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">Add mortgage details</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {hasFlow ? (
                        <div>
                          <p className={`font-semibold ${cf.monthly >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {cf.monthly >= 0 ? '+' : ''}{formatCurrency(cf.monthly)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatCurrency(inputs.actualMonthlyRent)} - {formatCurrency(cf.totalExpenses)}
                          </p>
                        </div>
                      ) : <span className="text-gray-300 text-xs">Not set</span>}
                    </td>
                    <td className="py-3 text-right">
                      {equity?.ltv != null ? (
                        <div>
                          <p className={`font-semibold ${parseFloat(equity.ltv) < 80 ? 'text-emerald-600' : 'text-amber-500'}`}>
                            {equity.ltv}%
                          </p>
                          <p className="text-xs text-gray-400">{parseFloat(equity.ltv) < 80 ? 'Good' : 'High LTV'}</p>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => setPropertyModal({ open: true, property: p })}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50 transition-colors"
                      >
                        {hasFlow ? 'Edit' : 'Add details'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="md:hidden space-y-4">
          {properties.map(p => {
            const cf      = p.cashFlow;
            const inputs  = p.userInputs || {};
            const equity  = p.equity;
            const hasFlow = inputs.actualMonthlyRent && (inputs.monthlyMortgage || inputs.monthlyHOA);

            return (
              <div key={p.propertyId || p._id} className="card">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{p.address}</p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{p.provider}</p>
                  </div>
                  <button
                    onClick={() => setPropertyModal({ open: true, property: p })}
                    className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
                  >
                    {hasFlow ? 'Edit' : 'Add details'}
                  </button>
                </div>

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between items-baseline">
                    <span className="text-gray-500">Value</span>
                    <span className="font-semibold">{formatCurrency(p.estimatedValue)}</span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-gray-500">Appreciation</span>
                    {p.appreciation != null ? (
                      <span className="text-right">
                        <span className={`font-semibold ${p.appreciation >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {p.appreciation >= 0 ? '+' : ''}{formatCurrency(p.appreciation)}
                        </span>
                        {p.appreciationLabel && <span className="block text-xs text-gray-400">{p.appreciationLabel}</span>}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-gray-500">Current Equity</span>
                    {equity?.currentEquity != null ? (
                      <span className="text-right">
                        <span className="font-semibold text-indigo-600">{formatCurrency(equity.currentEquity)}</span>
                        <span className="block text-xs text-gray-400">
                          {formatCurrency(equity.equityFromPaydown)} paydown
                          {equity.equityFromAppreciation != null && ` + ${formatCurrency(equity.equityFromAppreciation)} appr.`}
                        </span>
                      </span>
                    ) : <span className="text-gray-300 text-xs">Add mortgage details</span>}
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-gray-500">Cash Flow/mo</span>
                    {hasFlow ? (
                      <span className="text-right">
                        <span className={`font-semibold ${cf.monthly >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {cf.monthly >= 0 ? '+' : ''}{formatCurrency(cf.monthly)}
                        </span>
                        <span className="block text-xs text-gray-400">
                          {formatCurrency(inputs.actualMonthlyRent)} − {formatCurrency(cf.totalExpenses)}
                        </span>
                      </span>
                    ) : <span className="text-gray-300 text-xs">Not set</span>}
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-gray-500">LTV</span>
                    {equity?.ltv != null ? (
                      <span className="text-right">
                        <span className={`font-semibold ${parseFloat(equity.ltv) < 80 ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {equity.ltv}%
                        </span>
                        <span className="block text-xs text-gray-400">{parseFloat(equity.ltv) < 80 ? 'Good' : 'High LTV'}</span>
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      ) : (
        <div className="card text-center py-12 text-gray-400">
          <p>No properties added yet.</p>
          <p className="text-sm mt-1">Add a property from the Dashboard.</p>
        </div>
      )}

      <PropertyInputModal
        property={propertyModal.property}
        isOpen={propertyModal.open}
        onClose={() => setPropertyModal({ open: false, property: null })}
        onSave={async (inputs) => {
          const p = propertyModal.property;
          await updatePropertyInputs( p.propertyId || p._id, inputs);
          await load();
        }}
      />
    </div>
  );
}

// ─── Loader ───────────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Analysis Page ────────────────────────────────────────────────────────────
export default function Analysis() {
  
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();

  const accountId   = searchParams.get('accountId');
  const accountName = searchParams.get('accountName');
  const type        = searchParams.get('type');
  const tabParam    = searchParams.get('tab');

  // Determine active tab from URL
  const defaultTab = type === 'investment' ? 'investments'
    : type === 'banking' ? 'banking'
    : tabParam || 'banking';

  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`/analysis?tab=${tabId}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'banking' && (
        <ErrorBoundary section="Banking">
          <BankingTab
            accountId={accountId}
            accountName={accountName}
            navigate={navigate}
          />
        </ErrorBoundary>
      )}
      {activeTab === 'investments' && (
        <ErrorBoundary section="Investments">
          <InvestmentsTab
            accountId={accountId}
            navigate={navigate}
          />
        </ErrorBoundary>
      )}
      {activeTab === 'realestate' && (
        <ErrorBoundary section="Real Estate">
          <RealEstateTab />
        </ErrorBoundary>
      )}
    </div>
  );
}
