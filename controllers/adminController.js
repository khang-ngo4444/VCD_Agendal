const User = require('../models/User');
const Task = require('../models/Task');
const { RETENTION_DAYS } = require('../models/ActivityLog');
const activity = require('../services/activity');
const adminUsers = require('../services/adminUsers');

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

// Users (AD-W02): every account, newest first, with chips, search and pages of 50.
exports.users = async (req, res) => {
  const page = await adminUsers.listUsers(req.query);
  res.render('admin/users', {
    title: 'Users · Agendal Admin',
    ...page,
    timeZone: req.user.timeZone || 'UTC',
    now: new Date(),
  });
};

// Activity log (AD-W04): security events, newest first, filtered by the chips and the search box.
exports.activity = async (req, res) => {
  const page = await activity.listActivity(req.query);
  const timeZone = req.user.timeZone || 'UTC';
  res.render('admin/activity', {
    title: 'Activity log · Agendal Admin',
    ...page,
    days: activity.groupByDay(page.entries, timeZone),
    timeZone,
    filters: activity.FILTERS,
    labels: activity.ACTION_LABELS,
    retentionDays: RETENTION_DAYS,
  });
};
