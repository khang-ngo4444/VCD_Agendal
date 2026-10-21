const { setColumn, reopenedStatus, nextDates } = require('../../../services/tasks');

const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7
const now = new Date('2026-10-19T03:00:00Z'); // 10:00 on Monday 19 October in UTC+7

describe('a task is in Done exactly when it is completed', () => {
  test('moving a card into Done completes the task', () => {
    const task = { status: 'active', completedAt: null };
    setColumn(task, 'done', now);
    expect(task).toEqual({ status: 'done', completedAt: now });
  });

  test('moving a card out of Done reopens the task', () => {
    const task = { status: 'done', completedAt: new Date('2026-10-18T10:00:00Z') };
    setColumn(task, 'active', now);
    expect(task).toEqual({ status: 'active', completedAt: null });
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

describe('the next occurrence of a repeating task', () => {
  test('a weekly slot comes back at the same local time, even across a DST change', () => {
    const task = { repeat: { frequency: 'weekly' }, schedule: { start: new Date('2026-10-30T13:00:00Z'), end: new Date('2026-10-30T14:00:00Z') } };
    // 09:00–10:00 in New York on Fri 30 Oct (EDT); clocks go back on 1 Nov, so the next one is 14:00 UTC
    expect(nextDates(task, 'America/New_York').schedule).toEqual({ start: new Date('2026-11-06T14:00:00Z'), end: new Date('2026-11-06T15:00:00Z') });
  });

  test('a due date stays the end of its local day; a monthly one on the 31st lands on the 30th', () => {
    const task = { repeat: { frequency: 'monthly' }, dueDate: new Date('2026-10-31T16:59:59.999Z') }; // 23:59:59.999 on 31 Oct in UTC+7
    expect(nextDates(task, TZ)).toEqual({ dueDate: new Date('2026-11-30T16:59:59.999Z'), schedule: undefined });
  });

  test('nothing comes after the "until" date', () => {
    const task = { repeat: { frequency: 'weekly', until: new Date('2026-10-25T16:59:59.999Z') }, dueDate: new Date('2026-10-19T16:59:59.999Z') };
    expect(nextDates(task, TZ)).toBeNull();
    task.repeat.until = new Date('2026-10-26T16:59:59.999Z'); // the last day itself still counts
    expect(nextDates(task, TZ).dueDate).toEqual(new Date('2026-10-26T16:59:59.999Z'));
  });

  test('a task that doesn’t repeat, or has no date, has no next occurrence', () => {
    expect(nextDates({ dueDate: new Date() }, TZ)).toBeNull();
    expect(nextDates({ repeat: { frequency: 'daily' } }, TZ)).toBeNull();
  });
});
