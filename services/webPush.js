// Web Push: browser notifications that arrive even when no Agendal tab is open (public/sw.js shows them).
// Needs VAPID keys in .env (`npm run vapid` prints a pair); without them push is off and reminders are only logged.
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

const publicKey = () => process.env.VAPID_PUBLIC_KEY || '';
const isConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:no-reply@agendal.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  configured = true;
}

const text = (value, max) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);

// The subscription a browser posts (endpoint and its two keys). Only https endpoints: the push services all use it,
// and it keeps the server from being pointed at internal addresses.
function parseSubscription(body = {}) {
  const endpoint = text(body.endpoint, MAX_ENDPOINT_LENGTH);
  const p256dh = text(body.p256dh, MAX_KEY_LENGTH);
  const auth = text(body.auth, MAX_KEY_LENGTH);
  if (!endpoint || !p256dh || !auth) return null;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  return url.protocol === 'https:' ? { endpoint, keys: { p256dh, auth } } : null;
}

// Saves (or moves to this user) the browser's subscription. An endpoint belongs to one browser, so one owner.
const subscribe = (owner, subscription, userAgent) =>
  PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { $set: { owner, keys: subscription.keys, userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : undefined } },
    { upsert: true, new: true }
  );

const unsubscribe = (owner, endpoint) => PushSubscription.deleteOne({ owner, endpoint });

const countFor = (owner) => PushSubscription.countDocuments({ owner });

// Sends one notification to each of the user's browsers. Endpoints the push service no longer knows (404, 410) are
// removed. Throws when every browser failed for another reason, so the reminder job tries again next minute.
// Returns how many browsers got it.
async function sendToUser(owner, payload, { store = PushSubscription, send = (sub, body) => webpush.sendNotification(sub, body, { TTL: 60 * 60 }) } = {}) {
  if (!isConfigured()) return 0;
  configure();
  const subscriptions = await store.find({ owner }).lean();
  let delivered = 0;
  let failure = null;
  for (const subscription of subscriptions) {
    try {
      await send({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(payload));
      delivered += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await store.deleteOne({ _id: subscription._id });
      else failure = err;
    }
  }
  if (!delivered && failure) throw failure;
  return delivered;
}

module.exports = { isConfigured, publicKey, parseSubscription, subscribe, unsubscribe, countFor, sendToUser };
