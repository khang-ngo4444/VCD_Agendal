const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { PROJECT_COLOURS } = require('../services/projects');
const { describeFrequency } = require('../services/habits');
const { MAX_NAME_LENGTH, parseHabitForm } = require('../validators/habit');

const NEW_HABIT = { name: '', colour: PROJECT_COLOURS[0].hex, frequencyType: 'daily', days: [], timesPerWeek: '3', reminderTime: '' };

const findOwnedHabit = (req) => findOwned(Habit, req.params.id, req.user._id);

exports.index = async (req, res) => {
  const habits = await Habit.find({ owner: req.user._id }).sort({ createdAt: 1 }).lean();
  const label = (habit) => describeFrequency(habit, req.user.preferences.weekStartsOn);
  res.render('habits/index', {
    title: 'Habits · Agendal',
    active: habits.filter((habit) => !habit.archivedAt),
    archived: habits.filter((habit) => habit.archivedAt),
    label,
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
  res.redirect('/habits');
};

// Archive hides the habit from the lists but keeps every check-in; unarchive brings it back.
exports.setArchived = async (req, res) => {
  const habit = await findOwnedHabit(req);
  const archive = req.body?.archived === '1';
  habit.archivedAt = archive ? new Date() : null;
  await habit.save();
  flash(req, 'success', archive ? `Archived “${habit.name}”. Its history is kept.` : `“${habit.name}” is back on your list.`);
  res.redirect('/habits');
};

exports.remove = async (req, res) => {
  const habit = await findOwnedHabit(req);
  await HabitCheckIn.deleteMany({ owner: req.user._id, habit: habit._id });
  await habit.deleteOne();
  flash(req, 'success', `Deleted “${habit.name}” and its check-ins.`);
  res.redirect('/habits');
};
