const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { escapeRegex } = require('../services/regex');
const { DUES, STATUSES, isFiltered, parseSearch, searchFilter } = require('../services/taskSearch');
const { safeReturnTo } = require('../services/returnTo');
const { columnLabel, followRepeat, reopenedStatus, setColumn, topOrder } = require('../services/tasks');
const { formatDay, formatTime, isOverdue, toDateInput, toTimeInput } = require('../services/dates');
const { PRIORITIES, parseSchedule, parseTaskForm } = require('../validators/task');
const taskReminders = require('../services/taskReminders');

const MAX_TITLE_LENGTH = 200;

const text = (value) => (typeof value === 'string' ? value : '');

const findOwnedTask = (req) => findOwned(Task, req.params.id, req.user._id, { deletedAt: null });

exports.new = (req, res) => res.render('tasks/new', { title: 'New task · Agendal' });

const MAX_RESULTS = 50;

// Search (Figma W06): the header's search box and the filter panel (W21), applied as you type (app.js).
// The matching rules are in services/taskSearch.js. Open tasks come first.
exports.search = async (req, res) => {
  const search = parseSearch(req.query);
  const filtered = isFiltered(search);
  const tasks =
    search.words.length || filtered
      ? await Task.find(searchFilter(search, req.user)).sort({ completedAt: 1, updatedAt: -1 }).limit(MAX_RESULTS).lean()
      : [];
  // The typed words, for the result titles to highlight (a capture group, so String.split keeps the matches).
  const highlight = search.words.length ? new RegExp(`(${search.words.map(escapeRegex).join('|')})`, 'gi') : null;
  res.render('search', {
    title: search.q ? `${search.q} · Search · Agendal` : 'Search · Agendal',
    searchQuery: search.q,
    search,
    filtered,
    tasks,
    maxResults: MAX_RESULTS,
    highlight,
    priorities: PRIORITIES,
    statuses: STATUSES,
    dues: DUES,
  });
};

// Quick-add: a title is enough. The task starts in Backlog, in the Inbox unless a project was picked.
// The Calendar's slot form also sends scheduleDate, scheduleStart and scheduleEnd.
exports.create = async (req, res) => {
  const body = req.body ?? {};
  const returnTo = safeReturnTo(body.returnTo);
  const title = text(body.title).trim();
  const { error, schedule } = parseSchedule({ scheduleDate: text(body.scheduleDate), scheduleStart: text(body.scheduleStart), scheduleEnd: text(body.scheduleEnd) }, req.user.timeZone);
  if (!title || title.length > MAX_TITLE_LENGTH || error) {
    flash(req, 'error', error ?? (title ? `Keep the title under ${MAX_TITLE_LENGTH} characters.` : 'Type a title for the task.'));
    return res.redirect(returnTo);
  }

  const project = body.project ? await findOwned(Project, body.project, req.user._id) : null;
  await Task.create({ owner: req.user._id, project: project?._id ?? null, title, schedule: schedule ?? undefined });
  const when = schedule ? ` for ${formatDay(schedule.start, req.user.timeZone)}, ${formatTime(schedule.start, req.user.timeZone)}` : '';
  flash(req, 'success', `Added “${title}” to ${project ? project.name : 'the Inbox'}${when}.`);
  res.redirect(returnTo);
};

const CHEERS = ['Nice!', 'Well done!', 'Great work!', 'One down!', 'Nailed it!'];

// Done (done=1) or reopened. Finishing gets a little cheer and an Undo, which posts back here without done=1.
// Either way the Board card follows: to the top of Done, or back to the column the task's date suggests.
// A repeating task comes back as its next occurrence (services/tasks.js followRepeat), and Undo takes that back.
exports.setComplete = async (req, res) => {
  const task = await findOwnedTask(req);
  const done = req.body?.done === '1';
  const wasDone = task.status === 'done';
  setColumn(task, done ? 'done' : reopenedStatus(task, req.user.timeZone));
  task.order = await topOrder(req.user._id, task.status);
  await task.save();
  const next = await followRepeat(task, wasDone, req.user.timeZone);
  if (done) {
    const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    const again = next ? ` Next one: ${formatDay(next.schedule?.start ?? next.dueDate, req.user.timeZone)}.` : '';
    flash(req, 'success', `${cheer} “${task.title}” is done.${again}`, { undoUrl: `/tasks/${task._id}/complete` });
  } else flash(req, 'success', `Reopened “${task.title}”.`);
  res.redirect(safeReturnTo(req.body?.returnTo));
};

// The saved task as form strings, in the user's time zone.
function formValues(task, timeZone) {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    project: task.project ? String(task.project) : '',
    dueDate: task.dueDate ? toDateInput(task.dueDate, timeZone) : '',
    scheduleDate: task.schedule?.start ? toDateInput(task.schedule.start, timeZone) : '',
    scheduleStart: task.schedule?.start ? toTimeInput(task.schedule.start, timeZone) : '',
    scheduleEnd: task.schedule?.end ? toTimeInput(task.schedule.end, timeZone) : '',
    repeat: task.repeat?.frequency ?? '',
    until: task.repeat?.until ? toDateInput(task.repeat.until, timeZone) : '',
  };
}

async function renderTask(req, res, task, { values, errors = {} } = {}) {
  const project = task.project && (await Project.findOne({ _id: task.project, owner: req.user._id }).lean());
  const pending = await taskReminders.findPending(task);
  const reminder = taskReminders.describe(pending, req.user.timeZone);
  res.status(Object.keys(errors).length ? 422 : 200).render('tasks/show', {
    title: `${task.title} · Agendal`,
    task,
    reminder,
    reminderPresets: taskReminders.PRESETS,
    reminderDefaults: taskReminders.customDefaults(task, pending, req.user.timeZone),
    values: values ?? formValues(task, req.user.timeZone),
    errors,
    priorities: PRIORITIES,
    overdue: isOverdue(task),
    backHref: project ? `/projects/${project._id}` : '/inbox',
    backLabel: project ? project.name : 'Inbox',
  });
}

exports.show = async (req, res) => renderTask(req, res, await findOwnedTask(req));

exports.update = async (req, res) => {
  const task = await findOwnedTask(req);
  const { values, errors, changes } = parseTaskForm(req.body, req.user.timeZone);

  const project =
    values.project && mongoose.isValidObjectId(values.project)
      ? await Project.findOne({ _id: values.project, owner: req.user._id })
      : null;
  if (values.project && !project) errors.project = 'Pick a project from the list.';
  if (Object.keys(errors).length) return renderTask(req, res, task, { values, errors });

  const { schedule, repeat, ...fields } = changes;
  task.set({ ...fields, project: project?._id ?? null });
  task.set('schedule', schedule ?? undefined);
  task.set('repeat', repeat ?? undefined);
  await task.save();
  const reminder = await taskReminders.syncWithSchedule(task);
  flash(req, 'success', REMINDER_AFTER_SAVE[reminder] ?? 'Task saved.');
  res.redirect(`/tasks/${task._id}`);
};

// What the toast says when saving the task also moved or removed its preset reminder.
const REMINDER_AFTER_SAVE = {
  moved: 'Task saved. Its reminder moved with the new time.',
  removed: 'Task saved. Its reminder was removed: the task has no start time it can count back from.',
  passed: 'Task saved. Its reminder was removed: that time before the new start has already passed.',
};

const REMINDER_ERRORS = {
  unknown_preset: 'Pick one of the reminder times in the list.',
  not_scheduled: 'Schedule the task first: presets count back from its start time.',
  past: 'That time has already passed. Pick a later reminder.',
  invalid_time: 'Pick a date and a time for the reminder.',
};

// Reminder picker (W30): a preset counted back from the scheduled start, or (custom=1) a date and time the user picks.
exports.setReminder = async (req, res) => {
  const task = await findOwnedTask(req);
  const body = req.body ?? {};
  const { reminder, error } =
    body.custom === '1'
      ? await taskReminders.setCustom(task, body.reminderDate, body.reminderTime, req.user.timeZone)
      : await taskReminders.setPreset(task, body.preset);
  if (error) flash(req, 'error', REMINDER_ERRORS[error]);
  else flash(req, 'success', `Reminder set: ${taskReminders.describe(reminder, req.user.timeZone).label}.`);
  res.redirect(`/tasks/${task._id}`);
};

exports.removeReminder = async (req, res) => {
  const task = await findOwnedTask(req);
  const removed = await taskReminders.remove(task);
  flash(req, 'success', removed ? 'Reminder removed. It won’t be sent.' : 'This task has no reminder.');
  res.redirect(`/tasks/${task._id}`);
};

// The custom date-and-time form on its own page: the dialog's no-JS version.
exports.showReminder = async (req, res) => {
  const task = await findOwnedTask(req);
  const pending = await taskReminders.findPending(task);
  res.render('tasks/reminder', {
    title: `Reminder · ${task.title} · Agendal`,
    task,
    reminder: taskReminders.describe(pending, req.user.timeZone),
    defaults: taskReminders.customDefaults(task, pending, req.user.timeZone),
  });
};

// Calendar drag and drop: a new date, start and end (local times), keeping everything else about the task.
exports.reschedule = async (req, res) => {
  const task = await findOwnedTask(req);
  const body = req.body ?? {};
  const returnTo = safeReturnTo(body.returnTo, '/calendar');
  const { error, schedule } = parseSchedule({ scheduleDate: text(body.scheduleDate), scheduleStart: text(body.scheduleStart), scheduleEnd: text(body.scheduleEnd) }, req.user.timeZone);
  if (error || !schedule) {
    flash(req, 'error', error ?? 'Pick a time to move the task to.');
    return res.redirect(returnTo);
  }
  task.set('schedule', schedule);
  await task.save();
  flash(req, 'success', `Moved “${task.title}” to ${formatDay(schedule.start, req.user.timeZone)}, ${formatTime(schedule.start, req.user.timeZone)}.`);
  res.redirect(returnTo);
};

// "Remove schedule": the task keeps its project and due date and simply becomes unscheduled again.
exports.unschedule = async (req, res) => {
  const task = await findOwnedTask(req);
  task.set('schedule', undefined);
  await task.save();
  const reminder = await taskReminders.syncWithSchedule(task);
  flash(req, 'success', reminder === 'removed' ? 'Schedule removed, and its reminder with it.' : 'Schedule removed. The task is unscheduled again.');
  res.redirect(`/tasks/${task._id}`);
};

const listPath = (task) => (task.project ? `/projects/${task.project}` : '/inbox');

// Soft delete: the task disappears at once, and the toast offers Undo for at least 5 seconds.
exports.remove = async (req, res) => {
  const task = await findOwnedTask(req);
  task.deletedAt = new Date();
  await task.save();
  flash(req, 'success', `Deleted “${task.title}”.`, { undoUrl: `/tasks/${task._id}/restore` });
  res.redirect(listPath(task));
};

exports.restore = async (req, res) => {
  const task = await findOwned(Task, req.params.id, req.user._id, { deletedAt: { $ne: null } });
  task.deletedAt = null;
  await task.save();
  flash(req, 'success', `Restored “${task.title}”.`);
  res.redirect(listPath(task));
};

// Board: a card dragged to a position, or moved with its "Move to" menu. A drop sends `ids`, the column's cards top
// to bottom, and each one's position is saved; from the menu the card lands at the top of the column.
// ponytail: with a project filter on, `ids` holds only the visible cards, so hidden ones keep their old positions.
exports.move = async (req, res) => {
  const task = await findOwnedTask(req);
  const status = req.body?.status;
  const ids = [req.body?.ids ?? []].flat().filter((id) => mongoose.isValidObjectId(id));
  const returnTo = safeReturnTo(req.body?.returnTo, '/board');
  if (!columnLabel(status)) {
    flash(req, 'error', 'Pick one of the board columns.');
    return res.redirect(returnTo);
  }

  const changesColumn = task.status !== status;
  const wasDone = task.status === 'done';
  if (!ids.includes(task.id)) task.order = await topOrder(req.user._id, status);
  setColumn(task, status);
  await task.save();
  await followRepeat(task, wasDone, req.user.timeZone);
  if (ids.includes(task.id)) {
    // The owner in the filter means ids of other people's tasks change nothing.
    await Task.bulkWrite(ids.map((id, order) => ({ updateOne: { filter: { _id: id, owner: req.user._id }, update: { $set: { order } } } })));
  }
  if (changesColumn) flash(req, 'success', `Moved “${task.title}” to ${columnLabel(status)}.`);
  res.redirect(returnTo);
};
