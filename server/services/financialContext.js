import { plaidClient } from './plaidClient.js';
import User from '../models/User.js';

// VERSION: 2.0 — uses findById, full data snapshot
export async function buildFinancialContext(userId) {
  

  const user = await User.findById(userId);
  

  if (!user) {
    return { summary: 'No user account found.', data: {} };
  }

  if (!user.plaidItems?.length && !user.realEstateProperties?.length) {
    return {
      summary: 'The user has no financial accounts or properties connected yet. Ask them to connect accounts via the Dashboard.',
      data: { empty: true },
    };
  }

  const context = {
    banking:      [],
    investments:  [],
    holdings:     [],
    transactions: [],
    realestate:   [],
    errors:       [],
  };

  // ── Fetch account balances ────────────────────────────────────────────────
  for (const item of user.plaidItems || []) {
    try {
      const res = await plaidClient.accountsBalanceGet({ access_token: item.accessToken });
      

      for (const acct of res.data.accounts || []) {
        const entry = {
          accountId:    acct.account_id,
          name:         acct.name,
          officialName: acct.official_name || null,
          institution:  item.institutionName,
          type:         acct.type,
          subtype:      acct.subtype,
          balance:      acct.balances?.current  ?? 0,
          available:    acct.balances?.available ?? null,
          limit:        acct.balances?.limit     ?? null,
          mask:         acct.mask || null,
        };
        if (acct.type === 'investment') {
          context.investments.push(entry);
        } else {
          context.banking.push(entry);
        }
      }
    } catch (err) {
      const code = err.response?.data?.error_code;
      if (code === 'ITEM_LOGIN_REQUIRED' || code === 'INVALID_ACCESS_TOKEN') {
        context.errors.push(`${item.institutionName}: connection expired`);
      } else {
        context.errors.push(`${item.institutionName}: ${err.message}`);
      }
    }
  }

  // ── Fetch holdings ────────────────────────────────────────────────────────
  for (const item of user.plaidItems || []) {
    try {
      const res    = await plaidClient.investmentsHoldingsGet({ access_token: item.accessToken });
      const secMap = {};
      (res.data.securities || []).forEach(s => { secMap[s.security_id] = s; });
      for (const h of res.data.holdings || []) {
        const sec = secMap[h.security_id] || {};
        context.holdings.push({
          accountId:    h.account_id,
          accountName:  context.investments.find(a => a.accountId === h.account_id)?.name || 'Investment Account',
          institution:  item.institutionName,
          ticker:       sec.ticker_symbol || null,
          securityName: sec.name || 'Unknown',
          type:         sec.type || 'unknown',
          quantity:     h.quantity ?? 0,
          price:        h.institution_price ?? 0,
          value:        h.institution_value ?? 0,
          costBasis:    h.cost_basis ?? null,
          gainLoss:     h.cost_basis != null ? (h.institution_value ?? 0) - h.cost_basis : null,
          gainLossPct:  h.cost_basis && h.cost_basis > 1
            ? (((h.institution_value - h.cost_basis) / h.cost_basis) * 100).toFixed(2)
            : null,
        });
      }
    } catch (_) { /* holdings may not be available */ }
  }

  // ── Fetch transactions (last 90 days) ─────────────────────────────────────
  const end   = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

  for (const item of user.plaidItems || []) {
    try {
      const res = await plaidClient.transactionsGet({
        access_token: item.accessToken,
        start_date:   start,
        end_date:     end,
        options:      { count: 500, offset: 0 },
      });
      for (const tx of res.data.transactions || []) {
        const acct = [...context.banking, ...context.investments].find(a => a.accountId === tx.account_id);
        context.transactions.push({
          date:        tx.date,
          accountId:   tx.account_id,
          accountName: acct?.name || 'Unknown Account',
          institution: item.institutionName,
          name:        tx.merchant_name || tx.name,
          amount:      tx.amount,
          category:    tx.personal_finance_category?.primary || tx.category?.[0] || 'Uncategorized',
          subCategory: tx.personal_finance_category?.detailed || tx.category?.[1] || null,
        });
      }
    } catch (_) { /* transactions may not be available */ }
  }

  // ── Transaction analytics ─────────────────────────────────────────────────
  const last7Days  = new Date(Date.now() -  7 * 86400000).toISOString().split('T')[0];
  const last30Days = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const buildCategoryTotals = (days) => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const totals = {};
    context.transactions.filter(t => t.date >= cutoff && t.amount > 0).forEach(t => {
      if (!totals[t.category]) totals[t.category] = { total: 0, transactions: [] };
      totals[t.category].total += t.amount;
      totals[t.category].transactions.push({ date: t.date, name: t.name, amount: t.amount });
    });
    return totals;
  };

  const categories7d  = buildCategoryTotals(7);
  const categories30d = buildCategoryTotals(30);

  const monthlyIncome   = context.transactions.filter(t => t.date >= last30Days && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const monthlyExpenses = context.transactions.filter(t => t.date >= last30Days && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const weeklyIncome    = context.transactions.filter(t => t.date >= last7Days  && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const weeklyExpenses  = context.transactions.filter(t => t.date >= last7Days  && t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const accountSummaries = {};
  context.transactions.filter(t => t.date >= last30Days).forEach(tx => {
    if (!accountSummaries[tx.accountId]) {
      accountSummaries[tx.accountId] = { accountName: tx.accountName, institution: tx.institution, income: 0, expenses: 0, txCount: 0 };
    }
    if (tx.amount < 0) accountSummaries[tx.accountId].income   += Math.abs(tx.amount);
    else               accountSummaries[tx.accountId].expenses  += tx.amount;
    accountSummaries[tx.accountId].txCount++;
  });

  // ── Real estate ───────────────────────────────────────────────────────────
  for (const prop of user.realEstateProperties || []) {
    const inputs   = prop.userInputs || {};
    const value    = prop.estimatedValue ?? 0;
    const rent     = inputs.actualMonthlyRent ?? 0;
    const expenses = (inputs.monthlyMortgage ?? 0) + (inputs.monthlyHOA ?? 0)
                   + (inputs.monthlyInsurance ?? 0) + (inputs.monthlyPropertyTax ?? 0)
                   + (inputs.monthlyMaintenance ?? 0);
    const cashFlow = rent - expenses;

    // ── Bank-verified actuals ──
    // Cached snapshot derived from real transactions on the linked account.
    // Without this the advisor can only ever see the user's entered estimates,
    // so it cannot answer "how do my actual returns compare to expected?".
    const a = prop.actuals && prop.actuals.computedAt ? prop.actuals : null;
    const hasActual = !!(a && a.monthlyCashFlow != null);
    const actualData = hasActual ? {
      monthlyCashFlow: a.monthlyCashFlow,
      annualCashFlow:  a.annualCashFlow ?? a.monthlyCashFlow * 12,
      monthlyRent:     a.monthlyRent ?? null,
      monthsAnalyzed:  a.monthsAnalyzed ?? null,
      excludedCount:   a.excludedCount ?? 0,
      accountBalance:  a.currentBalance ?? null,
      monthsOfReserve: a.monthsOfReserve ?? null,
      vacancyCount:    a.vacancyCount ?? 0,
      asOf:            a.computedAt,
    } : null;

    // Variance between what the user expects and what the bank actually shows
    const variance = (hasActual && rent > 0)
      ? { monthly: a.monthlyCashFlow - cashFlow, annual: (a.monthlyCashFlow - cashFlow) * 12 }
      : null;

    // ── Cash-on-cash return ──
    // Computed on BOTH bases so the advisor can compare them directly.
    const cocEstimated = (inputs.downPayment > 0 && rent > 0)
      ? +(((cashFlow * 12) / inputs.downPayment) * 100).toFixed(1)
      : null;
    const cocActual = (inputs.downPayment > 0 && hasActual)
      ? +((((a.annualCashFlow ?? a.monthlyCashFlow * 12)) / inputs.downPayment) * 100).toFixed(1)
      : null;

    // ── Cap rate ──
    // Prefer the owner's real figures over RentCast's market estimate.
    // NOI excludes the mortgage — cap rate measures the property, not the financing.
    let capRate = null, capRateSource = null;
    if (rent > 0 && value > 0) {
      const operating = (inputs.monthlyHOA ?? 0) + (inputs.monthlyInsurance ?? 0)
                      + (inputs.monthlyPropertyTax ?? 0) + (inputs.monthlyMaintenance ?? 0);
      const noi = rent - operating;
      if (noi > 0) {
        capRate = +(((noi * 12) / value) * 100).toFixed(2);
        capRateSource = 'your entered figures';
      }
    }
    if (capRate == null && prop.data?.capRate) {
      capRate = parseFloat(prop.data.capRate);
      capRateSource = 'RentCast market estimate';
    }

    // ── Logged events (vacancies, one-time expenses/income) ──
    const currentYear = new Date().getFullYear();
    const yearEvents  = (prop.events || []).filter(e => new Date(e.date).getFullYear() === currentYear);
    const eventSummary = yearEvents.length ? {
      count: yearEvents.length,
      vacancyLoss:   yearEvents.filter(e => e.type === 'vacancy').reduce((s, e) => s + e.amount, 0),
      oneTimeExpense: yearEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0),
      oneTimeIncome:  yearEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0),
      items: yearEvents
        .sort((x, y) => new Date(y.date) - new Date(x.date))
        .slice(0, 10)
        .map(e => ({
          date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          type: e.type,
          amount: e.amount,
          description: e.description || null,
          category: e.category || null,
        })),
    } : null;

    let appreciation = null;
    if (inputs.purchasePrice && value) appreciation = value - inputs.purchasePrice;
    else if (prop.data?.appreciation) appreciation = prop.data.appreciation;

    let equityData = null;
    if (inputs.purchasePrice && inputs.downPayment && inputs.interestRate) {
      const loanAmount = inputs.purchasePrice - inputs.downPayment;
      const r          = (inputs.interestRate / 100) / 12;
      const n          = (inputs.loanTermYears || 30) * 12;
      let monthsPaid   = 0;
      if (inputs.purchaseDate) {
        const s = new Date(inputs.purchaseDate);
        const now = new Date();
        monthsPaid = Math.max(0, (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth()));
      }
      const powN = Math.pow(1 + r, n);
      const powK = Math.pow(1 + r, Math.min(monthsPaid, n));
      const remaining = Math.max(0, loanAmount * (powN - powK) / (powN - 1));
      equityData = {
        currentEquity:          Math.round(value - remaining),
        remainingBalance:       Math.round(remaining),
        equityFromPaydown:      Math.round(loanAmount - remaining),
        equityFromAppreciation: Math.round(value - (inputs.purchasePrice || value)),
        ltv:                    ((remaining / value) * 100).toFixed(1),
        monthsPaid,
        yearsOwned:             (monthsPaid / 12).toFixed(1),
      };
    }

    context.realestate.push({
      address:      prop.address,
      value,
      appreciation,
      rent:         rent || null,
      expenseBreakdown: {
        mortgage:    inputs.monthlyMortgage    || null,
        hoa:         inputs.monthlyHOA         || null,
        insurance:   inputs.monthlyInsurance   || null,
        propertyTax: inputs.monthlyPropertyTax || null,
        maintenance: inputs.monthlyMaintenance || null,
        total:       expenses || null,
      },
      cashFlow:      rent > 0 ? cashFlow : null,
      // Bank-verified figures and how they compare to the estimate
      actual:        actualData,
      variance,
      cocEstimated,
      cocActual,
      linkedAccount: prop.linkedAccountName || null,
      isLinked:      !!prop.linkedAccountId,
      events:        eventSummary,
      purchasePrice: inputs.purchasePrice ?? null,
      downPayment:   inputs.downPayment   ?? null,
      interestRate:  inputs.interestRate  ?? null,
      loanTermYears: inputs.loanTermYears ?? null,
      purchaseDate:  inputs.purchaseDate ? new Date(inputs.purchaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null,
      capRate,
      capRateSource,
      equity:        equityData,
    });
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  // Two net worth figures, matching the Dashboard exactly:
  //   grossAssetValue — face value of everything owned, debt ignored
  //   netWorth        — equity-adjusted, minus card/loan debt (the real one)
  //
  // Plaid reports credit-card and loan balances as POSITIVE amounts owed, so
  // they are split out of banking rather than summed into it — otherwise debt
  // would increase net worth. Mortgage-subtype loans are skipped because each
  // property's equity already nets out its mortgage.
  const isLiability = (a) => a.type === 'credit' || a.type === 'loan';
  const isMortgage  = (a) => a.type === 'loan' && /mortgage/i.test(a.subtype || '');

  const cashAccounts = context.banking.filter(a => !isLiability(a));
  const debtAccounts = context.banking.filter(a => isLiability(a) && !isMortgage(a));

  const totalBanking     = cashAccounts.reduce((s, a) => s + a.balance, 0);
  const totalInvestments = context.investments.reduce((s, a) => s + a.balance, 0);
  const totalRealEstate  = context.realestate.reduce((s, p) => s + p.value, 0);
  const accountDebt      = debtAccounts.reduce((s, a) => s + a.balance, 0);
  const totalCashFlow    = context.realestate.reduce((s, p) => s + (p.cashFlow ?? 0), 0);

  // Equity per property, falling back to full value when the mortgage is
  // unknown. An all-cash purchase legitimately has no equity object, so it is
  // not counted as missing data.
  let totalEquity = 0;
  let propsMissingEquity = 0;
  for (const p of context.realestate) {
    const equity = p.equity?.currentEquity;
    if (equity != null) {
      totalEquity += equity;
    } else {
      totalEquity += p.value || 0;
      const isCashPurchase = p.purchasePrice > 0 && p.downPayment >= p.purchasePrice;
      if (!isCashPurchase) propsMissingEquity++;
    }
  }

  const mortgageDebt     = Math.max(0, totalRealEstate - totalEquity);
  const totalDebt        = accountDebt + mortgageDebt;
  const grossAssetValue  = totalBanking + totalInvestments + totalRealEstate;
  const netWorth         = totalBanking + totalInvestments + totalEquity - accountDebt;

  const summary = buildSummaryText({
    netWorth, grossAssetValue, totalBanking, totalInvestments, totalRealEstate,
    totalCashFlow, totalEquity,
    accountDebt, mortgageDebt, totalDebt, propsMissingEquity, debtAccounts,
    monthlyIncome:   Math.round(monthlyIncome),
    monthlyExpenses: Math.round(monthlyExpenses),
    weeklyIncome:    Math.round(weeklyIncome),
    weeklyExpenses:  Math.round(weeklyExpenses),
    banking:      context.banking,
    investments:  context.investments,
    holdings:     context.holdings,
    realestate:   context.realestate,
    categories7d,
    categories30d,
    accountSummaries: Object.values(accountSummaries),
    errors:       context.errors,
  });

  

  return { summary, data: { netWorth, grossAssetValue, totalBanking, totalInvestments, totalRealEstate, totalCashFlow, totalEquity, accountDebt, mortgageDebt, totalDebt, propsMissingEquity, banking: context.banking, investments: context.investments, holdings: context.holdings, realestate: context.realestate, errors: context.errors } };
}

function buildSummaryText(d) {
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);
  const lines = [];

  lines.push('═══════════════════════════════════════');
  lines.push(`NET WORTH (equity-adjusted): ${fmt(d.netWorth)}`);
  lines.push(`GROSS ASSET VALUE (before debt): ${fmt(d.grossAssetValue)}`);
  lines.push('═══════════════════════════════════════');
  lines.push('  NET WORTH is cash + investments + property EQUITY, minus credit');
  lines.push('  card and loan balances. This is the real figure — use it by');
  lines.push('  default when the user asks what they are worth.');
  lines.push('  GROSS ASSET VALUE ignores all debt. Only use it when the user');
  lines.push('  explicitly asks about total/gross asset value or portfolio size.');
  if (d.totalDebt > 0) {
    lines.push(`  TOTAL DEBT: ${fmt(d.totalDebt)} (${fmt(d.mortgageDebt)} mortgages, ${fmt(d.accountDebt)} cards & loans)`);
  }
  if (d.propsMissingEquity > 0) {
    lines.push(`  CAVEAT: ${d.propsMissingEquity} propert${d.propsMissingEquity === 1 ? 'y is' : 'ies are'} counted at full value`);
    lines.push('  because mortgage details are missing, so NET WORTH is overstated.');
  }
  lines.push('');

  lines.push('BANKING ACCOUNTS (cash — credit cards and loans listed separately below):');
  const debtIds  = new Set((d.debtAccounts || []).map(a => a.accountId));
  const cashOnly = d.banking.filter(a => !debtIds.has(a.accountId));
  if (!cashOnly.length) {
    lines.push('  No banking accounts data available.');
  } else {
    for (const acct of cashOnly) {
      lines.push(`  • ${acct.name} (${acct.institution})`);
      lines.push(`    Type: ${acct.subtype || acct.type}`);
      lines.push(`    Current balance: ${fmt(acct.balance)}`);
      if (acct.available != null && acct.available !== acct.balance) lines.push(`    Available: ${fmt(acct.available)}`);
      const s = d.accountSummaries?.find(x => x.accountName === acct.name);
      if (s) lines.push(`    Last 30 days: ${fmt(s.income)} income, ${fmt(s.expenses)} expenses (${s.txCount} transactions)`);
    }
  }
  lines.push(`  TOTAL CASH: ${fmt(d.totalBanking)}`);
  lines.push('');

  // Debt accounts get their own section so the balances are never mistaken for
  // assets. Plaid reports these as positive amounts owed.
  if (d.debtAccounts?.length) {
    lines.push('DEBT ACCOUNTS (balances are amounts OWED — these reduce net worth):');
    for (const acct of d.debtAccounts) {
      lines.push(`  • ${acct.name} (${acct.institution})`);
      lines.push(`    Type: ${acct.subtype || acct.type}`);
      lines.push(`    Balance owed: ${fmt(acct.balance)}`);
      if (acct.limit != null) {
        lines.push(`    Credit limit: ${fmt(acct.limit)}`);
        lines.push(`    Utilization: ${fmt(acct.balance)} / ${fmt(acct.limit)} (${((acct.balance / acct.limit) * 100).toFixed(0)}%)`);
      }
      const s = d.accountSummaries?.find(x => x.accountName === acct.name);
      if (s) lines.push(`    Last 30 days: ${fmt(s.income)} income, ${fmt(s.expenses)} expenses (${s.txCount} transactions)`);
    }
    lines.push(`  TOTAL CARD & LOAN DEBT: ${fmt(d.accountDebt)}`);
    lines.push('');
  }

  if (d.monthlyIncome > 0 || d.monthlyExpenses > 0) {
    lines.push('SPENDING SUMMARY:');
    lines.push(`  Last 7 days:  income ${fmt(d.weeklyIncome)}, expenses ${fmt(d.weeklyExpenses)}, net ${fmt(d.weeklyIncome - d.weeklyExpenses)}`);
    lines.push(`  Last 30 days: income ${fmt(d.monthlyIncome)}, expenses ${fmt(d.monthlyExpenses)}, net ${fmt(d.monthlyIncome - d.monthlyExpenses)}`);
    lines.push('');
  }

  if (d.categories7d && Object.keys(d.categories7d).length) {
    lines.push('SPENDING BY CATEGORY — LAST 7 DAYS:');
    for (const [cat, data] of Object.entries(d.categories7d).sort((a, b) => b[1].total - a[1].total)) {
      lines.push(`  • ${cat}: ${fmt(data.total)}`);
      for (const tx of data.transactions.slice(0, 5)) lines.push(`    - ${tx.date} | ${tx.name}: ${fmt(tx.amount)}`);
    }
    lines.push('');
  }

  if (d.categories30d && Object.keys(d.categories30d).length) {
    lines.push('SPENDING BY CATEGORY — LAST 30 DAYS:');
    for (const [cat, data] of Object.entries(d.categories30d).sort((a, b) => b[1].total - a[1].total)) {
      lines.push(`  • ${cat}: ${fmt(data.total)} (${data.transactions.length} transactions)`);
      for (const tx of data.transactions.slice(0, 3)) lines.push(`    - ${tx.date} | ${tx.name}: ${fmt(tx.amount)}`);
    }
    lines.push('');
  }

  lines.push('INVESTMENT ACCOUNTS:');
  if (!d.investments.length) {
    lines.push('  No investment accounts connected.');
  } else {
    for (const acct of d.investments) {
      lines.push(`  • ${acct.name} (${acct.institution})`);
      lines.push(`    Portfolio value: ${fmt(acct.balance)}`);
      if (acct.available != null) lines.push(`    Cash available: ${fmt(acct.available)}`);
      const acctHoldings = d.holdings.filter(h => h.accountId === acct.accountId);
      if (acctHoldings.length) {
        lines.push(`    Holdings (${acctHoldings.length} positions):`);
        for (const h of acctHoldings.sort((a, b) => b.value - a.value)) {
          const gl = h.gainLoss != null ? ` | G/L: ${h.gainLoss >= 0 ? '+' : ''}${fmt(h.gainLoss)}${h.gainLossPct ? ` (${h.gainLossPct}%)` : ''}` : '';
          lines.push(`      - ${h.ticker || h.securityName}: ${h.quantity?.toFixed(4)} shares @ ${fmt(h.price)} = ${fmt(h.value)}${gl}`);
        }
      }
    }
    lines.push(`  TOTAL PORTFOLIO: ${fmt(d.totalInvestments)}`);
  }
  lines.push('');

  lines.push('REAL ESTATE:');
  if (!d.realestate.length) {
    lines.push('  No properties added.');
  } else {
    for (const p of d.realestate) {
      lines.push(`  • ${p.address}`);
      lines.push(`    Current value: ${fmt(p.value)}`);
      if (p.appreciation != null) lines.push(`    Appreciation: ${p.appreciation >= 0 ? '+' : ''}${fmt(p.appreciation)}${p.purchaseDate ? ` since ${p.purchaseDate}` : ''}`);
      if (p.purchasePrice) { lines.push(`    Purchase price: ${fmt(p.purchasePrice)}`); lines.push(`    Down payment: ${fmt(p.downPayment)}`); }
      if (p.interestRate) lines.push(`    Mortgage: ${p.interestRate}% / ${p.loanTermYears || 30}-year`);
      if (p.rent) lines.push(`    Monthly rental income (your entered figure): ${fmt(p.rent)}`);
      const eb = p.expenseBreakdown || {};
      if (eb.total) {
        lines.push(`    Monthly expenses (your entered figures): ${fmt(eb.total)}`);
        if (eb.mortgage)    lines.push(`      - Mortgage: ${fmt(eb.mortgage)}`);
        if (eb.hoa)         lines.push(`      - HOA: ${fmt(eb.hoa)}`);
        if (eb.insurance)   lines.push(`      - Insurance: ${fmt(eb.insurance)}`);
        if (eb.propertyTax) lines.push(`      - Property tax: ${fmt(eb.propertyTax)}`);
        if (eb.maintenance) lines.push(`      - Maintenance: ${fmt(eb.maintenance)}`);
      }

      // ── ESTIMATED vs ACTUAL ──
      if (p.cashFlow != null) {
        lines.push(`    EXPECTED monthly cash flow (from entered figures): ${p.cashFlow >= 0 ? '+' : ''}${fmt(p.cashFlow)}`);
        lines.push(`    EXPECTED annual cash flow: ${p.cashFlow >= 0 ? '+' : ''}${fmt(p.cashFlow * 12)}`);
      }
      if (p.cocEstimated != null) lines.push(`    EXPECTED cash-on-cash return: ${p.cocEstimated}%`);

      if (p.isLinked && p.actual) {
        lines.push(`    ── Bank-verified actuals (linked account: ${p.linkedAccount || 'connected'}) ──`);
        lines.push(`    ACTUAL monthly cash flow: ${p.actual.monthlyCashFlow >= 0 ? '+' : ''}${fmt(p.actual.monthlyCashFlow)}`);
        lines.push(`    ACTUAL annual cash flow: ${p.actual.annualCashFlow >= 0 ? '+' : ''}${fmt(p.actual.annualCashFlow)}`);
        if (p.actual.monthlyRent != null) lines.push(`    ACTUAL rent received (avg): ${fmt(p.actual.monthlyRent)}/mo`);
        if (p.cocActual != null) lines.push(`    ACTUAL cash-on-cash return: ${p.cocActual}%`);
        if (p.variance) {
          lines.push(`    VARIANCE (actual minus expected): ${p.variance.monthly >= 0 ? '+' : ''}${fmt(p.variance.monthly)}/mo, ${p.variance.annual >= 0 ? '+' : ''}${fmt(p.variance.annual)}/yr`);
        }
        if (p.actual.monthsAnalyzed) {
          lines.push(`    Based on ${p.actual.monthsAnalyzed} complete month(s) of transactions${p.actual.excludedCount ? `, excluding ${p.actual.excludedCount} logged vacancy month(s)` : ''}`);
        }
        if (p.actual.accountBalance != null) lines.push(`    Property account balance: ${fmt(p.actual.accountBalance)}`);
        if (p.actual.monthsOfReserve != null) {
          lines.push(`    Cash reserve: ${p.actual.monthsOfReserve} months of expenses (6 months recommended)`);
        }
        if (p.actual.vacancyCount) lines.push(`    Unresolved missing-rent months detected: ${p.actual.vacancyCount}`);
      } else if (p.isLinked) {
        lines.push(`    Bank account linked (${p.linkedAccount || 'connected'}) but not enough transaction history yet for actuals.`);
      } else {
        lines.push(`    No bank account linked — figures above are the user's estimates only, not verified against real transactions.`);
      }

      if (p.capRate) lines.push(`    Cap rate: ${p.capRate}%${p.capRateSource ? ` (${p.capRateSource})` : ''}`);
      if (p.equity) {
        lines.push(`    Equity: ${fmt(p.equity.currentEquity)} (LTV: ${p.equity.ltv}%)`);
        lines.push(`    Remaining mortgage: ${fmt(p.equity.remainingBalance)}`);
        lines.push(`    Equity from paydown: ${fmt(p.equity.equityFromPaydown)}`);
        lines.push(`    Equity from appreciation: ${fmt(p.equity.equityFromAppreciation)}`);
        lines.push(`    Time owned: ${p.equity.yearsOwned} years`);
      }
      if (p.events) {
        lines.push(`    Logged events this year (${p.events.count}):`);
        if (p.events.vacancyLoss)    lines.push(`      - Vacancy loss: ${fmt(p.events.vacancyLoss)}`);
        if (p.events.oneTimeExpense) lines.push(`      - One-time expenses: ${fmt(p.events.oneTimeExpense)}`);
        if (p.events.oneTimeIncome)  lines.push(`      - One-time income: ${fmt(p.events.oneTimeIncome)}`);
        for (const e of p.events.items) {
          lines.push(`      - ${e.date} | ${e.type}${e.category ? ` (${e.category})` : ''}: ${fmt(e.amount)}${e.description ? ` — ${e.description}` : ''}`);
        }
      }
    }
    lines.push(`  TOTAL RE VALUE: ${fmt(d.totalRealEstate)}`);
    if (d.totalEquity > 0) lines.push(`  TOTAL EQUITY: ${fmt(d.totalEquity)}`);
    if (d.totalCashFlow !== 0) lines.push(`  TOTAL EXPECTED MONTHLY CASH FLOW: ${d.totalCashFlow >= 0 ? '+' : ''}${fmt(d.totalCashFlow)}`);
    const linkedProps = d.realestate.filter(p => p.actual);
    if (linkedProps.length) {
      const actualTotal = linkedProps.reduce((s, p) => s + p.actual.monthlyCashFlow, 0);
      lines.push(`  TOTAL ACTUAL MONTHLY CASH FLOW (${linkedProps.length} of ${d.realestate.length} properties bank-linked): ${actualTotal >= 0 ? '+' : ''}${fmt(actualTotal)}`);
      const expectedForLinked = linkedProps.reduce((s, p) => s + (p.cashFlow ?? 0), 0);
      const totalVariance = actualTotal - expectedForLinked;
      lines.push(`  VARIANCE across linked properties: ${totalVariance >= 0 ? '+' : ''}${fmt(totalVariance)}/mo`);
    }
  }
  lines.push('');

  if (d.errors?.length) {
    lines.push('CONNECTION ISSUES:');
    d.errors.forEach(e => lines.push(`  ⚠ ${e}`));
  }

  return lines.join('\n');
}
