// No database: the pure calculations behind Insights.
const { periods, completionRate, change } = require('../services/insights');

describe('periods', () => {
  test('this week and last week, starting on the user’s first day of the week', () => {
    // 2026-10-21 is a Wednesday
    expect(periods('week', '2026-10-21', 1)).toEqual({ current: { from: '2026-10-19', to: '2026-10-26' }, previous: { from: '2026-10-12', to: '2026-10-19' } });
    expect(periods('week', '2026-10-21', 0).current).toEqual({ from: '2026-10-18', to: '2026-10-25' });
  });

  test('this month and last month, across the year boundary and short months', () => {
    expect(periods('month', '2026-10-21')).toEqual({ current: { from: '2026-10-01', to: '2026-11-01' }, previous: { from: '2026-09-01', to: '2026-10-01' } });
    expect(periods('month', '2027-01-31')).toEqual({ current: { from: '2027-01-01', to: '2027-02-01' }, previous: { from: '2026-12-01', to: '2027-01-01' } });
    expect(periods('month', '2027-02-14').current).toEqual({ from: '2027-02-01', to: '2027-03-01' });
  });
});

describe('completionRate', () => {
  const from = new Date('2026-10-19T00:00:00Z');
  const to = new Date('2026-10-26T00:00:00Z');
  const task = (due, completed, scheduled) => ({ dueDate: due && new Date(due), schedule: scheduled ? { start: new Date(scheduled) } : undefined, completedAt: completed ? new Date(completed) : null });

  test('share of the tasks due in the period that are done, and of those, done by the due date', () => {
    const tasks = [
      task('2026-10-20T16:59:59Z', '2026-10-20T10:00:00Z'), // done on time
      task('2026-10-21T16:59:59Z', '2026-10-22T09:00:00Z'), // done late
      task('2026-10-22T16:59:59Z', null), // open
      task('2026-10-23T16:59:59Z', null), // open
      task('2026-10-27T16:59:59Z', '2026-10-20T10:00:00Z'), // due next week: not counted
    ];
    expect(completionRate(tasks, from, to)).toEqual({ due: 4, done: 2, rate: 50, onTime: 50 });
  });

  test('a task without a due date counts on its scheduled day; nothing due gives null, not 0%', () => {
    expect(completionRate([task(null, '2026-10-20T12:00:00Z', '2026-10-20T11:00:00Z')], from, to)).toEqual({ due: 1, done: 1, rate: 100, onTime: 0 });
    expect(completionRate([], from, to)).toEqual({ due: 0, done: 0, rate: null, onTime: null });
  });
});

test('change: difference, or null when either side is missing', () => {
  expect(change(60, 45)).toBe(15);
  expect(change(40, 50)).toBe(-10);
  expect(change(null, 50)).toBeNull();
  expect(change(50, null)).toBeNull();
});
