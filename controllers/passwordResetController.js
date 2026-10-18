const User = require('../models/User');
const { HOME_PATH, ADMIN_LOCKED_MESSAGE, startSession } = require('../middleware/auth');
const { flash } = require('../middleware/flash');
const { sendMail } = require('../services/mailer');
const activity = require('../services/activity');
const { EMAIL_PATTERN, MAX_EMAIL_LENGTH, PASSWORD_HINT, validatePassword } = require('../validators/auth');

const text = (value) => (typeof value === 'string' ? value : '');

function renderForgot(res, { values = {}, errors = {}, sent = false } = {}) {
  res.status(Object.keys(errors).length ? 422 : 200).render('auth/forgot-password', {
    title: 'Reset your password · Agendal',
    values,
    errors,
    sent,
  });
}

exports.showForgot = (req, res) => renderForgot(res);

// Always answers "check your inbox", so the form can't be used to find out who has an account.
exports.sendResetLink = async (req, res) => {
  const email = text(req.body?.email).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return renderForgot(res, { values: { email }, errors: { email: 'Enter an email address like name@example.com.' } });
  }

  const user = await User.findOne({ email });
  if (user && user.canRequestPasswordReset()) {
    const token = user.createPasswordResetToken();
    await user.save();
    // Not awaited, so the response takes as long for an unknown email as for a real one.
    sendMail({
      to: user.email,
      subject: 'Reset your Agendal password',
      heading: 'Reset your password',
      paragraphs: [
        `Someone asked to reset the password for the Agendal account ${user.email}.`,
        'The link below works once, for the next 30 minutes.',
      ],
      action: { label: 'Choose a new password', url: `${req.app.locals.appUrl}/reset-password/${token}` },
      footnote: 'Didn’t ask for this? Ignore this email and your password stays the same.',
    }).catch((err) => console.error('Password reset email failed:', err));
  }

  renderForgot(res, { values: { email }, sent: true });
};

function renderReset(res, { tokenValid, errors = {} }) {
  const status = !tokenValid ? 410 : Object.keys(errors).length ? 422 : 200;
  res.status(status).render('auth/reset-password', {
    title: 'Choose a new password · Agendal',
    tokenValid,
    errors,
    passwordHint: PASSWORD_HINT,
  });
}

exports.showReset = async (req, res) => {
  renderReset(res, { tokenValid: Boolean(await User.findByResetToken(req.params.token)) });
};

exports.resetPassword = async (req, res) => {
  const user = await User.findByResetToken(req.params.token);
  if (!user) return renderReset(res, { tokenValid: false });

  const newPassword = text(req.body?.newPassword);
  const confirmPassword = text(req.body?.confirmPassword);
  const errors = {};
  const passwordError = validatePassword(newPassword, { email: user.email, name: user.name });
  if (passwordError) errors.newPassword = passwordError;
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'The two passwords don’t match.';
  if (Object.keys(errors).length) return renderReset(res, { tokenValid: true, errors });

  await user.setPassword(newPassword); // clears the token and ends every other session
  user.loginFailures = { count: 0, since: null }; // a reset also lifts a login lockout
  user.lockedUntil = null;
  await user.save();
  await activity.record(req, { action: 'password_reset', user, details: 'Reset link used · other sessions ended' });

  // The new password is saved, but a locked account still can't log in.
  if (user.isLockedByAdmin()) {
    flash(req, 'error', `Password updated. ${ADMIN_LOCKED_MESSAGE}`);
    return res.redirect('/login');
  }

  await startSession(req, user);
  flash(req, 'success', 'Password updated. You’re logged in.');
  res.redirect(HOME_PATH);
};
