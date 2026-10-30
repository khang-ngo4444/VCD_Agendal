// The database side of the reminder job (services/reminders.js), kept apart so tests can swap in an in-memory store.
const Reminder = require('../models/Reminder');
const Task = require('../models/Task');
const User = require('../models/User');
const deliveries = require('./deliveries');

const byId = (docs) => new Map(docs.map((doc) => [String(doc._id), doc]));

module.exports = {
  // Unsent reminders whose time has come, oldest first. Backed by the sent_1_remindAt_1 index.
  findDue: (now, maxAttempts, limit) =>
    Reminder.find({ sent: false, remindAt: { $lte: now }, attempts: { $lt: maxAttempts } })
      .sort({ remindAt: 1 })
      .limit(limit)
      .lean(),

  // The owner's reminders due soon that no email has carried yet.
  findUpcomingForEmail: (owner, now, until, maxAttempts) =>
    Reminder.find({ owner, sent: false, emailedAt: null, remindAt: { $gt: now, $lte: until }, attempts: { $lt: maxAttempts } })
      .sort({ remindAt: 1 })
      .lean(),

  // Saves the email counters (services/emailLimits.js countEmail).
  recordEmail: (user, counters) =>
    User.updateOne(
      { _id: user._id },
      { $set: Object.fromEntries(Object.entries(counters).map(([key, value]) => [`notifications.${key}`, value])) }
    ),

  recordDelivery: deliveries.record,

  loadTasks: async (ids) => byId(await Task.find({ _id: { $in: ids } }).populate('project', 'name').lean()),

  loadUsers: async (ids) => byId(await User.find({ _id: { $in: ids } })),

  // Atomic: only one job run can set the channel's date, so only that run sends it.
  // A missing field also matches null, so reminders created before these fields existed are claimed too.
  claim: async (id, field, now) =>
    (await Reminder.updateOne({ _id: id, [field]: null }, { $set: { [field]: now } })).modifiedCount === 1,

  release: (id, field) => Reminder.updateOne({ _id: id }, { $set: { [field]: null } }),

  recordFailure: (id, message) => Reminder.updateOne({ _id: id }, { $inc: { attempts: 1 }, $set: { lastError: message } }),

  close: (id, now, note) => Reminder.updateOne({ _id: id }, { $set: { sent: true, sentAt: now, lastError: note } }),

  // Marks reminders sent once every channel has its date. Returns how many were finished.
  finish: async (ids, now) =>
    (
      await Reminder.updateMany(
        { _id: { $in: ids }, sent: false, pushedAt: { $ne: null }, emailedAt: { $ne: null } },
        { $set: { sent: true, sentAt: now } }
      )
    ).modifiedCount,
};
