const mongoose = require('mongoose');
const Event = require('../models/Event');
const Project = require('../models/Project');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { safeReturnTo } = require('../services/returnTo');
const { formatDay, parseDateInput, toDateInput, toTimeInput } = require('../services/dates');
const { parseEventForm } = require('../validators/event');
const { SCOPES, applyDelete, applyEdit, occurrences } = require('../services/recurrence');

const findOwnedEvent = (req) => findOwned(Event, req.params.id, req.user._id);
const returnToOf = (req) => safeReturnTo(req.body?.returnTo ?? req.query.returnTo, '/calendar');

// The occurrence of a repeating event that was opened (?occurrence=<its original start>), or null for a one-off event.
function occurrenceOf(event, value, timeZone) {
  const original = new Date(typeof value === 'string' ? value : NaN);
  if (!event.repeat?.frequency || Number.isNaN(original.getTime())) return null;
  const list = occurrences(event, new Date(0), new Date(original.getTime() + 1), timeZone);
  return list.find((occurrence) => occurrence.original.getTime() === original.getTime()) ?? null;
}

// The saved event (or the opened occurrence of it) as form strings, in the user's time zone.
function formValues(event, timeZone, occurrence = null) {
  const { start, end, title } = occurrence ?? event;
  return {
    title,
    date: toDateInput(start, timeZone),
    start: event.allDay ? '09:00' : toTimeInput(start, timeZone),
    end: event.allDay ? '10:00' : toTimeInput(end, timeZone),
    allDay: event.allDay,
    repeat: event.repeat?.frequency ?? '',
    until: event.repeat?.until ? toDateInput(event.repeat.until, timeZone) : '',
    location: event.location ?? '',
    notes: event.notes ?? '',
    project: event.project ? String(event.project) : '',
  };
}

function renderForm(req, res, { event = null, occurrence = null, values, errors = {} }) {
  res.status(Object.keys(errors).length ? 422 : 200).render('events/form', {
    title: `${event ? event.title : 'New event'} · Agendal`,
    event,
    occurrence,
    scope: SCOPES.includes(req.body?.scope) ? req.body.scope : 'this',
    values,
    errors,
    returnTo: returnToOf(req),
  });
}

// The project picked in the form, or null for none. An id that isn't one of the user's projects is a form error.
async function pickedProject(req, values, errors) {
  if (!values.project) return null;
  const project = mongoose.isValidObjectId(values.project) && (await Project.findOne({ _id: values.project, owner: req.user._id }));
  if (!project) errors.project = 'Pick a project from the list.';
  return project || null;
}

// ?date=YYYY-MM-DD picks the day (the calendar's "New event" passes the day it shows).
exports.new = (req, res) => {
  const date = parseDateInput(req.query.date) ? req.query.date : toDateInput(new Date(), req.user.timeZone);
  renderForm(req, res, {
    values: { title: '', date, start: '09:00', end: '10:00', allDay: false, repeat: '', until: '', location: '', notes: '', project: '' },
  });
};

exports.create = async (req, res) => {
  const { values, errors, changes } = parseEventForm(req.body, req.user.timeZone);
  const project = await pickedProject(req, values, errors);
  if (Object.keys(errors).length) return renderForm(req, res, { values, errors });
  const event = await Event.create({ owner: req.user._id, project: project?._id ?? null, ...changes });
  flash(req, 'success', `Added “${event.title}” on ${formatDay(event.start, req.user.timeZone)}.`);
  res.redirect(returnToOf(req));
};

// ?occurrence=<start> opens one occurrence of a repeating event; saving then asks which ones to change.
exports.edit = async (req, res) => {
  const event = await findOwnedEvent(req);
  const occurrence = occurrenceOf(event, req.query.occurrence, req.user.timeZone);
  renderForm(req, res, { event, occurrence, values: formValues(event, req.user.timeZone, occurrence) });
};

const SAVED = { this: 'Saved this event.', following: 'Saved this and the following events.', all: 'Saved every event in the series.' };
const DELETED = { this: 'Deleted this event.', following: 'Deleted this and the following events.', all: 'Deleted the whole series.' };
const scopeOf = (req) => (SCOPES.includes(req.body?.scope) ? req.body.scope : 'this');

exports.update = async (req, res) => {
  const event = await findOwnedEvent(req);
  const occurrence = occurrenceOf(event, req.body?.occurrence, req.user.timeZone);
  const { values, errors, changes } = parseEventForm(req.body, req.user.timeZone);
  const project = await pickedProject(req, values, errors);
  if (Object.keys(errors).length) return renderForm(req, res, { event, occurrence, values, errors });

  const edited = { ...changes, project: project?._id ?? null };
  if (!occurrence) event.set(edited);
  else {
    const { series, newSeries } = applyEdit(event.toObject(), occurrence.original, edited, scopeOf(req));
    event.set(series);
    if (newSeries) await Event.create(newSeries);
  }
  await event.save();
  flash(req, 'success', occurrence ? SAVED[scopeOf(req)] : 'Event saved.');
  res.redirect(returnToOf(req));
};

exports.remove = async (req, res) => {
  const event = await findOwnedEvent(req);
  const occurrence = occurrenceOf(event, req.body?.occurrence, req.user.timeZone);
  const series = occurrence ? applyDelete(event.toObject(), occurrence.original, scopeOf(req)) : null;
  if (series) await event.set(series).save();
  else await event.deleteOne();
  flash(req, 'success', occurrence ? DELETED[scopeOf(req)] : `Deleted “${event.title}”.`);
  res.redirect(returnToOf(req));
};
