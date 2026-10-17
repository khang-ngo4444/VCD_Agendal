// Rules that keep reminder email from becoming spam. Push notifications are not limited.
const { toDateInput } = require('./dates');

const EMAIL_GAP_MS = 15 * 60 * 1000; // at most one reminder email every 15 minutes...
const EMAILS_PER_DAY = 10; // ...and 10 a day (the user's local day)

const localDay = (user, now) => toDateInput(now, user.timeZone || 'UTC');

// 'off'   — the user turned email reminders off: never email
// 'limit' — 10 emails already today: these reminders go by push only
// 'wait'  — an email went out less than 15 minutes ago: keep them for the next email
// 'send'  — send now
function emailDecision(user, now) {
  const settings = user.notifications ?? {};
  if (settings.email === false) return 'off';
  const sentToday = settings.emailDay === localDay(user, now) ? (settings.emailsToday ?? 0) : 0;
  if (sentToday >= EMAILS_PER_DAY) return 'limit';
  if (settings.lastEmailAt && now - settings.lastEmailAt < EMAIL_GAP_MS) return 'wait';
  return 'send';
}

// The counters after one more email, to save on the user.
function countEmail(user, now) {
  const settings = user.notifications ?? {};
  const day = localDay(user, now);
  const before = settings.emailDay === day ? (settings.emailsToday ?? 0) : 0;
  return { lastEmailAt: now, emailDay: day, emailsToday: before + 1 };
}

module.exports = { emailDecision, countEmail, EMAIL_GAP_MS, EMAILS_PER_DAY };
