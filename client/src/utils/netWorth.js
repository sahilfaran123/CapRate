/**
 * Net worth math — shared so every surface reports the same numbers.
 *
 * Two figures, deliberately kept distinct:
 *
 *   grossAssetValue — everything you own at face value: cash + investments +
 *                     the full estimated market value of every property. Debt
 *                     is ignored. Useful for "how big is the portfolio".
 *
 *   trueNetWorth    — what you'd actually walk away with: gross asset value
 *                     minus every debt we know about — the remaining mortgage
 *                     on each property, plus credit card and loan balances.
 *
 * The gap between the two is exactly `totalDebt`.
 */

// Plaid reports credit-card and loan balances as POSITIVE amounts owed. Summing
// them into a "banking" total the way a checking balance is summed makes debt
// increase net worth, so they have to be separated out first.
const LIABILITY_TYPES = new Set(['credit', 'loan']);

export const isLiabilityAccount = (a) => LIABILITY_TYPES.has(a?.type);

/**
 * A mortgage linked through Plaid is already reflected in its property's equity
 * (estimated value − remaining balance), so counting it again here would
 * subtract the same debt twice. HELOCs and home equity loans are NOT excluded:
 * the amortization engine only models the original purchase mortgage, so that
 * debt is genuinely unaccounted for elsewhere.
 */
export const isMortgageAccount = (a) =>
  a?.type === 'loan' && /mortgage/i.test(a?.subtype || '');

const sumBalances = (accounts) =>
  accounts.reduce((s, a) => s + (a.balances?.current || 0), 0);

/**
 * A property with no equity figure is not always a problem. `calcEquity` returns
 * null both when mortgage details are missing AND when the loan amount is zero
 * (an all-cash purchase). In the cash case the full value IS the equity and no
 * warning is warranted — only flag the genuinely unknown ones.
 */
function isCashPurchase(property) {
  const { purchasePrice, downPayment } = property?.userInputs || {};
  return purchasePrice > 0 && downPayment >= purchasePrice;
}

export function summarizeNetWorth({
  bankAccounts   = [],
  investAccounts = [],
  properties     = [],
} = {}) {
  // ── Accounts: split assets from debts ──
  const cashAccounts      = bankAccounts.filter(a => !isLiabilityAccount(a));
  const debtAccounts      = bankAccounts.filter(a => isLiabilityAccount(a) && !isMortgageAccount(a));
  const excludedMortgages = bankAccounts.filter(isMortgageAccount);

  const cashTotal    = sumBalances(cashAccounts);
  const investTotal  = sumBalances(investAccounts);
  const accountDebt  = sumBalances(debtAccounts);

  // ── Properties: gross value vs. owned equity ──
  let propGrossTotal  = 0;
  let propEquityTotal = 0;
  let propsMissingEquity = 0;

  for (const p of properties) {
    const value  = p.estimatedValue || 0;
    const equity = p.equity?.currentEquity;

    propGrossTotal += value;

    if (equity != null) {
      propEquityTotal += equity;
    } else {
      // Unknown mortgage → fall back to full value so the number stays usable,
      // but remember to tell the user it is not debt-adjusted.
      propEquityTotal += value;
      if (!isCashPurchase(p)) propsMissingEquity++;
    }
  }

  const mortgageDebt = Math.max(0, propGrossTotal - propEquityTotal);
  const totalDebt    = accountDebt + mortgageDebt;

  const grossAssetValue = cashTotal + investTotal + propGrossTotal;
  const trueNetWorth    = cashTotal + investTotal + propEquityTotal - accountDebt;

  return {
    trueNetWorth,
    grossAssetValue,
    cashTotal,
    investTotal,
    propGrossTotal,
    propEquityTotal,
    accountDebt,
    mortgageDebt,
    totalDebt,
    debtAccounts,
    excludedMortgages,
    // True when at least one property is counted at full value because its
    // mortgage details are missing — trueNetWorth is overstated by that much.
    propsMissingEquity,
    isEquityComplete: propsMissingEquity === 0,
  };
}
