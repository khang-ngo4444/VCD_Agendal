const Reminder = require('../models/Reminder');
const Task = require('../models/Task');
const { dayRange, endOfLocalDay, zonedParts } = require('./dates');
const { addInterval } = require('./recurrence');

// Kanban columns in board order (Task.status), with the dot colour each header shows (Figma W02).
const COLUMNS = [
  { status: 'backlog', label: 'Backlog', dot: 'bg-muted' },
  { status: 'upcoming', label: 'Upcoming', dot: 'bg-primary' },
  { status: 'active', label: 'Active', dot: 'bg-warning' },
  { status: 'done', label: 'Done', dot: 'bg-success' },
];
const columnLabel = (status) => COLUMNS.find((column) => column.status === status)?.label;

// The order value that puts a card above every other card in that column.
async function topOrder(owner, status) {
  const first = await Task.findOne({ owner, status, deletedAt: null }).sort({ order: 1 }).select('order').lean();
  return first ? first.order - 1 : 0;
}

// Keeps a task's column and its done state together: moving a card into Done completes the task, and moving it
// out of Done reopens it. Every column change goes through here (Board moves, ticking a task off in any list).
function setColumn(task, status, now = new Date()) {
  task.status = status;
  if (status === 'done') task.completedAt ??= now;
  else task.completedAt = null;
}

// The column a reopened task goes back to: Active once its day has come, Upcoming while it's still ahead,
// Backlog when it has no date (the same rule the seed uses).
function reopenedStatus(task, timeZone, now = new Date()) {
  const when = task.schedule?.start ?? task.dueDate;
  if (!when) return 'backlog';
  return when < dayRange(now, timeZone).end ? 'active' : 'upcoming';
}

// The dates of a repeating task's next occurrence, one step on in the user's time zone (a 09:00 slot stays at 09:00,
// a due date stays the end of its day), or null when the task doesn't repeat, has no date, or would pass its "until".
// ponytail: each occurrence steps from the one before, so a task due on the 31st moves to the 30th after a 30-day
// month and stays there; count from a series start (as services/recurrence.js does for events) if that matters.
function nextDates(task, timeZone) {
  const frequency = task.repeat?.frequency;
  const anchor = task.schedule?.start ?? task.dueDate;
  if (!frequency || !anchor) return null;
  const step = (date) => addInterval(date, frequency, 1, timeZone);
  if (task.repeat.until && step(anchor) > task.repeat.until) return null;
  return {
    dueDate: task.dueDate ? endOfLocalDay(zonedParts(step(task.dueDate), timeZone), timeZone) : undefined,
    schedule: task.schedule?.start ? { start: step(task.schedule.start), end: step(task.schedule.end) } : undefined,
  };
}

// Call after saving a task whose column may have changed (`wasDone`: it was in Done before). Completing a repeating
// task creates its next occurrence, with the same title, notes, project, priority, repeat and reminders, in the column
// its date suggests; the new task is returned. Reopening the task (Undo, or a card dragged out of Done) takes that
// occurrence back while it is still open, so the same occurrence never shows up twice.
async function followRepeat(task, wasDone, timeZone) {
  const done = task.status === 'done';
  if (done === wasDone) return null;
  if (!done) {
    const next = await Task.findOneAndDelete({ owner: task.owner, previousOccurrence: task._id, completedAt: null });
    if (next) await Reminder.deleteMany({ task: next._id });
    return null;
  }

  const dates = nextDates(task, timeZone);
  if (!dates) return null;
  const { owner, project, title, description, priority, repeat } = task;
  const next = new Task({ owner, project, title, description, priority, repeat, previousOccurrence: task._id, ...dates });
  next.status = reopenedStatus(next, timeZone);
  next.order = await topOrder(owner, next.status);
  try {
    await next.save();
  } catch (error) {
    if (error.code === 11000) return null; // another tab already created this next occurrence
    throw error;
  }

  // Reminders keep their distance from the task: one 15 minutes before this occurrence is 15 minutes before the next.
  // offsetMinutes marks the P10 reminder presets; it is simply left out until that field is in the Reminder model.
  const shift = (next.schedule?.start ?? next.dueDate) - (task.schedule?.start ?? task.dueDate);
  const reminders = await Reminder.find({ task: task._id }).lean();
  await Reminder.insertMany(
    reminders.map(({ type, remindAt, offsetMinutes }) => ({ task: next._id, owner, type, offsetMinutes, remindAt: new Date(remindAt.getTime() + shift) }))
  );
  return next;
}

module.exports = { COLUMNS, columnLabel, topOrder, setColumn, reopenedStatus, nextDates, followRepeat };
