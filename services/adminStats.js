// The numbers behind the admin overview (AD-W01). Admin accounts are never counted as users.
const User = require('../models/User');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const Project = require('../models/Project');
const ActivityLog = require('../models/ActivityLog');
const { toDateInput } = require('./dates');

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_DAYS = 30;
const INACTIVE_DAYS = 90;
const RECENT_ACTIVITY = 5;

const daysAgo = (now, days) => new Date(now.getTime() - days * DAY_MS);

// The last `count` local days ending today, oldest first: ["2026-09-18", …, "2026-10-17"].
function lastDays(now, timeZone, count = CHART_DAYS) {
  return Array.from({ length: count }, (_, i) => toDateInput(daysAgo(now, count - 1 - i), timeZone));
}

// One entry per day, 0 where nothing happened. rows: [{ _id: "YYYY-MM-DD", count }].
function fillDays(days, rows) {
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  return days.map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

// Whole-number % change, or null when there is nothing to compare with.
const percentChange = (current, previous) => (previous ? Math.round(((current - previous) / previous) * 100) : null);
const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

async function overviewStats(now = new Date(), timeZone = 'UTC') {
  const people = { role: { $ne: 'admin' } };
  const week = daysAgo(now, 7);
  const days = lastDays(now, timeZone);
  const inactiveSince = daysAgo(now, INACTIVE_DAYS);

  const [
    totalUsers,
    newThisWeek,
    newLastWeek,
    activeThisWeek,
    lockedByAdmin,
    lockedOut,
    inactive,
    tasks,
    reminders,
    habits,
    projects,
    checkInRows,
    recent,
  ] = await Promise.all([
    User.countDocuments(people),
    User.countDocuments({ ...people, createdAt: { $gte: week } }),
    User.countDocuments({ ...people, createdAt: { $gte: daysAgo(now, 14), $lt: week } }),
    User.countDocuments({ ...people, lastSeenAt: { $gte: week } }),
    User.countDocuments({ ...people, 'adminLock.at': { $exists: true } }),
    User.countDocuments({ ...people, adminLock: null, lockedUntil: { $gt: now } }),
    // Not seen for 90 days; accounts from before lastSeenAt existed count from their sign-up.
    User.countDocuments({
      ...people,
      $or: [{ lastSeenAt: { $lt: inactiveSince } }, { lastSeenAt: null, createdAt: { $lt: inactiveSince } }],
    }),
    Task.countDocuments({ deletedAt: null }),
    Reminder.countDocuments(),
    Habit.countDocuments(),
    Project.countDocuments(),
    // A check-in's date is the owner's local day, so it is grouped as stored.
    HabitCheckIn.aggregate([
      { $match: { date: { $gte: days[0], $lte: days.at(-1) } } },
      { $group: { _id: '$date', count: { $sum: 1 } } },
    ]),
    ActivityLog.find().sort({ createdAt: -1, _id: -1 }).limit(RECENT_ACTIVITY).lean(),
  ]);

  const checkIns = fillDays(days, checkInRows);
  return {
    users: {
      total: totalUsers,
      newThisWeek,
      newChange: percentChange(newThisWeek, newLastWeek),
      active: activeThisWeek,
      activeShare: percentOf(activeThisWeek, totalUsers),
      locked: lockedByAdmin + lockedOut,
      lockedByAdmin,
      lockedOut,
      inactive,
    },
    content: [
      { key: 'tasks', label: 'Tasks', count: tasks },
      { key: 'reminders', label: 'Reminders', count: reminders },
      { key: 'habits', label: 'Habits', count: habits },
      { key: 'projects', label: 'Projects', count: projects },
    ],
    checkIns,
    checkInTotal: checkIns.reduce((sum, day) => sum + day.count, 0),
    checkInMax: Math.max(...checkIns.map((day) => day.count)),
    recent,
    inactiveDays: INACTIVE_DAYS,
  };
}

module.exports = { overviewStats, lastDays, fillDays, percentChange, percentOf, CHART_DAYS };
