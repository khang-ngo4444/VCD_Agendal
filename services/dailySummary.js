// Daily summary (Settings → Notifications): at the time the user picks, one message with the day's plan, the same
// tasks, overdue tasks, habits and events the Daily List shows (services/daily.js). Runs every minute with the
// reminders (jobs/scheduler.js). It goes by push when this user has a browser with push on, else by email.
const User = require('../models/User');
const defaultNotifier = require('./notifier');
const webPush = require('./webPush');
const { loadDay } = require('./daily');
const { toDateInput, toTimeInput } = require('./dates');

const CATCH_UP_MINUTES = 60; // as for habit reminders: a summary more than an hour late is skipped for the day

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const defaultStore = {
  findOn: () => User.find({ 'notifications.dailySummary.on': true }),
  claim: async (id, day) =>
    (await User.updateOne({ _id: id, 'notifications.dailySummary.lastSentOn': { $ne: day } }, { $set: { 'notifications.dailySummary.lastSentOn': day } }))
      .modifiedCount === 1,
  release: (id, previous) => User.updateOne({ _id: id }, { $set: { 'notifications.dailySummary.lastSentOn': previous ?? null } }),
  loadDay: (user, date) => loadDay(user, date, { today: date }),
  browsers: (id) => (webPush.isConfigured() ? webPush.countFor(id) : 0),
};

// The time has come today (within the catch-up window) and today's summary hasn't gone yet.
function isTime(user, now) {
  const summary = user.notifications?.dailySummary;
  if (!summary?.on || !summary.time) return false;
  const timeZone = user.timeZone || 'UTC';
  const late = minutesOf(toTimeInput(now, timeZone)) - minutesOf(summary.time);
  return late >= 0 && late < CATCH_UP_MINUTES && summary.lastSentOn !== toDateInput(now, timeZone);
}

// What the message lists: open tasks for the day (scheduled first, by time), overdue tasks, habits still to do, events.
function digest(day) {
  const open = (task) => !task.completedAt;
  return {
    tasks: [...day.scheduled.filter(open), ...day.due.filter(open)],
    overdue: day.overdue,
    habits: day.habits.filter((summary) => summary.due && !summary.doneOnDate).map((summary) => summary.habit),
    events: day.events,
  };
}

async function processDailySummaries({ now = new Date(), store = defaultStore, notifier = defaultNotifier } = {}) {
  const result = { sent: 0, failed: 0 };
  for (const user of await store.findOn()) {
    if (!isTime(user, now)) continue;
    const channel = user.notifications?.push !== false && (await store.browsers(user._id)) > 0 ? 'push' : user.notifications?.email !== false ? 'email' : null;
    if (!channel) continue;
    const today = toDateInput(now, user.timeZone || 'UTC');
    const previous = user.notifications.dailySummary.lastSentOn;
    if (!(await store.claim(user._id, today))) continue;
    try {
      const summary = digest(await store.loadDay(user, today));
      await (channel === 'push' ? notifier.summaryPush(user, summary, now) : notifier.summaryEmail(user, summary, now));
      result.sent += 1;
    } catch (err) {
      console.error('[daily summary] failed:', err.message);
      await store.release(user._id, previous); // the next minute tries again, still inside the catch-up window
      result.failed += 1;
    }
  }
  return result;
}

module.exports = { processDailySummaries, isTime, digest, CATCH_UP_MINUTES };
