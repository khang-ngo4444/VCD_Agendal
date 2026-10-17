const { parseDateInput, parseTimeInput, zonedTime, endOfLocalDay } = require('../services/dates');

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const PRIORITIES = ['low', 'medium', 'high'];

const text = (value) => (typeof value === 'string' ? value : '');

// Reads the task detail form. Dates and times are the user's local wall clock, converted with their time zone.
// Returns { values } to re-fill the form, { errors } per field, and { changes } to apply when there are no errors.
// The project id is checked by the controller, which can look it up.
function parseTaskForm(body = {}, timeZone) {
  const values = {
    title: text(body.title).trim(),
    description: text(body.description).trim(),
    priority: text(body.priority),
    project: text(body.project),
    dueDate: text(body.dueDate),
    scheduleDate: text(body.scheduleDate),
    scheduleStart: text(body.scheduleStart),
    scheduleEnd: text(body.scheduleEnd),
  };
  const errors = {};
  const changes = { title: values.title, description: values.description, priority: values.priority };

  if (!values.title) errors.title = 'Give the task a title.';
  else if (values.title.length > MAX_TITLE_LENGTH) errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`;
  if (values.description.length > MAX_DESCRIPTION_LENGTH) errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
  if (!PRIORITIES.includes(values.priority)) errors.priority = 'Pick High, Medium or Low.';

  if (!values.dueDate) changes.dueDate = null;
  else {
    const due = parseDateInput(values.dueDate);
    if (due) changes.dueDate = endOfLocalDay(due, timeZone);
    else errors.dueDate = 'Pick a date from the calendar.';
  }

  const scheduleFields = [values.scheduleDate, values.scheduleStart, values.scheduleEnd];
  if (scheduleFields.every((field) => !field)) changes.schedule = null; // all empty: not scheduled
  else {
    const day = parseDateInput(values.scheduleDate);
    const start = parseTimeInput(values.scheduleStart);
    const end = parseTimeInput(values.scheduleEnd);
    if (!day || !start || !end) errors.schedule = 'Fill in the date, start and end time, or leave all three empty.';
    else if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) errors.schedule = 'The end time must be after the start time.';
    else changes.schedule = { start: zonedTime({ ...day, ...start }, timeZone), end: zonedTime({ ...day, ...end }, timeZone) };
  }

  return { values, errors, changes };
}

module.exports = { PRIORITIES, parseTaskForm };
