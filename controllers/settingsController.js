const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { flash } = require('../middleware/flash');
const { isValidTimeZone, timeZoneOptions } = require('../config/timeZones');
const { MAX_NAME_LENGTH, PASSWORD_HINT, validatePassword } = require('../validators/auth');
const accountDeletion = require('../services/accountDeletion');

const User = require('../models/User');

const THEMES = User.schema.path('preferences.theme').enumValues;
const ACCENTS = User.schema.path('preferences.accentColour').enumValues;
const CALENDAR_LAYOUTS = User.schema.path('preferences.calendarLayout').enumValues;
const AVATAR_SIZE_PX = 256;
const AVATAR_DIR = path.join(__dirname, '..', 'public', 'uploads', 'avatars');

// Form fields arrive as strings, but a crafted request can send arrays or nothing at all.
const text = (value) => (typeof value === 'string' ? value : '');

exports.index = (req, res) => res.redirect('/settings/profile');

function renderProfile(res, { values, errors = {} }) {
  res.status(Object.keys(errors).length ? 422 : 200).render('settings/profile', {
    title: 'Profile · Settings · Agendal',
    values,
    errors,
    timeZones: timeZoneOptions(values.timeZone),
  });
}

exports.showProfile = (req, res) =>
  renderProfile(res, { values: { name: req.user.name ?? '', timeZone: req.user.timeZone } });

exports.updateProfile = async (req, res) => {
  const body = req.body ?? {};
  const values = { name: text(body.name).trim(), timeZone: text(body.timeZone) };

  const errors = {};
  if (values.name.length > MAX_NAME_LENGTH) errors.name = `Use at most ${MAX_NAME_LENGTH} characters.`;
  if (!isValidTimeZone(values.timeZone)) errors.timeZone = 'Pick a time zone from the list.';
  if (Object.keys(errors).length) return renderProfile(res, { values, errors });

  Object.assign(req.user, values);
  await req.user.save();
  flash(req, 'success', 'Profile saved.');
  res.redirect('/settings/profile');
};

exports.updateAvatar = async (req, res) => {
  if (req.uploadError || !req.file) {
    flash(req, 'error', req.uploadError ?? 'Choose a JPG, PNG, WebP or GIF image.');
    return res.redirect('/settings/profile');
  }

  const fileName = `${req.user.id}.webp`;
  await fs.mkdir(AVATAR_DIR, { recursive: true });
  try {
    // Re-encoding also strips metadata and rejects files that only claim to be images.
    await sharp(req.file.buffer)
      .rotate()
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(path.join(AVATAR_DIR, fileName));
  } catch {
    flash(req, 'error', 'That file couldn’t be read as an image. Try another one.');
    return res.redirect('/settings/profile');
  }

  req.user.avatar = `/uploads/avatars/${fileName}?v=${Date.now()}`; // new URL so browsers drop the cached photo
  await req.user.save();
  flash(req, 'success', 'Photo updated.');
  res.redirect('/settings/profile');
};

exports.showAppearance = (req, res) =>
  res.render('settings/appearance', { title: 'Appearance · Settings · Agendal', values: req.user.preferences });

exports.updateAppearance = async (req, res) => {
  const body = req.body ?? {};
  // Radio buttons can only send a listed value, so anything else is a crafted request: keep the old setting.
  const { preferences } = req.user;
  if (THEMES.includes(body.theme)) preferences.theme = body.theme;
  if (ACCENTS.includes(body.accentColour)) preferences.accentColour = body.accentColour;
  if (CALENDAR_LAYOUTS.includes(body.calendarLayout)) preferences.calendarLayout = body.calendarLayout;
  if (body.weekStartsOn === '0' || body.weekStartsOn === '1') preferences.weekStartsOn = Number(body.weekStartsOn);

  await req.user.save();
  if (req.get('X-Requested-With') === 'fetch') return res.status(204).end();
  flash(req, 'success', 'Appearance saved.');
  res.redirect('/settings/appearance');
};

function renderAccount(req, res, errors = {}) {
  res.status(Object.keys(errors).length ? 422 : 200).render('settings/account', {
    title: 'Account · Settings · Agendal',
    errors,
    hasPassword: Boolean(req.user.passwordHash), // Google-only accounts set a first password instead
    passwordHint: PASSWORD_HINT,
  });
}

exports.showAccount = (req, res) => renderAccount(req, res);

exports.changePassword = async (req, res) => {
  const body = req.body ?? {};
  const [currentPassword, newPassword, confirmPassword] = [body.currentPassword, body.newPassword, body.confirmPassword].map(text);

  const errors = {};
  if (req.user.passwordHash && !(await req.user.checkPassword(currentPassword))) {
    errors.currentPassword = 'That isn’t your current password.';
  }
  const passwordError = validatePassword(newPassword, { email: req.user.email, name: req.user.name });
  if (passwordError) errors.newPassword = passwordError;
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'The two new passwords don’t match.';
  if (Object.keys(errors).length) return renderAccount(req, res, errors);

  await req.user.setPassword(newPassword); // also bumps sessionVersion, which signs out every other device
  await req.user.save();
  req.session.sessionVersion = req.user.sessionVersion; // ...but keeps this one signed in

  flash(req, 'success', 'Password updated. Other devices have been signed out.');
  res.redirect('/settings/account');
};

// Delete account (W32). The dialog on the Account page posts here; this page is its no-JS version and shows errors.
function renderDeleteAccount(req, res, errors = {}) {
  res.status(Object.keys(errors).length ? 422 : 200).render('settings/delete-account', {
    title: 'Delete account · Settings · Agendal',
    currentPath: '/settings/account', // keeps "Account" highlighted in the settings menu
    errors,
    hasPassword: Boolean(req.user.passwordHash),
  });
}

exports.showDeleteAccount = (req, res) => renderDeleteAccount(req, res);

exports.deleteAccount = async (req, res) => {
  const errors = await accountDeletion.checkConfirmation(req.user, req.body);
  if (Object.keys(errors).length) return renderDeleteAccount(req, res, errors);

  await accountDeletion.deleteAccount(req, req.user);
  // A fresh, empty session for the goodbye message; the old one is gone with the account.
  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  flash(req, 'success', 'Your account and all its data have been deleted.');
  res.redirect('/');
};
