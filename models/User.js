const crypto = require('node:crypto');
const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000; // one reset email per account per minute
const MAX_CHECKED_PASSWORD_LENGTH = 1000; // far above any real password; stops huge inputs from burning CPU in bcrypt
// A real bcrypt hash of a random string, compared against when the email is unknown so both cases take equally long.
const DUMMY_HASH = '$2b$12$/vYlgYtCDkPziiQgDQ/1c.RDxbrzoNeOABwHqZZfCHIubmQHx5dIi';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: String, // absent for Google-only accounts
    name: { type: String, trim: true },
    avatar: String,
    timeZone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }, // admins only use the /admin console
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      accentColour: { type: String, enum: ['blue', 'purple', 'green', 'orange', 'graphite'], default: 'blue' },
      weekStartsOn: { type: Number, enum: [0, 1], default: 1 }, // 0 = Sunday, 1 = Monday
      calendarLayout: { type: String, enum: ['day', 'week', 'month'], default: 'day' }, // which layout the Calendar opens on
    },
    googleId: { type: String, unique: true, sparse: true },
    sessionVersion: { type: Number, default: 0 }, // bumped to end every session (see middleware/auth.js)
    loginFailures: { count: { type: Number, default: 0 }, since: Date }, // failed logins in the current window
    lockedUntil: Date,
    onboardedAt: { type: Date, default: null }, // set when the Welcome screen is finished or skipped
    passwordReset: { tokenHash: String, expiresAt: Date, requestedAt: Date }, // only the hash is stored, see createPasswordResetToken
  },
  { timestamps: true }
);

userSchema.index({ 'passwordReset.tokenHash': 1 }, { sparse: true });

// Register, reset and change password all go through here, so the hashing stays in one place.
// A new password also ends every existing session; the caller logs the current device back in if it wants.
userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  this.sessionVersion += 1;
  this.passwordReset = undefined; // any outstanding reset link stops working
};

userSchema.methods.checkPassword = function (password) {
  if (!this.passwordHash || password.length > MAX_CHECKED_PASSWORD_LENGTH) return Promise.resolve(false); // Google-only account
  return bcrypt.compare(password, this.passwordHash);
};

// Spends the same time as a real check, for logins with an unknown email (otherwise response time reveals who has an account).
userSchema.statics.fakePasswordCheck = (password) => bcrypt.compare(password.slice(0, MAX_CHECKED_PASSWORD_LENGTH), DUMMY_HASH);

// Minutes left on a login lockout, or 0 when the account may log in.
userSchema.methods.lockMinutesLeft = function (now = new Date()) {
  return this.lockedUntil > now ? Math.ceil((this.lockedUntil - now) / 60000) : 0;
};

// ponytail: read-modify-write, so parallel failed logins can undercount; switch to $inc if that matters.
userSchema.methods.recordFailedLogin = function (now = new Date()) {
  if (!this.loginFailures.since || now - this.loginFailures.since > FAILED_LOGIN_WINDOW_MS) {
    this.loginFailures = { count: 0, since: now };
  }
  this.loginFailures.count += 1;
  if (this.loginFailures.count >= MAX_FAILED_LOGINS) {
    this.lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
    this.loginFailures = { count: 0, since: null };
  }
  return this.save();
};

userSchema.methods.clearFailedLogins = async function () {
  if (!this.loginFailures.count && !this.lockedUntil) return;
  this.loginFailures = { count: 0, since: null };
  this.lockedUntil = null;
  await this.save();
};

// Returns the token for the reset link. Only its hash is saved, so a leaked database can't be used to reset passwords.
userSchema.methods.createPasswordResetToken = function (now = new Date()) {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordReset = { tokenHash: sha256(token), expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS), requestedAt: now };
  return token;
};

// False right after a reset email was sent, so the form can't be used to flood someone's inbox.
userSchema.methods.canRequestPasswordReset = function (now = new Date()) {
  const last = this.passwordReset?.requestedAt;
  return !last || now - last >= RESET_COOLDOWN_MS;
};

// The user a reset link belongs to, or null when the token is unknown, used or expired.
userSchema.statics.findByResetToken = function (token) {
  if (typeof token !== 'string' || !token) return Promise.resolve(null);
  return this.findOne({ 'passwordReset.tokenHash': sha256(token), 'passwordReset.expiresAt': { $gt: new Date() } });
};

module.exports = model('User', userSchema);
module.exports.MAX_FAILED_LOGINS = MAX_FAILED_LOGINS;
