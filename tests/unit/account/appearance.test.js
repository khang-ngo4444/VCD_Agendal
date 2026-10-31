const settingsController = require('../../../controllers/settingsController');

function createReqRes({ body = {}, headers = {}, preferences = {} } = {}) {
  const user = {
    preferences: {
      theme: 'system',
      accentColour: 'blue',
      calendarLayout: 'day',
      weekStartsOn: 1,
      ...preferences,
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
    redirect: jest.fn(),
  };

  return { req, res, user };
}

describe('updateAppearance controller', () => {
  test('saves valid appearance settings to user preferences', async () => {
    const { req, res, user } = createReqRes({
      body: {
        theme: 'dark',
        accentColour: 'purple',
        calendarLayout: 'week',
        weekStartsOn: '0',
      },
    });

    await settingsController.updateAppearance(req, res);

    expect(user.preferences.theme).toBe('dark');
    expect(user.preferences.accentColour).toBe('purple');
    expect(user.preferences.calendarLayout).toBe('week');
    expect(user.preferences.weekStartsOn).toBe(0);
    expect(user.save).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/settings/appearance');
  });

  test('returns 204 No Content when requested with X-Requested-With: fetch', async () => {
    const { req, res, user } = createReqRes({
      body: { theme: 'light' },
      headers: { 'x-requested-with': 'fetch' },
    });

    await settingsController.updateAppearance(req, res);

    expect(user.preferences.theme).toBe('light');
    expect(user.save).toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.end).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('ignores unlisted values to prevent crafted invalid values', async () => {
    const { req, res, user } = createReqRes({
      body: {
        theme: 'neon',
        accentColour: 'magenta',
        calendarLayout: 'century',
        weekStartsOn: '5',
      },
      preferences: {
        theme: 'system',
        accentColour: 'blue',
        calendarLayout: 'day',
        weekStartsOn: 1,
      },
    });

    await settingsController.updateAppearance(req, res);

    expect(user.preferences.theme).toBe('system');
    expect(user.preferences.accentColour).toBe('blue');
    expect(user.preferences.calendarLayout).toBe('day');
    expect(user.preferences.weekStartsOn).toBe(1);
  });
});
