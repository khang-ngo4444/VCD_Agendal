// Focus mode (Figma W13): which tasks to offer, today's finished sessions,.
// lengthFor is a pure function (tests/focus.test.js).
const FocusSession = require('../models/FocusSession');
const Task = require('../models/Task');
const { todayRange } = require('./dates');

// The two lengths the Focus page offers: a focus block and the break after it, in minutes.
const LENGTHS = [
  { focus: 25, rest: 5 },
  { focus: 50, rest: 10 },
];
const lengthFor = (focusMinutes) => LENGTHS.find((length) => length.focus === Number(focusMinutes)) ?? LENGTHS[0];

// Today's finished blocks, oldest first, with the task titles, and their total minutes.
async function todaysSessions(user, now = new Date()) {
  const { start, end } = todayRange(user.timeZone, now);
  const sessions = await FocusSession.find({ owner: user._id, startedAt: { $gte: start, $lt: end } })
    .sort({ startedAt: 1 })
    .populate('task', 'title')
    .lean();
  return { sessions, minutes: sessions.reduce((sum, session) => sum + session.minutes, 0) };
}

const MAX_OTHER_TASKS = 50;

// The tasks the Focus page offers. Today: open tasks the Daily List shows for today (overdue, scheduled today, or
// unscheduled and due today), by time. Other: every other open task, recently changed first.
async function focusChoices(user, now = new Date()) {
  const { start, end } = todayRange(user.timeZone, now);
  const open = { owner: user._id, deletedAt: null, completedAt: null };
  const today = await Task.find({
    ...open,
    $or: [{ 'schedule.start': { $gte: start, $lt: end } }, { 'schedule.start': null, dueDate: { $lt: end } }, { dueDate: { $lt: start } }],
  }).lean();
  const when = (task) => task.schedule?.start ?? task.dueDate;
  today.sort((a, b) => when(a) - when(b));
  const other = await Task.find({ ...open, _id: { $nin: today.map((task) => task._id) } })
    .sort({ updatedAt: -1 })
    .limit(MAX_OTHER_TASKS)
    .lean();
  return { today, other, maxOther: MAX_OTHER_TASKS };
}

module.exports = { LENGTHS, lengthFor, todaysSessions, focusChoices };
