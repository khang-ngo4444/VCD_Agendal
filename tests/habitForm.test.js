const { parseHabitForm } = require('../validators/habit');

const base = { name: 'Read 20 pages', colour: '#2f6fde', frequencyType: 'daily' };

test('a daily habit needs only a name and a colour', () => {
  const { errors, changes } = parseHabitForm(base);
  expect(errors).toEqual({});
  expect(changes).toEqual({ name: 'Read 20 pages', colour: '#2f6fde', frequency: { type: 'daily' }, reminderTime: undefined });
});

test('chosen days arrive as a string for one box and an array for several', () => {
  expect(parseHabitForm({ ...base, frequencyType: 'days', days: '3' }).changes.frequency).toEqual({ type: 'days', days: [3] });
  expect(parseHabitForm({ ...base, frequencyType: 'days', days: ['5', '1', '1'] }).changes.frequency).toEqual({ type: 'days', days: [1, 5] });
});

test('chosen days with no box ticked is an error next to the frequency', () => {
  expect(parseHabitForm({ ...base, frequencyType: 'days' }).errors.frequency).toBe('Tick at least one day.');
});

test('times a week must be 1 to 7, and other frequencies drop the leftover fields', () => {
  expect(parseHabitForm({ ...base, frequencyType: 'timesPerWeek', timesPerWeek: '3' }).changes.frequency).toEqual({ type: 'timesPerWeek', timesPerWeek: 3 });
  expect(parseHabitForm({ ...base, frequencyType: 'timesPerWeek', timesPerWeek: '9' }).errors.frequency).toBeDefined();
  expect(parseHabitForm({ ...base, days: '2', timesPerWeek: '3' }).changes.frequency).toEqual({ type: 'daily' });
});

test('name, colour and reminder time are checked', () => {
  const { errors } = parseHabitForm({ name: ' ', colour: 'red', frequencyType: 'daily', reminderTime: '25:00' });
  expect(Object.keys(errors).sort()).toEqual(['colour', 'name', 'reminderTime']);
});
