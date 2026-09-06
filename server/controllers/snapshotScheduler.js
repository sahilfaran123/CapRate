import cron from 'node-cron';
import User from '../models/User.js';
import { saveSnapshotsForUser } from '../controllers/balanceHistoryController.js';

export function initializeSnapshotScheduler() {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('\n[Scheduler] 🕐 Daily snapshot job starting...');
    try {
      const users = await User.find({ 'plaidItems.0': { $exists: true } });
      let total   = 0;
      for (const user of users) {
        try {
          // Use _id (not email) since balanceHistoryController now uses findById
          const { snapshotCount } = await saveSnapshotsForUser(user._id);
          total += snapshotCount;
          console.log(`[Scheduler] ✅ ${user.email}: ${snapshotCount} snapshots`);
        } catch (err) {
          console.error(`[Scheduler] ❌ ${user.email}:`, err.message);
        }
      }
      console.log(`[Scheduler] ✅ Done. ${users.length} users, ${total} snapshots.\n`);
    } catch (err) {
      console.error('[Scheduler] ❌ Job failed:', err.message);
    }
  });

  const next = new Date();
  if (next.getHours() >= 2) next.setDate(next.getDate() + 1);
  next.setHours(2, 0, 0, 0);
  console.log(`[Scheduler] ✅ Daily snapshots scheduled — next run: ${next.toLocaleString()}`);
}
