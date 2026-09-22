import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  listTransactions, assignTransaction, assignTransactionsBulk,
  createTransactionRule, deleteTransactionRule, clearTransactionAssignment,
  formatCurrency,
} from '../services/api.js';

/**
 * Transaction assignment.
 *
 * Only meaningful when one bank account serves several properties — otherwise
 * every transaction is auto-attributed to the sole property that claims the
 * account and there is nothing to decide. The page still exists for that case
 * so users can mark personal spending on a property account.
 *
 * Unassigned transactions count toward NO property. That is deliberate: an
 * inflated cash-flow number that looks plausible is far more dangerous than a
 * low one flagged as needing review.
 */

const shortAddress = (a) => (a || '').split(',')[0];

const STATUS_TABS = [
  { key: 'unassigned', label: 'Needs review' },
  { key: 'assigned',   label: 'Assigned'     },
  { key: 'personal',   label: 'Personal'     },
  { key: 'all',        label: 'All'          },
];

// ─── Assignment badge ────────────────────────────────────────────────────────
function AssignmentBadge({ row, propertyById }) {
  if (row.target === 'personal') {
    return <span className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">Personal</span>;
  }
  if (row.target === 'property') {
    const addr = propertyById[row.propertyId]?.address;
    // Auto-attributed rows are styled quietly — the user never chose them, so
    // presenting them as confirmed decisions would overstate what we know.
    const auto = row.source === 'sole-claimant';
    return (
      <span
        className={`text-xs px-2 py-1 rounded-md ${
          auto ? 'bg-gray-50 text-gray-500' : 'bg-emerald-50 text-emerald-700'
        }`}
        title={
          row.source === 'override' ? 'You assigned this transaction'
          : row.source === 'rule'   ? 'Assigned by a rule covering this series'
          : 'Only one property uses this account'
        }
      >
        {shortAddress(addr) || 'Property'}
        {row.source === 'rule' && ' · rule'}
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-800">
      Needs review
    </span>
  );
}

// ─── Per-row assign control ──────────────────────────────────────────────────
function AssignMenu({ row, properties, onAssign, onAssignSeries, onClear, busy }) {
  const [open, setOpen] = useState(false);

  const choose = async (target, propertyId, whole) => {
    setOpen(false);
    if (whole) await onAssignSeries(row, target, propertyId);
    else       await onAssign(row, target, propertyId);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600
                   hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
      >
        Assign ▾
      </button>

      {open && (
        <>
          {/* Click-away layer */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white border border-gray-200
                          rounded-xl shadow-lg py-1.5 text-left">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">
              This transaction
            </p>
            {properties.map(p => (
              <button
                key={p.id}
                onClick={() => choose('property', p.id, false)}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50"
              >
                {shortAddress(p.address)}
              </button>
            ))}
            <button
              onClick={() => choose('personal', null, false)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              Personal — ignore
            </button>

            {row.matchKey && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">
                  Every transaction like this
                </p>
                {properties.map(p => (
                  <button
                    key={`s_${p.id}`}
                    onClick={() => choose('property', p.id, true)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50"
                  >
                    All → {shortAddress(p.address)}
                  </button>
                ))}
                <button
                  onClick={() => choose('personal', null, true)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                >
                  All → Personal
                </button>
              </>
            )}

            {row.source === 'override' && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => { setOpen(false); onClear(row); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                >
                  Clear my assignment
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Suggestions ─────────────────────────────────────────────────────────────
function Suggestions({ suggestions, onApply, busy }) {
  if (!suggestions.length) return null;

  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
      <h2 className="text-sm font-bold text-gray-900">Suggested assignments</h2>
      <p className="text-xs text-gray-600 mt-1 mb-3">
        Based on the rent and mortgage figures you entered. Nothing is applied until you confirm —
        each one covers the whole recurring series.
      </p>
      <ul className="space-y-2">
        {suggestions.map(s => (
          <li
            key={`${s.accountId}_${s.matchKey}`}
            className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {s.label} · {formatCurrency(s.avgAmount)}
                <span className="text-gray-400 font-normal"> × {s.count}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                s.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {s.confidence}
              </span>
              <button
                onClick={() => onApply(s)}
                disabled={busy}
                className="btn-primary text-xs whitespace-nowrap disabled:opacity-50"
              >
                → {shortAddress(s.propertyAddress)}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Transactions() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(false);

  const [status,     setStatus]     = useState('unassigned');
  const [accountId,  setAccountId]  = useState('');
  const [selected,   setSelected]   = useState(new Set());

  const load = useCallback(async (opts = {}) => {
    const nextStatus  = opts.status    ?? status;
    const nextAccount = opts.accountId ?? accountId;
    setLoading(true);
    setError(null);
    try {
      const res = await listTransactions({
        status:    nextStatus,
        accountId: nextAccount || undefined,
      });
      setData(res);
      setSelected(new Set());
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load transactions');
    } finally {
      setLoading(false);
    }
  }, [status, accountId]);

  useEffect(() => { load(); }, [load]);

  const properties = data?.properties || [];
  const rows       = data?.transactions || [];

  const propertyById = useMemo(
    () => Object.fromEntries(properties.map(p => [p.id, p])),
    [properties]
  );

  // Only properties that actually claim the account a row belongs to should be
  // offered — assigning a transaction to a property on a different bank would
  // produce figures that can never reconcile.
  const propertiesForAccount = useCallback((acctId) => {
    const acct = (data?.accounts || []).find(a => a.accountId === acctId);
    return acct ? acct.claimants : properties;
  }, [data, properties]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = (row, target, propertyId) => run(() =>
    assignTransaction({
      accountId:     row.accountId,
      transactionId: row.id,
      fingerprint:   row.fingerprint,
      target,
      propertyId,
    })
  );

  const handleAssignSeries = (row, target, propertyId) => run(() =>
    createTransactionRule({
      accountId: row.accountId,
      matchKey:  row.matchKey,
      target,
      propertyId,
      label:     row.label || row.name,
    })
  );

  const handleClear = (row) => run(() => clearTransactionAssignment(row.fingerprint));

  const handleApplySuggestion = (s) => run(() =>
    createTransactionRule({
      accountId:  s.accountId,
      matchKey:   s.matchKey,
      target:     'property',
      propertyId: s.propertyId,
      label:      s.label,
    })
  );

  const handleBulk = (target, propertyId) => {
    const chosen = rows.filter(r => selected.has(r.fingerprint));
    if (!chosen.length) return;
    // Bulk applies per account: a selection can span accounts, and an assignment
    // is only meaningful within the account it belongs to.
    const byAccount = chosen.reduce((acc, r) => {
      (acc[r.accountId] ||= []).push(r.fingerprint);
      return acc;
    }, {});
    return run(async () => {
      for (const [acct, fingerprints] of Object.entries(byAccount)) {
        await assignTransactionsBulk({ accountId: acct, fingerprints, target, propertyId });
      }
    });
  };

  const toggle = (fp) => setSelected(prev => {
    const next = new Set(prev);
    next.has(fp) ? next.delete(fp) : next.add(fp);
    return next;
  });

  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.fingerprint));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map(r => r.fingerprint)));

  // ── Render ──
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const accounts   = data?.accounts || [];
  const hasShared  = accounts.some(a => a.shared);
  const unassigned = data?.meta?.unassigned ?? 0;

  if (!accounts.length) {
    return (
      <div className="card text-center py-12">
        <h1 className="text-lg font-bold text-gray-900">No linked accounts</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Link a bank account to a property and its transactions will show up here, ready to be
          attributed to the right property.
        </p>
        <Link to="/real-estate" className="btn-primary text-sm inline-block mt-4">
          Go to Real Estate
        </Link>
      </div>
    );
  }

  const selectedCount = selected.size;
  const bulkProperties = accountId
    ? propertiesForAccount(accountId)
    : properties;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <p className="text-sm text-gray-500 mt-1">
          {hasShared
            ? 'Some accounts serve more than one property. Assign each transaction so every property reports its own numbers.'
            : 'Every transaction is attributed automatically. Mark anything personal so it stays out of your rental figures.'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Needs-review banner */}
      {unassigned > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            {unassigned} transaction{unassigned === 1 ? '' : 's'} need review
          </p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            These are on accounts shared by several properties, so we cannot tell which one they
            belong to. They currently count toward <strong>no</strong> property — your cash flow is
            understated until they are assigned.
          </p>
        </div>
      )}

      <Suggestions
        suggestions={data?.suggestions || []}
        onApply={handleApplySuggestion}
        busy={busy}
      />

      {/* Account errors */}
      {accounts.filter(a => a.error).map(a => (
        <div key={a.accountId} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700">
            {a.accountName || 'An account'}:{' '}
            {a.error === 'RECONNECT'
              ? 'bank connection expired — reconnect it from the Dashboard.'
              : 'could not load transactions.'}
          </p>
        </div>
      ))}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); load({ status: t.key }); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === t.key
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
            {t.key === 'unassigned' && unassigned > 0 && (
              <span className="ml-1.5 text-xs bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full">
                {unassigned}
              </span>
            )}
          </button>
        ))}

        {accounts.length > 1 && (
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); load({ accountId: e.target.value }); }}
            className="ml-auto text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
          >
            <option value="">All accounts</option>
            {accounts.map(a => (
              <option key={a.accountId} value={a.accountId}>
                {a.accountName || 'Account'}{a.shared ? ` (${a.claimants.length} properties)` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Bulk bar */}
      {selectedCount > 0 && (
        <div className="sticky top-2 z-30 bg-indigo-600 text-white rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {bulkProperties.map(p => (
              <button
                key={p.id}
                onClick={() => handleBulk('property', p.id)}
                disabled={busy}
                className="text-xs bg-white/15 hover:bg-white/25 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                → {shortAddress(p.address)}
              </button>
            ))}
            <button
              onClick={() => handleBulk('personal', null)}
              disabled={busy}
              className="text-xs bg-white/15 hover:bg-white/25 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              → Personal
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">
            {status === 'unassigned'
              ? 'Nothing needs review — every transaction is attributed.'
              : 'No transactions match this filter.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all transactions"
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="text-left font-medium px-2 py-2.5">Date</th>
                <th className="text-left font-medium px-2 py-2.5">Description</th>
                <th className="text-right font-medium px-2 py-2.5">Amount</th>
                <th className="text-left font-medium px-2 py-2.5">Assigned to</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr
                  key={row.fingerprint}
                  className={selected.has(row.fingerprint) ? 'bg-indigo-50/40' : 'hover:bg-gray-50/60'}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.fingerprint)}
                      onChange={() => toggle(row.fingerprint)}
                      aria-label={`Select ${row.name}`}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-2 py-3 text-gray-500 whitespace-nowrap">{row.date}</td>
                  <td className="px-2 py-3">
                    <p className="text-gray-900 font-medium truncate max-w-[280px]">{row.name}</p>
                    <p className="text-xs text-gray-400">
                      {row.accountName}
                      {row.pending && ' · pending'}
                    </p>
                  </td>
                  <td className={`px-2 py-3 text-right whitespace-nowrap font-medium ${
                    row.direction === 'in' ? 'text-emerald-600' : 'text-gray-900'
                  }`}>
                    {row.direction === 'in' ? '+' : '−'}{formatCurrency(row.amount)}
                  </td>
                  <td className="px-2 py-3">
                    <AssignmentBadge row={row} propertyById={propertyById} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AssignMenu
                      row={row}
                      properties={propertiesForAccount(row.accountId)}
                      onAssign={handleAssign}
                      onAssignSeries={handleAssignSeries}
                      onClear={handleClear}
                      busy={busy}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Active rules */}
      {(data?.rules || []).length > 0 && (
        <section className="card">
          <h2 className="text-sm font-bold text-gray-900 mb-1">Active rules</h2>
          <p className="text-xs text-gray-500 mb-3">
            Each rule assigns a whole recurring series, including transactions that have not arrived yet.
          </p>
          <ul className="divide-y divide-gray-100">
            {data.rules.map(r => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{r.label || r.matchKey}</p>
                  <p className="text-xs text-gray-400">
                    → {r.target === 'personal'
                        ? 'Personal'
                        : shortAddress(propertyById[r.propertyId]?.address) || 'Property'}
                  </p>
                </div>
                <button
                  onClick={() => run(() => deleteTransactionRule(r.id))}
                  disabled={busy}
                  className="text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Showing the last {data?.meta?.months ?? 12} months.
      </p>
    </div>
  );
}
