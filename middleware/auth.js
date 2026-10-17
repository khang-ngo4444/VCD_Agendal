const User = require('../models/User');

const HOME_PATH = '/today'; // the Daily List
const SESSION_COOKIE = 'agendal.sid';

// Mounted before every app route: loads the logged-in user or sends the visitor to log in.
async function requireLogin(req, res, next) {
  const { userId, sessionVersion } = req.session;
  const user = userId && (await User.findById(userId));

  if (user && user.sessionVersion === sessionVersion) {
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

module.exports = { HOME_PATH, SESSION_COOKIE, requireLogin, guestOnly };
