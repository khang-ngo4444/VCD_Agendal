// One local day of a user's plan: what the Daily List shows (controllers/dailyController.js) and what the daily
// summary sends (services/dailySummary.js), so the two always agree.
const Task = require('../models/Task');
const { loadSummaries } = require('./habits');
const { eventsBetween } = require('./events');
const { dayRange, parseDateInput, zonedTime } = require('./dates');

// The instants a local day ("YYYY-MM-DD") starts and ends at in `timeZone`.
const localDayRange = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone);

// `today` is the user's local today: overdue tasks are only listed when looking at it. `projects` (the sidebar list)
// gives events their colours; without it they use the accent colour.
async function loadDay(user, date, { today, projects = [] }) {
  const { timeZone } = user;
  const { start, end } = localDayRange(date, timeZone);
  const mine = { owner: user._id, deletedAt: null };

  const [scheduled, due, overdue, habits, events] = await Promise.all([
    Task.find({ ...mine, 'schedule.start': { $gte: start, $lt: end } }).sort({ 'schedule.start': 1 }).lean(),
    Task.find({ ...mine, 'schedule.start': null, dueDate: { $gte: start, $lt: end } }).lean(),
    // Overdue only makes sense looking at today: a due date is the end of its day, so before today's start = late.
    date === today ? Task.find({ ...mine, completedAt: null, dueDate: { $lt: start } }).sort({ dueDate: 1 }).lean() : [],
    loadSummaries(user, date, { archivedAt: null }),
    eventsBetween(user._id, start, end, timeZone, projects),
  ]);
  return { start, end, scheduled, due, overdue, habits, events };
}

module.exports = { localDayRange, loadDay };
