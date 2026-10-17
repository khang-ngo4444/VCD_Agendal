const { flash } = require('../middleware/flash');
const { isValidTimeZone, timeZoneOptions } = require('../config/timeZones');

const MAX_NAME_LENGTH = 80;

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
