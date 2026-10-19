const Task = require('../models/Task');

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

module.exports = { COLUMNS, columnLabel, topOrder };
