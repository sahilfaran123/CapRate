import mongoose from 'mongoose';

/**
 * Balance Snapshot Schema
 * Stores point-in-time snapshots of account balances and portfolio values
 * Used to build equity graphs over time
 */
const balanceSnapshotSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  accountId: {
    type: String,
    required: true,
    index: true,
  },
  accountType: {
    type: String,
    enum: ['banking', 'investment'],
    required: true,
  },
  // For banking accounts
  balance: {
    type: Number,
    default: null,
  },
  // For investment accounts
  portfolioValue: {
    type: Number,
    default: null,
  },
  // Account metadata
  accountName: String,
  institutionName: String,
  // When this snapshot was taken
  snapshotDate: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

// Compound index for efficient queries
balanceSnapshotSchema.index({ userId: 1, accountId: 1, snapshotDate: -1 });

// Index for cleanup queries (delete old data)
balanceSnapshotSchema.index({ snapshotDate: 1 });

export default mongoose.model('BalanceSnapshot', balanceSnapshotSchema);
