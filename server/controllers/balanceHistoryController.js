import BalanceSnapshot from '../models/BalanceSnapshot.js';
import User            from '../models/User.js';
import { plaidClient } from '../services/plaidClient.js';

// ─── Forward-fill gaps in chart data ─────────────────────────────────────────
function fillDateGaps(points, valueKey) {
  if (!points.length) return [];
  const dataMap = {};
  points.forEach(p => {
    dataMap[new Date(p.date).toISOString().split('T')[0]] = p[valueKey];
  });
  const filled = [];
  let current  = new Date(points[0].date);
  const today  = new Date();
  today.setHours(23, 59, 59, 999);
  let lastVal  = points[0][valueKey];
  while (current <= today) {
    const key = current.toISOString().split('T')[0];
    if (dataMap[key] !== undefined) {
      lastVal = dataMap[key];
      filled.push({ date: new Date(current), [valueKey]: lastVal, source: 'snapshot' });
    } else {
      filled.push({ date: new Date(current), [valueKey]: lastVal, source: 'interpolated' });
    }
    current = new Date(current.getTime() + 86400000);
  }
  return filled;
}

// ─── Save snapshots for one user (used by cron + manual trigger) ──────────────
export async function saveSnapshotsForUser(userId) {
  const user = await User.findById(userId);
  if (!user || !user.plaidItems?.length) return { snapshotCount: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let snapshotCount = 0;

  for (const item of user.plaidItems) {
    try {
      const res = await plaidClient.accountsBalanceGet({ access_token: item.accessToken });
      for (const account of res.data.accounts || []) {
        const accountType = account.type === 'investment' ? 'investment' : 'banking';
        const exists = await BalanceSnapshot.findOne({
          userId:       userId.toString(),
          accountId:    account.account_id,
          snapshotDate: { $gte: today },
        });
        if (exists) continue;
        const doc = {
          userId:          userId.toString(),
          accountId:       account.account_id,
          accountType,
          accountName:     account.name,
          institutionName: item.institutionName,
          snapshotDate:    new Date(),
        };
        if (accountType === 'investment') {
          doc.portfolioValue = parseFloat(account.balances?.current) || 0;
        } else {
          doc.balance = parseFloat(account.balances?.current) || 0;
        }
        await BalanceSnapshot.create(doc);
        snapshotCount++;
      }
    } catch (err) {
      const code = err.response?.data?.error_code;
      if (code !== 'ITEM_LOGIN_REQUIRED' && code !== 'INVALID_ACCESS_TOKEN') {
        console.error(`[Snapshot] Error for ${item.institutionName}:`, err.message);
      }
    }
  }
  return { snapshotCount };
}

// ─── POST /snapshot ───────────────────────────────────────────────────────────
export const saveBalanceSnapshot = async (req, res, next) => {
  try {
    const result = await saveSnapshotsForUser(req.userId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

// ─── POST /snapshot-manual ────────────────────────────────────────────────────
export const manualSnapshotTrigger = async (req, res, next) => {
  try {
    const users = await User.find({ 'plaidItems.0': { $exists: true } });
    let total   = 0;
    for (const user of users) {
      const { snapshotCount } = await saveSnapshotsForUser(user._id);
      total += snapshotCount;
    }
    res.json({ success: true, usersProcessed: users.length, totalSnapshots: total });
  } catch (err) { next(err); }
};

// ─── GET /banking ─────────────────────────────────────────────────────────────
export const getAllBankingHistory = async (req, res, next) => {
  try {
    const { days = 90 } = req.query;
    const start = new Date(Date.now() - parseInt(days) * 86400000);
    const snaps = await BalanceSnapshot.find({
      userId:      req.userId.toString(),
      accountType: 'banking',
      snapshotDate: { $gte: start },
    }).sort({ snapshotDate: 1 });

    const byDate = {};
    snaps.forEach(s => {
      const key = new Date(s.snapshotDate).toISOString().split('T')[0];
      byDate[key] = (byDate[key] || 0) + (parseFloat(s.balance) || 0);
    });
    const raw = Object.entries(byDate)
      .map(([d, b]) => ({ date: new Date(d), balance: Math.round(b * 100) / 100 }))
      .sort((a, b) => a.date - b.date);

    // Too few snapshot days to be useful — rebuild from transactions per account
    if (raw.length < 7) {
      const user = await User.findById(req.userId);
      const accountIds = new Set();
      for (const item of user?.plaidItems || []) {
        try {
          const res = await plaidClient.accountsBalanceGet({ access_token: item.accessToken });
          for (const a of res.data.accounts || []) {
            if (a.type !== 'investment') accountIds.add(a.account_id);
          }
        } catch (_) { /* skip unreachable item */ }
      }

      const dayCount = parseInt(days) || 90;
      const totals = {};
      for (const id of accountIds) {
        const series = await reconstructBankingHistory(req.userId, id, dayCount);
        for (const p of series) {
          const key = p.date.toISOString().split('T')[0];
          totals[key] = (totals[key] || 0) + p.balance;
        }
      }
      const derived = Object.entries(totals)
        .map(([d, b]) => ({ date: new Date(d), balance: Math.round(b * 100) / 100 }))
        .sort((a, b) => a.date - b.date);

      if (derived.length) {
        return res.json({
          history: fillDateGaps(derived, 'balance'),
          accountCount: accountIds.size,
          meta: { source: 'reconstructed' },
        });
      }
    }

    const history = fillDateGaps(raw, 'balance');
    res.json({ history, accountCount: new Set(snaps.map(s => s.accountId)).size, meta: { source: 'snapshots' } });
  } catch (err) { next(err); }
};

// ─── GET /investment ──────────────────────────────────────────────────────────
export const getAllInvestmentHistory = async (req, res, next) => {
  try {
    const { days = 90 } = req.query;
    const start = new Date(Date.now() - parseInt(days) * 86400000);
    const snaps = await BalanceSnapshot.find({
      userId:      req.userId.toString(),
      accountType: 'investment',
      snapshotDate: { $gte: start },
    }).sort({ snapshotDate: 1 });

    const byDate = {};
    snaps.forEach(s => {
      const key = new Date(s.snapshotDate).toISOString().split('T')[0];
      const val = parseFloat(s.portfolioValue);
      if (!isNaN(val)) byDate[key] = (byDate[key] || 0) + val;
    });
    const raw = Object.entries(byDate)
      .map(([d, v]) => ({ date: new Date(d), portfolioValue: Math.round(v * 100) / 100 }))
      .sort((a, b) => a.date - b.date);
    const history = fillDateGaps(raw, 'portfolioValue');
    res.json({ history, accountCount: new Set(snaps.map(s => s.accountId)).size });
  } catch (err) { next(err); }
};

// ─── Reconstruct historical balances from transactions ───────────────────────
/**
 * Snapshots only exist from the day an account was connected onward, so a newly
 * linked account shows a flat 1-2 point chart. Plaid does not expose historical
 * balances directly, but it does return up to ~24 months of transactions — and
 * balance history can be derived from those by walking backwards from today.
 *
 * Plaid sign convention: positive amount = money OUT, negative = money IN.
 * For any transaction, balance_before = balance_after + tx.amount.
 * So the balance at the end of day D = currentBalance + sum(amounts after D).
 *
 * Returns [{ date, balance }] oldest→newest, or [] if unavailable.
 */
async function reconstructBankingHistory(userId, accountId, days) {
  const user = await User.findById(userId);
  if (!user?.plaidItems?.length) return [];

  // Find which item owns this account
  let accessToken = null;
  let currentBalance = null;
  for (const item of user.plaidItems) {
    try {
      const res = await plaidClient.accountsBalanceGet({
        access_token: item.accessToken,
        options: { account_ids: [accountId] },
      });
      const acct = res.data.accounts?.find(a => a.account_id === accountId);
      if (acct) {
        accessToken    = item.accessToken;
        currentBalance = acct.balances?.current ?? null;
        break;
      }
    } catch (_) { /* try the next item */ }
  }
  if (!accessToken || currentBalance == null) return [];

  const end   = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt   = d => d.toISOString().split('T')[0];

  // Page through transactions (Plaid caps each call at 500)
  let transactions = [];
  try {
    let offset = 0;
    for (let page = 0; page < 6; page++) {
      const res = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date:   fmt(start),
        end_date:     fmt(end),
        options:      { count: 500, offset, account_ids: [accountId] },
      });
      transactions = transactions.concat(res.data.transactions);
      if (transactions.length >= res.data.total_transactions) break;
      offset = transactions.length;
    }
  } catch (_) {
    return [];
  }
  if (!transactions.length) return [];

  // Sum of transaction amounts per day
  const byDay = {};
  for (const tx of transactions) {
    byDay[tx.date] = (byDay[tx.date] || 0) + tx.amount;
  }

  // Walk backwards from today, undoing each day's net movement
  const series = [];
  let balance  = currentBalance;
  const cursor = new Date(end);
  cursor.setHours(0, 0, 0, 0);
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);

  while (cursor >= startDay) {
    const key = fmt(cursor);
    series.push({ date: new Date(cursor), balance: Math.round(balance * 100) / 100 });
    // Undo this day's transactions to get the previous day's closing balance
    if (byDay[key]) balance += byDay[key];
    cursor.setDate(cursor.getDate() - 1);
  }

  return series.reverse();   // oldest → newest
}

// ─── GET /banking/:accountId ──────────────────────────────────────────────────
export const getBankingHistory = async (req, res, next) => {
  try {
    const { accountId }   = req.params;
    const { days = 90 }   = req.query;
    const dayCount = parseInt(days) || 90;
    const start = new Date(Date.now() - dayCount * 86400000);
    const snaps = await BalanceSnapshot.find({
      userId: req.userId.toString(), accountId,
      accountType: 'banking', snapshotDate: { $gte: start },
    }).sort({ snapshotDate: 1 });
    const raw = snaps.map(s => ({ date: new Date(s.snapshotDate), balance: parseFloat(s.balance) || 0 }));

    // Snapshots only start the day the account was connected. When there are too
    // few to be informative, derive the earlier history from transactions.
    const MIN_SNAPSHOTS = 7;
    if (raw.length < MIN_SNAPSHOTS) {
      const derived = await reconstructBankingHistory(req.userId, accountId, dayCount);
      if (derived.length) {
        // Real snapshots win for any day we actually recorded
        const snapByDay = new Map(
          raw.map(p => [new Date(p.date).toISOString().split('T')[0], p.balance])
        );
        const merged = derived.map(p => {
          const key = p.date.toISOString().split('T')[0];
          return snapByDay.has(key) ? { date: p.date, balance: snapByDay.get(key) } : p;
        });
        return res.json({
          history: fillDateGaps(merged, 'balance'),
          meta: { source: 'reconstructed', snapshotDays: raw.length },
        });
      }
    }

    res.json({ history: fillDateGaps(raw, 'balance'), meta: { source: 'snapshots', snapshotDays: raw.length } });
  } catch (err) { next(err); }
};

// ─── GET /investment/:accountId ───────────────────────────────────────────────
export const getInvestmentHistory = async (req, res, next) => {
  try {
    const { accountId }   = req.params;
    const { days = 90 }   = req.query;
    const start = new Date(Date.now() - parseInt(days) * 86400000);
    const snaps = await BalanceSnapshot.find({
      userId: req.userId.toString(), accountId,
      accountType: 'investment', snapshotDate: { $gte: start },
    }).sort({ snapshotDate: 1 });
    const raw = snaps.map(s => ({ date: new Date(s.snapshotDate), portfolioValue: parseFloat(s.portfolioValue) || 0 }));
    res.json({ history: fillDateGaps(raw, 'portfolioValue') });
  } catch (err) { next(err); }
};
