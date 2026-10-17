const { RETENTION_DAYS } = require('../models/ActivityLog');
const activity = require('../services/activity');
const adminUsers = require('../services/adminUsers');
const adminStats = require('../services/adminStats');
const { flash } = require('../middleware/flash');

// Admin overview (AD-W01): users, content, check-ins per day, recent activity and what needs a look.
exports.overview = async (req, res) => {
  const now = new Date();
  const timeZone = req.user.timeZone || 'UTC';
  res.render('admin/overview', {
    title: 'Overview · Agendal Admin',
    ...(await adminStats.overviewStats(now, timeZone)),
    actionLabels: activity.ACTION_LABELS,
    now,
    timeZone,
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
    currentUrl: req.originalUrl,
    maxReasonLength: adminUsers.MAX_REASON_LENGTH,
  });
};

// Back to the page, chip and search the admin was on. Only /admin/users addresses, never another site.
const backToUsers = (value) => (typeof value === 'string' && /^\/admin\/users(\?[^\s]*)?$/.test(value) ? value : '/admin/users');
const nameOf = (user) => user.name || user.email;
// "#user-<id>": the list scrolls to that row and flashes it (tr:target in src/css/app.css).
const rowAnchor = (user) => (user ? `#user-${user._id}` : '');

const LOCK_ERRORS = {
  self: 'You can’t lock your own account.',
  already: 'That account is already locked.',
  not_found: 'That account doesn’t exist any more.',
};
const UNLOCK_ERRORS = { ...LOCK_ERRORS, already: 'That account isn’t locked.' };

// Lock account (AD-W03): the user is logged out everywhere and can't log in until unlocked.
exports.lock = async (req, res) => {
  const { user, error } = await adminUsers.lockUser(req, req.user, req.params.id, req.body?.reason);
  if (error) flash(req, 'error', LOCK_ERRORS[error]);
  else flash(req, 'success', `${nameOf(user)}’s account is locked and logged out everywhere.`);
  res.redirect(backToUsers(req.body?.back) + rowAnchor(user));
};

exports.unlock = async (req, res) => {
  const { user, error } = await adminUsers.unlockUser(req, req.user, req.params.id);
  if (error) flash(req, 'error', UNLOCK_ERRORS[error]);
  else flash(req, 'success', `${nameOf(user)} can log in again.`);
  res.redirect(backToUsers(req.body?.back) + rowAnchor(user));
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
