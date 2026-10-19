const Task = require('../models/Task');

// Kanban columns in board order (Task.status), with the dot colour each header shows (Figma W02).
const COLUMNS = [
  { status: 'backlog', label: 'Backlog', dot: 'bg-muted' },
  { status: 'upcoming', label: 'Upcoming', dot: 'bg-primary' },
  { status: 'active', label: 'Active', dot: 'bg-warning' },
  { status: 'done', label: 'Done', dot: 'bg-success' },
];
const MAX_DONE = 50; // ponytail: Done shows the latest 50 completions; older ones stay on their project pages

// The Board (Figma W02): every task by column, in each column's saved order.
exports.show = async (req, res) => {
  const mine = { owner: req.user._id, deletedAt: null };
  const [open, done] = await Promise.all([
    Task.find({ ...mine, status: { $ne: 'done' } }).sort({ order: 1, createdAt: -1 }).lean(),
    Task.find({ ...mine, status: 'done' }).sort({ completedAt: -1 }).limit(MAX_DONE).lean(),
  ]);
  const tasks = [...open, ...done.sort((a, b) => a.order - b.order)];
  res.render('board', {
    title: 'Board · Agendal',
    columns: COLUMNS.map((column) => ({ ...column, tasks: tasks.filter((task) => task.status === column.status) })),
  });
};

exports.COLUMNS = COLUMNS;
