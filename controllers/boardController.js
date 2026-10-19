const mongoose = require('mongoose');
const Task = require('../models/Task');
const { COLUMNS } = require('../services/tasks');

const MAX_DONE = 50; // ponytail: Done shows the latest 50 completions; older ones stay on their project pages

// The Board (Figma W02): every task by column, in each column's saved order. ?project=<id> or ?project=inbox shows
// only that project's cards.
exports.show = async (req, res) => {
  const filter = req.query.project === 'inbox' ? 'inbox' : mongoose.isValidObjectId(req.query.project) ? String(req.query.project) : null;
  const mine = { owner: req.user._id, deletedAt: null, ...(filter && { project: filter === 'inbox' ? null : filter }) };
  const [open, done] = await Promise.all([
    Task.find({ ...mine, status: { $ne: 'done' } }).sort({ order: 1, createdAt: -1 }).lean(),
    Task.find({ ...mine, status: 'done' }).sort({ completedAt: -1 }).limit(MAX_DONE).lean(),
  ]);
  const tasks = [...open, ...done.sort((a, b) => a.order - b.order)];
  res.render('board', {
    title: 'Board · Agendal',
    filter,
    columns: COLUMNS.map((column) => ({ ...column, tasks: tasks.filter((task) => task.status === column.status) })),
  });
};
