const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: String, // absent for Google-only accounts
    name: { type: String, trim: true },
    avatar: String,
    timeZone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      accentColour: String,
      weekStartsOn: { type: Number, enum: [0, 1], default: 1 }, // 0 = Sunday, 1 = Monday
    },
    googleId: { type: String, unique: true, sparse: true },
    sessionVersion: { type: Number, default: 0 }, // bumped to end every session (see middleware/auth.js)
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

module.exports = model('User', userSchema);
