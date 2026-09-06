import { plaidClient } from '../services/plaidClient.js';
import User            from '../models/User.js';

// ─── Get Investment Accounts ──────────────────────────────────────────────────
export const getInvestmentAccounts = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.plaidItems?.length) return res.json({ accounts: [] });

    const allAccounts = [];
    for (const item of user.plaidItems) {
      try {
        const response = await plaidClient.accountsBalanceGet({ access_token: item.accessToken });
        const investmentAccounts = response.data.accounts
          .filter(acc => acc.type === 'investment')
          .map(acc => ({ ...acc, institutionName: item.institutionName, itemId: item.itemId }));
        allAccounts.push(...investmentAccounts);
      } catch (err) {
        const code = err.response?.data?.error_code;
        if (code !== 'ITEM_LOGIN_REQUIRED' && code !== 'INVALID_ACCESS_TOKEN') {
          console.error(`[Investments] Error for ${item.institutionName}:`, err.message);
        }
      }
    }
    res.json({ accounts: allAccounts });
  } catch (err) { next(err); }
};

// ─── Get Holdings ─────────────────────────────────────────────────────────────
export const getHoldings = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.plaidItems?.length) return res.json({ holdings: [], securities: [] });

    const allHoldings   = [];
    const allSecurities = [];

    for (const item of user.plaidItems) {
      try {
        const response = await plaidClient.investmentsHoldingsGet({ access_token: item.accessToken });
        allHoldings.push(...(response.data.holdings || []));
        allSecurities.push(...(response.data.securities || []));
      } catch (err) {
        const code = err.response?.data?.error_code;
        if (code !== 'ITEM_LOGIN_REQUIRED' && code !== 'INVALID_ACCESS_TOKEN') {
          console.error(`[Investments] Holdings error for ${item.institutionName}:`, err.message);
        }
      }
    }

    const secMap = {};
    allSecurities.forEach(s => { secMap[s.security_id] = s; });
    const enriched = allHoldings.map(h => ({ ...h, security: secMap[h.security_id] || null }));

    res.json({ holdings: enriched, securities: allSecurities });
  } catch (err) { next(err); }
};

// ─── Get Investment Transactions ──────────────────────────────────────────────
export const getInvestmentTransactions = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const start     = dateRegex.test(startDate) ? startDate : new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const end       = dateRegex.test(endDate)   ? endDate   : new Date().toISOString().split('T')[0];

    const user = await User.findById(req.userId);
    if (!user || !user.plaidItems?.length) return res.json({ investment_transactions: [] });

    const allTxs = [];
    for (const item of user.plaidItems) {
      try {
        const response = await plaidClient.investmentsTransactionsGet({
          access_token: item.accessToken,
          start_date:   start,
          end_date:     end,
        });
        allTxs.push(...(response.data.investment_transactions || []));
      } catch (err) {
        const code = err.response?.data?.error_code;
        if (code !== 'ITEM_LOGIN_REQUIRED' && code !== 'INVALID_ACCESS_TOKEN') {
          console.error(`[Investments] Tx error for ${item.institutionName}:`, err.message);
        }
      }
    }

    allTxs.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ investment_transactions: allTxs });
  } catch (err) { next(err); }
};
