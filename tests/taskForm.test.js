const { parseTaskForm } = require('../validators/task');

const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7
const base = { title: 'Revise joins', description: '', priority: 'medium', project: '', dueDate: '' };

describe('scheduling a task', () => {
  test('a slot typed in local time is stored as the right UTC instants', () => {
    const { errors, changes } = parseTaskForm({ ...base, scheduleDate: '2026-10-19', scheduleStart: '19:00', scheduleEnd: '20:30' }, TZ);
    expect(errors).toEqual({});
    expect(changes.schedule).toEqual({ start: new Date('2026-10-19T12:00:00Z'), end: new Date('2026-10-19T13:30:00Z') });
  });

  // The card's acceptance rule: a slot that ends before it starts would show up backwards on the calendar.
  test('an end time before the start time is rejected with a clear message', () => {
    const { errors } = parseTaskForm({ ...base, scheduleDate: '2026-10-19', scheduleStart: '20:00', scheduleEnd: '19:00' }, TZ);
    expect(errors.schedule).toBe('The end time must be after the start time.');
  });

  test('a half-filled schedule is an error, not a silently dropped time', () => {
    const { errors } = parseTaskForm({ ...base, scheduleDate: '2026-10-19', scheduleStart: '20:00' }, TZ);
    expect(errors.schedule).toMatch(/Fill in the date, start and end time/);
  });

  test('leaving all three schedule fields empty unschedules the task', () => {
    expect(parseTaskForm(base, TZ).changes.schedule).toBeNull();
  });
});

describe('other fields', () => {
  test('a title is required', () => {
    expect(parseTaskForm({ ...base, title: '   ' }, TZ).errors.title).toBe('Give the task a title.');
  });

  test('priority must be one of the three levels', () => {
    expect(parseTaskForm({ ...base, priority: 'urgent' }, TZ).errors.priority).toBeDefined();
  });

  test('the due date covers the whole local day', () => {
    const { changes } = parseTaskForm({ ...base, dueDate: '2026-10-19' }, TZ);
    expect(changes.dueDate).toEqual(new Date('2026-10-19T16:59:59.999Z')); // 23:59:59.999 in UTC+7
  });
});

describe('repeating a task', () => {
  test('a repeat needs a date to step from', () => {
    expect(parseTaskForm({ ...base, repeat: 'weekly' }, TZ).errors.repeat).toMatch(/due date or a scheduled time/);
    const { errors, changes } = parseTaskForm({ ...base, dueDate: '2026-10-19', repeat: 'weekly' }, TZ);
    expect(errors).toEqual({});
    expect(changes.repeat).toEqual({ frequency: 'weekly' });
  });

  test('only the four frequencies are accepted, and "Does not repeat" clears it', () => {
    expect(parseTaskForm({ ...base, dueDate: '2026-10-19', repeat: 'hourly' }, TZ).errors.repeat).toBe('Pick how often it repeats.');
    expect(parseTaskForm({ ...base, dueDate: '2026-10-19', repeat: '' }, TZ).changes.repeat).toBeNull();
  });
});

describe('ending a repeat', () => {
  const weekly = { ...base, dueDate: '2026-10-19', repeat: 'weekly' };

  test('the last date covers the whole local day', () => {
    const { errors, changes } = parseTaskForm({ ...weekly, until: '2026-12-18' }, TZ);
    expect(errors).toEqual({});
    expect(changes.repeat).toEqual({ frequency: 'weekly', until: new Date('2026-12-18T16:59:59.999Z') });
  });

  test('it can’t end before the task’s own date', () => {
    expect(parseTaskForm({ ...weekly, until: '2026-10-18' }, TZ).errors.until).toMatch(/can’t end before/);
  });

  test('empty repeats forever, and without a repeat the date is ignored', () => {
    expect(parseTaskForm(weekly, TZ).changes.repeat).toEqual({ frequency: 'weekly', until: undefined });
    expect(parseTaskForm({ ...base, until: 'nonsense' }, TZ).errors).toEqual({});
  });
});
