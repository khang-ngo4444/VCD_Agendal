const { processDueReminders, MAX_ATTEMPTS } = require('../../../services/reminders');
const { buildReminderEmail } = require('../../../services/notifier');
const { unsubscribeToken, readUnsubscribeToken } = require('../../../services/unsubscribe');

process.env.SESSION_SECRET = 'test-secret';

const NOW = new Date('2026-10-19T01:45:00Z'); // 08:45 in Ho Chi Minh City
const minutes = (n) => new Date(NOW.getTime() + n * 60_000);

// The same calls as services/reminderStore.js, against plain arrays.
function memoryStore({ reminders, tasks, users }) {
  const find = (id) => reminders.find((r) => r._id === id);
  return {
    reminders,
    findDue: async (now, maxAttempts, limit) =>
      reminders
        .filter((r) => !r.sent && r.remindAt <= now && (r.attempts ?? 0) < maxAttempts)
        .sort((a, b) => a.remindAt - b.remindAt)
        .slice(0, limit)
        .map((r) => ({ ...r })), // a snapshot, like .lean()
    findUpcomingForEmail: async (owner, now, until, maxAttempts) =>
      reminders
        .filter((r) => r.owner === owner && !r.sent && !r.emailedAt && r.remindAt > now && r.remindAt <= until && (r.attempts ?? 0) < maxAttempts)
        .map((r) => ({ ...r })),
    recordEmail: async (u, counters) => {
      u.notifications = { ...u.notifications, ...counters };
    },
    loadTasks: async (ids) => new Map(tasks.filter((t) => ids.includes(t._id)).map((t) => [t._id, t])),
    loadUsers: async (ids) => new Map(users.filter((u) => ids.includes(u._id)).map((u) => [u._id, u])),
    claim: async (id, field, now) => {
      const r = find(id);
      if (r[field]) return false;
      r[field] = now;
      return true;
    },
    release: async (id, field) => {
      find(id)[field] = null;
    },
    recordFailure: async (id, message) => {
      const r = find(id);
      r.attempts = (r.attempts ?? 0) + 1;
      r.lastError = message;
    },
    close: async (id, now, note) => Object.assign(find(id), { sent: true, sentAt: now, lastError: note }),
    finish: async (ids, now) => {
      let count = 0;
      for (const r of reminders.filter((x) => ids.includes(x._id) && !x.sent && x.pushedAt && x.emailedAt)) {
        Object.assign(r, { sent: true, sentAt: now });
        count += 1;
      }
      return count;
    },
  };
}

function recordingNotifier({ failEmail = false } = {}) {
  const calls = { email: [], push: [] };
  return {
    calls,
    email: async (user, items) => {
      if (failEmail) throw new Error('SMTP down');
      calls.email.push({ to: user.email, tasks: items.map((i) => i.task.title) });
    },
    push: async (user, items) => calls.push.push({ to: user.email, tasks: items.map((i) => i.task.title) }),
  };
}

const USER_ID = '64f0c0ffee64f0c0ffee64f0';
const makeUser = (notifications = {}) => ({ _id: 'u1', email: 'tuan@example.com', timeZone: 'Asia/Ho_Chi_Minh', notifications });
const user = makeUser();
const task = (id, extra = {}) => ({ _id: id, title: `Task ${id}`, deletedAt: null, completedAt: null, ...extra });
const reminder = (id, taskId, remindAt, extra = {}) => ({ _id: id, task: taskId, owner: 'u1', remindAt, sent: false, ...extra });

describe('the reminder job', () => {
  test('sends a due reminder and marks it sent', async () => {
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [makeUser()] });
    const notifier = recordingNotifier();

    const result = await processDueReminders({ now: NOW, store, notifier });

    expect(result).toMatchObject({ due: 1, sent: 1, failed: 0 });
    expect(notifier.calls.email).toEqual([{ to: 'tuan@example.com', tasks: ['Task t1'] }]);
    expect(store.reminders[0]).toMatchObject({ sent: true, sentAt: NOW });
  });

  test('leaves reminders that are not due yet alone', async () => {
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(5))], tasks: [task('t1')], users: [makeUser()] });
    const notifier = recordingNotifier();
    await processDueReminders({ now: NOW, store, notifier });
    expect(notifier.calls.email).toEqual([]);
    expect(store.reminders[0].sent).toBe(false);
  });

  test('never sends the same reminder twice, even when two runs overlap', async () => {
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [makeUser()] });
    const notifier = recordingNotifier();
    await Promise.all([processDueReminders({ now: NOW, store, notifier }), processDueReminders({ now: NOW, store, notifier })]);
    await processDueReminders({ now: minutes(1), store, notifier });
    expect(notifier.calls.email).toHaveLength(1);
    expect(notifier.calls.push).toHaveLength(1);
  });

  test('closes reminders for completed or deleted tasks without sending', async () => {
    const store = memoryStore({
      reminders: [reminder('r1', 't1', minutes(-1)), reminder('r2', 't2', minutes(-1))],
      tasks: [task('t1', { completedAt: minutes(-30) }), task('t2', { deletedAt: minutes(-30) })],
      users: [makeUser()],
    });
    const notifier = recordingNotifier();
    const result = await processDueReminders({ now: NOW, store, notifier });
    expect(result.closed).toBe(2);
    expect(notifier.calls.email).toEqual([]);
    expect(store.reminders.every((r) => r.sent)).toBe(true);
  });

  test('sends the reminders due together in one email', async () => {
    const store = memoryStore({
      reminders: [reminder('r1', 't1', minutes(-2)), reminder('r2', 't2', minutes(-1))],
      tasks: [task('t1'), task('t2')],
      users: [makeUser()],
    });
    const notifier = recordingNotifier();
    await processDueReminders({ now: NOW, store, notifier });
    expect(notifier.calls.email).toEqual([{ to: 'tuan@example.com', tasks: ['Task t1', 'Task t2'] }]);
  });

  test('retries a failed send on the next run and gives up after MAX_ATTEMPTS', async () => {
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [makeUser()] });
    const failing = recordingNotifier({ failEmail: true });

    for (let run = 0; run < MAX_ATTEMPTS + 2; run += 1) await processDueReminders({ now: minutes(run), store, notifier: failing });

    const [r] = store.reminders;
    expect(r.attempts).toBe(MAX_ATTEMPTS);
    expect(r.sent).toBe(false);
    expect(r.lastError).toBe('email: SMTP down');
    expect(failing.calls.push).toHaveLength(1); // the push channel worked and was not repeated

    const working = recordingNotifier();
    await processDueReminders({ now: minutes(10), store, notifier: working });
    expect(working.calls.email).toEqual([]); // given up: no more tries
  });

  test('a send that fails once still goes out on the next run', async () => {
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [makeUser()] });
    await processDueReminders({ now: NOW, store, notifier: recordingNotifier({ failEmail: true }) });
    const working = recordingNotifier();
    await processDueReminders({ now: minutes(1), store, notifier: working });
    expect(working.calls.email).toHaveLength(1);
    expect(store.reminders[0].sent).toBe(true);
  });
});

describe('the reminder email', () => {
  const items = (...list) => list.map(([t, remindAt]) => ({ task: t, reminder: { remindAt } }));

  test('one reminder: its title and local time in the subject, a link to the task', () => {
    const t = task('64f0c0ffee', { title: 'Read chapter 5', project: { name: 'SQL Course' }, schedule: { start: minutes(15) } });
    const mail = buildReminderEmail({ ...user, _id: USER_ID }, items([t, NOW]), NOW);
    expect(mail.subject).toBe('Reminder: Read chapter 5 · 09:00');
    expect(mail.paragraphs).toEqual(['09:00 · Read chapter 5 · SQL Course']);
    expect(mail.action.url).toMatch(/\/tasks\/64f0c0ffee$/);
  });

  test('several reminders: one email that lists them all', () => {
    const mail = buildReminderEmail(
      { ...user, _id: USER_ID },
      items([task('a', { title: 'Read chapter 5', schedule: { start: minutes(15) } }), NOW], [task('b', { title: 'Pay rent', dueDate: minutes(600) }), NOW]),
      NOW
    );
    expect(mail.subject).toBe('Reminder: 2 things coming up');
    expect(mail.paragraphs).toEqual(['09:00 · Read chapter 5', 'due Today · Pay rent']);
    expect(mail.action.url).toMatch(/\/today$/);
  });
});

describe('email reminders: settings and limits', () => {
  const run = (store, notifier, at = NOW) => processDueReminders({ now: at, store, notifier });

  test('email off: push still goes out, no email, and the reminder is finished', async () => {
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [makeUser({ email: false })] });
    const notifier = recordingNotifier();
    await run(store, notifier);
    expect(notifier.calls.email).toEqual([]);
    expect(notifier.calls.push).toHaveLength(1);
    expect(store.reminders[0].sent).toBe(true);
  });

  test('push off: email only', async () => {
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [makeUser({ push: false })] });
    const notifier = recordingNotifier();
    await run(store, notifier);
    expect(notifier.calls.push).toEqual([]);
    expect(notifier.calls.email).toHaveLength(1);
  });

  test('at most one email every 15 minutes: a reminder due 5 minutes after an email waits for the next one', async () => {
    const u = makeUser({ lastEmailAt: minutes(-5), emailDay: '2026-10-19', emailsToday: 1 });
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [u] });
    const notifier = recordingNotifier();

    await run(store, notifier);
    expect(notifier.calls.push).toHaveLength(1); // push is not limited
    expect(notifier.calls.email).toEqual([]);
    expect(store.reminders[0].sent).toBe(false);

    await run(store, notifier, minutes(10)); // 15 minutes after the last email
    expect(notifier.calls.email).toHaveLength(1);
    expect(notifier.calls.push).toHaveLength(1);
    expect(store.reminders[0].sent).toBe(true);
  });

  test('an email also carries the reminders due in the next 15 minutes; their push still comes on time', async () => {
    const store = memoryStore({
      reminders: [reminder('r1', 't1', minutes(-1)), reminder('r2', 't2', minutes(10)), reminder('r3', 't3', minutes(40))],
      tasks: [task('t1'), task('t2'), task('t3')],
      users: [makeUser()],
    });
    const notifier = recordingNotifier();

    await run(store, notifier);
    expect(notifier.calls.email).toEqual([{ to: 'tuan@example.com', tasks: ['Task t1', 'Task t2'] }]);
    expect(notifier.calls.push.map((c) => c.tasks)).toEqual([['Task t1']]);

    await run(store, notifier, minutes(10));
    expect(notifier.calls.email).toHaveLength(1); // no second email for r2
    expect(notifier.calls.push.map((c) => c.tasks)).toEqual([['Task t1'], ['Task t2']]);
    expect(store.reminders.find((r) => r._id === 'r2').sent).toBe(true);
  });

  test('after 10 emails today, reminders go by push only', async () => {
    const u = makeUser({ lastEmailAt: minutes(-60), emailDay: '2026-10-19', emailsToday: 10 });
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [u] });
    const notifier = recordingNotifier();
    await run(store, notifier);
    expect(notifier.calls.email).toEqual([]);
    expect(notifier.calls.push).toHaveLength(1);
    expect(store.reminders[0].sent).toBe(true);
  });

  test('the daily count starts again on a new local day', async () => {
    const u = makeUser({ lastEmailAt: minutes(-600), emailDay: '2026-10-18', emailsToday: 10 });
    const store = memoryStore({ reminders: [reminder('r1', 't1', minutes(-1))], tasks: [task('t1')], users: [u] });
    const notifier = recordingNotifier();
    await run(store, notifier);
    expect(notifier.calls.email).toHaveLength(1);
    expect(u.notifications).toMatchObject({ emailDay: '2026-10-19', emailsToday: 1, lastEmailAt: NOW });
  });
});

describe('turning email off from the email', () => {
  test('every reminder email has an unsubscribe link and the one-click headers', () => {
    const mail = buildReminderEmail({ ...user, _id: USER_ID }, [{ task: task('t1', { schedule: { start: minutes(15) } }), reminder: { remindAt: NOW } }], NOW);
    const link = mail.footerLinks.find((l) => l.label === 'Turn off email reminders').url;
    expect(mail.headers['List-Unsubscribe']).toBe(`<${link}>`);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(readUnsubscribeToken(link.split('/').pop())).toBe(USER_ID);
  });

  test('a tampered or foreign token is rejected', () => {
    const token = unsubscribeToken(USER_ID);
    expect(readUnsubscribeToken(token)).toBe(USER_ID);
    expect(readUnsubscribeToken(token.replace(USER_ID, 'aaaaaaaaaaaaaaaaaaaaaaaa'))).toBeNull();
    expect(readUnsubscribeToken(`${token}x`)).toBeNull();
    expect(readUnsubscribeToken('not-a-token')).toBeNull();
    expect(readUnsubscribeToken(undefined)).toBeNull();
  });
});
