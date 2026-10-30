const { FREQUENCY_TYPES } = require('../models/Habit');
const { isPresetColour } = require('../services/projects');
const { parseTimeInput } = require('../services/dates');

const MAX_NAME_LENGTH = 60;

const text = (value) => (typeof value === 'string' ? value : '');

// Reads the habit form. Returns { values } to re-fill it, { errors } per field, and { changes } to save when there are none.
// `days` arrives as one string or an array, depending on how many boxes were ticked.
function parseHabitForm(body = {}) {
  const values = {
    name: text(body.name).trim(),
    colour: text(body.colour),
    frequencyType: text(body.frequencyType),
    days: [body.days ?? []].flat().map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    timesPerWeek: text(body.timesPerWeek),
    reminderTime: text(body.reminderTime),
  };
  const errors = {};

  if (!values.name) errors.name = 'Give the habit a name.';
  else if (values.name.length > MAX_NAME_LENGTH) errors.name = `Use at most ${MAX_NAME_LENGTH} characters.`;
  if (!isPresetColour(values.colour)) errors.colour = 'Pick one of the colours.';

  const frequency = { type: values.frequencyType };
  if (!FREQUENCY_TYPES.includes(values.frequencyType)) errors.frequency = 'Pick how often.';
  else if (values.frequencyType === 'days') {
    if (values.days.length) frequency.days = [...new Set(values.days)].sort();
    else errors.frequency = 'Tick at least one day.';
  } else if (values.frequencyType === 'timesPerWeek') {
    const times = Number(values.timesPerWeek);
    if (Number.isInteger(times) && times >= 1 && times <= 7) frequency.timesPerWeek = times;
    else errors.frequency = 'Choose between 1 and 7 times a week.';
  }

  if (values.reminderTime && !parseTimeInput(values.reminderTime)) errors.reminderTime = 'Pick a time, or leave it empty.';

  const changes = { name: values.name, colour: values.colour, frequency, reminderTime: values.reminderTime || undefined };
  return { values, errors, changes };
}

module.exports = { MAX_NAME_LENGTH, parseHabitForm };
