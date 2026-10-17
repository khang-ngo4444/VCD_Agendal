const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { flash } = require('../middleware/flash');
const { isValidTimeZone, timeZoneOptions } = require('../config/timeZones');

const User = require('../models/User');

const MAX_NAME_LENGTH = 80;
const THEMES = User.schema.path('preferences.theme').enumValues;
const ACCENTS = User.schema.path('preferences.accentColour').enumValues;
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
  if (body.weekStartsOn === '0' || body.weekStartsOn === '1') preferences.weekStartsOn = Number(body.weekStartsOn);

  await req.user.save();
  flash(req, 'success', 'Appearance saved.');
  res.redirect('/settings/appearance');
};
