const User = require('../models/User');
const { flash } = require('../middleware/flash');
const { readUnsubscribeToken } = require('../services/unsubscribe');
const { EMAIL_GAP_MS, EMAILS_PER_DAY } = require('../services/emailLimits');
const webPush = require('../services/webPush');

const limits = { emailGapMinutes: EMAIL_GAP_MS / 60_000, emailsPerDay: EMAILS_PER_DAY };

// Settings → Notifications
exports.showSettings = (req, res) =>
  res.render('settings/notifications', {
    title: 'Notifications · Settings · Agendal',
    values: { push: req.user.notifications?.push !== false, email: req.user.notifications?.email !== false },
    limits,
  });

exports.updateSettings = async (req, res) => {
  const body = req.body ?? {};
  // An unticked checkbox sends nothing, so a missing field means "off".
  req.user.set('notifications.push', body.push === 'on');
  req.user.set('notifications.email', body.email === 'on');
  await req.user.save();
  flash(req, 'success', 'Notification settings saved.');
  res.redirect('/settings/notifications');
};

// Web Push (public/js/push.js): this browser's subscription, posted with fetch. 204 on success.
exports.subscribePush = async (req, res) => {
  const subscription = webPush.parseSubscription(req.body);
  if (!subscription) return res.status(400).json({ error: 'Not a valid push subscription.' });
  await webPush.subscribe(req.user._id, subscription, req.get('User-Agent'));
  res.status(204).end();
};

exports.unsubscribePush = async (req, res) => {
  if (typeof req.body?.endpoint === 'string') await webPush.unsubscribe(req.user._id, req.body.endpoint);
  res.status(204).end();
};

// "Send a test" in Settings → Notifications: one notification to each of the user's browsers. 409 when none has push on.
exports.testPush = async (req, res) => {
  const delivered = await webPush.sendToUser(req.user._id, {
    title: 'Agendal',
    body: 'Notifications are on. Your reminders will look like this.',
    url: '/settings/notifications',
    tag: 'test',
  });
  res.status(delivered ? 204 : 409).end();
};

// The "Turn off email reminders" link in every reminder email. No login needed: the signed token is the proof.
function renderUnsubscribe(res, { token, valid, done }) {
  res.status(valid ? 200 : 404).render('notifications/unsubscribe', { title: 'Email reminders · Agendal', token, valid, done });
}

// Opening the link only shows a button, so link scanners in mail clients can't switch anything off.
exports.showUnsubscribe = (req, res) =>
  renderUnsubscribe(res, { token: req.params.token, valid: Boolean(readUnsubscribeToken(req.params.token)), done: false });

// The button, and the one-click POST that Gmail sends for the List-Unsubscribe header (mounted before the CSRF check).
exports.unsubscribe = async (req, res) => {
  const userId = readUnsubscribeToken(req.params.token);
  if (!userId) return renderUnsubscribe(res, { token: req.params.token, valid: false, done: false });
  await User.updateOne({ _id: userId }, { $set: { 'notifications.email': false } });
  renderUnsubscribe(res, { token: req.params.token, valid: true, done: true });
};
