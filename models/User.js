const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: String, // absent for Google-only accounts
    name: { type: String, trim: true },
    avatar: String,
    timeZone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      accentColour: { type: String, enum: ['blue', 'purple', 'green', 'orange', 'graphite'], default: 'blue' },
      weekStartsOn: { type: Number, enum: [0, 1], default: 1 }, // 0 = Sunday, 1 = Monday
    },
    googleId: { type: String, unique: true, sparse: true },
    sessionVersion: { type: Number, default: 0 }, // bumped to end every session (see middleware/auth.js)
    loginFailures: { count: { type: Number, default: 0 }, since: Date }, // failed logins in the current window
    lockedUntil: Date,
  },
  { timestamps: true }
);

// Register, reset and change password all go through here, so the hashing stays in one place.
// A new password also ends every existing session; the caller logs the current device back in if it wants.
userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  this.sessionVersion += 1;
};

userSchema.methods.checkPassword = function (password) {
  if (!this.passwordHash) return Promise.resolve(false); // Google-only account
  return bcrypt.compare(password, this.passwordHash);
};

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

module.exports = model('User', userSchema);
