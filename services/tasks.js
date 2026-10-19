const Task = require('../models/Task');
const { dayRange } = require('./dates');

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

module.exports = { COLUMNS, columnLabel, topOrder, setColumn, reopenedStatus };
