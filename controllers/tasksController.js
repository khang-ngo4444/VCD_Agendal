const Project = require('../models/Project');
const Task = require('../models/Task');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');

const MAX_TITLE_LENGTH = 200;

const text = (value) => (typeof value === 'string' ? value : '');

// Only same-site paths, so a crafted returnTo can't bounce the user to another site. Parsed with URL, because
// browsers read tricks like "/\evil.example" as "//evil.example".
function safeReturnTo(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return '/inbox';
  const url = new URL(path, 'http://agendal.invalid');
  return url.origin === 'http://agendal.invalid' ? url.pathname + url.search : '/inbox';
}

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
  const task = await findOwned(Task, req.params.id, req.user._id, { deletedAt: null });
  const done = req.body?.done === '1';
  task.completedAt = done ? new Date() : null;
  await task.save();
  flash(req, 'success', done ? `Done: “${task.title}”.` : `Reopened “${task.title}”.`);
  res.redirect(safeReturnTo(req.body?.returnTo));
};
