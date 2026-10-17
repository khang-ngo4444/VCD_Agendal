const User = require('../models/User');

const HOME_PATH = '/today'; // the Daily List

// Mounted before every app route: loads the logged-in user or sends the visitor to log in.
async function requireLogin(req, res, next) {
  const user = req.session.userId && (await User.findById(req.session.userId));
  if (!user) return res.redirect('/login');

  req.user = user;
  res.locals.currentUser = user;
  next();
}

// Logged-in users have no reason to see the login or register page again.
function guestOnly(req, res, next) {
  if (req.session.userId) return res.redirect(HOME_PATH);
  next();
}

module.exports = { HOME_PATH, requireLogin, guestOnly };
