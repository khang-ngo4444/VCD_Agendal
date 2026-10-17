const Project = require('../models/Project');
const Task = require('../models/Task');

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOUR = '#64748b'; // Project model default

// Data every page inside the app shell needs: the current path and the sidebar's project list.
async function loadShell(req, res, next) {
  const owner = req.user._id;
  const [projects, openCounts] = await Promise.all([
    Project.find({ owner }).sort({ createdAt: 1 }).lean(),
    Task.aggregate([
      { $match: { owner, deletedAt: null, completedAt: null } },
      { $group: { _id: '$project', count: { $sum: 1 } } },
    ]),
  ]);
  const openCount = new Map(openCounts.map(({ _id, count }) => [String(_id), count])); // Inbox key is 'null'

  res.locals.currentPath = req.path;
  res.locals.inboxCount = openCount.get('null') ?? 0;
  res.locals.sidebarProjects = projects.map((project) => ({
    href: `/projects/${project._id}`,
    name: project.name,
    // Rendered into a style attribute, so only a plain hex colour gets through.
    colour: HEX_COLOUR.test(project.colour) ? project.colour : FALLBACK_COLOUR,
    openCount: openCount.get(String(project._id)) ?? 0,
  }));
  next();
}

module.exports = loadShell;
