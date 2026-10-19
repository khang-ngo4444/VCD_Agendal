// Habit reminders: a habit with a reminder time (Habit.reminderTime, "HH:mm" in the user's time zone) gets one
// reminder at that time on the days it is due, unless it is already checked in. Runs every minute with the task
// reminders (jobs/scheduler.js).
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const User = require('../models/User');
const defaultNotifier = require('./notifier');
const { isDue } = require('./habits');
const { emailDecision, countEmail } = require('./emailLimits');
const { addDays, startOfWeek, toDateInput, toTimeInput } = require('./dates');

// If the server was down at the reminder time, it still goes out up to this late; after that the day is skipped.
const CATCH_UP_MINUTES = 60;

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const defaultStore = {
  findWithReminders: () => Habit.find({ reminderTime: { $type: 'string' }, archivedAt: null }).lean(),
  loadUsers: async (ids) => new Map((await User.find({ _id: { $in: ids } })).map((user) => [String(user._id), user])),
  checkInsBetween: (habitIds, from, to) =>
    HabitCheckIn.find({ habit: { $in: habitIds }, date: { $gte: from, $lte: to } }, { habit: 1, date: 1 }).lean(),
  // Atomic: only one job run can mark the habit reminded today, so only that run sends it.
  claim: async (id, day) => (await Habit.updateOne({ _id: id, lastRemindedOn: { $ne: day } }, { $set: { lastRemindedOn: day } })).modifiedCount === 1,
  release: (id, previous) => Habit.updateOne({ _id: id }, { $set: { lastRemindedOn: previous ?? null } }),
  recordEmail: (user, counters) =>
    User.updateOne({ _id: user._id }, { $set: Object.fromEntries(Object.entries(counters).map(([key, value]) => [`notifications.${key}`, value])) }),
};

// Whether the habit wants a reminder at `now`: its time has come today (within the catch-up window), it hasn't had
// one today, it is due today, and it isn't done: checked in today, or (N times a week) this week's target is met.
function wantsReminder(habit, user, now, checkIns) {
  const timeZone = user.timeZone || 'UTC';
  const today = toDateInput(now, timeZone);
  const late = minutesOf(toTimeInput(now, timeZone)) - minutesOf(habit.reminderTime);
  if (late < 0 || late >= CATCH_UP_MINUTES) return false;
  if (habit.lastRemindedOn === today || !isDue(habit, today)) return false;

  const mine = checkIns.filter((checkIn) => String(checkIn.habit) === String(habit._id));
  if (mine.some((checkIn) => checkIn.date === today)) return false;
  if (habit.frequency.type === 'timesPerWeek') {
    const weekStart = startOfWeek(today, user.preferences?.weekStartsOn ?? 1);
    const thisWeek = mine.filter((checkIn) => checkIn.date >= weekStart && checkIn.date <= today).length;
    if (thisWeek >= (habit.frequency.timesPerWeek ?? 1)) return false;
  }
  return true;
}

async function processHabitReminders({ now = new Date(), store = defaultStore, notifier = defaultNotifier } = {}) {
  const result = { sent: 0, failed: 0 };
  const habits = await store.findWithReminders();
  if (!habits.length) return result;
  const users = await store.loadUsers([...new Set(habits.map((habit) => String(habit.owner)))]);
  // A week back covers "N times a week" habits; today's check-ins cover the rest.
  const anyZone = toDateInput(now, 'UTC');
  const checkIns = await store.checkInsBetween(habits.map((habit) => habit._id), addDays(anyZone, -8), addDays(anyZone, 1));

  for (const [ownerId, user] of users) {
    if (user.notifications?.push === false && user.notifications?.email === false) continue; // both channels off
    const due = habits.filter((habit) => String(habit.owner) === ownerId && wantsReminder(habit, user, now, checkIns));
    const today = toDateInput(now, user.timeZone || 'UTC');
    const claimed = [];
    for (const habit of due) if (await store.claim(habit._id, today)) claimed.push(habit);
    if (!claimed.length) continue;

    let delivered = false;
    if (user.notifications?.push !== false) {
      try {
        await notifier.habitPush(user, claimed);
        delivered = true;
      } catch (err) {
        console.error('[habit reminders] push failed:', err.message);
      }
    }
    // Email follows the same limits as task reminders; while an email waits for its 15-minute gap, push alone goes.
    if (emailDecision(user, now) === 'send') {
      try {
        await notifier.habitEmail(user, claimed, now);
        await store.recordEmail(user, countEmail(user, now));
        delivered = true;
      } catch (err) {
        console.error('[habit reminders] email failed:', err.message);
      }
    }
    if (delivered) result.sent += claimed.length;
    else {
      // Nothing went out: free the habits so the next run (still inside the catch-up window) tries again.
      for (const habit of claimed) await store.release(habit._id, habit.lastRemindedOn);
      result.failed += claimed.length;
    }
  }
  return result;
}

module.exports = { processHabitReminders, wantsReminder, CATCH_UP_MINUTES };
