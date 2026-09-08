import { Products, CountryCode } from 'plaid';
import { createHash }            from 'crypto';
import { plaidClient, invalidatePlaidCache } from '../services/plaidClient.js';
import User                      from '../models/User.js';

// Hash userId for Plaid — must not contain PII
const toPlaidUserId = (userId) =>
  createHash('sha256').update(String(userId)).digest('hex').slice(0, 32);

// ─── Create Link Token ────────────────────────────────────────────────────────
export const createLinkToken = async (req, res, next) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user:          { client_user_id: toPlaidUserId(req.userId) },
      client_name:   'CapRate',
      products:      [Products.Transactions, Products.Investments],
      country_codes: [CountryCode.Us],
      language:      'en',
    });
    res.json({ linkToken: response.data.link_token });
  } catch (err) {
    console.error('[Plaid] createLinkToken error:', err.response?.data || err.message);
    next(err);
  }
};

// ─── Exchange Public Token ────────────────────────────────────────────────────
export const exchangePublicToken = async (req, res, next) => {
  try {
    const { publicToken, institutionId, institutionName } = req.body;
    if (!publicToken) return res.status(400).json({ error: 'publicToken is required' });

    invalidatePlaidCache();   // new item — ensure the next fetch is live
    const exchangeRes = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const { access_token: accessToken, item_id: itemId } = exchangeRes.data;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Remove duplicate institution if reconnecting
    user.plaidItems = user.plaidItems.filter(i => i.institutionId !== institutionId);

    user.plaidItems.push({
      accessToken,
      itemId,
      institutionId:   institutionId   || null,
      institutionName: institutionName || 'Unknown Institution',
    });
    await user.save();

    res.json({ success: true, message: `${institutionName || 'Account'} connected successfully` });
  } catch (err) {
    console.error('[Plaid] exchangePublicToken error:', err.response?.data || err.message);
    next(err);
  }
};

// ─── Get All Accounts ─────────────────────────────────────────────────────────
export const getAccounts = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.plaidItems?.length) {
      return res.json({ accounts: [] });
    }

    const allAccounts  = [];
    const expiredItems = [];

    for (const item of user.plaidItems) {
      try {
        const response = await plaidClient.accountsBalanceGet({
          access_token: item.accessToken,
        });
        const accounts = response.data.accounts.map(a => ({
          ...a,
          institutionName: item.institutionName,
          institutionId:   item.institutionId,
          itemId:          item.itemId,
        }));
        allAccounts.push(...accounts);
      } catch (err) {
        const code = err.response?.data?.error_code;
        if (code === 'ITEM_LOGIN_REQUIRED' || code === 'INVALID_ACCESS_TOKEN') {
          console.warn(`[Plaid] Token expired for ${item.institutionName}`);
          expiredItems.push({ name: item.institutionName, itemId: item.itemId });
        } else {
          console.error(`[Plaid] Error for ${item.institutionName}:`, err.message);
        }
      }
    }

    res.json({
      accounts: allAccounts,
      ...(expiredItems.length > 0 && { expiredConnections: expiredItems }),
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Transactions ─────────────────────────────────────────────────────────
export const getTransactions = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const start = dateRegex.test(startDate) ? startDate
      : new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const end   = dateRegex.test(endDate) ? endDate
      : new Date().toISOString().split('T')[0];

    const user = await User.findById(req.userId);
    if (!user || !user.plaidItems?.length) return res.json({ transactions: [] });

    const allTxs = [];
    for (const item of user.plaidItems) {
      try {
        const response = await plaidClient.transactionsGet({
          access_token: item.accessToken,
          start_date:   start,
          end_date:     end,
          options:      { count: 500, offset: 0 },
        });
        allTxs.push(...response.data.transactions.map(tx => ({
          ...tx, institutionName: item.institutionName,
        })));
      } catch (err) {
        const code = err.response?.data?.error_code;
        if (code !== 'ITEM_LOGIN_REQUIRED' && code !== 'INVALID_ACCESS_TOKEN') {
          console.error(`[Plaid] Transactions error for ${item.institutionName}:`, err.message);
        }
      }
    }
    allTxs.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ transactions: allTxs });
  } catch (err) {
    next(err);
  }
};

// ─── Remove Item ──────────────────────────────────────────────────────────────
export const removeItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const item = user.plaidItems.find(i => i.itemId === itemId);
    if (!item) return res.status(404).json({ error: 'Account not found' });

    try {
      await plaidClient.itemRemove({ access_token: item.accessToken });
      invalidatePlaidCache(item.accessToken);
    } catch (err) {
      // Log the error so we know if Plaid rejected the removal,
      // but still clean up locally — a stale token in our DB is worse
      // than an orphaned item on Plaid's side.
      const code = err.response?.data?.error_code;
      console.error(`[Plaid] itemRemove failed for ${item.institutionName}: ${code || err.message}`);
      // Still clear the cache since we're removing it locally
      invalidatePlaidCache(item.accessToken);
    }

    user.plaidItems = user.plaidItems.filter(i => i.itemId !== itemId);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
