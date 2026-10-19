const { addInterval, occurrences } = require('../services/recurrence');

const NEW_YORK = 'America/New_York'; // clocks go back on 1 November 2026
const HCM = 'Asia/Ho_Chi_Minh';

describe('stepping on the wall clock', () => {
  test('a 09:00 weekly event is still at 09:00 after the clocks change', () => {
    const saturday = new Date('2026-10-31T13:00:00Z'); // 09:00 EDT
    expect(addInterval(saturday, 'weekly', 1, NEW_YORK)).toEqual(new Date('2026-11-07T14:00:00Z')); // 09:00 EST
  });

  test('the 31st falls on the last day of shorter months, counted from the start each time', () => {
    const jan31 = new Date('2027-01-31T02:00:00Z'); // 09:00 in UTC+7
    expect(addInterval(jan31, 'monthly', 1, HCM)).toEqual(new Date('2027-02-28T02:00:00Z'));
    expect(addInterval(jan31, 'monthly', 2, HCM)).toEqual(new Date('2027-03-31T02:00:00Z'));
    expect(addInterval(jan31, 'yearly', 1, HCM)).toEqual(new Date('2028-01-31T02:00:00Z'));
  });
});

describe('expanding a repeating event', () => {
  // Weekly lecture, Mondays 09:00–10:30 in UTC+7, from 5 Oct to 26 Oct 2026 (4 lectures).
  const lecture = {
    title: 'Database Systems',
    start: new Date('2026-10-05T02:00:00Z'),
    end: new Date('2026-10-05T03:30:00Z'),
    repeat: { frequency: 'weekly', until: new Date('2026-10-26T16:59:59Z') },
  };
  const october = [new Date('2026-10-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z')];
  const starts = (list) => list.map((occurrence) => occurrence.start.toISOString().slice(0, 16));

  test('every week until the end date, each keeping its length', () => {
    const list = occurrences(lecture, ...october, HCM);
    expect(starts(list)).toEqual(['2026-10-05T02:00', '2026-10-12T02:00', '2026-10-19T02:00', '2026-10-26T02:00']);
    expect(list.every(({ start, end }) => end - start === 90 * 60_000)).toBe(true);
  });

  test('only occurrences overlapping the range come back', () => {
    expect(starts(occurrences(lecture, new Date('2026-10-12T00:00:00Z'), new Date('2026-10-19T00:00:00Z'), HCM))).toEqual(['2026-10-12T02:00']);
  });

  test('a cancelled occurrence is skipped and a moved one shows at its new time', () => {
    const withChanges = {
      ...lecture,
      exceptions: [
        { original: new Date('2026-10-12T02:00:00Z'), cancelled: true },
        { original: new Date('2026-10-19T02:00:00Z'), start: new Date('2026-10-19T03:00:00Z'), end: new Date('2026-10-19T04:30:00Z'), title: 'Database Systems (room change)' },
      ],
    };
    const list = occurrences(withChanges, ...october, HCM);
    expect(starts(list)).toEqual(['2026-10-05T02:00', '2026-10-19T03:00', '2026-10-26T02:00']);
    expect(list[1]).toMatchObject({ original: new Date('2026-10-19T02:00:00Z'), title: 'Database Systems (room change)' });
  });

  test('a one-off event is a single occurrence', () => {
    const once = { title: 'Dentist', start: new Date('2026-10-20T08:00:00Z'), end: new Date('2026-10-20T08:30:00Z') };
    expect(starts(occurrences(once, ...october, HCM))).toEqual(['2026-10-20T08:00']);
  });
});
