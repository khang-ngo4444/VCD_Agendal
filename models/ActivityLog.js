const { Schema, model } = require('mongoose');

// Security events the admin console lists at /admin/activity. Kept 90 days, then MongoDB removes them.
const ACTIONS = ['signup', 'login', 'login_failed', 'lockout', 'password_reset', 'account_deleted', 'admin_lock', 'admin_unlock'];
const RETENTION_DAYS = 90;

const activityLogSchema = new Schema({
  action: { type: String, enum: ACTIONS, required: true },
  account: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // the account it happened to; null for unknown emails
  email: { type: String, lowercase: true, trim: true }, // copied, so the entry still reads right after the account is deleted
  actor: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // the admin, for admin lock / unlock
  details: String, // "Chrome on Windows", "Wrong password · attempt 3 of 10"
  ip: String,
  createdAt: { type: Date, default: Date.now },
});

activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });
activityLogSchema.index({ action: 1, createdAt: -1 }); // the filter chips

module.exports = model('ActivityLog', activityLogSchema);
module.exports.ACTIONS = ACTIONS;
module.exports.RETENTION_DAYS = RETENTION_DAYS;
