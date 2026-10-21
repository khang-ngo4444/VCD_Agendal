// No database: the pure calculations behind Insights.
const { periods, completionRate, change, fillDays, countByDay, semesterGrid, sortHabits, SEMESTER_WEEKS } = require('../../../services/insights');

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

  test('semester: the last 20 weeks up to the end of this week, and the 20 weeks before', () => {
    // 2026-10-21 is a Wednesday; with Monday weeks this week ends on Sunday 25 Oct
    expect(periods('semester', '2026-10-21', 1)).toEqual({
      current: { from: '2026-06-08', to: '2026-10-26' },
      previous: { from: '2026-01-19', to: '2026-06-08' },
    });
  });
});

describe('semesterGrid', () => {
  const counts = new Map([['2026-10-19', 8], ['2026-10-20', 2], ['2026-10-21', 1], ['2026-06-08', 4], ['2026-10-22', 5]]);
  const grid = semesterGrid('2026-10-21', 1, counts);

  test('20 columns of 7 days, oldest first, starting on the first day of the week', () => {
    expect(grid.weeks).toHaveLength(SEMESTER_WEEKS);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks[0][0].date).toBe('2026-06-08');
    expect(grid.weeks.at(-1).at(-1).date).toBe('2026-10-25');
  });

  test('shades are quarters of the busiest day; nothing done is level 0', () => {
    const day = (date) => grid.weeks.flat().find((d) => d.date === date);
    expect(day('2026-10-19')).toMatchObject({ count: 8, level: 4 });
    expect(day('2026-06-08')).toMatchObject({ count: 4, level: 2 });
    expect(day('2026-10-20')).toMatchObject({ count: 2, level: 1 });
    expect(day('2026-10-10')).toMatchObject({ count: 0, level: 0 });
  });

  test('days after today are marked future and never counted, even if the data has them', () => {
    const tomorrow = grid.weeks.flat().find((d) => d.date === '2026-10-22');
    expect(tomorrow).toMatchObject({ future: true, count: 0, level: 0 });
    expect(grid.total).toBe(15);
    expect(grid.busiest).toEqual({ date: '2026-10-19', count: 8 });
  });

  test('a month label goes on the first week that starts in it', () => {
    expect(grid.months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(grid.months[0].column).toBe(0);
    expect(grid.weeks[grid.months[1].column][0].date.slice(0, 7)).toBe('2026-07');
  });

  test('an empty semester has no busiest day', () => {
    expect(semesterGrid('2026-10-21', 1, new Map())).toMatchObject({ total: 0, busiest: null });
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

test('countByDay and fillDays: per local day, with empty days as 0', () => {
  const counts = countByDay([new Date('2026-10-19T17:30:00Z'), new Date('2026-10-19T18:00:00Z'), new Date('2026-10-20T01:00:00Z')], 'Asia/Ho_Chi_Minh');
  // 17:30 UTC is 00:30 on the 20th in Ho Chi Minh City
  expect([...counts]).toEqual([['2026-10-20', 3]]);
  expect(fillDays(['2026-10-19', '2026-10-20'], counts)).toEqual([{ date: '2026-10-19', count: 0 }, { date: '2026-10-20', count: 3 }]);
});

test('sortHabits: by the chosen column, highest first, ties by name; unknown sorts fall back to the current streak', () => {
  const rows = [
    { name: 'Run', current: 2, longest: 9, rate: 40 },
    { name: 'Read', current: 5, longest: 5, rate: null },
    { name: 'Gym', current: 2, longest: 3, rate: 90 },
  ];
  expect(sortHabits(rows, 'current').map((r) => r.name)).toEqual(['Read', 'Gym', 'Run']);
  expect(sortHabits(rows, 'longest').map((r) => r.name)).toEqual(['Run', 'Read', 'Gym']);
  expect(sortHabits(rows, 'rate').map((r) => r.name)).toEqual(['Gym', 'Run', 'Read']);
  expect(sortHabits(rows, 'constructor').map((r) => r.name)).toEqual(['Read', 'Gym', 'Run']);
});
