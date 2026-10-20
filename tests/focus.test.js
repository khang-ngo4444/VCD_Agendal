// No database: the focus lengths.
const { LENGTHS, lengthFor } = require('../services/focus');

test('lengthFor: the offered lengths, 25 / 5 for anything else', () => {
  expect(LENGTHS).toEqual([{ focus: 25, rest: 5 }, { focus: 50, rest: 10 }]);
  expect(lengthFor(50)).toEqual({ focus: 50, rest: 10 });
  expect(lengthFor('50')).toEqual({ focus: 50, rest: 10 });
  expect(lengthFor(undefined)).toEqual({ focus: 25, rest: 5 });
  expect(lengthFor(90)).toEqual({ focus: 25, rest: 5 });
});
