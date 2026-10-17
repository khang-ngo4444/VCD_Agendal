const Project = require('../models/Project');
const Task = require('../models/Task');
const { findOwned } = require('../services/ownership');
const { flash } = require('../middleware/flash');
const { PROJECT_COLOURS, isPresetColour, taskCounts } = require('../services/projects');

const MAX_NAME_LENGTH = 60;

const text = (value) => (typeof value === 'string' ? value : '');

async function renderIndex(req, res, { values = {}, errors = {} } = {}) {
  const owner = req.user._id;
  const [projects, countsFor] = await Promise.all([Project.find({ owner }).sort({ createdAt: 1 }).lean(), taskCounts(owner)]);
  const cards = [
    { name: 'Inbox', href: '/inbox', colour: null, ...countsFor('inbox') },
    ...projects.map((project) => ({ name: project.name, href: `/projects/${project._id}`, colour: project.colour, ...countsFor(project._id) })),
  ];
  res.status(Object.keys(errors).length ? 422 : 200).render('projects/index', {
    title: 'Projects · Agendal',
    cards,
    values,
    errors,
    maxNameLength: MAX_NAME_LENGTH,
  });
}

function validateName(name) {
  if (!name) return 'Give the project a name.';
  if (name.length > MAX_NAME_LENGTH) return `Use at most ${MAX_NAME_LENGTH} characters.`;
  return null;
}

exports.index = (req, res) => renderIndex(req, res);

exports.create = async (req, res) => {
  const name = text(req.body?.name).trim();
  const error = validateName(name);
  if (error) return renderIndex(req, res, { values: { name }, errors: { name: error } });

  // New projects cycle through the presets so neighbours in the sidebar look different.
  const count = await Project.countDocuments({ owner: req.user._id });
  const project = await Project.create({ owner: req.user._id, name, colour: PROJECT_COLOURS[count % PROJECT_COLOURS.length].hex });
  flash(req, 'success', `Project “${project.name}” created.`);
  res.redirect(`/projects/${project._id}`);
};


// Shared by /projects/:id and /inbox (project = null).
async function renderTaskList(req, res, project) {
  const tasks = await Task.find({ owner: req.user._id, project: project?._id ?? null, deletedAt: null }).lean();
  const byDueDate = (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || a.createdAt - b.createdAt;
  res.render('projects/show', {
    title: `${project ? project.name : 'Inbox'} · Agendal`,
    project,
    projectColours: PROJECT_COLOURS,
    openTasks: tasks.filter((task) => !task.completedAt).sort(byDueDate),
    doneTasks: tasks.filter((task) => task.completedAt).sort((a, b) => b.completedAt - a.completedAt),
  });
}

exports.show = async (req, res) => renderTaskList(req, res, await findOwned(Project, req.params.id, req.user._id));

exports.inbox = (req, res) => renderTaskList(req, res, null);

exports.rename = async (req, res) => {
  const project = await findOwned(Project, req.params.id, req.user._id);
  const name = text(req.body?.name).trim();
  const error = validateName(name);
  if (error) flash(req, 'error', error);
  else {
    project.name = name;
    await project.save();
    flash(req, 'success', 'Project renamed.');
  }
  res.redirect(`/projects/${project._id}`);
};

exports.setColour = async (req, res) => {
  const project = await findOwned(Project, req.params.id, req.user._id);
  if (isPresetColour(req.body?.colour)) {
    project.colour = req.body.colour;
    await project.save();
    flash(req, 'success', 'Colour updated.');
  }
  res.redirect(`/projects/${project._id}`);
};

// The project goes, its tasks stay: they move to the Inbox.
exports.remove = async (req, res) => {
  const project = await findOwned(Project, req.params.id, req.user._id);
  await Task.updateMany({ owner: req.user._id, project: project._id }, { $set: { project: null } });
  await project.deleteOne();
  flash(req, 'success', `“${project.name}” deleted. Its tasks are in the Inbox.`);
  res.redirect('/projects');
};
