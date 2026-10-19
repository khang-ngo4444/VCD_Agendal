const { FREQUENCIES } = require('../models/Event');
const { addDays, endOfLocalDay, parseDateInput, parseTimeInput, zonedTime } = require('../services/dates');

const MAX_TITLE_LENGTH = 200;
const MAX_LOCATION_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;

const text = (value) => (typeof value === 'string' ? value : '');
const pad = (number) => String(number).padStart(2, '0');

// Reads the event form (Figma W24). Times are the user's local wall clock. Returns { values } to re-fill the form,
// { errors } per field, and { changes } to save when there are none. The project id is checked by the controller.
function parseEventForm(body = {}, timeZone) {
  const values = {
    title: text(body.title).trim(),
    date: text(body.date),
    start: text(body.start),
    end: text(body.end),
    allDay: body.allDay === 'on',
    repeat: text(body.repeat),
    until: text(body.until),
    location: text(body.location).trim(),
    notes: text(body.notes).trim(),
    project: text(body.project),
  };
  const errors = {};

  if (!values.title) errors.title = 'Give the event a title.';
  else if (values.title.length > MAX_TITLE_LENGTH) errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`;
  if (values.location.length > MAX_LOCATION_LENGTH) errors.location = `Keep the location under ${MAX_LOCATION_LENGTH} characters.`;
  if (values.notes.length > MAX_NOTES_LENGTH) errors.notes = `Keep the notes under ${MAX_NOTES_LENGTH} characters.`;
  if (values.repeat && !FREQUENCIES.includes(values.repeat)) errors.repeat = 'Pick how often it repeats.';

  const day = parseDateInput(values.date);
  const start = parseTimeInput(values.start);
  const end = parseTimeInput(values.end);
  let when = null;
  if (!day) errors.date = 'Pick a date.';
  else if (values.allDay) {
    const next = parseDateInput(addDays(values.date, 1));
    when = { start: zonedTime(day, timeZone), end: zonedTime(next, timeZone) };
  } else if (!start || !end) errors.time = 'Fill in when it starts and ends, or make it all-day.';
  else if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
    const suggestion = `${pad(Math.min(start.hour + 1, 23))}:${pad(start.minute)}`;
    errors.time = `End time must be after the start (${values.start}). Try ${suggestion}?`;
  } else when = { start: zonedTime({ ...day, ...start }, timeZone), end: zonedTime({ ...day, ...end }, timeZone) };

  const until = values.until ? parseDateInput(values.until) : null;
  if (values.repeat && values.until) {
    if (!until) errors.until = 'Pick the last date, or leave it empty to repeat forever.';
    else if (day && values.until < values.date) errors.until = 'The repeat can’t end before the first event.';
  }

  const changes = {
    title: values.title,
    allDay: values.allDay,
    ...when,
    location: values.location || undefined,
    notes: values.notes || undefined,
    repeat: values.repeat ? { frequency: values.repeat, until: until ? endOfLocalDay(until, timeZone) : undefined } : undefined,
  };
  return { values, errors, changes };
}

module.exports = { parseEventForm };
