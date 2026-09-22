/**
 * Transaction assignment API.
 *
 * Lets the user decide which property each bank transaction belongs to when one
 * account serves several properties. See services/txnAttribution.js for the
 * resolution chain; this layer is responsible for fetching, shaping, and
 * persisting decisions.
 */
import User from '../models/User.js';
import { plaidClient } from '../services/plaidClient.js';
import {
  cleanLabel, fingerprintOf,
  resolveAssignments, suggestAssignments,
  TARGET_PROPERTY, TARGET_PERSONAL, SOURCE_UNASSIGNED,
} from '../services/txnAttribution.js';

const DEFAULT_MONTHS = 12;
const PLAID_PAGE     = 500;   // Plaid's maximum page size
const MAX_PAGES      = 10;    // hard stop: 5,000 transactions per account
// Bulk cap. A fingerprint is ~80 chars, so 100 of them plus the wrapper stays
// under the 10kb express.json limit in server.js. The client chunks past this.
const MAX_BULK       = 100;

const fmtDate = (d) => d.toISOString().split('T')[0];

/**
 * Fetch every transaction for one account in the window, following Plaid's
 * pagination. Plaid caps a page at 500, and a busy account over 12 months can
 * exceed that — stopping at the first page would silently drop the oldest
 * transactions, which is exactly where unassigned history accumulates.
 */
async function fetchAccountTransactions(accessToken, accountId, start, end) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date:   fmtDate(start),
      end_date:     fmtDate(end),
      options: { count: PLAID_PAGE, offset: page * PLAID_PAGE, account_ids: [accountId] },
    });
    all.push(...res.data.transactions);
    if (all.length >= res.data.total_transactions) break;
    if (!res.data.transactions.length) break;          // defensive: never spin
  }
  return all;
}

/**
 * Every distinct bank account linked to at least one property, with the
 * properties claiming it. Keyed by account so we fetch once per ACCOUNT rather
 * than once per property — the old per-property fetch made N identical Plaid
 * calls for a shared account.
 */
function linkedAccounts(user) {
  const byAccount = new Map();
  for (const p of user.realEstateProperties) {
    if (!p.linkedAccountId || !p.linkedItemId) continue;
    if (!byAccount.has(p.linkedAccountId)) {
      byAccount.set(p.linkedAccountId, {
        accountId:   p.linkedAccountId,
        itemId:      p.linkedItemId,
        accountName: p.linkedAccountName,
        claimants:   [],
      });
    }
    byAccount.get(p.linkedAccountId).claimants.push(p);
  }
  return [...byAccount.values()];
}

/** Shape a claimant property for the attribution engine's suggestion scoring. */
function toClaimant(p) {
  const inputs = p.userInputs || {};
  return {
    id:               String(p._id),
    address:          p.address,
    expectedRent:     inputs.actualMonthlyRent || null,
    expectedMortgage: inputs.monthlyMortgage   || null,
  };
}

// ─── GET /api/transactions ───────────────────────────────────────────────────
// Query: months, accountId, propertyId, status (all|unassigned|assigned|personal)
export const listTransactions = async (req, res, next) => {
  try {
    const months = Math.min(parseInt(req.query.months) || DEFAULT_MONTHS, 24);
    const status = req.query.status || 'all';
    const { accountId: filterAccount, propertyId: filterProperty } = req.query;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const end   = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);

    let accounts = linkedAccounts(user);
    if (filterAccount) accounts = accounts.filter(a => a.accountId === filterAccount);

    const rules     = user.transactionRules     || [];
    const overrides = user.transactionOverrides || [];

    const rows          = [];
    const accountMeta   = [];
    const allSuggestions = [];

    for (const acct of accounts) {
      const item = user.plaidItems.find(i => i.itemId === acct.itemId);
      if (!item) {
        accountMeta.push({ ...summarizeAccount(acct), error: 'ITEM_GONE', unassignedCount: 0 });
        continue;
      }

      let txs = [];
      try {
        txs = await fetchAccountTransactions(item.accessToken, acct.accountId, start, end);
      } catch (err) {
        // One broken bank connection must not blank out the whole page — the
        // user still needs to work through their other accounts.
        const code = err.response?.data?.error_code;
        const kind = (code === 'ITEM_LOGIN_REQUIRED' || code === 'INVALID_ACCESS_TOKEN')
          ? 'RECONNECT' : 'FETCH_FAILED';
        accountMeta.push({ ...summarizeAccount(acct), error: kind, unassignedCount: 0 });
        continue;
      }

      const claimantIds = acct.claimants.map(p => String(p._id));
      const assignments = resolveAssignments({
        transactions: txs, accountId: acct.accountId, claimantIds, rules, overrides,
      });

      const suggestions = suggestAssignments({
        transactions: txs,
        accountId:    acct.accountId,
        claimants:    acct.claimants.map(toClaimant),
        rules, overrides,
      }).map(s => ({ ...s, accountId: acct.accountId }));
      allSuggestions.push(...suggestions);

      let unassignedCount = 0;
      for (const tx of txs) {
        const a = assignments.get(tx.transaction_id);
        if (a.source === SOURCE_UNASSIGNED) unassignedCount++;

        rows.push({
          id:          tx.transaction_id,
          fingerprint: fingerprintOf(tx, acct.accountId),
          date:        tx.date,
          // Plaid: positive = money OUT. Expose an explicit direction so the
          // client never has to re-derive that convention.
          amount:      Math.abs(tx.amount),
          direction:   tx.amount > 0 ? 'out' : 'in',
          name:        tx.merchant_name || tx.name || 'Unknown',
          label:       cleanLabel(tx),
          category:    tx.personal_finance_category?.primary || tx.category?.[0] || null,
          pending:     !!tx.pending,
          accountId:   acct.accountId,
          accountName: acct.accountName,
          matchKey:    a.matchKey,
          target:      a.target,
          propertyId:  a.propertyId,
          source:      a.source,
        });
      }

      accountMeta.push({ ...summarizeAccount(acct), unassignedCount, error: null });
    }

    // Filters applied after resolution so counts above reflect the true totals
    let filtered = rows;
    if (filterProperty) filtered = filtered.filter(r => r.propertyId === filterProperty);
    if (status === 'unassigned') filtered = filtered.filter(r => r.source === SOURCE_UNASSIGNED);
    else if (status === 'assigned') filtered = filtered.filter(r => r.target === TARGET_PROPERTY);
    else if (status === 'personal') filtered = filtered.filter(r => r.target === TARGET_PERSONAL);

    filtered.sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      transactions: filtered,
      accounts:     accountMeta,
      suggestions:  allSuggestions,
      properties:   user.realEstateProperties.map(p => ({
        id: String(p._id), address: p.address, linkedAccountId: p.linkedAccountId || null,
      })),
      rules: rules.map(r => ({
        id: String(r._id), accountId: r.accountId, matchKey: r.matchKey,
        target: r.target, propertyId: r.propertyId ? String(r.propertyId) : null,
        label: r.label, createdAt: r.createdAt,
      })),
      meta: {
        months,
        total:      rows.length,
        shown:      filtered.length,
        unassigned: rows.filter(r => r.source === SOURCE_UNASSIGNED).length,
      },
    });
  } catch (err) {
    next(err);
  }
};

function summarizeAccount(acct) {
  return {
    accountId:   acct.accountId,
    accountName: acct.accountName,
    claimants:   acct.claimants.map(p => ({ id: String(p._id), address: p.address })),
    shared:      acct.claimants.length > 1,
  };
}

/** Validate an assignment target, returning an error string or null. */
function validateTarget(user, target, propertyId) {
  if (target !== TARGET_PROPERTY && target !== TARGET_PERSONAL) {
    return 'target must be "property" or "personal"';
  }
  if (target === TARGET_PROPERTY) {
    if (!propertyId) return 'propertyId is required when target is "property"';
    const owned = user.realEstateProperties.some(p => String(p._id) === String(propertyId));
    // Checked against the user's OWN properties so a crafted id cannot attach a
    // transaction to somebody else's portfolio.
    if (!owned) return 'Property not found';
  }
  return null;
}

// Any change to assignments invalidates the cached actuals of every property on
// that account — their cash-flow figures were derived from the old partition.
function invalidateAccountActuals(user, accountId) {
  for (const p of user.realEstateProperties) {
    if (p.linkedAccountId === accountId && p.actuals?.computedAt) {
      p.actuals.computedAt = new Date(0);
    }
  }
}

// ─── POST /api/transactions/assign ───────────────────────────────────────────
// Pins ONE transaction. Body: { accountId, transactionId, fingerprint, target, propertyId }
export const assignTransaction = async (req, res, next) => {
  try {
    const { accountId, transactionId, fingerprint, target, propertyId } = req.body;
    if (!accountId || !fingerprint) {
      return res.status(400).json({ error: 'accountId and fingerprint are required' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const invalid = validateTarget(user, target, propertyId);
    if (invalid) return res.status(400).json({ error: invalid });

    // Replace any existing decision for this transaction rather than stacking
    // duplicates — resolution takes the first match, so a stale row would win.
    user.transactionOverrides = (user.transactionOverrides || []).filter(o =>
      o.fingerprint !== fingerprint &&
      (!transactionId || o.plaidTransactionId !== transactionId)
    );

    user.transactionOverrides.push({
      accountId,
      plaidTransactionId: transactionId || null,
      fingerprint,
      target,
      propertyId: target === TARGET_PROPERTY ? propertyId : null,
    });

    invalidateAccountActuals(user, accountId);
    await user.save();

    res.json({ success: true, assigned: 1 });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/transactions/assign-bulk ──────────────────────────────────────
// Body: { accountId, fingerprints: [string], target, propertyId }
//
// Takes fingerprints only, not transaction ids. Two reasons: the fingerprint is
// the more durable identity (it survives the pending → posted transition that
// changes transaction_id), and the compact payload keeps a large selection
// inside the global 10kb JSON body limit set in server.js. The client chunks
// anything bigger than MAX_BULK.
export const assignTransactionsBulk = async (req, res, next) => {
  try {
    const { accountId, fingerprints, target, propertyId } = req.body;
    if (!accountId || !Array.isArray(fingerprints) || !fingerprints.length) {
      return res.status(400).json({ error: 'accountId and a non-empty fingerprints array are required' });
    }
    if (fingerprints.length > MAX_BULK) {
      return res.status(400).json({ error: `Too many items in one request (max ${MAX_BULK})` });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const invalid = validateTarget(user, target, propertyId);
    if (invalid) return res.status(400).json({ error: invalid });

    const wanted = new Set(fingerprints.filter(f => typeof f === 'string' && f));

    user.transactionOverrides = (user.transactionOverrides || [])
      .filter(o => !wanted.has(o.fingerprint));

    for (const fingerprint of wanted) {
      user.transactionOverrides.push({
        accountId,
        plaidTransactionId: null,
        fingerprint,
        target,
        propertyId: target === TARGET_PROPERTY ? propertyId : null,
      });
    }

    invalidateAccountActuals(user, accountId);
    await user.save();

    res.json({ success: true, assigned: wanted.size });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/transactions/rule ─────────────────────────────────────────────
// Assigns a whole recurring series. Body: { accountId, matchKey, target, propertyId, label }
export const createRule = async (req, res, next) => {
  try {
    const { accountId, matchKey, target, propertyId, label } = req.body;
    if (!accountId || !matchKey) {
      return res.status(400).json({ error: 'accountId and matchKey are required' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const invalid = validateTarget(user, target, propertyId);
    if (invalid) return res.status(400).json({ error: invalid });

    // One rule per (account, series). Re-assigning a series updates it in place
    // rather than leaving a shadowed duplicate behind.
    user.transactionRules = (user.transactionRules || []).filter(
      r => !(r.accountId === accountId && r.matchKey === matchKey)
    );

    user.transactionRules.push({
      accountId, matchKey, target,
      propertyId: target === TARGET_PROPERTY ? propertyId : null,
      label:      (label || '').slice(0, 200) || null,
    });

    invalidateAccountActuals(user, accountId);
    await user.save();

    const created = user.transactionRules[user.transactionRules.length - 1];
    res.status(201).json({
      success: true,
      rule: {
        id: String(created._id), accountId, matchKey, target,
        propertyId: created.propertyId ? String(created.propertyId) : null,
        label: created.label,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/transactions/rule/:ruleId ───────────────────────────────────
export const deleteRule = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const rule = (user.transactionRules || []).find(r => String(r._id) === req.params.ruleId);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const accountId = rule.accountId;
    user.transactionRules = user.transactionRules.filter(r => String(r._id) !== req.params.ruleId);

    invalidateAccountActuals(user, accountId);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/transactions/override ───────────────────────────────────────
// Body: { fingerprint } — reverts one transaction to rule/auto resolution.
export const deleteOverride = async (req, res, next) => {
  try {
    const { fingerprint } = req.body;
    if (!fingerprint) return res.status(400).json({ error: 'fingerprint is required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existing = (user.transactionOverrides || []).find(o => o.fingerprint === fingerprint);
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });

    user.transactionOverrides = user.transactionOverrides.filter(o => o.fingerprint !== fingerprint);
    invalidateAccountActuals(user, existing.accountId);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
