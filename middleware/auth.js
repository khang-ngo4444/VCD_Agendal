const User = require('../models/User');

const HOME_PATH = '/today'; // the Daily List
const WELCOME_PATH = '/welcome';
const ADMIN_PATH = '/admin'; // the admin console
const SESSION_COOKIE = 'agendal.sid';

// Logs the user in on this device. A fresh session ID on every login stops session fixation.
async function startSession(req, user, { remember = true } = {}) {
  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.userId = user.id;
  req.session.sessionVersion = user.sessionVersion;
  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });
  if (!remember) req.session.cookie.maxAge = null; // cookie ends when the browser closes
}

// Mounted before every app route: loads the logged-in user or sends the visitor to log in.
async function requireLogin(req, res, next) {
  const { userId, sessionVersion } = req.session;
  const user = userId && (await User.findById(userId));

  if (user && user.sessionVersion === sessionVersion) {
    // Private pages must not be cached: after logging out on a shared device, Back must not show someone's tasks.
    res.set('Cache-Control', 'no-store');
    req.user = user;
    res.locals.currentUser = user;
    return next();
  }

  // Logged out on another device, password changed, or account gone: drop this stale session too.
  if (userId) return req.session.destroy((err) => (err ? next(err) : res.redirect('/login')));
  res.redirect('/login');
}

// Logged-in users have no reason to see the login or register page again.
function guestOnly(req, res, next) {
  if (req.session.userId) return res.redirect(HOME_PATH);
  next();
}

// A new account sees the Welcome screen once, before any other app page.
function requireOnboarding(req, res, next) {
  if (!req.user.onboardedAt && req.path !== WELCOME_PATH) return res.redirect(WELCOME_PATH);
  next();
}

// Admin accounts only use the admin console: any app page (and so every login redirect) sends them to /admin.
function keepAdminsInConsole(req, res, next) {
  if (req.user.role === 'admin') return res.redirect(ADMIN_PATH);
  next();
}

// Used inside the admin router. Anyone else skips the whole router and ends up at the normal 404 page,
// exactly like any unknown address, so /admin doesn't reveal that it exists.
function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  next('router');
}

module.exports = {
  HOME_PATH,
  WELCOME_PATH,
  ADMIN_PATH,
  SESSION_COOKIE,
  startSession,
  requireLogin,
  guestOnly,
  requireOnboarding,
  keepAdminsInConsole,
  requireAdmin,
};
