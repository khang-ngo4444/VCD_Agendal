// "Last sent" in Settings → Notifications (Figma W12 "last delivered today 07:30"): the last reminder, habit reminder
// or daily summary that went out, and how, so people can tell whether notifications actually reach them.
const User = require('../models/User');
const { formatDay, formatTime } = require('./dates');

// Without MAIL_HOST, email is only printed to the server console (services/mailer.js): say so instead of "email".
const emailChannel = () => (process.env.MAIL_HOST ? 'email' : 'console');

const record = (userId, { at, channels, what }) =>
  channels.length ? User.updateOne({ _id: userId }, { $set: { 'notifications.lastDelivered': { at, channels, what } } }) : null;

const CHANNEL_WORDS = { push: 'browser notification', email: 'email', console: 'email printed to the server console (MAIL_HOST isn’t set)' };

// "Today 22:59 · “Hello world” · by browser notification and email", or null when nothing has gone out yet.
function describe(lastDelivered, timeZone, now = new Date()) {
  if (!lastDelivered?.at) return null;
  const channels = lastDelivered.channels.map((channel) => CHANNEL_WORDS[channel] ?? channel).join(' and ');
  return `${formatDay(lastDelivered.at, timeZone, now)} ${formatTime(lastDelivered.at, timeZone)} · “${lastDelivered.what}” · by ${channels}`;
}

module.exports = { emailChannel, record, describe };
