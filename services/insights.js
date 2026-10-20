// The numbers behind Insights (Figma W14): today's progress, completion rates, tasks per project, the 30-day trend
// and habit streaks, all in the user's time zone. The calculations are pure functions (tests/insights.test.js);
// loadInsights gathers the data for one user.
const Task = require('../models/Task');
const { loadSummaries } = require('./habits');
const { addDays, dayRange, parseDateInput, toDateInput, zonedTime } = require('./dates');

// The instants a local day ("YYYY-MM-DD") starts at in `timeZone`.
const dayStart = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone).start;

async function loadInsights(user, { now = new Date() } = {}) {
  const timeZone = user.timeZone || 'UTC';
  const today = toDateInput(now, timeZone);
  const todayStart = dayStart(today, timeZone);
  const tomorrowStart = dayStart(addDays(today, 1), timeZone);
  const mine = { owner: user._id, deletedAt: null };

  const [todayScheduled, todayDue, overdue, summaries] = await Promise.all([
    // Today: the same tasks the Daily List shows (scheduled today, or unscheduled and due today).
    Task.find({ ...mine, 'schedule.start': { $gte: todayStart, $lt: tomorrowStart } }, { completedAt: 1 }).lean(),
    Task.find({ ...mine, 'schedule.start': null, dueDate: { $gte: todayStart, $lt: tomorrowStart } }, { completedAt: 1 }).lean(),
    Task.countDocuments({ ...mine, completedAt: null, dueDate: { $lt: todayStart } }),
    loadSummaries(user, today, { archivedAt: null }),
  ]);

  const dayTasks = [...todayScheduled, ...todayDue];
  const dueHabits = summaries.filter((summary) => summary.due);

  return {
    today,
    todayProgress: {
      tasks: { done: dayTasks.filter((task) => task.completedAt).length, total: dayTasks.length },
      habits: { done: dueHabits.filter((summary) => summary.doneOnDate).length, total: dueHabits.length },
      overdue,
    },
  };
}

module.exports = { loadInsights };
