jest.mock('../models/Task', () => ({ create: jest.fn() }));
const Task = require('../models/Task');
const tasks = require('../controllers/tasksController');

test('an invalid quick-add preserves the draft and project instead of redirecting away from the error', async () => {
  const req = { user: { _id: 'owner', timeZone: 'Asia/Ho_Chi_Minh' }, body: { title: '  ', project: 'saved-project', returnTo: '/board?project=inbox' } };
  const res = { status: jest.fn().mockReturnThis(), render: jest.fn() };
  await tasks.create(req, res);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(res.render).toHaveBeenCalledWith('tasks/new', expect.objectContaining({
    values: expect.objectContaining({ title: '  ', project: 'saved-project', returnTo: '/board?project=inbox' }),
    errors: { title: 'Type a title for the task.' },
  }));
  expect(Task.create).not.toHaveBeenCalled();
});

test('a bad calendar time keeps the title and schedule so the user can correct just the invalid input', async () => {
  const req = { user: { _id: 'owner', timeZone: 'Asia/Ho_Chi_Minh' }, body: { title: 'Read notes', scheduleDate: '2026-10-21', scheduleStart: '15:00', scheduleEnd: '14:00' } };
  const res = { status: jest.fn().mockReturnThis(), render: jest.fn() };
  await tasks.create(req, res);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(res.render).toHaveBeenCalledWith('tasks/new', expect.objectContaining({
    values: expect.objectContaining({ title: 'Read notes', scheduleDate: '2026-10-21', scheduleStart: '15:00', scheduleEnd: '14:00' }),
    errors: { schedule: expect.any(String) },
  }));
});
