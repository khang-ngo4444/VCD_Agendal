const notificationsController = require('../../../controllers/notificationsController');

function createReqRes({ body = {}, headers = {}, notifications = {} } = {}) {
  const store = {
    push: true,
    email: true,
    dailySummary: { on: false, time: '07:30' },
    ...notifications,
  };

  const user = {
    timeZone: 'Asia/Ho_Chi_Minh',
    notifications: store,
    set(path, value) {
      const parts = path.split('.');
      let target = this;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]] ??= {};
      }
      target[parts.at(-1)] = value;
    },
    save: jest.fn().mockResolvedValue(true),
  };

  const req = {
    body,
    user,
    headers,
    get(name) {
      return this.headers[name.toLowerCase()] ?? this.headers[name];
    },
    session: {},
  };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    end: jest.fn(),
    json: jest.fn(),
    redirect: jest.fn(),
    render: jest.fn(),
  };

  return { req, res, user };
}

describe('updateSettings in notificationsController (autosave)', () => {
  test('returns 204 No Content when updated via fetch autosave', async () => {
    const { req, res, user } = createReqRes({
      body: {
        push: 'on',
        dailySummary: 'on',
        dailySummaryTime: '08:30',
      },
      headers: { 'x-requested-with': 'fetch' },
    });

    await notificationsController.updateSettings(req, res);

    expect(user.notifications.push).toBe(true);
    expect(user.notifications.email).toBe(false); // unticked
    expect(user.notifications.dailySummary.on).toBe(true);
    expect(user.notifications.dailySummary.time).toBe('08:30');
    expect(user.save).toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.end).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('returns 422 JSON error on invalid dailySummaryTime when requested via fetch', async () => {
    const { req, res, user } = createReqRes({
      body: {
        dailySummaryTime: 'invalid-time',
      },
      headers: { 'x-requested-with': 'fetch' },
    });

    await notificationsController.updateSettings(req, res);

    expect(user.save).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('redirects with flash message on regular form submit', async () => {
    const { req, res, user } = createReqRes({
      body: {
        push: 'on',
        email: 'on',
        dailySummaryTime: '07:30',
      },
    });

    await notificationsController.updateSettings(req, res);

    expect(user.save).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/settings/notifications');
  });
});
