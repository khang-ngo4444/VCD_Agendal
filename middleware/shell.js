const Project = require('../models/Project');
const { taskCounts } = require('../services/projects');

// Data every page inside the app shell needs: the current path and the sidebar's projects with done / total counts.
async function loadShell(req, res, next) {
  const owner = req.user._id;
  const [projects, countsFor] = await Promise.all([Project.find({ owner }).sort({ createdAt: 1 }).lean(), taskCounts(owner)]);

  res.locals.currentPath = req.path;
  res.locals.sidebarProjects = [
    { href: '/inbox', name: 'Inbox', colour: null, ...countsFor('inbox') },
    ...projects.map((project) => ({
      href: `/projects/${project._id}`,
      name: project.name,
      colour: project.colour,
      ...countsFor(project._id),
    })),
  ];
  next();
}

module.exports = loadShell;
