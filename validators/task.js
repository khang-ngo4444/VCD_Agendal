const { parseDateInput, parseTimeInput, zonedTime, endOfLocalDay } = require('../services/dates');

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const PRIORITIES = ['low', 'medium', 'high'];

const text = (value) => (typeof value === 'string' ? value : '');

// The three schedule fields (local date, start and end time) as { schedule } in UTC, or { error } to show.
// All three empty means "not scheduled": { schedule: null }.
function parseSchedule({ scheduleDate, scheduleStart, scheduleEnd }, timeZone) {
  if (![scheduleDate, scheduleStart, scheduleEnd].some(Boolean)) return { schedule: null };
  const day = parseDateInput(scheduleDate);
  const start = parseTimeInput(scheduleStart);
  const end = parseTimeInput(scheduleEnd);
  if (!day || !start || !end) return { error: 'Fill in the date, start and end time, or leave all three empty.' };
  if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) return { error: 'The end time must be after the start time.' };
  return { schedule: { start: zonedTime({ ...day, ...start }, timeZone), end: zonedTime({ ...day, ...end }, timeZone) } };
}

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

  const { error, schedule } = parseSchedule(values, timeZone);
  if (error) errors.schedule = error;
  else changes.schedule = schedule;

  return { values, errors, changes };
}

module.exports = { PRIORITIES, parseSchedule, parseTaskForm };
