const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const Task = require('../models/Task');
const User = require('../models/User');
const { assignLanes } = require('../services/calendar');
const { addDays, dayRange, formatTime, parseDateInput, startOfWeek, toDateInput, toTimeInput, zonedTime } = require('../services/dates');

const VIEWS = User.schema.path('preferences.calendarLayout').enumValues; // day, week, month

const label = (date, options) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const firstOfMonth = (date, months = 0) => {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
};

// The days a view shows: one, a week from the user's first weekday, or the whole weeks around a month.
function daysFor(view, date, weekStartsOn) {
  if (view === 'day') return [date];
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date, weekStartsOn), i));
  const lastOfMonth = addDays(firstOfMonth(date, 1), -1);
  const days = [];
  for (let day = startOfWeek(firstOfMonth(date), weekStartsOn); day <= lastOfMonth || days.length % 7; day = addDays(day, 1)) days.push(day);
  return days;
}

const dayStart = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone).start;

// Scheduled tasks for each shown day, placed by minute of the local day (cut off at midnight) with overlap lanes.
async function scheduledByDay(owner, days, timeZone, projects) {
  const from = dayStart(days[0], timeZone);
  const to = dayStart(addDays(days.at(-1), 1), timeZone);
  const tasks = await Task.find({ owner, deletedAt: null, 'schedule.start': { $gte: from, $lt: to } }).lean();
  const project = (task) => projects.find((item) => item.id === (task.project ? String(task.project) : null));
  const byDay = new Map(days.map((day) => [day, []]));
  for (const task of tasks) {
    const day = toDateInput(task.schedule.start, timeZone);
    const midnight = dayStart(day, timeZone);
    byDay.get(day)?.push({
      kind: 'task',
      id: String(task._id),
      title: task.title,
      href: `/tasks/${task._id}`,
      done: Boolean(task.completedAt),
      colour: project(task)?.colour ?? 'var(--color-base-300)',
      projectName: project(task)?.name,
      startMinute: (task.schedule.start - midnight) / 60000,
      endMinute: Math.min(24 * 60, (task.schedule.end - midnight) / 60000),
      time: `${formatTime(task.schedule.start, timeZone)}–${formatTime(task.schedule.end, timeZone)}`,
    });
  }
  for (const [day, items] of byDay) byDay.set(day, assignLanes(items));
  return byDay;
}

// Open tasks without a time, for the side panel: one group per project in sidebar order (Inbox first).
async function unscheduledByProject(owner, projects) {
  const tasks = await Task.find({ owner, deletedAt: null, completedAt: null, 'schedule.start': null }).sort({ dueDate: 1, createdAt: 1 }).lean();
  return projects
    .map((project) => ({ ...project, tasks: tasks.filter((task) => (task.project ? String(task.project) : null) === project.id) }))
    .filter((group) => group.tasks.length);
}

// Habits checked in on each shown day, as { name, colour }; archived habits still count, their history is real.
async function checkInsByDay(owner, days) {
  const [habits, checkIns] = await Promise.all([
    Habit.find({ owner }, { name: 1, colour: 1 }).lean(),
    HabitCheckIn.find({ owner, date: { $gte: days[0], $lte: days.at(-1) } }, { habit: 1, date: 1 }).lean(),
  ]);
  const byDay = new Map(days.map((day) => [day, []]));
  for (const checkIn of checkIns) {
    const habit = habits.find((item) => item._id.equals(checkIn.habit));
    if (habit) byDay.get(checkIn.date)?.push({ name: habit.name, colour: habit.colour });
  }
  return byDay;
}

// The Calendar (Figma W23 day, W03 week, W11 month): ?view=day|week|month (default: the user's saved layout)
// and ?date=YYYY-MM-DD (default: today), in the user's time zone and first day of the week.
exports.show = async (req, res) => {
  const { timeZone, preferences } = req.user;
  const today = toDateInput(new Date(), timeZone);
  const view = VIEWS.includes(req.query.view) ? req.query.view : preferences.calendarLayout;
  const date = parseDateInput(req.query.date) ? req.query.date : today;
  const step = { day: (n) => addDays(date, n), week: (n) => addDays(date, 7 * n), month: (n) => firstOfMonth(date, n) }[view];
  const [hour, minute] = toTimeInput(new Date(), timeZone).split(':').map(Number);
  const days = daysFor(view, date, preferences.weekStartsOn);
  const [items, unscheduled, habits] = await Promise.all([
    scheduledByDay(req.user._id, days, timeZone, res.locals.sidebarProjects),
    view === 'month' ? [] : unscheduledByProject(req.user._id, res.locals.sidebarProjects),
    checkInsByDay(req.user._id, days),
  ]);

  res.render('calendar', {
    title: 'Calendar · Agendal',
    view,
    date,
    today,
    nowMinutes: hour * 60 + minute,
    unscheduled,
    previous: step(-1),
    next: step(1),
    eyebrow: view === 'day' ? label(date, { weekday: 'long' }) : null,
    heading: view === 'day' ? label(date, { day: 'numeric', month: 'long' }) : label(date, { month: 'long', year: 'numeric' }),
    days: days.map((day) => ({
      date: day,
      number: Number(day.slice(8)),
      weekday: label(day, { weekday: 'short' }),
      name: label(day, { weekday: 'long', day: 'numeric', month: 'long' }),
      inMonth: day.slice(0, 7) === date.slice(0, 7),
      isToday: day === today,
      items: items.get(day),
      habits: habits.get(day),
    })),
  });
};
