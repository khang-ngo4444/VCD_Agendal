const {
  todayRange,
  dayRange,
  zonedTime,
  parseDateInput,
  parseTimeInput,
  endOfLocalDay,
  isOverdue,
  formatDay,
} = require('../services/dates');

// Etc/GMT+8 is UTC-8 (POSIX names flip the sign); no DST, so the numbers below never drift.
const UTC_MINUS_8 = 'Etc/GMT+8';
const UTC_PLUS_7 = 'Asia/Ho_Chi_Minh';

describe('today in the user’s time zone', () => {
  // 06:00 UTC on 17 Oct is still the evening of the 16th in UTC-8, but already the afternoon of the 17th in UTC+7.
  // If "today" came from the server clock, one of these users would see the wrong Daily List.
  const sameMoment = new Date('2026-10-17T06:00:00Z');

  test('a UTC-8 user is still on 16 October', () => {
    expect(todayRange(UTC_MINUS_8, sameMoment)).toEqual({
      start: new Date('2026-10-16T08:00:00Z'),
      end: new Date('2026-10-17T08:00:00Z'),
    });
  });

  test('a UTC+7 user is already on 17 October', () => {
    expect(todayRange(UTC_PLUS_7, sameMoment)).toEqual({
      start: new Date('2026-10-16T17:00:00Z'),
      end: new Date('2026-10-17T17:00:00Z'),
    });
  });

  test('the day the clocks go back has 25 hours, so nothing scheduled late that day falls into tomorrow', () => {
    const { start, end } = dayRange(new Date('2026-11-01T12:00:00Z'), 'America/New_York');
    expect((end - start) / 3_600_000).toBe(25);
  });
});

describe('form values', () => {
  test('a local time becomes the matching UTC instant', () => {
    expect(zonedTime({ year: 2026, month: 10, day: 19, hour: 20, minute: 0 }, UTC_PLUS_7)).toEqual(new Date('2026-10-19T13:00:00Z'));
  });

  test('impossible dates and times are rejected instead of rolling over', () => {
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('19/10/2026')).toBeNull();
    expect(parseTimeInput('24:00')).toBeNull();
    expect(parseDateInput('2026-10-19')).toEqual({ year: 2026, month: 10, day: 19 });
  });
});

describe('overdue', () => {
  const due = endOfLocalDay({ year: 2026, month: 10, day: 19 }, UTC_PLUS_7);

  test('a task stays on time for the whole of its due day', () => {
    expect(isOverdue({ dueDate: due }, new Date('2026-10-19T16:59:00Z'))).toBe(false); // 23:59 local
  });

  test('it becomes overdue when the due day ends, unless it was completed', () => {
    const nextMorning = new Date('2026-10-20T01:00:00Z');
    expect(isOverdue({ dueDate: due }, nextMorning)).toBe(true);
    expect(isOverdue({ dueDate: due, completedAt: new Date() }, nextMorning)).toBe(false);
  });

  test('due dates read as Today and Tomorrow for the user, not the server', () => {
    const now = new Date('2026-10-19T03:00:00Z'); // 10:00 on the 19th in UTC+7
    expect(formatDay(due, UTC_PLUS_7, now)).toBe('Today');
    expect(formatDay(endOfLocalDay({ year: 2026, month: 10, day: 20 }, UTC_PLUS_7), UTC_PLUS_7, now)).toBe('Tomorrow');
  });
});

describe('local day strings', () => {
  const { addDays, weekdayOf, startOfWeek } = require('../services/dates');

  test('adding days crosses month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  test('the day the clocks go back is still exactly one day long', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  test('weeks start on the user’s first day of the week', () => {
    expect(weekdayOf('2026-10-18')).toBe(0); // a Sunday
    expect(startOfWeek('2026-10-18', 1)).toBe('2026-10-12'); // Monday-first: the Sunday ends the week
    expect(startOfWeek('2026-10-18', 0)).toBe('2026-10-18'); // Sunday-first: it starts one
  });
});
