// No database: an in-memory store and a recording notifier.
const { processHabitReminders, wantsReminder } = require('../services/habitReminders');

const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7
const at = (local) => new Date(`${local}+07:00`); // "2026-10-19T21:00" local → Date
const user = (fields = {}) => ({ _id: 'u1', email: 'demo@agendal.app', timeZone: TZ, preferences: { weekStartsOn: 1 }, notifications: { push: true, email: true }, ...fields });
const habit = (fields = {}) => ({ _id: 'h1', owner: 'u1', name: 'Read 20 pages', frequency: { type: 'daily' }, reminderTime: '21:00', lastRemindedOn: null, ...fields });

function memoryStore(habits, users, checkIns = []) {
  const docs = habits.map((h) => ({ ...h }));
  return {
    docs,
    emails: [],
    findWithReminders: async () => docs.map((h) => ({ ...h })),
    loadUsers: async () => new Map(users.map((u) => [String(u._id), u])),
    checkInsBetween: async () => checkIns,
    claim: async (id, day) => {
      const doc = docs.find((h) => h._id === id);
      if (doc.lastRemindedOn === day) return false;
      doc.lastRemindedOn = day;
      return true;
    },
    release: async (id, previous) => {
      docs.find((h) => h._id === id).lastRemindedOn = previous ?? null;
    },
    recordEmail: async function (u, counters) {
      this.emails.push(counters);
      Object.assign(u.notifications, counters);
    },
  };
}

const recorder = () => ({ pushes: [], mails: [], habitPush: jest.fn(async function (u, hs) { this.pushes.push(hs.map((h) => h.name)); }), habitEmail: jest.fn(async function (u, hs) { this.mails.push(hs.map((h) => h.name)); }) });

describe('processHabitReminders', () => {
  test('a habit due today sends exactly one reminder at its time, by push and email', async () => {
    const store = memoryStore([habit()], [user()]);
    const notifier = recorder();
    expect(await processHabitReminders({ now: at('2026-10-19T20:59'), store, notifier })).toEqual({ sent: 0, failed: 0 });
    expect(await processHabitReminders({ now: at('2026-10-19T21:00'), store, notifier })).toEqual({ sent: 1, failed: 0 });
    expect(await processHabitReminders({ now: at('2026-10-19T21:01'), store, notifier })).toEqual({ sent: 0, failed: 0 });
    expect(notifier.habitPush).toHaveBeenCalledTimes(1);
    expect(notifier.habitEmail).toHaveBeenCalledTimes(1);
    expect(store.docs[0].lastRemindedOn).toBe('2026-10-19');
  });

  test('none once it is checked in today', async () => {
    const store = memoryStore([habit()], [user()], [{ habit: 'h1', date: '2026-10-19' }]);
    const notifier = recorder();
    await processHabitReminders({ now: at('2026-10-19T21:00'), store, notifier });
    expect(notifier.habitPush).not.toHaveBeenCalled();
  });

  test('the next day it reminds again', async () => {
    const store = memoryStore([habit({ lastRemindedOn: '2026-10-18' })], [user()]);
    const notifier = recorder();
    expect((await processHabitReminders({ now: at('2026-10-19T21:00'), store, notifier })).sent).toBe(1);
  });

  test('habits due together go in one email, each with its own push', async () => {
    const store = memoryStore([habit(), habit({ _id: 'h2', name: 'Stretch' })], [user()]);
    const notifier = recorder();
    await processHabitReminders({ now: at('2026-10-19T21:00'), store, notifier });
    expect(notifier.mails).toEqual([['Read 20 pages', 'Stretch']]);
    expect(notifier.pushes).toEqual([['Read 20 pages', 'Stretch']]);
  });

  test('email waits for its 15-minute gap, so push goes alone; nothing at all when both channels are off', async () => {
    const recent = user({ notifications: { push: true, email: true, lastEmailAt: at('2026-10-19T20:55'), emailDay: '2026-10-19', emailsToday: 1 } });
    const notifier = recorder();
    await processHabitReminders({ now: at('2026-10-19T21:00'), store: memoryStore([habit()], [recent]), notifier });
    expect(notifier.habitPush).toHaveBeenCalledTimes(1);
    expect(notifier.habitEmail).not.toHaveBeenCalled();

    const silent = recorder();
    const store = memoryStore([habit()], [user({ notifications: { push: false, email: false } })]);
    await processHabitReminders({ now: at('2026-10-19T21:00'), store, notifier: silent });
    expect(silent.habitPush).not.toHaveBeenCalled();
    expect(store.docs[0].lastRemindedOn).toBeNull();
  });

  test('when nothing could be sent the habit is freed, and the next minute tries again', async () => {
    const store = memoryStore([habit()], [user({ notifications: { push: true, email: false } })]);
    const failing = { habitPush: jest.fn().mockRejectedValueOnce(new Error('push service down')).mockResolvedValue(), habitEmail: jest.fn() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await processHabitReminders({ now: at('2026-10-19T21:00'), store, notifier: failing })).toEqual({ sent: 0, failed: 1 });
    expect(store.docs[0].lastRemindedOn).toBeNull();
    expect(await processHabitReminders({ now: at('2026-10-19T21:01'), store, notifier: failing })).toEqual({ sent: 1, failed: 0 });
    console.error.mockRestore();
  });
});

describe('wantsReminder', () => {
  const u = user();
  test('only on due days: weekdays skip the weekend, chosen days only those', () => {
    // 2026-10-18 is a Sunday, 2026-10-19 a Monday
    expect(wantsReminder(habit({ frequency: { type: 'weekdays' } }), u, at('2026-10-18T21:00'), [])).toBe(false);
    expect(wantsReminder(habit({ frequency: { type: 'weekdays' } }), u, at('2026-10-19T21:00'), [])).toBe(true);
    expect(wantsReminder(habit({ frequency: { type: 'days', days: [3] } }), u, at('2026-10-19T21:00'), [])).toBe(false);
  });

  test('N times a week: not once this week’s target is met', () => {
    const twice = habit({ frequency: { type: 'timesPerWeek', timesPerWeek: 2 } });
    const week = [{ habit: 'h1', date: '2026-10-20' }, { habit: 'h1', date: '2026-10-21' }];
    expect(wantsReminder(twice, u, at('2026-10-22T21:00'), week.slice(0, 1))).toBe(true);
    expect(wantsReminder(twice, u, at('2026-10-22T21:00'), week)).toBe(false);
  });

  test('a missed time is caught up within an hour, not later; the reminder time is in the user’s time zone', () => {
    expect(wantsReminder(habit(), u, at('2026-10-19T21:59'), [])).toBe(true);
    expect(wantsReminder(habit(), u, at('2026-10-19T22:00'), [])).toBe(false);
    expect(wantsReminder(habit(), user({ timeZone: 'UTC' }), at('2026-10-19T21:00'), [])).toBe(false); // 14:00 UTC
  });
});
