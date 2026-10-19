const Project = require('../models/Project');
const Reminder = require('../models/Reminder');
const { taskCounts } = require('../services/projects');

// Data every page inside the app shell needs: the current path and the sidebar's projects with done / total counts.
async function loadShell(req, res, next) {
  const owner = req.user._id;
  const [projects, countsFor, reminders] = await Promise.all([
    Project.find({ owner }).sort({ createdAt: 1 }).lean(),
    taskCounts(owner),
    // Unsent reminders, so task rows, cards and calendar chips can show a bell (views/tasks/_reminder-badge.ejs).
    req.method === 'GET' ? Reminder.find({ owner, sent: false }, { task: 1, remindAt: 1 }).sort({ remindAt: 1 }).lean() : [],
  ]);
  const reminderAt = new Map();
  for (const reminder of reminders) if (!reminderAt.has(String(reminder.task))) reminderAt.set(String(reminder.task), reminder.remindAt);
  res.locals.reminderFor = (taskId) => reminderAt.get(String(taskId)) ?? null;

  res.locals.currentPath = req.path;
  res.locals.currentUrl = req.originalUrl; // path and query, for returnTo fields that must come back to the same view
  res.locals.sidebarProjects = [
    { id: null, href: '/inbox', name: 'Inbox', colour: null, ...countsFor('inbox') },
    ...projects.map((project) => ({
      id: String(project._id),
      href: `/projects/${project._id}`,
      name: project.name,
      colour: project.colour,
      ...countsFor(project._id),
    })),
  ];
  next();
}

module.exports = loadShell;
