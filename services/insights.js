// The numbers behind Insights (Figma W14): today's progress, completion rates, focus time, tasks per project, the 30-day
// trend, the semester heatmap and habit streaks, all in the user's time zone. The calculations are pure functions (tests/unit/insights/insights.test.js);
// loadInsights gathers the data for one user.
const Task = require('../models/Task');
const HabitCheckIn = require('../models/HabitCheckIn');
const FocusSession = require('../models/FocusSession');
const { loadSummaries, completion } = require('./habits');
const { taskCounts } = require('./projects');
const { pickSuggestion } = require('./suggestions');
const { addDays, dayRange, parseDateInput, startOfWeek, toDateInput, zonedTime } = require('./dates');

const TREND_DAYS = 30;
const SEMESTER_WEEKS = 20; // about one university semester
const PERIODS = ['week', 'month', 'semester'];

// The instants a local day ("YYYY-MM-DD") starts at in `timeZone`.
const dayStart = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone).start;

// This week, month or semester (the last 20 weeks, this week included) and the one before, as local days [from, to):
// `to` is the first day after.
function periods(kind, today, weekStartsOn = 1) {
  if (kind === 'semester') {
    const to = addDays(startOfWeek(today, weekStartsOn), 7);
    const from = addDays(to, -7 * SEMESTER_WEEKS);
    return { current: { from, to }, previous: { from: addDays(from, -7 * SEMESTER_WEEKS), to: from } };
  }
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

// One entry per local day, 0 where nothing happened. counts: Map of "YYYY-MM-DD" → number.
const fillDays = (days, counts) => days.map((date) => ({ date, count: counts.get(date) ?? 0 }));

// Count Dates per local day.
function countByDay(dates, timeZone) {
  const counts = new Map();
  for (const date of dates) {
    const day = toDateInput(date, timeZone);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

// Semester activity (W14): the last 20 weeks as columns of 7 days, oldest first, each day with its count and a shade
// level 0–4 (0 = nothing; 1–4 are quarters of the busiest day, so one huge day doesn't wash the rest out to level 1).
// Days after today are kept, marked future, so the last column is a whole week. Month labels sit on the first
// column whose week starts in that month.
function semesterGrid(today, weekStartsOn, counts) {
  const to = addDays(startOfWeek(today, weekStartsOn), 7);
  const from = addDays(to, -7 * SEMESTER_WEEKS);
  const days = Array.from({ length: 7 * SEMESTER_WEEKS }, (_, i) => addDays(from, i));
  const past = days.filter((date) => date <= today);
  const max = Math.max(0, ...past.map((date) => counts.get(date) ?? 0));
  const level = (count) => (count ? Math.min(4, Math.ceil((count / max) * 4)) : 0);
  const weeks = [];
  const months = [];
  for (let w = 0; w < SEMESTER_WEEKS; w++) {
    const week = days.slice(w * 7, w * 7 + 7).map((date) => {
      const count = date <= today ? (counts.get(date) ?? 0) : 0;
      return { date, count, level: level(count), future: date > today };
    });
    const month = week[0].date.slice(0, 7);
    if (!months.length || months.at(-1).month !== month) months.push({ month, column: w });
    weeks.push(week);
  }
  const total = past.reduce((sum, date) => sum + (counts.get(date) ?? 0), 0);
  const busiest = past.reduce((best, date) => ((counts.get(date) ?? 0) > (best?.count ?? 0) ? { date, count: counts.get(date) } : best), null);
  return { from, to, weeks, months, total, busiest };
}

// Habit table rows, sorted by the column the user picked (ties by name).
const HABIT_SORTS = {
  current: (a, b) => b.current - a.current,
  longest: (a, b) => b.longest - a.longest,
  rate: (a, b) => (b.rate ?? -1) - (a.rate ?? -1),
};
const sortKey = (sort) => (typeof sort === 'string' && Object.hasOwn(HABIT_SORTS, sort) ? sort : 'current'); // not ?sort=constructor
function sortHabits(rows, sort) {
  const by = HABIT_SORTS[sortKey(sort)];
  return [...rows].sort((a, b) => by(a, b) || a.name.localeCompare(b.name));
}

async function loadInsights(user, { period = 'week', sort = 'current', projects = [], now = new Date() } = {}) {
  const timeZone = user.timeZone || 'UTC';
  const weekStartsOn = user.preferences?.weekStartsOn ?? 1;
  const today = toDateInput(now, timeZone);
  const todayStart = dayStart(today, timeZone);
  const tomorrowStart = dayStart(addDays(today, 1), timeZone);
  const kind = PERIODS.includes(period) ? period : 'week';
  const semester = periods('semester', today, weekStartsOn).current; // the heatmap always shows the last 20 weeks
  const { current, previous } = periods(kind, today, weekStartsOn);
  const trendDays = Array.from({ length: TREND_DAYS }, (_, i) => addDays(today, i - TREND_DAYS + 1));
  const mine = { owner: user._id, deletedAt: null };
  const windowStart = dayStart(previous.from, timeZone);
  const windowEnd = dayStart(current.to, timeZone);

  const [periodTasks, todayScheduled, todayDue, overdueTasks, completed, checkIns, summaries, countsFor, focusSessions] = await Promise.all([
    Task.find({ ...mine, $or: [{ dueDate: { $gte: windowStart, $lt: windowEnd } }, { dueDate: null, 'schedule.start': { $gte: windowStart, $lt: windowEnd } }] }, { dueDate: 1, schedule: 1, completedAt: 1 }).lean(),
    // Today: the same tasks the Daily List shows (scheduled today, or unscheduled and due today).
    Task.find({ ...mine, 'schedule.start': { $gte: todayStart, $lt: tomorrowStart } }, { completedAt: 1 }).lean(),
    Task.find({ ...mine, 'schedule.start': null, dueDate: { $gte: todayStart, $lt: tomorrowStart } }, { completedAt: 1 }).lean(),
    Task.find({ ...mine, completedAt: null, dueDate: { $lt: todayStart } }, { dueDate: 1, schedule: 1 }).lean(),
    // Everything finished in the last 20 weeks: the heatmap, the 30-day trend and the suggestions all read from it.
    Task.find({ ...mine, completedAt: { $gte: dayStart(semester.from, timeZone) } }, { completedAt: 1 }).lean(),
    HabitCheckIn.find({ owner: user._id, date: { $gte: trendDays[0], $lte: today } }, { date: 1 }).lean(),
    loadSummaries(user, today, { archivedAt: null }),
    taskCounts(user._id),
    FocusSession.find({ owner: user._id, startedAt: { $gte: windowStart, $lt: windowEnd } }, { startedAt: 1, minutes: 1 }).lean(),
  ]);

  const dayTasks = [...todayScheduled, ...todayDue];
  const dueHabits = summaries.filter((summary) => summary.due);
  const rates = {
    current: completionRate(periodTasks, dayStart(current.from, timeZone), dayStart(current.to, timeZone)),
    previous: completionRate(periodTasks, dayStart(previous.from, timeZone), dayStart(previous.to, timeZone)),
  };
  const completedCounts = countByDay(completed.map((task) => task.completedAt), timeZone);
  const currentStart = dayStart(current.from, timeZone);
  const focusMinutes = (inCurrent) => focusSessions.filter((session) => (session.startedAt >= currentStart) === inCurrent).reduce((sum, session) => sum + session.minutes, 0);
  const focus = { current: focusMinutes(true), previous: focusMinutes(false) };
  const checkInCounts = new Map();
  for (const { date } of checkIns) checkInCounts.set(date, (checkInCounts.get(date) ?? 0) + 1);

  const habitRows = summaries.map(({ habit, done, start, streak }) => {
    const last30 = completion(habit, done, { start: [start, addDays(today, -29)].sort()[1], today, weekStartsOn });
    return {
      id: String(habit._id),
      name: habit.name,
      colour: habit.colour,
      current: streak.current,
      longest: streak.longest,
      unit: streak.unit,
      rate: last30.rate == null ? null : Math.round(last30.rate * 100),
    };
  });

  return {
    today,
    period: kind,
    range: current,
    todayProgress: {
      tasks: { done: dayTasks.filter((task) => task.completedAt).length, total: dayTasks.length },
      habits: { done: dueHabits.filter((summary) => summary.doneOnDate).length, total: dueHabits.length },
      overdue: overdueTasks.length,
    },
    rates,
    rateChange: change(rates.current.rate, rates.previous.rate),
    doneChange: change(rates.current.done, rates.previous.done),
    focus: { ...focus, change: focus.previous || focus.current ? focus.current - focus.previous : null },
    projects: projects.map((project) => {
      const { done, total } = countsFor(project.id ?? 'inbox');
      return { ...project, done, open: total - done, total };
    }),
    trend: { tasks: fillDays(trendDays, completedCounts), checkIns: fillDays(trendDays, checkInCounts) },
    semester: semesterGrid(today, weekStartsOn, completedCounts),
    habits: sortHabits(habitRows, sort),
    sort: sortKey(sort),
    suggestion: pickSuggestion({ completedAt: completed.map((task) => task.completedAt), overdueTasks, summaries, today, now, timeZone, dismissed: user.suggestionsDismissed }),
  };
}

module.exports = { periods, completionRate, change, fillDays, countByDay, semesterGrid, sortHabits, loadInsights, TREND_DAYS, SEMESTER_WEEKS, PERIODS };
