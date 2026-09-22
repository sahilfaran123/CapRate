/**
 * Transaction attribution engine.
 *
 * When several properties are linked to ONE bank account, every property's
 * financials were previously computed from the full transaction set of that
 * account — so each reported the same rent and mortgage, and portfolio totals
 * summed the duplicates. This module decides which property each transaction
 * belongs to so those figures can be partitioned correctly.
 *
 * Pure functions only: no database access, no Plaid calls. Everything here is
 * driven by arguments and returns plain data, which keeps the resolution rules
 * testable without a network or a Mongo instance.
 *
 * ── Resolution chain (first match wins) ──
 *   1. Override      — the user assigned this exact transaction
 *   2. Rule          — the user assigned the recurring series it belongs to
 *   3. Sole claimant — only one property is linked to the account, so it is
 *                      unambiguous. This is why single-property users never see
 *                      any of this machinery.
 *   4. Unassigned    — ambiguous; counts toward NOBODY until the user decides.
 *
 * Step 4 is deliberately conservative. Leaving a transaction out understates a
 * property until it is reviewed; counting it for every claimant would inflate
 * the portfolio, and an inflated number that looks plausible is far more
 * dangerous to an investor than a low one flagged as needing review.
 */

// Assignment targets
export const TARGET_PROPERTY = 'property';
export const TARGET_PERSONAL = 'personal';

// Where a resolution came from — surfaced in the UI so the user can see WHY a
// transaction landed where it did, and which decisions are safe to change.
export const SOURCE_OVERRIDE     = 'override';
export const SOURCE_RULE         = 'rule';
export const SOURCE_SOLE_CLAIMANT = 'sole-claimant';
export const SOURCE_UNASSIGNED   = 'unassigned';

/**
 * Bank descriptors for ACH deposits embed dates and trace IDs, e.g.
 * "ORIG CO NAME:TCS MGT LLC 3135 ORIG ID:471634599 DESC DATE:260820 CO ENTRY..."
 * Those make every transaction look unique. Extract the stable payer identity so
 * repeat payments from the same source group together.
 *
 * Moved here verbatim from realEstateController so detection and assignment
 * share one definition — if these ever drifted, a rule created against one key
 * would silently stop matching the series it was made from.
 */
export function normalizeDescriptor(tx) {
  if (tx.merchant_name) return tx.merchant_name.toLowerCase().trim();
  let s = (tx.name || '').toUpperCase();

  // Pull the originating company name out of an ACH descriptor when present
  const origMatch = s.match(/ORIG(?:INATOR)?\s*CO(?:MPANY)?\s*NAME\s*:\s*([A-Z0-9 &.,'-]+?)(?=\s+(?:ORIG|DESC|CO |ID:|ENTRY|SEC:|$))/);
  if (origMatch) s = origMatch[1];

  return s
    .replace(/\b(?:ORIG|DESC|CO|ID|DATE|ENTRY|SEC|REF|TRN|PPD|CCD|WEB|ACH|DEPOSIT|PAYMENT)\b[:\s]*/g, ' ')
    .replace(/\d{4,}/g, ' ')
    .replace(/[^A-Z& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() || null;
}

/** Human-readable version of a descriptor, for display. */
export function cleanLabel(tx) {
  if (tx.merchant_name) return tx.merchant_name;
  const norm = normalizeDescriptor(tx);
  if (!norm) return null;
  return norm.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * The key a recurring series is grouped under, and what a rule matches against.
 *
 * Plaid sign convention: positive = money OUT, negative = money IN. The two
 * directions use different amount-bucket fallbacks ($5 for debits, $25 for
 * credits) because rent deposits vary far more than bill payments do. These
 * buckets are carried over unchanged from the original detection code so
 * existing behaviour is preserved exactly.
 */
export function matchKeyOf(tx) {
  const norm = normalizeDescriptor(tx);
  if (norm) return norm;
  return tx.amount > 0
    ? `amt_${Math.round(tx.amount / 5) * 5}`
    : `amt_${Math.round(Math.abs(tx.amount) / 25) * 25}`;
}

/**
 * A content-based identity for a transaction.
 *
 * Plaid's `transaction_id` is NOT stable across the pending → posted
 * transition: the pending row is removed and a brand new id appears, with
 * `pending_transaction_id` pointing back at the old one. An override keyed only
 * by transaction_id would therefore silently detach the moment a transaction
 * posted, and the user's decision would be lost. The fingerprint survives that
 * because it is derived from the content, which does not change.
 */
export function fingerprintOf(tx, accountId) {
  const acct = accountId || tx.account_id || '';
  const amt  = Math.round(Number(tx.amount) * 100);   // integer cents, avoids float drift
  return `${acct}|${tx.date}|${amt}|${normalizeDescriptor(tx) || ''}`;
}

/**
 * Detect recurring series among a set of transactions.
 *
 * @param {Array}  transactions
 * @param {object} opts
 * @param {'debit'|'credit'} opts.direction
 * @returns {Array} series — { key, label, avgAmount, minAmount, maxAmount,
 *                             varies, count, monthsPaid, direction }
 *
 * Thresholds differ by direction and are carried over from the original
 * detection code:
 *   debits  — 3+ occurrences, amounts within 15% of average, 3+ distinct months.
 *             Bills are predictable, so consistency is a fair requirement.
 *   credits — 2+ distinct months, average >= $200, NO consistency requirement.
 *             When a property manager nets out fees and repairs before
 *             depositing, the amount legitimately varies month to month; payer
 *             identity plus monthly cadence is the reliable signal.
 */
export function detectSeries(transactions, { direction = 'debit' } = {}) {
  const isDebit = direction === 'debit';
  const pool    = transactions.filter(t => (isDebit ? t.amount > 0 : t.amount < 0));

  const grouped = new Map();
  for (const tx of pool) {
    const key = matchKeyOf(tx);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(tx);
  }

  const series = [];
  for (const [key, txs] of grouped) {
    const amounts    = txs.map(t => Math.abs(t.amount));
    const avg        = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const monthsSeen = new Set(txs.map(t => t.date.slice(0, 7)));

    if (isDebit) {
      if (txs.length < 3) continue;
      if (!amounts.every(a => Math.abs(a - avg) <= avg * 0.15)) continue;
      if (monthsSeen.size < 3) continue;
    } else {
      if (monthsSeen.size < 2) continue;
      if (avg < 200) continue;
    }

    series.push({
      key,
      direction,
      label:      txs[0].merchant_name || cleanLabel(txs[0]) ||
                  (isDebit ? 'Recurring payment' : 'Recurring deposit'),
      avgAmount:  Math.round(avg),
      minAmount:  Math.round(Math.min(...amounts)),
      maxAmount:  Math.round(Math.max(...amounts)),
      varies:     Math.max(...amounts) - Math.min(...amounts) > avg * 0.15,
      count:      txs.length,
      monthsPaid: [...monthsSeen].sort(),
    });
  }
  return series;
}

/**
 * Index overrides for lookup by all three identities a transaction may present.
 * Built once per resolve() call rather than scanned per transaction, so a large
 * account stays O(n) instead of O(n*m).
 */
function indexOverrides(overrides) {
  const byTxId        = new Map();
  const byFingerprint = new Map();
  for (const o of overrides) {
    if (o.plaidTransactionId) byTxId.set(o.plaidTransactionId, o);
    if (o.fingerprint)        byFingerprint.set(o.fingerprint, o);
  }
  return { byTxId, byFingerprint };
}

/** Rules are scoped to an account so the same payer can mean different things at different banks. */
function indexRules(rules, accountId) {
  const byKey = new Map();
  for (const r of rules) {
    if (r.accountId !== accountId) continue;
    byKey.set(r.matchKey, r);
  }
  return byKey;
}

/**
 * Resolve every transaction to a property, to "personal", or to unassigned.
 *
 * @param {object}   args
 * @param {Array}    args.transactions
 * @param {string}   args.accountId
 * @param {string[]} args.claimantIds  — property ids linked to this account
 * @param {Array}    args.rules
 * @param {Array}    args.overrides
 * @returns {Map<string, {target, propertyId, source, matchKey}>} keyed by transaction_id
 */
export function resolveAssignments({
  transactions = [],
  accountId,
  claimantIds = [],
  rules = [],
  overrides = [],
} = {}) {
  const { byTxId, byFingerprint } = indexOverrides(overrides);
  const rulesByKey = indexRules(rules, accountId);

  // Auto-attribution applies only when the account is unambiguous. With two or
  // more claimants there is no safe default, so unmatched transactions fall
  // through to unassigned rather than being guessed at.
  const soleClaimant = claimantIds.length === 1 ? claimantIds[0] : null;

  const out = new Map();
  for (const tx of transactions) {
    const matchKey = matchKeyOf(tx);

    // 1. Override — check the current id, the id this row replaced when it
    //    posted, and finally the content fingerprint.
    const override =
      byTxId.get(tx.transaction_id) ||
      (tx.pending_transaction_id ? byTxId.get(tx.pending_transaction_id) : null) ||
      byFingerprint.get(fingerprintOf(tx, accountId));

    if (override) {
      out.set(tx.transaction_id, {
        target:     override.target,
        propertyId: override.target === TARGET_PROPERTY ? String(override.propertyId) : null,
        source:     SOURCE_OVERRIDE,
        matchKey,
      });
      continue;
    }

    // 2. Rule — covers the whole series, including occurrences not yet seen.
    const rule = rulesByKey.get(matchKey);
    if (rule) {
      out.set(tx.transaction_id, {
        target:     rule.target,
        propertyId: rule.target === TARGET_PROPERTY ? String(rule.propertyId) : null,
        source:     SOURCE_RULE,
        matchKey,
      });
      continue;
    }

    // 3. Sole claimant — unambiguous, so no user input is needed.
    if (soleClaimant) {
      out.set(tx.transaction_id, {
        target:     TARGET_PROPERTY,
        propertyId: String(soleClaimant),
        source:     SOURCE_SOLE_CLAIMANT,
        matchKey,
      });
      continue;
    }

    // 4. Ambiguous — counts for nobody until the user decides.
    out.set(tx.transaction_id, {
      target:     null,
      propertyId: null,
      source:     SOURCE_UNASSIGNED,
      matchKey,
    });
  }
  return out;
}

/**
 * Filter a transaction list down to the ones belonging to one property.
 * Transactions marked personal or left unassigned are excluded by design.
 */
export function transactionsForProperty(transactions, assignments, propertyId) {
  const want = String(propertyId);
  return transactions.filter(tx => {
    const a = assignments.get(tx.transaction_id);
    return a && a.target === TARGET_PROPERTY && a.propertyId === want;
  });
}

/**
 * Propose rules for series that are still unassigned on a shared account.
 *
 * Suggestions are never applied automatically. A wrong guess silently moves
 * income between properties and is very hard to spot afterwards, so the user
 * confirms once and the resulting rule then covers the whole series.
 *
 * @returns {Array} { matchKey, direction, label, avgAmount, count, propertyId,
 *                    propertyAddress, confidence, reason }
 */
export function suggestAssignments({
  transactions = [],
  accountId,
  claimants = [],          // [{ id, address, expectedRent, expectedMortgage }]
  rules = [],
  overrides = [],
} = {}) {
  if (claimants.length < 2) return [];   // nothing ambiguous to resolve

  const assignments = resolveAssignments({
    transactions, accountId,
    claimantIds: claimants.map(c => String(c.id)),
    rules, overrides,
  });

  // Only look at series that are still genuinely undecided.
  const unresolved = transactions.filter(
    tx => assignments.get(tx.transaction_id)?.source === SOURCE_UNASSIGNED
  );
  if (!unresolved.length) return [];

  const suggestions = [];
  const seen = new Set();

  const consider = (series, kind) => {
    for (const s of series) {
      if (seen.has(s.key)) continue;

      // Score every claimant against the figure this series would represent.
      const scored = claimants
        .map(c => {
          const expected = kind === 'rent' ? c.expectedRent : c.expectedMortgage;
          if (!expected || expected <= 0) return null;
          const ratio = s.avgAmount / expected;
          return { claimant: c, expected, delta: Math.abs(ratio - 1) };
        })
        .filter(Boolean)
        .sort((a, b) => a.delta - b.delta);

      if (!scored.length) continue;

      const best = scored[0];
      if (best.delta > 0.2) continue;          // no claimant is a plausible match

      // A match only means something if it is clearly better than the
      // alternatives. Two properties renting at $2,000 are indistinguishable by
      // amount alone, and guessing between them is worse than asking.
      const runnerUp   = scored[1];
      const ambiguous  = runnerUp && Math.abs(runnerUp.delta - best.delta) < 0.05;
      if (ambiguous) continue;

      const confidence = best.delta <= 0.05 ? 'high' : best.delta <= 0.12 ? 'medium' : 'low';

      seen.add(s.key);
      suggestions.push({
        matchKey:        s.key,
        direction:       s.direction,
        label:           s.label,
        avgAmount:       s.avgAmount,
        count:           s.count,
        propertyId:      String(best.claimant.id),
        propertyAddress: best.claimant.address,
        confidence,
        reason: kind === 'rent'
          ? `Deposits average ${fmtUsd(s.avgAmount)}, within ${pct(best.delta)} of the ${fmtUsd(best.expected)} expected rent`
          : `Payments average ${fmtUsd(s.avgAmount)}, within ${pct(best.delta)} of the ${fmtUsd(best.expected)} expected mortgage`,
      });
    }
  };

  consider(detectSeries(unresolved, { direction: 'credit' }), 'rent');
  consider(detectSeries(unresolved, { direction: 'debit'  }), 'mortgage');

  const rank = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
}

const fmtUsd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct    = (delta) => `${Math.round(delta * 100)}%`;
