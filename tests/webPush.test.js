// No database and no push service: the store and the sender are fakes.
const webPush = require('../services/webPush');
const { buildReminderPush } = require('../services/notifier');

const owner = '64b000000000000000000001';
const sub = (id, endpoint) => ({ _id: id, owner, endpoint, keys: { p256dh: 'p', auth: 'a' } });
const fakeStore = (subscriptions) => ({
  find: () => ({ lean: async () => subscriptions }),
  deleteOne: jest.fn(async () => ({})),
});
const statusError = (statusCode) => Object.assign(new Error(`push service answered ${statusCode}`), { statusCode });

describe('parseSubscription', () => {
  test('keeps the endpoint and both keys of an https subscription', () => {
    expect(webPush.parseSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'BN1', auth: 'x9' })).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'BN1', auth: 'x9' },
    });
  });

  test('refuses missing keys, plain http or internal addresses, and crafted arrays', () => {
    expect(webPush.parseSubscription({ endpoint: 'https://push.example/abc', p256dh: 'BN1' })).toBeNull();
    expect(webPush.parseSubscription({ endpoint: 'http://127.0.0.1:27017/', p256dh: 'BN1', auth: 'x9' })).toBeNull();
    expect(webPush.parseSubscription({ endpoint: 'not a url', p256dh: 'BN1', auth: 'x9' })).toBeNull();
    expect(webPush.parseSubscription({ endpoint: ['https://push.example/abc'], p256dh: 'BN1', auth: 'x9' })).toBeNull();
    expect(webPush.parseSubscription(undefined)).toBeNull();
  });
});

describe('sendToUser', () => {
  const env = { ...process.env };
  const keys = require('web-push').generateVAPIDKeys(); // setVapidDetails checks the key format
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  test('sends to every browser of the user', async () => {
    const send = jest.fn(async () => ({ statusCode: 201 }));
    const store = fakeStore([sub('s1', 'https://push.example/1'), sub('s2', 'https://push.example/2')]);
    expect(await webPush.sendToUser(owner, { title: 'Hi' }, { store, send })).toBe(2);
    expect(send).toHaveBeenCalledWith({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }, '{"title":"Hi"}');
  });

  test('a browser the push service no longer knows (404, 410) is removed, and the others still get it', async () => {
    const send = jest.fn(async ({ endpoint }) => {
      if (endpoint.endsWith('/gone')) throw statusError(410);
    });
    const store = fakeStore([sub('s1', 'https://push.example/gone'), sub('s2', 'https://push.example/ok')]);
    expect(await webPush.sendToUser(owner, {}, { store, send })).toBe(1);
    expect(store.deleteOne).toHaveBeenCalledWith({ _id: 's1' });
  });

  test('throws when every browser failed for another reason, so the job tries again', async () => {
    const send = jest.fn(async () => {
      throw statusError(500);
    });
    await expect(webPush.sendToUser(owner, {}, { store: fakeStore([sub('s1', 'https://push.example/1')]), send })).rejects.toThrow('500');
  });

  test('no browsers, or no VAPID keys: nothing to send and nothing fails', async () => {
    const send = jest.fn();
    expect(await webPush.sendToUser(owner, {}, { store: fakeStore([]), send })).toBe(0);
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await webPush.sendToUser(owner, {}, { store: fakeStore([sub('s1', 'https://push.example/1')]), send })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

test('buildReminderPush: the task title, its time and project, and a link that opens it', () => {
  const now = new Date('2026-10-18T06:00:00Z');
  const task = { _id: 't1', title: 'Group meeting', project: { name: 'University' }, schedule: { start: new Date('2026-10-18T08:00:00Z') } };
  expect(buildReminderPush({ timeZone: 'Asia/Ho_Chi_Minh' }, { task, reminder: { remindAt: new Date('2026-10-18T07:45:00Z') } }, now)).toEqual({
    title: 'Group meeting',
    body: '15:00 · University',
    url: '/tasks/t1',
    tag: 'task-t1',
  });
});
