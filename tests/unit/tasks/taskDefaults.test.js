const mongoose = require('mongoose');
const Task = require('../../../models/Task');

test('a new task starts open in the Backlog column, whatever page created it', () => {
  const quickAdd = new Task({ owner: new mongoose.Types.ObjectId(), title: 'Quick idea' });
  const scheduled = new Task({ owner: new mongoose.Types.ObjectId(), title: 'Study', schedule: { start: new Date(), end: new Date() } });
  for (const task of [quickAdd, scheduled]) {
    expect(task.status).toBe('backlog');
    expect(task.completedAt).toBeNull();
  }
});
