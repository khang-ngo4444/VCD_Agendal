// No database: the Reminder model is stubbed, so these cover the reminder times and what gets saved or removed.
const Reminder = require('../../../models/Reminder');
const taskReminders = require('../../../services/taskReminders');

const now = new Date('2026-10-18T06:00:00Z'); // 13:00 in Ho Chi Minh City
const owner = '64b000000000000000000001';
const scheduled = (iso) => ({ _id: '64b0000000000000000000aa', owner, schedule: { start: new Date(iso), end: new Date(iso) } });
const unscheduled = { _id: '64b0000000000000000000bb', owner, schedule: undefined };

afterEach(() => jest.restoreAllMocks());

describe('setPreset', () => {
  beforeEach(() => {
    jest.spyOn(Reminder, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    jest.spyOn(Reminder, 'create').mockImplementation(async (doc) => doc);
  });

  test.each([
    [5, '2026-10-18T07:55:00.000Z'],
    [15, '2026-10-18T07:45:00.000Z'],
    [30, '2026-10-18T07:30:00.000Z'],
    [60, '2026-10-18T07:00:00.000Z'],
    [1440, '2026-10-17T08:00:00.000Z'],
  ])('%i minutes before an 08:00 UTC start', async (minutes, expected) => {
    const task = scheduled('2026-10-18T08:00:00Z');
    const result = await taskReminders.setPreset(task, minutes, new Date('2026-10-16T00:00:00Z'));
    expect(result.reminder.remindAt.toISOString()).toBe(expected);
    expect(result.reminder.offsetMinutes).toBe(minutes);
  });

  test('replaces the task’s earlier reminder and starts unsent, so the job sends it once', async () => {
    const task = scheduled('2026-10-18T08:00:00Z');
    const { reminder } = await taskReminders.setPreset(task, '15', now);
    expect(Reminder.deleteMany).toHaveBeenCalledWith({ task: task._id, owner, sent: false });
    expect(reminder).toMatchObject({ task: task._id, owner, sent: false, pushedAt: null, emailedAt: null, attempts: 0 });
  });

  test('an unscheduled task, a time already passed or an unknown preset are refused', async () => {
    expect(await taskReminders.setPreset(unscheduled, 15, now)).toEqual({ error: 'not_scheduled' });
    expect(await taskReminders.setPreset(scheduled('2026-10-18T06:10:00Z'), 15, now)).toEqual({ error: 'past' });
    expect(await taskReminders.setPreset(scheduled('2026-10-18T08:00:00Z'), 7, now)).toEqual({ error: 'unknown_preset' });
    expect(await taskReminders.setPreset(scheduled('2026-10-18T08:00:00Z'), ['15'], now)).toEqual({ error: 'unknown_preset' });
    expect(Reminder.create).not.toHaveBeenCalled();
  });
});

describe('syncWithSchedule', () => {
  const pending = (fields) => {
    const doc = { _id: 'r1', save: jest.fn().mockResolvedValue(), set(values) { Object.assign(this, values); }, ...fields };
    jest.spyOn(Reminder, 'findOne').mockResolvedValue(doc);
    jest.spyOn(Reminder, 'deleteOne').mockResolvedValue({});
    return doc;
  };

  test('a preset follows the new start time and is sent again', async () => {
    const doc = pending({ offsetMinutes: 15, remindAt: new Date('2026-10-18T07:45:00Z'), pushedAt: new Date() });
    expect(await taskReminders.syncWithSchedule(scheduled('2026-10-18T10:00:00Z'), now)).toBe('moved');
    expect(doc.remindAt.toISOString()).toBe('2026-10-18T09:45:00.000Z');
    expect(doc).toMatchObject({ sent: false, pushedAt: null, emailedAt: null });
    expect(doc.save).toHaveBeenCalled();
  });

  test('a preset goes when the task loses its schedule or its new time has passed', async () => {
    pending({ offsetMinutes: 15, remindAt: new Date('2026-10-18T07:45:00Z') });
    expect(await taskReminders.syncWithSchedule(unscheduled, now)).toBe('removed');
    expect(await taskReminders.syncWithSchedule(scheduled('2026-10-18T06:05:00Z'), now)).toBe('passed');
    expect(Reminder.deleteOne).toHaveBeenCalledWith({ _id: 'r1' });
  });

  test('a chosen time stays put, and an unchanged preset is left alone', async () => {
    pending({ offsetMinutes: null, remindAt: new Date('2026-10-19T02:00:00Z') });
    expect(await taskReminders.syncWithSchedule(unscheduled, now)).toBe('kept');
    const doc = pending({ offsetMinutes: 15, remindAt: new Date('2026-10-18T07:45:00Z') });
    expect(await taskReminders.syncWithSchedule(scheduled('2026-10-18T08:00:00Z'), now)).toBe('kept');
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('no reminder, nothing to do', async () => {
    jest.spyOn(Reminder, 'findOne').mockResolvedValue(null);
    expect(await taskReminders.syncWithSchedule(scheduled('2026-10-18T08:00:00Z'), now)).toBe('none');
  });
});

test('describe: the preset name with its time, in the user’s time zone', () => {
  const label = (r) => taskReminders.describe(r, 'Asia/Ho_Chi_Minh', now).label;
  expect(label({ offsetMinutes: 15, remindAt: new Date('2026-10-18T07:45:00Z') })).toBe('15 minutes before · 14:45');
  expect(taskReminders.describe(null, 'UTC')).toBeNull();
});

describe('setCustom (reminder at a chosen date and time)', () => {
  beforeEach(() => {
    jest.spyOn(Reminder, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    jest.spyOn(Reminder, 'create').mockImplementation(async (doc) => doc);
  });

  test('the wall-clock time is read in the user’s time zone, and works for unscheduled tasks', async () => {
    const { reminder } = await taskReminders.setCustom(unscheduled, '2026-10-20', '09:00', 'Asia/Ho_Chi_Minh', now);
    expect(reminder.remindAt.toISOString()).toBe('2026-10-20T02:00:00.000Z');
    expect(reminder.offsetMinutes).toBeNull(); // stays put when the task is rescheduled
  });

  test('a time already passed, a malformed date or time, or crafted arrays are refused', async () => {
    expect(await taskReminders.setCustom(unscheduled, '2026-10-18', '12:59', 'Asia/Ho_Chi_Minh', now)).toEqual({ error: 'past' });
    expect(await taskReminders.setCustom(unscheduled, '2026-02-30', '09:00', 'UTC', now)).toEqual({ error: 'invalid_time' });
    expect(await taskReminders.setCustom(unscheduled, '2026-10-20', '25:00', 'UTC', now)).toEqual({ error: 'invalid_time' });
    expect(await taskReminders.setCustom(unscheduled, ['2026-10-20'], ['09:00'], 'UTC', now)).toEqual({ error: 'invalid_time' });
    expect(Reminder.create).not.toHaveBeenCalled();
  });

  test('describe shows the day and time of a chosen time', () => {
    const r = { offsetMinutes: null, remindAt: new Date('2026-10-19T02:00:00Z') };
    expect(taskReminders.describe(r, 'Asia/Ho_Chi_Minh', now).label).toBe('Tomorrow · 09:00');
  });
});

test('customDefaults: the current reminder, else 15 minutes before the start, else the next full hour', () => {
  const tz = 'Asia/Ho_Chi_Minh';
  expect(taskReminders.customDefaults(unscheduled, { remindAt: new Date('2026-10-19T02:00:00Z') }, tz, now)).toEqual({ date: '2026-10-19', time: '09:00' });
  expect(taskReminders.customDefaults(scheduled('2026-10-18T08:00:00Z'), null, tz, now)).toEqual({ date: '2026-10-18', time: '14:45' });
  expect(taskReminders.customDefaults(unscheduled, null, tz, new Date('2026-10-18T06:20:00Z'))).toEqual({ date: '2026-10-18', time: '14:00' });
});

describe('remove', () => {
  test('deletes the task’s unsent reminder, so the job never sends it, and returns what Undo needs', async () => {
    jest.spyOn(Reminder, 'findOne').mockResolvedValue({ remindAt: new Date('2026-10-18T07:45:00Z'), offsetMinutes: 15 });
    jest.spyOn(Reminder, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
    expect(await taskReminders.remove(scheduled('2026-10-18T08:00:00Z'))).toEqual({ remindAt: new Date('2026-10-18T07:45:00Z'), offsetMinutes: 15 });
    expect(Reminder.deleteMany).toHaveBeenCalledWith({ task: '64b0000000000000000000aa', owner, sent: false });
  });

  test('says so when there was nothing to remove', async () => {
    jest.spyOn(Reminder, 'findOne').mockResolvedValue(null);
    jest.spyOn(Reminder, 'deleteMany');
    expect(await taskReminders.remove(unscheduled)).toBeNull();
    expect(Reminder.deleteMany).not.toHaveBeenCalled();
  });
});

describe('restore (Undo of Remove reminder)', () => {
  beforeEach(() => {
    jest.spyOn(Reminder, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    jest.spyOn(Reminder, 'create').mockImplementation(async (doc) => doc);
  });

  test('a preset comes back counted from the task’s current start, a chosen time as it was', async () => {
    const preset = await taskReminders.restore(scheduled('2026-10-18T09:00:00Z'), { remindAt: '2026-10-18T07:45:00.000Z', offsetMinutes: 15 }, now);
    expect(preset.reminder).toMatchObject({ remindAt: new Date('2026-10-18T08:45:00Z'), offsetMinutes: 15, sent: false });
    const chosen = await taskReminders.restore(unscheduled, { remindAt: '2026-10-19T02:00:00.000Z', offsetMinutes: null }, now);
    expect(chosen.reminder).toMatchObject({ remindAt: new Date('2026-10-19T02:00:00Z'), offsetMinutes: null });
  });

  test('not once its time has passed', async () => {
    expect(await taskReminders.restore(unscheduled, { remindAt: '2026-10-18T05:00:00.000Z', offsetMinutes: null }, now)).toEqual({ error: 'past' });
    expect(Reminder.create).not.toHaveBeenCalled();
  });
});
