const { Schema, model } = require('mongoose');

// One browser that agreed to receive reminders (Web Push). A user has one per browser or device; the push service
// gives each its own endpoint URL and keys (services/webPush.js). Removed when the browser unsubscribes, or when the
// push service says the endpoint is gone.
const pushSubscriptionSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: String, // which browser, so the user can tell their devices apart
  },
  { timestamps: true }
);

module.exports = model('PushSubscription', pushSubscriptionSchema);
