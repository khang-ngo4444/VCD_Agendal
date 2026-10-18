// Settings → Delete account: the account and everything it owns go, for good.
const fs = require('node:fs/promises');
const path = require('node:path');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const activity = require('./activity');

const AVATAR_DIR = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
const text = (value) => (typeof value === 'string' ? value : '');

// Everything an account owns. Add new owned collections here (e.g. events, P8) so deletion stays complete.
const OWNED = [Reminder, HabitCheckIn, Habit, Task, Project];

// The confirmation the form asks for: the password, or the account's email for Google-only accounts,
// plus the "I understand" box. Returns field errors; empty when the request may go ahead.
async function checkConfirmation(user, body = {}) {
  const errors = {};
  if (user.passwordHash) {
    if (!(await user.checkPassword(text(body.deletePassword)))) errors.deletePassword = 'That isn’t your password.';
  } else if (text(body.deleteEmail).trim().toLowerCase() !== user.email) {
    errors.deleteEmail = `Type ${user.email} to confirm.`;
  }
  if (body.understand !== 'on') errors.understand = 'Tick the box to confirm you understand this can’t be undone.';
  return errors;
}

// Logged first, so the entry exists even if a later step fails; it keeps the email, since the account goes.
// Other devices are signed out because their sessions point at a user that no longer exists (requireLogin).
async function deleteAccount(req, user) {
  await activity.record(req, { action: 'account_deleted', user, details: 'Deleted by the user · all data removed' });
  const counts = Object.fromEntries(
    await Promise.all(OWNED.map(async (Model) => [Model.modelName, (await Model.deleteMany({ owner: user._id })).deletedCount]))
  );
  await User.deleteOne({ _id: user._id });
  if (user.avatar) await fs.rm(path.join(AVATAR_DIR, `${user.id}.webp`), { force: true }); // uploaded photo, if any
  return counts;
}

module.exports = { checkConfirmation, deleteAccount, OWNED };
