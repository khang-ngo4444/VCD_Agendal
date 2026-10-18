const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { isOverdue, toDateInput, toTimeInput } = require('../services/dates');
const { PRIORITIES, parseTaskForm } = require('../validators/task');
const taskReminders = require('../services/taskReminders');

const MAX_TITLE_LENGTH = 200;

const text = (value) => (typeof value === 'string' ? value : '');

// Only same-site paths, so a crafted returnTo can't bounce the user to another site. Parsed with URL, because
// browsers read tricks like "/\evil.example" as "//evil.example".
function safeReturnTo(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return '/inbox';
  const url = new URL(path, 'http://agendal.invalid');
  return url.origin === 'http://agendal.invalid' ? url.pathname + url.search : '/inbox';
}

const findOwnedTask = (req) => findOwned(Task, req.params.id, req.user._id, { deletedAt: null });

exports.new = (req, res) => res.render('tasks/new', { title: 'New task · Agendal' });

// Quick-add: a title is enough. The task starts in Backlog, in the Inbox unless a project was picked.
exports.create = async (req, res) => {
  const body = req.body ?? {};
  const returnTo = safeReturnTo(body.returnTo);
  const title = text(body.title).trim();
  if (!title || title.length > MAX_TITLE_LENGTH) {
    flash(req, 'error', title ? `Keep the title under ${MAX_TITLE_LENGTH} characters.` : 'Type a title for the task.');
    return res.redirect(returnTo);
  }

  const project = body.project ? await findOwned(Project, body.project, req.user._id) : null;
  await Task.create({ owner: req.user._id, project: project?._id ?? null, title });
  flash(req, 'success', `Added “${title}” to ${project ? project.name : 'the Inbox'}.`);
  res.redirect(returnTo);
};

exports.setComplete = async (req, res) => {
  const task = await findOwnedTask(req);
  const done = req.body?.done === '1';
  task.completedAt = done ? new Date() : null;
  await task.save();
  flash(req, 'success', done ? `Done: “${task.title}”.` : `Reopened “${task.title}”.`);
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
  };
}

async function renderTask(req, res, task, { values, errors = {} } = {}) {
  const project = task.project && (await Project.findOne({ _id: task.project, owner: req.user._id }).lean());
  const reminder = taskReminders.describe(await taskReminders.findPending(task), req.user.timeZone);
  res.status(Object.keys(errors).length ? 422 : 200).render('tasks/show', {
    title: `${task.title} · Agendal`,
    task,
    reminder,
    reminderPresets: taskReminders.PRESETS,
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

  const { schedule, ...fields } = changes;
  task.set({ ...fields, project: project?._id ?? null });
  task.set('schedule', schedule ?? undefined);
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
};

// Reminder picker (W30): a preset counted back from the scheduled start.
exports.setReminder = async (req, res) => {
  const task = await findOwnedTask(req);
  const { reminder, error } = await taskReminders.setPreset(task, req.body?.preset);
  if (error) flash(req, 'error', REMINDER_ERRORS[error]);
  else flash(req, 'success', `Reminder set: ${taskReminders.describe(reminder, req.user.timeZone).label}.`);
  res.redirect(`/tasks/${task._id}`);
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
