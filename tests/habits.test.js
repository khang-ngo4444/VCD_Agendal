const { isDue, streaks, dailyStreaks, completion, weekProgress, describeFrequency } = require('../services/habits');
const { addDays, toDateInput } = require('../services/dates');

const daily = { frequency: { type: 'daily' } };
const weekdays = { frequency: { type: 'weekdays' } };
const monWedFri = { frequency: { type: 'days', days: [1, 3, 5] } };
const threeAWeek = { frequency: { type: 'timesPerWeek', timesPerWeek: 3 } };

// Days before `end` (inclusive), e.g. lastDays('2026-10-18', 3) → 16, 17, 18.
const lastDays = (end, count) => Array.from({ length: count }, (_, i) => addDays(end, -i));
const set = (...lists) => new Set(lists.flat());

const TODAY = '2026-10-18'; // a Sunday
const opts = { start: '2026-09-01', today: TODAY, weekStartsOn: 1 };

describe('which days a habit is due', () => {
  test('weekdays skip Saturday and Sunday', () => {
    expect(isDue(weekdays, '2026-10-16')).toBe(true); // Friday
    expect(isDue(weekdays, '2026-10-17')).toBe(false); // Saturday
  });

  test('chosen days only', () => {
    expect(isDue(monWedFri, '2026-10-14')).toBe(true); // Wednesday
    expect(isDue(monWedFri, '2026-10-15')).toBe(false); // Thursday
  });

  test('N times a week can be done on any day', () => {
    expect(isDue(threeAWeek, '2026-10-17')).toBe(true);
  });
});

describe('daily streaks', () => {
  test('consecutive check-ins up to today', () => {
    expect(streaks(daily, set(lastDays(TODAY, 5)), opts)).toMatchObject({ current: 5, longest: 5, unit: 'day' });
  });

  test('today not done yet does not break the streak', () => {
    expect(streaks(daily, set(lastDays(addDays(TODAY, -1), 4)), opts).current).toBe(4);
  });

  test('a missed day ends the current streak but the longest one is kept', () => {
    const done = set(lastDays('2026-10-10', 7), lastDays(TODAY, 3)); // 4–10 Oct, then 16–18 Oct
    expect(streaks(daily, done, opts)).toMatchObject({ current: 3, longest: 7 });
  });
});

describe('streaks for habits that are not due every day', () => {
  test('weekends do not break a weekday streak', () => {
    const weekdaysDone = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
    expect(streaks(weekdays, set(weekdaysDone), opts).current).toBe(10);
  });

  test('chosen days count only those days', () => {
    const done = set(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16']);
    expect(streaks(monWedFri, done, opts).current).toBe(6);
    done.delete('2026-10-12');
    expect(streaks(monWedFri, done, opts)).toMatchObject({ current: 2, longest: 3 });
  });
});

describe('scheduled streaks versus consecutive calendar days', () => {
  const gymDays = ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21'];
  const gymOptions = { start: '2026-09-21', today: '2026-10-21' };

  test('Gym can have 14 scheduled days but 13 completions in the last 30 days and a 1-day daily streak', () => {
    const done = set(gymDays);
    expect(streaks(monWedFri, done, gymOptions)).toEqual({ current: 14, longest: 14, unit: 'scheduled day' });
    expect(completion(monWedFri, done, { ...gymOptions, start: '2026-09-22' })).toEqual({ done: 13, due: 13, rate: 1 });
    expect(dailyStreaks(done, gymOptions)).toEqual({ current: 1, longest: 1, unit: 'day' });
  });

  test('undo today retains the previous scheduled streak but a missed due day breaks it', () => {
    const done = set(gymDays.slice(0, -1));
    expect(streaks(monWedFri, done, gymOptions).current).toBe(13);
    expect(dailyStreaks(done, gymOptions).current).toBe(0); // Tuesday was missed
    done.delete('2026-10-19');
    expect(streaks(monWedFri, done, gymOptions)).toMatchObject({ current: 0, longest: 12 });
    done.add('2026-10-21');
    expect(streaks(monWedFri, done, gymOptions).current).toBe(1);
  });

  test('off-schedule check-ins extend only the daily streak; future dates do not count', () => {
    const done = set(gymDays, ['2026-10-20', '2026-10-22']);
    expect(dailyStreaks(done, gymOptions)).toMatchObject({ current: 3, longest: 3 });
    expect(streaks(monWedFri, done, gymOptions).current).toBe(14);
    expect(dailyStreaks(done, { ...gymOptions, today: '2026-10-22' }).current).toBe(4);
  });

  test('a weekly goal and daily streak have different units and reset boundaries', () => {
    const done = set(['2026-10-12', '2026-10-13', '2026-10-14']);
    const options = { start: '2026-10-12', today: '2026-10-16' };
    expect(streaks(threeAWeek, done, options)).toEqual({ current: 1, longest: 1, unit: 'week' });
    expect(dailyStreaks(done, options)).toEqual({ current: 0, longest: 3, unit: 'day' });
  });
});

describe('N times a week', () => {
  // Monday-first weeks: 28 Sep, 5 Oct, 12 Oct (this week, ends today).
  const week1 = ['2026-09-28', '2026-09-30', '2026-10-02'];
  const week2 = ['2026-10-05', '2026-10-06', '2026-10-09'];

  test('counts weeks that met the target, in weeks', () => {
    const result = streaks(threeAWeek, set(week1, week2, ['2026-10-12', '2026-10-14', '2026-10-15']), { ...opts, start: '2026-09-28' });
    expect(result).toEqual({ current: 3, longest: 3, unit: 'week' });
  });

  test('the current week in progress does not break the streak', () => {
    const result = streaks(threeAWeek, set(week1, week2, ['2026-10-13']), { ...opts, start: '2026-09-28', today: '2026-10-14' });
    expect(result.current).toBe(2);
  });

  test('a past week below the target breaks it', () => {
    const result = streaks(threeAWeek, set(week1, ['2026-10-05'], ['2026-10-12', '2026-10-13', '2026-10-14']), { ...opts, start: '2026-09-28' });
    expect(result).toMatchObject({ current: 1, longest: 1 });
  });

  test('a Sunday-first week changes which days belong together', () => {
    // Sun 11 – Sat 17 Oct holds three check-ins only when weeks start on Sunday.
    const done = set(['2026-10-11', '2026-10-13', '2026-10-17']);
    expect(streaks(threeAWeek, done, { start: '2026-10-11', today: '2026-10-18', weekStartsOn: 0 }).current).toBe(1);
    expect(streaks(threeAWeek, done, { start: '2026-10-11', today: '2026-10-18', weekStartsOn: 1 }).current).toBe(0);
  });
});

describe('time zones', () => {
  // 06:00 UTC on 17 Oct: still the 16th for a UTC-8 user, already the 17th for a UTC+7 user.
  const now = new Date('2026-10-17T06:00:00Z');
  const checkedInUntil15th = set(lastDays('2026-10-15', 5));

  test('the user’s own today decides whether the streak is still alive', () => {
    const minus8 = toDateInput(now, 'Etc/GMT+8');
    const plus7 = toDateInput(now, 'Asia/Ho_Chi_Minh');
    expect([minus8, plus7]).toEqual(['2026-10-16', '2026-10-17']);
    expect(streaks(daily, checkedInUntil15th, { ...opts, today: minus8 }).current).toBe(5); // the 16th is still in progress
    expect(streaks(daily, checkedInUntil15th, { ...opts, today: plus7 }).current).toBe(0); // the 16th is over and was missed
  });
});

describe('completion rate and weekly progress', () => {
  test('checked-in due days ÷ due days, ignoring today until it is done', () => {
    const done = set(['2026-10-12', '2026-10-13', '2026-10-15']); // Mon, Tue, Thu
    expect(completion(weekdays, done, { start: '2026-10-12', today: TODAY })).toEqual({ done: 3, due: 5, rate: 0.6 });
  });

  test('nothing due yet gives no rate', () => {
    expect(completion(weekdays, set(), { start: TODAY, today: TODAY }).rate).toBeNull();
  });

  test('this week’s progress', () => {
    expect(weekProgress(threeAWeek, set(['2026-10-13', '2026-10-15']), { today: TODAY })).toEqual({ done: 2, target: 3 });
    expect(weekProgress(monWedFri, set(['2026-10-12']), { today: TODAY })).toEqual({ done: 1, target: 3 });
  });
});

test('frequency labels follow the user’s week', () => {
  const sunMon = { frequency: { type: 'days', days: [1, 0] } };
  expect(describeFrequency(sunMon, 1)).toBe('Mon, Sun');
  expect(describeFrequency(sunMon, 0)).toBe('Sun, Mon');
  expect(describeFrequency(threeAWeek)).toBe('3 times a week');
});
