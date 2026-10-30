const Task = require('../models/Task');
const { eventsBetween } = require('../services/events');
const { localDayRange, loadDay } = require('../services/daily');
const { addDays, formatDay, parseDateInput, startOfWeek, toDateInput } = require('../services/dates');

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
  const mine = { owner: req.user._id, deletedAt: null };

  // The day's tasks, habits and events come from services/daily.js, shared with the daily summary.
  const [{ start, scheduled, due, overdue, habits, events }, week] = await Promise.all([
    loadDay(req.user, date, { today, projects: res.locals.sidebarProjects }),
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
    counts: { scheduled: scheduled.length, due: due.length, overdue: overdue.length, events: events.length },
    // The day's timeline: all-day events, then events and scheduled tasks by start time.
    schedule: [...events.map((event) => ({ event })), ...scheduled.map((task) => ({ task }))].sort(
      (a, b) => Boolean(b.event?.allDay) - Boolean(a.event?.allDay) || (a.event?.start ?? a.task.schedule.start) - (b.event?.start ?? b.task.schedule.start)
    ),
    overdue,
    habits: habits.filter((summary) => summary.due),
    habitsEditable: date <= today && date > addDays(today, -7), // the check-in window (controllers/habitsController.js)
    scheduled,
    due: due.sort((a, b) => Boolean(a.completedAt) - Boolean(b.completedAt) || a.createdAt - b.createdAt), // open first
  });
};

const UPCOMING_DAYS = 7;
const MAX_LATER = 50; // ponytail: Later is capped, not paged; add paging if people plan months ahead

// Upcoming (Figma W19): open tasks from tomorrow on, grouped by the day they're scheduled (or else due),
// one group per day for the next 7 days, then everything after that under "Later".
exports.upcoming = async (req, res) => {
  const { timeZone } = req.user;
  const today = toDateInput(new Date(), timeZone);
  const from = localDayRange(addDays(today, 1), timeZone).start;
  const [tasks, events] = await Promise.all([
    Task.find({
      owner: req.user._id,
      deletedAt: null,
      completedAt: null,
      $or: [{ 'schedule.start': { $gte: from } }, { 'schedule.start': null, dueDate: { $gte: from } }],
    }).lean(),
    // Events only for the 7 days: repeating ones would fill "Later" forever.
    eventsBetween(req.user._id, from, localDayRange(addDays(today, UPCOMING_DAYS), timeZone).end, timeZone, res.locals.sidebarProjects),
  ]);

  const when = (task) => task.schedule?.start ?? task.dueDate;
  const lastDay = addDays(today, UPCOMING_DAYS);
  const groups = new Map();
  for (const task of tasks.sort((a, b) => when(a) - when(b))) {
    const day = toDateInput(when(task), timeZone);
    const key = day <= lastDay ? day : 'later';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const later = (groups.get('later') ?? []).slice(0, MAX_LATER);
  groups.delete('later');
  const dayLabel = (day) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

  for (const event of events) {
    const day = toDateInput(event.start, timeZone);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push({ event });
  }
  const startOf = (item) => (item.event ? item.event.start : when(item));
  const days = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({ day, label: dayLabel(day), tomorrow: day === addDays(today, 1), items: items.sort((a, b) => startOf(a) - startOf(b)) }));
  const shown = [...days.flatMap((group) => group.items.filter((item) => !item.event)), ...later];

  res.render('upcoming', {
    title: 'Upcoming · Agendal',
    days,
    later,
    count: shown.length,
    eventCount: events.length,
    highCount: shown.filter((task) => task.priority === 'high').length,
  });
};
