const mongoose = require('mongoose');
const Event = require('../models/Event');
const Project = require('../models/Project');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { safeReturnTo } = require('../services/returnTo');
const { formatDay, parseDateInput, toDateInput, toTimeInput } = require('../services/dates');
const { parseEventForm } = require('../validators/event');

const findOwnedEvent = (req) => findOwned(Event, req.params.id, req.user._id);
const returnToOf = (req) => safeReturnTo(req.body?.returnTo ?? req.query.returnTo, '/calendar');

// The saved event as form strings, in the user's time zone.
function formValues(event, timeZone) {
  return {
    title: event.title,
    date: toDateInput(event.start, timeZone),
    start: event.allDay ? '09:00' : toTimeInput(event.start, timeZone),
    end: event.allDay ? '10:00' : toTimeInput(event.end, timeZone),
    allDay: event.allDay,
    repeat: event.repeat?.frequency ?? '',
    until: event.repeat?.until ? toDateInput(event.repeat.until, timeZone) : '',
    location: event.location ?? '',
    notes: event.notes ?? '',
    project: event.project ? String(event.project) : '',
  };
}

function renderForm(req, res, { event = null, values, errors = {} }) {
  res.status(Object.keys(errors).length ? 422 : 200).render('events/form', {
    title: `${event ? event.title : 'New event'} · Agendal`,
    event,
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

exports.edit = async (req, res) => {
  const event = await findOwnedEvent(req);
  renderForm(req, res, { event, values: formValues(event, req.user.timeZone) });
};

exports.update = async (req, res) => {
  const event = await findOwnedEvent(req);
  const { values, errors, changes } = parseEventForm(req.body, req.user.timeZone);
  const project = await pickedProject(req, values, errors);
  if (Object.keys(errors).length) return renderForm(req, res, { event, values, errors });
  event.set({ ...changes, project: project?._id ?? null });
  await event.save();
  flash(req, 'success', 'Event saved.');
  res.redirect(returnToOf(req));
};

exports.remove = async (req, res) => {
  const event = await findOwnedEvent(req);
  await event.deleteOne();
  flash(req, 'success', `Deleted “${event.title}”.`);
  res.redirect(returnToOf(req));
};
