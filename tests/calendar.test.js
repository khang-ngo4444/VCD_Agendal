const { assignLanes } = require('../services/calendar');

const item = (name, start, end) => ({ name, startMinute: start * 60, endMinute: end * 60 });
const layout = (items) => Object.fromEntries(assignLanes(items).map(({ name, lane, lanes }) => [name, `${lane + 1}/${lanes}`]));

test('items that do not overlap each get the full width', () => {
  expect(layout([item('a', 9, 10), item('b', 10, 11)])).toEqual({ a: '1/1', b: '1/1' });
});

test('overlapping items split the width, and a lane is reused once it is free', () => {
  // a 9–12 overlaps b 9–10 and c 10–11; c can reuse b's lane, so the whole group needs only two lanes.
  expect(layout([item('a', 9, 12), item('b', 9, 10), item('c', 10, 11)])).toEqual({ a: '1/2', b: '2/2', c: '2/2' });
});

test('a later group starts again at full width', () => {
  expect(layout([item('a', 9, 10), item('b', 9.5, 10.5), item('c', 14, 15)])).toEqual({ a: '1/2', b: '2/2', c: '1/1' });
});
