const User = require('../models/User');
const { HOME_PATH, WELCOME_PATH, SESSION_COOKIE, startSession } = require('../middleware/auth');
const { PASSWORD_HINT, validateRegistration } = require('../validators/auth');

const DUPLICATE_KEY_ERROR = 11000;

// Form fields arrive as strings, but a crafted request can send arrays or nothing at all.
const text = (value) => (typeof value === 'string' ? value : '');

// Same message for an unknown email and a wrong password, so the form can't be used to find accounts.
const LOGIN_FAILED = "That email and password don't match. Check them and try again.";

function renderRegister(res, { values = {}, errors = {} } = {}) {
  res.status(Object.keys(errors).length ? 422 : 200).render('auth/register', {
    title: 'Create your account · Agendal',
    values,
    errors,
    passwordHint: PASSWORD_HINT,
  });
}

exports.showRegister = (req, res) => renderRegister(res);

exports.register = async (req, res) => {
  const body = req.body ?? {};
  const values = { name: text(body.name).trim(), email: text(body.email).trim().toLowerCase() };
  const password = text(body.password);

  const errors = validateRegistration({ ...values, password });
  if (Object.keys(errors).length) return renderRegister(res, { values, errors });

  const user = new User(values);
  await user.setPassword(password);
  try {
    await user.save();
  } catch (err) {
    if (err.code !== DUPLICATE_KEY_ERROR) throw err;
    return renderRegister(res, { values, errors: { email: 'This email already has an account.', emailTaken: true } });
  }

  await startSession(req, user);
  res.redirect(WELCOME_PATH);
};

function renderLogin(res, { values = { remember: true }, error, status = error ? 401 : 200 } = {}) {
  // Named loginError because EJS includes inherit page locals, and the field partial reads `error`.
  res.status(status).render('auth/login', { title: 'Log in · Agendal', values, loginError: error });
}

exports.showLogin = (req, res) => renderLogin(res);

exports.login = async (req, res) => {
  const body = req.body ?? {};
  const values = { email: text(body.email).trim().toLowerCase(), remember: body.remember === 'on' };

  const user = values.email && (await User.findOne({ email: values.email }));

  const minutesLeft = user ? user.lockMinutesLeft() : 0;
  if (minutesLeft) {
    const wait = `${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`;
    return renderLogin(res, { values, status: 429, error: `Too many failed attempts. Try again in ${wait}.` });
  }

  if (!user || !(await user.checkPassword(text(body.password)))) {
    if (user) await user.recordFailedLogin();
    return renderLogin(res, { values, error: LOGIN_FAILED });
  }

  await user.clearFailedLogins();
  await startSession(req, user, { remember: values.remember });
  res.redirect(HOME_PATH);
};

// Logging out ends the user's sessions on every device, not just this one.
exports.logout = async (req, res) => {
  if (req.session.userId) await User.updateOne({ _id: req.session.userId }, { $inc: { sessionVersion: 1 } });
  await new Promise((resolve, reject) => req.session.destroy((err) => (err ? reject(err) : resolve())));
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/');
};
