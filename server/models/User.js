import mongoose from 'mongoose';
import argon2   from 'argon2';
import { v4 as uuidv4 } from 'uuid';

const ARGON2_OPTIONS = {
  type:        argon2.argon2id,
  memoryCost:  65536,
  timeCost:    3,
  parallelism: 4,
};

// ── userInputs sub-schema (per property) ────────────────────────────────────
const userInputsSchema = new mongoose.Schema({
  actualMonthlyRent:    { type: Number, default: null },
  monthlyMortgage:      { type: Number, default: null },
  monthlyHOA:           { type: Number, default: null },
  monthlyInsurance:     { type: Number, default: null },
  monthlyPropertyTax:   { type: Number, default: null },
  monthlyMaintenance:   { type: Number, default: null },
  purchasePrice:        { type: Number, default: null },
  purchaseDate:         { type: Date,   default: null },
  downPayment:          { type: Number, default: null },
  interestRate:         { type: Number, default: null },
  loanTermYears:        { type: Number, default: 30   },
}, { _id: false });

// ── Property event sub-schema (vacancies, one-time expenses/income) ──────────
const propertyEventSchema = new mongoose.Schema({
  type:        { type: String, enum: ['vacancy', 'expense', 'income'], required: true },
  date:        { type: Date, required: true },
  amount:      { type: Number, required: true },
  description: { type: String, maxlength: 200 },
  category:    { type: String }, // roof, hvac, plumbing, appliance, other
}, { _id: true });

// ── Real estate property sub-schema ─────────────────────────────────────────
const realEstatePropertySchema = new mongoose.Schema({
  provider:       { type: String, enum: ['rentcast', 'zillow'], required: true },
  propertyId:     { type: String, required: true },
  address:        { type: String, required: true },
  estimatedValue: { type: Number, default: null },
  lastRefreshed:        { type: Date, default: null },   // last time ANY endpoint refreshed
  lastValueRefreshed:   { type: Date, default: null },   // /avm/value — weekly
  lastDetailsRefreshed: { type: Date, default: null },   // /properties — monthly
  lastRentRefreshed:    { type: Date, default: null },   // /avm/rent/long-term — monthly
  data:           { type: mongoose.Schema.Types.Mixed, default: {} },
  userInputs:     { type: userInputsSchema, default: () => ({}) },
  events:         { type: [propertyEventSchema], default: [] },
  // Linked dedicated bank account (Plaid)
  linkedAccountId:   { type: String, default: null },
  linkedItemId:      { type: String, default: null },
  linkedAccountName: { type: String, default: null },
  // Cached snapshot of actual figures derived from real transactions
  actuals: {
    monthlyCashFlow: { type: Number, default: null },
    annualCashFlow:  { type: Number, default: null },
    monthlyRent:     { type: Number, default: null },
    monthsAnalyzed:  { type: Number, default: null },
    excludedCount:   { type: Number, default: null },
    currentBalance:  { type: Number, default: null },
    monthsOfReserve: { type: Number, default: null },
    vacancyCount:    { type: Number, default: null },
    computedAt:      { type: Date,   default: null },
  },
  createdAt:      { type: Date, default: Date.now },
});

// ── Plaid item sub-schema ────────────────────────────────────────────────────
// accessToken stored encrypted via AES-256 (see encryption.js)
const plaidItemSchema = new mongoose.Schema({
  accessToken:     { type: String, required: true }, // stored encrypted
  itemId:          { type: String, required: true },
  institutionId:   { type: String, default: null },
  institutionName: { type: String, default: 'Unknown Institution' },
  createdAt:       { type: Date, default: Date.now },
});

// ── Transaction assignment sub-schemas ──────────────────────────────────────
// When several properties share one bank account, these record who each
// transaction belongs to. See services/txnAttribution.js for the resolution
// chain (override → rule → sole claimant → unassigned).

// A rule covers a whole recurring series — one decision handles every past AND
// future occurrence, which is what keeps this from becoming per-transaction
// data entry. `matchKey` comes from matchKeyOf() in the attribution service.
const transactionRuleSchema = new mongoose.Schema({
  accountId:  { type: String, required: true },
  matchKey:   { type: String, required: true },
  target:     { type: String, enum: ['property', 'personal'], required: true },
  // Null when target is 'personal' — that money belongs to no property.
  propertyId: { type: mongoose.Schema.Types.ObjectId, default: null },
  label:      { type: String, maxlength: 200, default: null },  // for display
  createdAt:  { type: Date, default: Date.now },
}, { _id: true });

// An override pins ONE transaction, taking precedence over any rule — e.g. the
// month a shared handyman invoice happened to be for a different property.
//
// Both identities are stored because neither alone is sufficient: Plaid's
// transaction_id changes when a transaction moves from pending to posted, while
// the fingerprint (account|date|amount|descriptor) survives that transition but
// cannot distinguish two genuinely identical charges on the same day.
const transactionOverrideSchema = new mongoose.Schema({
  accountId:          { type: String, required: true },
  plaidTransactionId: { type: String, default: null },
  fingerprint:        { type: String, required: true },
  target:             { type: String, enum: ['property', 'personal'], required: true },
  propertyId:         { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt:          { type: Date, default: Date.now },
}, { _id: true });

// ── Password reset sub-schema ────────────────────────────────────────────────
const passwordResetSchema = new mongoose.Schema({
  tokenHash:  { type: String, required: true },
  expiresAt:  { type: Date,   required: true },
  used:       { type: Boolean, default: false },
}, { _id: false });

// ── Onboarding sub-schema ───────────────────────────────────────────────────
// Stores ONLY what cannot be derived from account state. Whether the user has
// added a property or connected a bank is read from realEstateProperties and
// plaidItems at response time — duplicating it here would drift the moment
// someone removes their last property.
const onboardingSchema = new mongoose.Schema({
  // 'owner'   — already owns rental property
  // 'shopper' — evaluating their first purchase
  investorType:         { type: String,  enum: ['owner', 'shopper', null], default: null },
  exploredDealAnalyzer: { type: Boolean, default: false },
  dismissed:            { type: Boolean, default: false },
  completedAt:          { type: Date,    default: null },
}, { _id: false });

// ── Main User schema ─────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  email: {
    type:      String,
    required:  true,
    unique:    true,
    lowercase: true,
    trim:      true,
    maxlength: 254,
  },

  // Argon2id hash — never plaintext. select: false = excluded by default
  passwordHash: {
    type:   String,
    select: false,
  },

  name: {
    type:      String,
    trim:      true,
    default:   '',
    maxlength: 200,
  },

  // Refresh token rotation
  refreshTokenHash: {
    type:   String,
    select: false,
  },

  // Brute-force protection
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil:         { type: Date,   default: null },
  lastLoginAt:         { type: Date,   default: null },
  lastLoginIp:         { type: String, default: null },

  // Password reset (single-use, 15 min)
  passwordReset: { type: passwordResetSchema, default: null, select: false },

  // Connected bank accounts
  plaidItems:             { type: [plaidItemSchema],          default: [] },

  // Real estate portfolio
  realEstateProperties:   { type: [realEstatePropertySchema], default: [] },

  // Transaction assignment — only populated when an account serves more than
  // one property, or when the user explicitly marks something personal. Rules
  // stay small by design (one per recurring series); overrides grow only with
  // deliberate user action, so embedding these stays well inside the 16MB
  // document limit rather than needing their own collection.
  transactionRules:       { type: [transactionRuleSchema],     default: [] },
  transactionOverrides:   { type: [transactionOverrideSchema], default: [] },

  // Onboarding — see onboardingSchema above
  onboarding:             { type: onboardingSchema, default: () => ({}) },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// Note: email uniqueness is enforced by { unique: true } on the field definition above.
// A separate userSchema.index({ email: 1 }) is intentionally omitted to avoid the
// duplicate index warning Mongoose emits when both are present.

// ── Hooks ────────────────────────────────────────────────────────────────────
userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// ── Instance methods ─────────────────────────────────────────────────────────

userSchema.methods.setPassword = async function (plaintext) {
  this.passwordHash = await argon2.hash(plaintext, ARGON2_OPTIONS);
};

userSchema.methods.verifyPassword = async function (plaintext) {
  if (!this.passwordHash) return false;
  return argon2.verify(this.passwordHash, plaintext);
};

userSchema.methods.isLocked = function () {
  return this.lockedUntil && this.lockedUntil > new Date();
};

userSchema.methods.recordFailedLogin = async function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  await this.save();
};

userSchema.methods.recordSuccessfulLogin = async function (ip) {
  this.failedLoginAttempts = 0;
  this.lockedUntil         = null;
  this.lastLoginAt         = new Date();
  this.lastLoginIp         = ip || null;
  await this.save();
};

userSchema.methods.setRefreshToken = async function (token) {
  this.refreshTokenHash = await argon2.hash(token, ARGON2_OPTIONS);
  await this.save();
};

userSchema.methods.verifyRefreshToken = async function (token) {
  if (!this.refreshTokenHash) return false;
  return argon2.verify(this.refreshTokenHash, token);
};

userSchema.methods.createPasswordResetToken = async function () {
  const { randomBytes } = await import('crypto');
  const raw    = randomBytes(32).toString('hex');
  const hash   = await argon2.hash(raw, { ...ARGON2_OPTIONS, memoryCost: 4096 });
  this.passwordReset = {
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    used:      false,
  };
  await this.save();
  return raw;
};

userSchema.methods.verifyAndConsumeResetToken = async function (raw) {
  if (!this.passwordReset)                   return false;
  if (this.passwordReset.used)               return false;
  if (this.passwordReset.expiresAt < new Date()) return false;
  const valid = await argon2.verify(this.passwordReset.tokenHash, raw);
  if (valid) {
    this.passwordReset.used = true;
    await this.save();
  }
  return valid;
};

// Safe object for API responses — strips all sensitive fields
userSchema.methods.toSafeObject = function () {
  const onboarding = this.onboarding || {};
  return {
    id:          this._id,
    email:       this.email,
    name:        this.name,
    lastLoginAt: this.lastLoginAt,
    createdAt:   this.createdAt,
    onboarding: {
      investorType:         onboarding.investorType         ?? null,
      exploredDealAnalyzer: onboarding.exploredDealAnalyzer ?? false,
      dismissed:            onboarding.dismissed            ?? false,
      completedAt:          onboarding.completedAt          ?? null,
      // Derived, never stored — always reflects current account state
      hasProperty:       (this.realEstateProperties || []).length > 0,
      hasBankConnection: (this.plaidItems || []).length > 0,
    },
  };
};

const User = mongoose.model('User', userSchema);
export default User;
