// No database: the rules behind the Insights suggestion card, each shown and not shown.
const { peakWindow, lateOverdue, habitSlipping, pickSuggestion, dismissUntil } = require('../../../services/suggestions');
const { streaks } = require('../../../services/habits');

const timeZone = 'Asia/Ho_Chi_Minh'; // UTC+7
const now = new Date('2026-10-21T05:00:00Z'); // 12:00 in Ho Chi Minh City
const today = '2026-10-21';
// A Date at a local hour, `daysAgo` days back.
const at = (daysAgo, hour, minute = 15) => new Date(Date.UTC(2026, 9, 21 - daysAgo, hour - 7, minute));

describe('peakWindow', () => {
  test('most tasks done 9–11: suggests planning tomorrow in that window', () => {
    const completedAt = [...Array(7)].map((_, i) => at(i + 1, 9 + (i % 2))).concat([at(2, 14), at(3, 20), at(4, 16)]);
    expect(peakWindow({ completedAt, timeZone, today, now })).toEqual({
      key: 'peak-9',
      title: 'You finish most tasks between 9 and 11 in the morning.',
      body: '7 of the 10 tasks you finished in the last 30 days were done between 9:00 and 11:00.',
      action: { label: 'Plan tomorrow 9–11', href: '/calendar?view=day&date=2026-10-22' },
    });
  });

  test('fewer than 10 finished tasks in 30 days: no pattern yet', () => {
    const completedAt = [...Array(9)].map((_, i) => at(i + 1, 9));
    expect(peakWindow({ completedAt, timeZone, today, now })).toBeNull();
  });

  test('tasks older than 30 days do not count', () => {
    const completedAt = [...Array(12)].map((_, i) => at(40 + i, 9));
    expect(peakWindow({ completedAt, timeZone, today, now })).toBeNull();
  });

  test('no window stands out (spread over the day): nothing to say', () => {
    const completedAt = [...Array(12)].map((_, i) => at(1, 8 + i));
    expect(peakWindow({ completedAt, timeZone, today, now })).toBeNull();
  });
});

describe('lateOverdue', () => {
  const task = (hour) => ({ schedule: { start: at(3, hour, 0) } });

  test('most overdue scheduled tasks were planned after 21:00', () => {
    const suggestion = lateOverdue({ overdueTasks: [task(22), task(23), task(10), { dueDate: at(2, 0) }], timeZone });
    expect(suggestion.key).toBe('late-overdue');
    expect(suggestion.title).toBe('2 of your 3 overdue tasks were planned after 21:00.');
  });

  test('one late task, or late ones in the minority, is not a pattern', () => {
    expect(lateOverdue({ overdueTasks: [task(22), task(10)], timeZone })).toBeNull();
    expect(lateOverdue({ overdueTasks: [task(22), task(23), task(9), task(10), task(11)], timeZone })).toBeNull();
    expect(lateOverdue({ overdueTasks: [], timeZone })).toBeNull();
  });
});

describe('habitSlipping', () => {
  const habit = (type = 'daily') => ({ _id: 'h1', name: 'Read 20 pages', frequency: { type, days: [] } });
  const summary = (doneDays, h = habit()) => {
    const done = new Set(doneDays);
    return { habit: h, done, start: '2026-09-01', streak: streaks(h, done, { start: '2026-09-01', today, weekStartsOn: 1 }), due: true, doneOnDate: done.has(today) };
  };

  test('a habit with a good run that missed the last 3 days: check in today', () => {
    const suggestion = habitSlipping({ summaries: [summary(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-17'])], today });
    expect(suggestion).toEqual({
      key: 'habit-h1',
      title: '“Read 20 pages” has slipped 3 times in a row.',
      body: 'Your best run was 4 days. One check-in today starts a new streak.',
      action: { label: 'Check in today', form: { action: '/habits/h1/check-ins', fields: { date: today, done: '1', returnTo: '/insights' } } },
    });
  });

  test('missed only 2 days, never had a run of 3, or counted per week: no suggestion', () => {
    expect(habitSlipping({ summaries: [summary(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-18'])], today })).toBeNull();
    expect(habitSlipping({ summaries: [summary(['2026-10-10', '2026-10-12'])], today })).toBeNull();
    expect(habitSlipping({ summaries: [summary(['2026-10-01', '2026-10-02', '2026-10-03'], habit('timesPerWeek'))], today })).toBeNull();
  });
});

describe('pickSuggestion', () => {
  const peakData = { completedAt: [...Array(10)].map((_, i) => at(i + 1, 9)), overdueTasks: [], summaries: [], today, now, timeZone };

  test('the first rule that fires and is not dismissed', () => {
    expect(pickSuggestion(peakData).key).toBe('peak-9');
  });

  test('a dismissed suggestion stays hidden for 7 days, then comes back', () => {
    const until = dismissUntil(now);
    expect(until - now).toBe(7 * 24 * 60 * 60 * 1000);
    expect(pickSuggestion({ ...peakData, dismissed: new Map([['peak-9', until]]) })).toBeNull();
    expect(pickSuggestion({ ...peakData, dismissed: { 'peak-9': new Date(now.getTime() - 1) } }).key).toBe('peak-9');
  });

  test('nothing to suggest gives null', () => {
    expect(pickSuggestion({ ...peakData, completedAt: [] })).toBeNull();
  });
});
