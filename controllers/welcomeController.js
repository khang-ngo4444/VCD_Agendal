const Project = require('../models/Project');
const { HOME_PATH } = require('../middleware/auth');
const { flash } = require('../middleware/flash');
const { isValidTimeZone, timeZoneOptions } = require('../config/timeZones');

const MAX_PROJECT_NAME_LENGTH = 60;

const text = (value) => (typeof value === 'string' ? value : '');

exports.show = (req, res) => {
  if (req.user.onboardedAt) return res.redirect(HOME_PATH); // shown once only
  res.render('welcome', { title: 'Welcome · Agendal', timeZones: timeZoneOptions(req.user.timeZone) });
};

// "Skip for now" keeps the defaults; "Continue" saves the choices. Either way the screen is done.
exports.complete = async (req, res) => {
  const body = req.body ?? {};
  const user = req.user;

  if (body.skip !== '1') {
    if (isValidTimeZone(body.timeZone)) user.timeZone = body.timeZone;
    if (body.weekStartsOn === '0' || body.weekStartsOn === '1') user.preferences.weekStartsOn = Number(body.weekStartsOn);

    const projectName = text(body.projectName).trim().slice(0, MAX_PROJECT_NAME_LENGTH);
    if (projectName) await Project.create({ owner: user._id, name: projectName });
  }

  user.onboardedAt = new Date();
  await user.save();
  flash(req, 'success', 'You’re all set. Add your first task to get going.');
  res.redirect(HOME_PATH);
};
