const { setColumn, reopenedStatus } = require('../services/tasks');

const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7
const now = new Date('2026-10-19T03:00:00Z'); // 10:00 on Monday 19 October in UTC+7

describe('a task is in Done exactly when it is completed', () => {
  test('moving a card into Done completes the task', () => {
    const task = { status: 'active', completedAt: null };
    setColumn(task, 'done', now);
    expect(task).toEqual({ status: 'done', completedAt: now });
  });

  test('a task that was already completed keeps its completion time', () => {
    const earlier = new Date('2026-10-18T10:00:00Z');
    const task = { status: 'active', completedAt: earlier };
    setColumn(task, 'done', now);
    expect(task.completedAt).toBe(earlier);
  });
});

describe('the column a reopened task goes back to', () => {
  test('Active once its day has come, in the user’s time zone', () => {
    expect(reopenedStatus({ dueDate: new Date('2026-10-19T16:59:59Z') }, TZ, now)).toBe('active'); // 23:59 today
    expect(reopenedStatus({ dueDate: new Date('2026-10-12T16:59:59Z') }, TZ, now)).toBe('active'); // last week
  });

  test('Upcoming while it is still ahead; the schedule wins over the due date', () => {
    expect(reopenedStatus({ dueDate: new Date('2026-10-19T17:00:00Z') }, TZ, now)).toBe('upcoming'); // 00:00 tomorrow
    expect(reopenedStatus({ schedule: { start: new Date('2026-10-21T02:00:00Z') }, dueDate: new Date('2026-10-18T00:00:00Z') }, TZ, now)).toBe('upcoming');
  });

  test('Backlog without any date', () => {
    expect(reopenedStatus({}, TZ, now)).toBe('backlog');
  });
});
