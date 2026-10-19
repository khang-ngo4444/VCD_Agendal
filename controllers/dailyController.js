const Task = require('../models/Task');
const { addDays, dayRange, formatDay, parseDateInput, startOfWeek, toDateInput, zonedTime } = require('../services/dates');

// The instants a local day ("YYYY-MM-DD") starts and ends at in `timeZone`.
const localDayRange = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone);

// The week strip above the list: the 7 days around `date`, with a dot on days that have tasks due or scheduled.
async function weekStrip(mine, date, today, { timeZone, preferences }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date, preferences.weekStartsOn), i));
  const from = localDayRange(days[0], timeZone).start;
  const to = localDayRange(days[6], timeZone).end;
  const tasks = await Task.find(
    { ...mine, $or: [{ dueDate: { $gte: from, $lt: to } }, { 'schedule.start': { $gte: from, $lt: to } }] },
    { dueDate: 1, 'schedule.start': 1 }
  ).lean();
  const busy = new Set(tasks.map((task) => toDateInput(task.schedule?.start ?? task.dueDate, timeZone)));
  const label = (day, options) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  return {
    range: `${label(days[0], { day: 'numeric', month: 'short' })} – ${label(days[6], { day: 'numeric', month: 'short' })}`,
    previous: addDays(date, -7),
    next: addDays(date, 7),
    days: days.map((day) => ({
      date: day,
      letter: label(day, { weekday: 'narrow' }),
      number: Number(day.slice(8)),
      name: label(day, { weekday: 'long', day: 'numeric', month: 'long' }),
      selected: day === date,
      isToday: day === today,
      busy: busy.has(day),
    })),
  };
}

// The Daily List (Figma W01 "Today"): everything for one local day, today unless ?date=YYYY-MM-DD picks another.
exports.today = async (req, res) => {
  const { timeZone } = req.user;
  const today = toDateInput(new Date(), timeZone);
  const date = parseDateInput(req.query.date) ? req.query.date : today;
  const { start, end } = localDayRange(date, timeZone);
  const mine = { owner: req.user._id, deletedAt: null };

  const [scheduled, due, overdue, week] = await Promise.all([
    Task.find({ ...mine, 'schedule.start': { $gte: start, $lt: end } }).sort({ 'schedule.start': 1 }).lean(),
    Task.find({ ...mine, 'schedule.start': null, dueDate: { $gte: start, $lt: end } }).lean(),
    // Overdue only makes sense looking at today: a due date is the end of its day, so before today's start = late.
    date === today ? Task.find({ ...mine, completedAt: null, dueDate: { $lt: start } }).sort({ dueDate: 1 }).lean() : [],
    weekStrip(mine, date, today, req.user),
  ]);
  const dayTasks = [...scheduled, ...due];
  const firstName = (req.user.name || '').split(' ')[0];

  res.render('today', {
    title: `${date === today ? 'Today' : formatDay(start, timeZone)} · Agendal`,
    date,
    today,
    week,
    heading: date === today ? 'Today' : formatDay(start, timeZone),
    eyebrow: new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(start),
    progress: { done: dayTasks.filter((task) => task.completedAt).length, total: dayTasks.length, firstName },
    counts: { scheduled: scheduled.length, due: due.length, overdue: overdue.length },
    overdue,
    scheduled,
    due: due.sort((a, b) => Boolean(a.completedAt) - Boolean(b.completedAt) || a.createdAt - b.createdAt), // open first
  });
};
