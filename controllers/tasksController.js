const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { safeReturnTo } = require('../services/returnTo');
const { isOverdue, toDateInput, toTimeInput } = require('../services/dates');
const { PRIORITIES, parseTaskForm } = require('../validators/task');

const MAX_TITLE_LENGTH = 200;

const text = (value) => (typeof value === 'string' ? value : '');

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

const CHEERS = ['Nice!', 'Well done!', 'Great work!', 'One down!', 'Nailed it!'];

// Done (done=1) or reopened. Finishing gets a little cheer and an Undo, which posts back here without done=1.
exports.setComplete = async (req, res) => {
  const task = await findOwnedTask(req);
  const done = req.body?.done === '1';
  task.completedAt = done ? new Date() : null;
  await task.save();
  if (done) {
    const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    flash(req, 'success', `${cheer} “${task.title}” is done.`, { undoUrl: `/tasks/${task._id}/complete` });
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
  };
}

async function renderTask(req, res, task, { values, errors = {} } = {}) {
  const project = task.project && (await Project.findOne({ _id: task.project, owner: req.user._id }).lean());
  res.status(Object.keys(errors).length ? 422 : 200).render('tasks/show', {
    title: `${task.title} · Agendal`,
    task,
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
  flash(req, 'success', 'Task saved.');
  res.redirect(`/tasks/${task._id}`);
};

// "Remove schedule": the task keeps its project and due date and simply becomes unscheduled again.
exports.unschedule = async (req, res) => {
  const task = await findOwnedTask(req);
  task.set('schedule', undefined);
  await task.save();
  flash(req, 'success', 'Schedule removed. The task is unscheduled again.');
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
