const User = require('../models/User');
const { addDays, parseDateInput, startOfWeek, toDateInput, toTimeInput } = require('../services/dates');

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

// The Calendar (Figma W23 day, W03 week, W11 month): ?view=day|week|month (default: the user's saved layout)
// and ?date=YYYY-MM-DD (default: today), in the user's time zone and first day of the week.
exports.show = async (req, res) => {
  const { timeZone, preferences } = req.user;
  const today = toDateInput(new Date(), timeZone);
  const view = VIEWS.includes(req.query.view) ? req.query.view : preferences.calendarLayout;
  const date = parseDateInput(req.query.date) ? req.query.date : today;
  const step = { day: (n) => addDays(date, n), week: (n) => addDays(date, 7 * n), month: (n) => firstOfMonth(date, n) }[view];
  const [hour, minute] = toTimeInput(new Date(), timeZone).split(':').map(Number);

  res.render('calendar', {
    title: 'Calendar · Agendal',
    view,
    date,
    today,
    nowMinutes: hour * 60 + minute,
    previous: step(-1),
    next: step(1),
    eyebrow: view === 'day' ? label(date, { weekday: 'long' }) : null,
    heading: view === 'day' ? label(date, { day: 'numeric', month: 'long' }) : label(date, { month: 'long', year: 'numeric' }),
    days: daysFor(view, date, preferences.weekStartsOn).map((day) => ({
      date: day,
      number: Number(day.slice(8)),
      weekday: label(day, { weekday: 'short' }),
      name: label(day, { weekday: 'long', day: 'numeric', month: 'long' }),
      inMonth: day.slice(0, 7) === date.slice(0, 7),
      isToday: day === today,
    })),
  });
};
