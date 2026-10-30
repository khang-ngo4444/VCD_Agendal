// No database: the saved plan and the check a finished block passes before it is saved.
const { savedPlan, checkSession } = require('../../../services/focus');

test('savedPlan: the last plan, one hour of Pomodoro at first or when it no longer fits', () => {
  expect(savedPlan({ preferences: { focusPlan: { rhythm: 'deep', minutes: 90 } } })).toEqual({ rhythm: 'deep', minutes: 90 });
  expect(savedPlan({ preferences: {} })).toEqual({ rhythm: 'pomodoro', minutes: 60 });
  expect(savedPlan({ preferences: { focusPlan: { rhythm: 'deep', minutes: 5 } } })).toEqual({ rhythm: 'pomodoro', minutes: 60 });
});

describe('checkSession', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const ago = (minutes) => new Date(now - minutes * 60 * 1000).toISOString();

  test('a block that ran its full length is saved with that length', () => {
    expect(checkSession({ startedAt: ago(25), minutes: '25' }, now)).toEqual({ session: { startedAt: new Date(ago(25)), minutes: 25 } });
    expect(checkSession({ startedAt: ago(30), minutes: '30' }, now).session.minutes).toBe(30); // a last block with spare minutes
  });

  test('pauses make a block take longer, which is fine; a little clock drift is allowed', () => {
    expect(checkSession({ startedAt: ago(40), minutes: '25' }, now).session.minutes).toBe(25);
    expect(checkSession({ startedAt: ago(24.5), minutes: '25' }, now).session).toBeDefined();
  });

  test('a block that cannot have finished yet is refused', () => {
    expect(checkSession({ startedAt: ago(10), minutes: '25' }, now)).toEqual({ error: 'This block hasn’t finished yet.' });
    expect(checkSession({ startedAt: ago(30), minutes: '50' }, now).error).toBeDefined();
  });

  test('10 to 100 whole minutes, a real start time, and not older than a day', () => {
    const tooLong = { error: 'A focus block is 10 to 100 minutes.' };
    expect(checkSession({ startedAt: ago(200), minutes: '101' }, now)).toEqual(tooLong);
    expect(checkSession({ startedAt: ago(200), minutes: '9' }, now)).toEqual(tooLong);
    expect(checkSession({ startedAt: ago(200), minutes: '25.5' }, now)).toEqual(tooLong);
    expect(checkSession({ startedAt: 'yesterday', minutes: '25' }, now)).toEqual({ error: 'Missing start time.' });
    expect(checkSession({ startedAt: ['x'], minutes: '25' }, now)).toEqual({ error: 'Missing start time.' });
    expect(checkSession({ minutes: '25' }, now)).toEqual({ error: 'Missing start time.' });
    expect(checkSession(undefined, now)).toEqual(tooLong);
    expect(checkSession({ startedAt: ago(25 * 60), minutes: '25' }, now)).toEqual({ error: 'This block is too old to save.' });
  });
});
