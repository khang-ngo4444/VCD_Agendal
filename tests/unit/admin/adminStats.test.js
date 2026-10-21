// No database: the day list, gap filling and percentages behind the admin overview.
const { lastDays, fillDays, percentChange, percentOf, CHART_DAYS } = require('../../../services/adminStats');

test(`lastDays lists ${CHART_DAYS} local days ending today, oldest first`, () => {
  const now = new Date('2026-10-17T18:30:00Z'); // already 18 Oct in Ho Chi Minh City
  const days = lastDays(now, 'Asia/Ho_Chi_Minh');
  expect(days).toHaveLength(CHART_DAYS);
  expect(days.at(-1)).toBe('2026-10-18');
  expect(days[0]).toBe('2026-09-19');
  expect(lastDays(now, 'UTC').at(-1)).toBe('2026-10-17');
});

test('fillDays puts 0 on days without check-ins and ignores days outside the chart', () => {
  const days = ['2026-10-15', '2026-10-16', '2026-10-17'];
  const rows = [
    { _id: '2026-10-17', count: 4 },
    { _id: '2026-10-15', count: 2 },
    { _id: '2026-09-01', count: 9 },
  ];
  expect(fillDays(days, rows)).toEqual([
    { date: '2026-10-15', count: 2 },
    { date: '2026-10-16', count: 0 },
    { date: '2026-10-17', count: 4 },
  ]);
});

test('percentChange compares with last week, and says nothing when last week was empty', () => {
  expect(percentChange(36, 32)).toBe(13);
  expect(percentChange(10, 20)).toBe(-50);
  expect(percentChange(5, 0)).toBeNull();
});

test('percentOf avoids dividing by zero', () => {
  expect(percentOf(412, 1248)).toBe(33);
  expect(percentOf(3, 0)).toBe(0);
});
