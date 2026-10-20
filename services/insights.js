// The numbers behind Insights (Figma W14): today's progress, completion rates, tasks per project, the 30-day trend
// and habit streaks, all in the user's time zone. The calculations are pure functions (tests/insights.test.js);
// loadInsights gathers the data for one user.
const Task = require('../models/Task');
const { loadSummaries } = require('./habits');
const { addDays, dayRange, parseDateInput, startOfWeek, toDateInput, zonedTime } = require('./dates');

// The instants a local day ("YYYY-MM-DD") starts at in `timeZone`.
const dayStart = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone).start;

// This week or month and the one before, as local days [from, to) — `to` is the first day after.
function periods(kind, today, weekStartsOn = 1) {
  if (kind === 'month') {
    const first = `${today.slice(0, 7)}-01`;
    const next = addDays(first, 32).slice(0, 7) + '-01';
    const previous = addDays(first, -1).slice(0, 7) + '-01';
    return { current: { from: first, to: next }, previous: { from: previous, to: first } };
  }
  const from = startOfWeek(today, weekStartsOn);
  return { current: { from, to: addDays(from, 7) }, previous: { from: addDays(from, -7), to: from } };
}

// When a task is meant to be done: its due date, or else its scheduled start.
const dueAt = (task) => task.dueDate ?? task.schedule?.start ?? null;

// Of the tasks due in [from, to) (instants), how many are done, and how many were done by their due date.
// rate and onTime are whole percentages, null when nothing was due.
function completionRate(tasks, from, to) {
  const due = tasks.filter((task) => {
    const at = dueAt(task);
    return at && at >= from && at < to;
  });
  const done = due.filter((task) => task.completedAt);
  const onTime = done.filter((task) => task.completedAt <= dueAt(task));
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
  return { due: due.length, done: done.length, rate: pct(done.length, due.length), onTime: pct(onTime.length, done.length) };
}

// Change between two percentages (or counts) for the "↑ 12 points vs last week" line: null when either is missing.
const change = (current, previous) => (current == null || previous == null ? null : current - previous);

async function loadInsights(user, { period = 'week', now = new Date() } = {}) {
  const timeZone = user.timeZone || 'UTC';
  const weekStartsOn = user.preferences?.weekStartsOn ?? 1;
  const today = toDateInput(now, timeZone);
  const todayStart = dayStart(today, timeZone);
  const tomorrowStart = dayStart(addDays(today, 1), timeZone);
  const kind = period === 'month' ? 'month' : 'week';
  const { current, previous } = periods(kind, today, weekStartsOn);
  const mine = { owner: user._id, deletedAt: null };
  const windowStart = dayStart(previous.from, timeZone);
  const windowEnd = dayStart(current.to, timeZone);

  const [periodTasks, todayScheduled, todayDue, overdue, summaries] = await Promise.all([
    Task.find({ ...mine, $or: [{ dueDate: { $gte: windowStart, $lt: windowEnd } }, { dueDate: null, 'schedule.start': { $gte: windowStart, $lt: windowEnd } }] }, { dueDate: 1, schedule: 1, completedAt: 1 }).lean(),
    // Today: the same tasks the Daily List shows (scheduled today, or unscheduled and due today).
    Task.find({ ...mine, 'schedule.start': { $gte: todayStart, $lt: tomorrowStart } }, { completedAt: 1 }).lean(),
    Task.find({ ...mine, 'schedule.start': null, dueDate: { $gte: todayStart, $lt: tomorrowStart } }, { completedAt: 1 }).lean(),
    Task.countDocuments({ ...mine, completedAt: null, dueDate: { $lt: todayStart } }),
    loadSummaries(user, today, { archivedAt: null }),
  ]);

  const dayTasks = [...todayScheduled, ...todayDue];
  const dueHabits = summaries.filter((summary) => summary.due);
  const rates = {
    current: completionRate(periodTasks, dayStart(current.from, timeZone), dayStart(current.to, timeZone)),
    previous: completionRate(periodTasks, dayStart(previous.from, timeZone), dayStart(previous.to, timeZone)),
  };

  return {
    today,
    period: kind,
    range: current,
    todayProgress: {
      tasks: { done: dayTasks.filter((task) => task.completedAt).length, total: dayTasks.length },
      habits: { done: dueHabits.filter((summary) => summary.doneOnDate).length, total: dueHabits.length },
      overdue,
    },
    rates,
    rateChange: change(rates.current.rate, rates.previous.rate),
    doneChange: change(rates.current.done, rates.previous.done),
  };
}

module.exports = { periods, completionRate, change, loadInsights };
