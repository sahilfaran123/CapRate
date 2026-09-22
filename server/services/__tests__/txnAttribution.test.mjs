import {
  normalizeDescriptor, matchKeyOf, fingerprintOf, detectSeries,
  resolveAssignments, transactionsForProperty, suggestAssignments,
  TARGET_PROPERTY, TARGET_PERSONAL,
  SOURCE_OVERRIDE, SOURCE_RULE, SOURCE_SOLE_CLAIMANT, SOURCE_UNASSIGNED,
} from '../txnAttribution.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  else console.log(`pass  ${name}`);
};

const PROP_A = '65a000000000000000000001';
const PROP_B = '65a000000000000000000002';
const ACCT   = 'acct_shared';

// Build 6 months of transactions for a given descriptor/amount
const series = (name, amount, { months = 6, idPrefix = 'tx' } = {}) =>
  Array.from({ length: months }, (_, i) => ({
    transaction_id: `${idPrefix}_${name}_${i}`,
    account_id: ACCT,
    date: `2025-0${i + 1}-05`,
    amount,
    name,
    merchant_name: null,
  }));

// ── 1. Descriptor normalization ────────────────────────────────────────────
eq('ACH originator extracted',
  normalizeDescriptor({ name: 'ORIG CO NAME:TCS MGT LLC 3135 ORIG ID:471634599 DESC DATE:260820 CO ENTRY' }),
  'tcs mgt llc');
eq('merchant_name preferred',
  normalizeDescriptor({ name: 'WHATEVER', merchant_name: '  Chase Mortgage ' }),
  'chase mortgage');
eq('digits stripped so dates do not fragment a series',
  normalizeDescriptor({ name: 'RENT DEPOSIT 20250105' }),
  'rent');

// Same payer, different trace ids, must collapse to ONE key
const k1 = matchKeyOf({ name: 'ORIG CO NAME:TCS MGT LLC 3135 ORIG ID:471634599 DESC DATE:260820', amount: -2000 });
const k2 = matchKeyOf({ name: 'ORIG CO NAME:TCS MGT LLC 3135 ORIG ID:999999999 DESC DATE:260920', amount: -2050 });
eq('same payer collapses to one key across trace ids', k1 === k2, true);

// ── 2. Fingerprint stability ───────────────────────────────────────────────
const pendingTx = { transaction_id: 'pend_1', account_id: ACCT, date: '2025-06-05', amount: 1500, name: 'CHASE MORTGAGE' };
const postedTx  = { transaction_id: 'post_1', account_id: ACCT, date: '2025-06-05', amount: 1500, name: 'CHASE MORTGAGE',
                    pending_transaction_id: 'pend_1' };
eq('fingerprint identical across pending -> posted',
  fingerprintOf(pendingTx, ACCT) === fingerprintOf(postedTx, ACCT), true);
eq('fingerprint uses integer cents (no float drift)',
  fingerprintOf({ date: '2025-01-01', amount: 0.1 + 0.2, name: 'X' }, 'a'),
  'a|2025-01-01|30|x');

// ── 3. Sole claimant auto-attribution ──────────────────────────────────────
const txs = [...series('CHASE MORTGAGE', 1500), ...series('TCS MGT LLC', -2000)];
let res = resolveAssignments({ transactions: txs, accountId: ACCT, claimantIds: [PROP_A] });
eq('sole claimant assigns everything',
  [...res.values()].every(a => a.target === TARGET_PROPERTY && a.propertyId === PROP_A), true);
eq('sole claimant source is labelled',
  [...res.values()].every(a => a.source === SOURCE_SOLE_CLAIMANT), true);

// ── 4. Two claimants -> nothing guessed ────────────────────────────────────
res = resolveAssignments({ transactions: txs, accountId: ACCT, claimantIds: [PROP_A, PROP_B] });
eq('shared account leaves everything unassigned',
  [...res.values()].every(a => a.source === SOURCE_UNASSIGNED && a.propertyId === null), true);

// ── 5. Rules ───────────────────────────────────────────────────────────────
const mortgageKey = matchKeyOf({ name: 'CHASE MORTGAGE', amount: 1500 });
const rules = [{ accountId: ACCT, matchKey: mortgageKey, target: TARGET_PROPERTY, propertyId: PROP_B }];
res = resolveAssignments({ transactions: txs, accountId: ACCT, claimantIds: [PROP_A, PROP_B], rules });
const mortgageRows = txs.filter(t => t.name === 'CHASE MORTGAGE');
eq('rule assigns the whole series',
  mortgageRows.every(t => res.get(t.transaction_id).propertyId === PROP_B), true);
eq('rule source labelled', res.get(mortgageRows[0].transaction_id).source, SOURCE_RULE);
eq('non-matching series still unassigned',
  res.get(txs.find(t => t.name === 'TCS MGT LLC').transaction_id).source, SOURCE_UNASSIGNED);

// Rule scoped to a DIFFERENT account must not leak
res = resolveAssignments({
  transactions: txs, accountId: ACCT, claimantIds: [PROP_A, PROP_B],
  rules: [{ accountId: 'other_acct', matchKey: mortgageKey, target: TARGET_PROPERTY, propertyId: PROP_B }],
});
eq('rule from another account does not apply',
  res.get(mortgageRows[0].transaction_id).source, SOURCE_UNASSIGNED);

// ── 6. Overrides beat rules ────────────────────────────────────────────────
res = resolveAssignments({
  transactions: txs, accountId: ACCT, claimantIds: [PROP_A, PROP_B], rules,
  overrides: [{ plaidTransactionId: mortgageRows[0].transaction_id, target: TARGET_PROPERTY, propertyId: PROP_A }],
});
eq('override wins over rule', res.get(mortgageRows[0].transaction_id).propertyId, PROP_A);
eq('override source labelled', res.get(mortgageRows[0].transaction_id).source, SOURCE_OVERRIDE);
eq('siblings still follow the rule', res.get(mortgageRows[1].transaction_id).propertyId, PROP_B);

// Override survives pending -> posted via pending_transaction_id
res = resolveAssignments({
  transactions: [postedTx], accountId: ACCT, claimantIds: [PROP_A, PROP_B],
  overrides: [{ plaidTransactionId: 'pend_1', target: TARGET_PROPERTY, propertyId: PROP_A }],
});
eq('override follows pending -> posted by pending_transaction_id',
  res.get('post_1').propertyId, PROP_A);

// Override survives even when BOTH ids are unknown, via fingerprint
res = resolveAssignments({
  transactions: [postedTx], accountId: ACCT, claimantIds: [PROP_A, PROP_B],
  overrides: [{ fingerprint: fingerprintOf(pendingTx, ACCT), target: TARGET_PROPERTY, propertyId: PROP_B }],
});
eq('override recovered by fingerprint when ids are gone',
  res.get('post_1').propertyId, PROP_B);

// ── 7. Personal exclusion ──────────────────────────────────────────────────
res = resolveAssignments({
  transactions: txs, accountId: ACCT, claimantIds: [PROP_A],
  rules: [{ accountId: ACCT, matchKey: mortgageKey, target: TARGET_PERSONAL }],
});
eq('personal rule overrides sole-claimant auto-attribution',
  res.get(mortgageRows[0].transaction_id).target, TARGET_PERSONAL);
eq('personal transactions excluded from the property subset',
  transactionsForProperty(txs, res, PROP_A).some(t => t.name === 'CHASE MORTGAGE'), false);
eq('non-personal still included',
  transactionsForProperty(txs, res, PROP_A).length, 6);

// ── 8. Series detection thresholds ─────────────────────────────────────────
eq('debit series needs 3+ occurrences',
  detectSeries(series('X BILL', 500, { months: 2 }), { direction: 'debit' }).length, 0);
eq('debit series detected at 3',
  detectSeries(series('X BILL', 500, { months: 3 }), { direction: 'debit' }).length, 1);
eq('inconsistent debit amounts rejected',
  detectSeries([
    { transaction_id: 'a', date: '2025-01-05', amount: 100, name: 'VAR' },
    { transaction_id: 'b', date: '2025-02-05', amount: 900, name: 'VAR' },
    { transaction_id: 'c', date: '2025-03-05', amount: 400, name: 'VAR' },
  ], { direction: 'debit' }).length, 0);
eq('credit series tolerates varying amounts (PM nets out fees)',
  detectSeries([
    { transaction_id: 'a', date: '2025-01-05', amount: -2000, name: 'TCS MGT' },
    { transaction_id: 'b', date: '2025-02-05', amount: -1650, name: 'TCS MGT' },
    { transaction_id: 'c', date: '2025-03-05', amount: -2000, name: 'TCS MGT' },
  ], { direction: 'credit' }).length, 1);
eq('trivial deposits ignored',
  detectSeries([
    { transaction_id: 'a', date: '2025-01-05', amount: -50, name: 'VENMO' },
    { transaction_id: 'b', date: '2025-02-05', amount: -50, name: 'VENMO' },
  ], { direction: 'credit' }).length, 0);

// ── 9. Suggestions ─────────────────────────────────────────────────────────
const claimants = [
  { id: PROP_A, address: '1 A St', expectedRent: 2000, expectedMortgage: 1500 },
  { id: PROP_B, address: '2 B St', expectedRent: 3200, expectedMortgage: 2400 },
];
let sugg = suggestAssignments({ transactions: txs, accountId: ACCT, claimants });
const rentSugg = sugg.find(s => s.direction === 'credit');
eq('rent series suggested for the matching property', rentSugg?.propertyId, PROP_A);
eq('confident match flagged high', rentSugg?.confidence, 'high');
eq('mortgage series suggested for the matching property',
  sugg.find(s => s.direction === 'debit')?.propertyId, PROP_A);

// Ambiguity: two properties with the SAME expected rent -> refuse to guess
sugg = suggestAssignments({
  transactions: series('TCS MGT LLC', -2000), accountId: ACCT,
  claimants: [
    { id: PROP_A, address: '1 A St', expectedRent: 2000 },
    { id: PROP_B, address: '2 B St', expectedRent: 2000 },
  ],
});
eq('identical expectations produce no suggestion', sugg.length, 0);

// No suggestions for a single-property account (nothing is ambiguous)
eq('single claimant yields no suggestions',
  suggestAssignments({ transactions: txs, accountId: ACCT, claimants: [claimants[0]] }).length, 0);

// Already-resolved series are not re-suggested
eq('series covered by a rule is not suggested again',
  suggestAssignments({ transactions: txs, accountId: ACCT, claimants, rules })
    .some(s => s.matchKey === mortgageKey), false);

// Nothing plausible -> no guess
eq('wildly mismatched amounts produce no suggestion',
  suggestAssignments({
    transactions: series('RANDOM CO', -47), accountId: ACCT, claimants,
  }).length, 0);

// ── 10. The invariant this feature exists to protect ───────────────────────
// Two properties on one account must PARTITION it: no transaction may be
// counted by both (the double-count bug), and none may be silently dropped.
{
  const rentA = series('TCS MGT LLC', -2000, { idPrefix: 'a' });
  const rentB = series('ACME PROPERTIES', -3200, { idPrefix: 'b' });
  const all   = [...rentA, ...rentB];

  const partitionRules = [
    { accountId: ACCT, matchKey: matchKeyOf(rentA[0]), target: TARGET_PROPERTY, propertyId: PROP_A },
    { accountId: ACCT, matchKey: matchKeyOf(rentB[0]), target: TARGET_PROPERTY, propertyId: PROP_B },
  ];

  const r = resolveAssignments({
    transactions: all, accountId: ACCT,
    claimantIds: [PROP_A, PROP_B], rules: partitionRules,
  });
  const forA = transactionsForProperty(all, r, PROP_A);
  const forB = transactionsForProperty(all, r, PROP_B);

  const idsA = new Set(forA.map(t => t.transaction_id));
  eq('no transaction counted by both properties',
    forB.filter(t => idsA.has(t.transaction_id)).length, 0);
  eq('subsets sum to the whole account', forA.length + forB.length, all.length);
  eq('each property sees only its own rent',
    [Math.abs(forA[0].amount), Math.abs(forB[0].amount)], [2000, 3200]);
  // Before partitioning, BOTH properties saw ALL 12 transactions — that total
  // (24) is the over-count this replaces.
  eq('partitioning removes the naive double-count',
    forA.length + forB.length < all.length * 2, true);
}

// Sole-claimant accounts must lose nothing — the common case stays intact.
{
  const all = [...series('CHASE MORTGAGE', 1500), ...series('TCS MGT LLC', -2000)];
  const r = resolveAssignments({ transactions: all, accountId: ACCT, claimantIds: [PROP_A] });
  eq('single-property account keeps every transaction',
    transactionsForProperty(all, r, PROP_A).length, all.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
