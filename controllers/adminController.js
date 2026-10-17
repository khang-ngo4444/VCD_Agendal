const User = require('../models/User');
const Task = require('../models/Task');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Admin overview (AD-W01). Headline numbers only; the charts come with the "Admin: system statistics" card.
exports.overview = async (req, res) => {
  const now = new Date();
  const people = { role: { $ne: 'admin' } };
  const [totalUsers, newThisWeek, lockedOut, tasksCreated] = await Promise.all([
    User.countDocuments(people),
    User.countDocuments({ ...people, createdAt: { $gte: new Date(now - WEEK_MS) } }),
    User.countDocuments({ ...people, lockedUntil: { $gt: now } }),
    Task.countDocuments({ deletedAt: null }),
  ]);

  res.render('admin/overview', {
    title: 'Overview · Agendal Admin',
    stats: [
      { label: 'Total users', value: totalUsers },
      { label: 'New this week', value: newThisWeek },
      { label: 'Locked out now', value: lockedOut, hint: '10 failed logins · 15 minutes' },
      { label: 'Tasks created', value: tasksCreated, hint: 'Not counting deleted tasks' },
    ],
  });
};
