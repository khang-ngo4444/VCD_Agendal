const Task = require('../models/Task');
const { dayRange, formatDay, parseDateInput, toDateInput, zonedTime } = require('../services/dates');

// The instants a local day ("YYYY-MM-DD") starts and ends at in `timeZone`.
const localDayRange = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone);

// The Daily List (Figma W01 "Today"): everything for one local day, today by default.
exports.today = async (req, res) => {
  const { timeZone } = req.user;
  const today = toDateInput(new Date(), timeZone);
  const date = today;
  const { start, end } = localDayRange(date, timeZone);
  const mine = { owner: req.user._id, deletedAt: null };

  const [scheduled, due, overdue] = await Promise.all([
    Task.find({ ...mine, 'schedule.start': { $gte: start, $lt: end } }).sort({ 'schedule.start': 1 }).lean(),
    Task.find({ ...mine, 'schedule.start': null, dueDate: { $gte: start, $lt: end } }).lean(),
    // Overdue only makes sense looking at today: a due date is the end of its day, so before today's start = late.
    date === today ? Task.find({ ...mine, completedAt: null, dueDate: { $lt: start } }).sort({ dueDate: 1 }).lean() : [],
  ]);
  const dayTasks = [...scheduled, ...due];
  const firstName = (req.user.name || '').split(' ')[0];

  res.render('today', {
    title: 'Today · Agendal',
    date,
    heading: date === today ? 'Today' : formatDay(start, timeZone),
    eyebrow: new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(start),
    progress: { done: dayTasks.filter((task) => task.completedAt).length, total: dayTasks.length, firstName },
    counts: { scheduled: scheduled.length, due: due.length, overdue: overdue.length },
    overdue,
    scheduled,
    due: due.sort((a, b) => Boolean(a.completedAt) - Boolean(b.completedAt) || a.createdAt - b.createdAt), // open first
  });
};
