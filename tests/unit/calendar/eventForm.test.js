const { parseEventForm } = require('../../../validators/event');

const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7
const base = { title: 'HCI group meeting', date: '2026-10-14', start: '15:00', end: '16:00' };

test('a timed event is stored as UTC instants from the local times', () => {
  const { errors, changes } = parseEventForm(base, TZ);
  expect(errors).toEqual({});
  expect(changes).toMatchObject({ start: new Date('2026-10-14T08:00:00Z'), end: new Date('2026-10-14T09:00:00Z'), allDay: false });
});

test('an end before the start gets the message from the design, with a suggestion', () => {
  const { errors } = parseEventForm({ ...base, end: '14:00' }, TZ);
  expect(errors.time).toBe('End time must be after the start (15:00). Try 16:00?');
});

test('a title is required', () => {
  expect(parseEventForm({ ...base, title: ' ' }, TZ).errors.title).toBe('Give the event a title.');
});

test('an all-day event runs from local midnight to the next midnight and ignores the times', () => {
  const { errors, changes } = parseEventForm({ ...base, start: '', end: '', allDay: 'on' }, TZ);
  expect(errors).toEqual({});
  expect(changes).toMatchObject({ start: new Date('2026-10-13T17:00:00Z'), end: new Date('2026-10-14T17:00:00Z'), allDay: true });
});

test('a repeat can end on a date, which covers that whole day, but not before the first event', () => {
  expect(parseEventForm({ ...base, repeat: 'weekly', until: '2026-12-16' }, TZ).changes.repeat).toEqual({
    frequency: 'weekly',
    until: new Date('2026-12-16T16:59:59.999Z'),
  });
  expect(parseEventForm({ ...base, repeat: 'weekly', until: '2026-10-01' }, TZ).errors.until).toBeDefined();
  expect(parseEventForm({ ...base, repeat: 'hourly' }, TZ).errors.repeat).toBeDefined();
  expect(parseEventForm(base, TZ).changes.repeat).toBeUndefined();
});
