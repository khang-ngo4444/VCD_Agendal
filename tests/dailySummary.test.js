// No database: a fake store and a recording notifier.
process.env.SESSION_SECRET = 'test-secret'; // signs the unsubscribe links in the emails
const { processDailySummaries, isTime, digest } = require('../services/dailySummary');
const { buildSummaryEmail, buildSummaryPush } = require('../services/notifier');

const TZ = 'Asia/Ho_Chi_Minh';
const at = (local) => new Date(`${local}+07:00`);
const user = (summary = {}, notifications = {}) => ({
  _id: 'u1',
  email: 'demo@agendal.app',
  timeZone: TZ,
  notifications: { push: true, email: true, dailySummary: { on: true, time: '07:30', lastSentOn: null, ...summary }, ...notifications },
});
const emptyDay = { scheduled: [], due: [], overdue: [], habits: [], events: [] };

function fakeStore(users, { browsers = 0, day = emptyDay } = {}) {
  return {
    findOn: async () => users,
    claim: async (id, today) => {
      const u = users.find((item) => item._id === id);
      if (u.notifications.dailySummary.lastSentOn === today) return false;
      u.notifications.dailySummary.lastSentOn = today;
      return true;
    },
    release: async (id, previous) => {
      users.find((item) => item._id === id).notifications.dailySummary.lastSentOn = previous;
    },
    loadDay: async () => day,
    browsers: async () => browsers,
  };
}
const recorder = () => ({ summaryPush: jest.fn(async () => {}), summaryEmail: jest.fn(async () => {}) });

describe('processDailySummaries', () => {
  test('once a day at the chosen time, by email when no browser has push on', async () => {
    const users = [user()];
    const notifier = recorder();
    const store = fakeStore(users);
    expect((await processDailySummaries({ now: at('2026-10-19T07:29'), store, notifier })).sent).toBe(0);
    expect((await processDailySummaries({ now: at('2026-10-19T07:30'), store, notifier })).sent).toBe(1);
    expect((await processDailySummaries({ now: at('2026-10-19T07:31'), store, notifier })).sent).toBe(0);
    expect(notifier.summaryEmail).toHaveBeenCalledTimes(1);
    expect(notifier.summaryPush).not.toHaveBeenCalled();
    expect(users[0].notifications.dailySummary.lastSentOn).toBe('2026-10-19');
  });

  test('by push instead when the user has a browser with push on: one message, not both', async () => {
    const notifier = recorder();
    await processDailySummaries({ now: at('2026-10-19T07:30'), store: fakeStore([user()], { browsers: 1 }), notifier });
    expect(notifier.summaryPush).toHaveBeenCalledTimes(1);
    expect(notifier.summaryEmail).not.toHaveBeenCalled();
  });

  test('nothing when it is off, or when both channels are off', async () => {
    const notifier = recorder();
    await processDailySummaries({ now: at('2026-10-19T07:30'), store: fakeStore([user({ on: false })]), notifier });
    await processDailySummaries({ now: at('2026-10-19T07:30'), store: fakeStore([user({}, { push: false, email: false })], { browsers: 1 }), notifier });
    expect(notifier.summaryEmail).not.toHaveBeenCalled();
    expect(notifier.summaryPush).not.toHaveBeenCalled();
  });

  test('a failed send frees the day, so the next minute tries again', async () => {
    const users = [user()];
    const notifier = { summaryEmail: jest.fn().mockRejectedValueOnce(new Error('mail server down')).mockResolvedValue(), summaryPush: jest.fn() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await processDailySummaries({ now: at('2026-10-19T07:30'), store: fakeStore(users), notifier })).toEqual({ sent: 0, failed: 1 });
    expect(users[0].notifications.dailySummary.lastSentOn).toBeNull();
    expect(await processDailySummaries({ now: at('2026-10-19T07:31'), store: fakeStore(users), notifier })).toEqual({ sent: 1, failed: 0 });
    console.error.mockRestore();
  });
});

test('isTime: in the user’s time zone, up to an hour late', () => {
  expect(isTime(user(), at('2026-10-19T08:29'))).toBe(true);
  expect(isTime(user(), at('2026-10-19T08:30'))).toBe(false);
  expect(isTime({ ...user(), timeZone: 'UTC' }, at('2026-10-19T07:30'))).toBe(false); // 00:30 UTC
});

describe('the message', () => {
  const now = at('2026-10-19T07:30');
  const day = {
    scheduled: [
      { title: 'Database lecture', schedule: { start: at('2026-10-19T09:00') } },
      { title: 'Done already', schedule: { start: at('2026-10-19T08:00') }, completedAt: now },
    ],
    due: [{ title: 'Buy groceries', dueDate: at('2026-10-19T23:59') }],
    overdue: [{ title: 'Renew passport', dueDate: at('2026-10-16T23:59') }],
    habits: [
      { habit: { name: 'Read 20 pages' }, due: true, doneOnDate: false },
      { habit: { name: 'Run' }, due: true, doneOnDate: true },
      { habit: { name: 'Swim' }, due: false, doneOnDate: false },
    ],
    events: [{ time: '10:00–11:00', start: at('2026-10-19T10:00'), event: { title: 'Team sync' } }],
  };

  test('digest keeps what is still to do: open tasks, overdue tasks, habits due and not done, events', () => {
    const summary = digest(day);
    expect(summary.tasks.map((t) => t.title)).toEqual(['Database lecture', 'Buy groceries']);
    expect(summary.habits.map((h) => h.name)).toEqual(['Read 20 pages']);
  });

  test('email and push list the day by time, in the user’s time zone', () => {
    const summary = digest(day);
    const mail = buildSummaryEmail(user(), summary, now);
    expect(mail.subject).toBe('Your day: 2 tasks · 1 overdue · 1 habit · 1 event');
    expect(mail.heading).toBe('Your plan for Monday 19 October');
    expect(mail.paragraphs).toEqual([
      '09:00 · Database lecture',
      '10:00–11:00 · Team sync',
      'Due today · Buy groceries',
      'Overdue (Fri 16 Oct) · Renew passport',
      'Habit · Read 20 pages',
    ]);
    const push = buildSummaryPush(user(), summary, now);
    expect(push).toMatchObject({ title: mail.subject, url: '/today', tag: 'daily-summary' });
    expect(push.body).toBe('09:00 · Database lecture\n10:00–11:00 · Team sync\nDue today · Buy groceries\n…');
  });

  test('an empty day still gets a friendly message', () => {
    expect(buildSummaryEmail(user(), digest(emptyDay), now).paragraphs).toEqual(['Nothing planned for today. Enjoy it, or add something on your Daily List.']);
  });
});
