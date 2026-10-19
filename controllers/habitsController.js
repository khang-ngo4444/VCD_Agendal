const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { safeReturnTo } = require('../services/returnTo');
const { PROJECT_COLOURS } = require('../services/projects');
const { addDays, parseDateInput, startOfWeek, toDateInput } = require('../services/dates');
const { DAY_NAMES, completion, isDue, loadSummaries } = require('../services/habits');
const { MAX_NAME_LENGTH, parseHabitForm } = require('../validators/habit');

const BACKFILL_DAYS = 7; // check-ins can be added or undone for today and the 6 days before

const NEW_HABIT = { name: '', colour: PROJECT_COLOURS[0].hex, frequencyType: 'daily', days: [], timesPerWeek: '3', reminderTime: '' };

const findOwnedHabit = (req) => findOwned(Habit, req.params.id, req.user._id);

const localToday = (user) => toDateInput(new Date(), user.timeZone);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/; // ?month=2026-10
const shiftMonth = (month, months) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + months, 1)).toISOString().slice(0, 7);
};

// Today's habits: the ones due today first, then the rest greyed out; archived ones in a collapsed list.
exports.index = async (req, res) => {
  const today = localToday(req.user);
  const summaries = await loadSummaries(req.user, today);
  const active = summaries.filter(({ habit }) => !habit.archivedAt).sort((a, b) => b.due - a.due);
  res.render('habits/index', {
    title: 'Habits · Agendal',
    today,
    active,
    archived: summaries.filter(({ habit }) => habit.archivedAt),
    doneCount: active.filter((summary) => summary.due && summary.doneOnDate).length,
    dueCount: active.filter((summary) => summary.due).length,
  });
};

// Habit detail: streaks, completion rates and a month of check-ins (?month=YYYY-MM, default this month).
exports.show = async (req, res) => {
  const { _id } = await findOwnedHabit(req);
  const today = localToday(req.user);
  const weekStartsOn = req.user.preferences.weekStartsOn;
  const [summary] = await loadSummaries(req.user, today, { _id });
  const { habit, done, start } = summary;

  const month = MONTH.test(req.query.month) ? req.query.month : today.slice(0, 7);
  const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const format = (date, options) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const days = [];
  // Whole weeks, from the week holding the 1st to the week holding the last day.
  for (let date = startOfWeek(`${month}-01`, weekStartsOn); date <= lastOfMonth || days.length % 7; date = addDays(date, 1)) {
    const state = done.has(date) ? 'done' : date > today || date < start || !isDue(habit, date) ? 'idle' : date === today ? 'open' : 'missed';
    days.push({ date, number: Number(date.slice(8)), inMonth: date.startsWith(month), isToday: date === today, state, label: format(date, { day: 'numeric', month: 'long' }) });
  }

  res.render('habits/show', {
    title: `${habit.name} · Agendal`,
    summary,
    days,
    monthLabel: format(`${month}-01`, { month: 'long', year: 'numeric' }),
    prevMonth: shiftMonth(month, -1),
    nextMonth: month < today.slice(0, 7) ? shiftMonth(month, 1) : null,
    weekdayNames: DAY_NAMES.map((_, i) => DAY_NAMES[(i + weekStartsOn) % 7]),
    last30: completion(habit, done, { start: [start, addDays(today, -29)].sort()[1], today, weekStartsOn }),
    allTime: completion(habit, done, { start, today, weekStartsOn }),
  });
};

// The saved habit as form strings.
function formValues(habit) {
  return {
    name: habit.name,
    colour: habit.colour,
    frequencyType: habit.frequency.type,
    days: habit.frequency.days ?? [],
    timesPerWeek: String(habit.frequency.timesPerWeek ?? 3),
    reminderTime: habit.reminderTime ?? '',
  };
}

function renderForm(req, res, { habit = null, values, errors = {} }) {
  res.status(Object.keys(errors).length ? 422 : 200).render('habits/form', {
    title: `${habit ? `Edit ${habit.name}` : 'New habit'} · Agendal`,
    habit,
    values,
    errors,
    colours: PROJECT_COLOURS,
    maxNameLength: MAX_NAME_LENGTH,
  });
}

exports.new = (req, res) => renderForm(req, res, { values: NEW_HABIT });

exports.create = async (req, res) => {
  const { values, errors, changes } = parseHabitForm(req.body);
  if (Object.keys(errors).length) return renderForm(req, res, { values, errors });
  const habit = await Habit.create({ owner: req.user._id, ...changes });
  flash(req, 'success', `Habit “${habit.name}” created.`);
  res.redirect('/habits');
};

exports.edit = async (req, res) => {
  const habit = await findOwnedHabit(req);
  renderForm(req, res, { habit, values: formValues(habit) });
};

exports.update = async (req, res) => {
  const habit = await findOwnedHabit(req);
  const { values, errors, changes } = parseHabitForm(req.body);
  if (Object.keys(errors).length) return renderForm(req, res, { habit, values, errors });
  habit.set(changes); // replaces the whole frequency, so days or timesPerWeek left from an old choice go too
  await habit.save();
  flash(req, 'success', 'Habit saved.');
  res.redirect(`/habits/${habit._id}`);
};

// Archive hides the habit from the lists but keeps every check-in; unarchive brings it back.
exports.setArchived = async (req, res) => {
  const habit = await findOwnedHabit(req);
  const archive = req.body?.archived === '1';
  habit.archivedAt = archive ? new Date() : null;
  await habit.save();
  flash(req, 'success', archive ? `Archived “${habit.name}”. Its history is kept.` : `“${habit.name}” is back on your list.`);
  res.redirect(`/habits/${habit._id}`);
};

exports.remove = async (req, res) => {
  const habit = await findOwnedHabit(req);
  await HabitCheckIn.deleteMany({ owner: req.user._id, habit: habit._id });
  await habit.deleteOne();
  flash(req, 'success', `Deleted “${habit.name}” and its check-ins.`);
  res.redirect('/habits');
};

// Check in (done=1) or undo (done=0) one local day. Only today and the 6 days before; never the future.
exports.checkIn = async (req, res) => {
  const habit = await findOwnedHabit(req);
  const date = typeof req.body?.date === 'string' ? req.body.date : '';
  const today = localToday(req.user);
  const returnTo = safeReturnTo(req.body?.returnTo, '/habits');

  if (!parseDateInput(date) || date > today || date <= addDays(today, -BACKFILL_DAYS)) {
    flash(req, 'error', 'You can check in for today and the 6 days before, not other days.');
    return res.redirect(returnTo);
  }
  if (req.body?.done === '1') {
    // An upsert, so a repeated click finds the day already there; if two requests race, the unique index stops the second.
    await HabitCheckIn.updateOne({ habit: habit._id, date }, { $setOnInsert: { owner: req.user._id } }, { upsert: true }).catch((err) => {
      if (err.code !== 11000) throw err;
    });
    flash(req, 'success', `Checked in “${habit.name}”.`);
  } else {
    await HabitCheckIn.deleteOne({ habit: habit._id, date });
    flash(req, 'success', `Check-in removed from “${habit.name}”.`);
  }
  res.redirect(returnTo);
};
