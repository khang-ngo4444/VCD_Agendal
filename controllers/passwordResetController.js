const User = require('../models/User');
const { HOME_PATH, startSession } = require('../middleware/auth');
const { flash } = require('../middleware/flash');
const { sendMail } = require('../services/mailer');
const { EMAIL_PATTERN } = require('../validators/auth');

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
  if (!EMAIL_PATTERN.test(email)) {
    return renderForgot(res, { values: { email }, errors: { email: 'Enter an email address like name@example.com.' } });
  }

  const user = await User.findOne({ email });
  if (user) {
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
