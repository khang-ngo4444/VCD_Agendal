const Project = require('../models/Project');
const Task = require('../models/Task');
const Event = require('../models/Event');
const { findOwned } = require('../services/ownership');
const { flash } = require('../middleware/flash');
const { PROJECT_COLOURS, PROJECT_SORT, taskCounts, moveProject } = require('../services/projects');
const { parseProject, COLOUR, MAX_NAME_LENGTH } = require('../validators/project');
const { safeReturnTo } = require('../services/returnTo');

const text = (value) => (typeof value === 'string' ? value : '');

async function renderIndex(req, res, { values = {}, errors = {} } = {}) {
  const owner = req.user._id;
  const [projects, countsFor] = await Promise.all([Project.find({ owner }).sort(PROJECT_SORT).lean(), taskCounts(owner)]);
  const cards = [
    { name: 'Inbox', href: '/inbox', colour: null, ...countsFor('inbox') },
    ...projects.map((project) => ({ id: String(project._id), name: project.name, href: `/projects/${project._id}`, colour: project.colour, icon: project.icon, ...countsFor(project._id) })),
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
  // New projects cycle through the presets so neighbours in the sidebar look different.
  const count = await Project.countDocuments({ owner: req.user._id });
  const { values, errors } = parseProject(req.body, { colour: PROJECT_COLOURS[count % PROJECT_COLOURS.length].hex });
  if (Object.keys(errors).length) return renderEditor(req, res, null, { values, errors });
  const last = await Project.findOne({ owner: req.user._id }).sort({ order: -1 }).select('order').lean();
  const project = await Project.create({ owner: req.user._id, ...values, order: (last?.order || 0) + 1 });
  flash(req, 'success', `Project “${project.name}” created.`);
  res.redirect(`/projects/${project._id}`);
};

function renderEditor(req, res, project, { values, errors = {} } = {}) {
  return res.status(Object.keys(errors).length ? 422 : 200).render('projects/form', {
    title: `${project ? 'Customize' : 'New'} project item · Agendal`, project,
    values: values || { name: project?.name || '', colour: project?.colour || '#2f6fde', icon: project?.icon || '' },
    errors, maxNameLength: MAX_NAME_LENGTH, validColour: COLOUR,
  });
}

exports.newForm = (req, res) => renderEditor(req, res, null);
exports.edit = async (req, res) => renderEditor(req, res, await findOwned(Project, req.params.id, req.user._id));
exports.update = async (req, res) => {
  const project = await findOwned(Project, req.params.id, req.user._id);
  const { values, errors } = parseProject(req.body, project);
  if (Object.keys(errors).length) return renderEditor(req, res, project, { values, errors });
  Object.assign(project, values);
  await project.save();
  flash(req, 'success', 'Project item updated.');
  res.redirect(`/projects/${project._id}`);
};
exports.move = async (req, res) => {
  const project = await findOwned(Project, req.params.id, req.user._id);
  const direction = req.body?.direction;
  if (!['up', 'down'].includes(direction)) return res.status(422).render('errors/error', { title: 'Invalid move · Agendal', status: 422, heading: 'Choose Move up or Move down', message: 'The item order was not changed.' });
  const changed = await moveProject(req.user._id, project._id, direction);
  flash(req, 'success', changed ? `Moved “${project.name}” ${direction}.` : `“${project.name}” is already ${direction === 'up' ? 'first' : 'last'}.`);
  res.redirect(safeReturnTo(req.body?.returnTo, '/projects'));
};


// Shared by /projects/:id and /inbox (project = null).
async function renderTaskList(req, res, project) {
  const tasks = await Task.find({ owner: req.user._id, project: project?._id ?? null, deletedAt: null }).lean();
  const byDueDate = (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || a.createdAt - b.createdAt;
  res.render('projects/show', {
    title: `${project ? project.name : 'Inbox'} · Agendal`,
    project,
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
  if (error) return renderEditor(req, res, project, { values: { name, colour: project.colour, icon: project.icon || '' }, errors: { name: error } });
  else {
    project.name = name;
    await project.save();
    flash(req, 'success', 'Project renamed.');
  }
  res.redirect(`/projects/${project._id}`);
};

exports.setColour = async (req, res) => {
  const project = await findOwned(Project, req.params.id, req.user._id);
  const colour = text(req.body?.colour).trim();
  if (!COLOUR.test(colour)) return renderEditor(req, res, project, { values: { name: project.name, colour, icon: project.icon || '' }, errors: { colour: 'Enter a six-digit colour, such as #2f6fde.' } });
  project.colour = colour;
  await project.save();
  flash(req, 'success', 'Colour updated.');
  res.redirect(`/projects/${project._id}`);
};

// The project goes, its tasks stay: they move to the Inbox.
exports.remove = async (req, res) => {
  const project = await findOwned(Project, req.params.id, req.user._id);
  await Task.updateMany({ owner: req.user._id, project: project._id }, { $set: { project: null } });
  const events = await Event.updateMany({ owner: req.user._id, project: project._id }, { $set: { project: null } });
  await project.deleteOne();
  flash(req, 'success', `“${project.name}” deleted. Its tasks are in the Inbox.${events.modifiedCount ? ' Its calendar events kept their dates with no project.' : ''}`);
  res.redirect('/projects');
};
