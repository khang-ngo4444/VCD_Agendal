const Task = require('../models/Task');

// Preset project colours (Figma: Project/* variables plus red and graphite from W09).
const PROJECT_COLOURS = [
  { name: 'Blue', hex: '#2f6fde' },
  { name: 'Orange', hex: '#e8730c' },
  { name: 'Green', hex: '#2e9e6a' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Red', hex: '#e5484d' },
  { name: 'Graphite', hex: '#6e6e73' },
];
const isPresetColour = (hex) => PROJECT_COLOURS.some((colour) => colour.hex === hex);

// { done, total } per project for one user; the Inbox (project: null) is under the key 'inbox'.
async function taskCounts(owner) {
  const rows = await Task.aggregate([
    { $match: { owner, deletedAt: null } },
    {
      $group: {
        _id: '$project',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } },
      },
    },
  ]);
  const counts = new Map(rows.map(({ _id, done, total }) => [_id ? String(_id) : 'inbox', { done, total }]));
  return (key) => counts.get(String(key)) ?? { done: 0, total: 0 };
}

module.exports = { PROJECT_COLOURS, isPresetColour, taskCounts };
