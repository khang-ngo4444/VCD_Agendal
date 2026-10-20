// No database: the checks behind Focus mode.
const { LENGTHS, lengthFor, checkSession } = require('../services/focus');

test('lengthFor: the offered lengths, 25 / 5 for anything else', () => {
  expect(LENGTHS).toEqual([{ focus: 25, rest: 5 }, { focus: 50, rest: 10 }]);
  expect(lengthFor(50)).toEqual({ focus: 50, rest: 10 });
  expect(lengthFor('50')).toEqual({ focus: 50, rest: 10 });
  expect(lengthFor(undefined)).toEqual({ focus: 25, rest: 5 });
  expect(lengthFor(90)).toEqual({ focus: 25, rest: 5 });
});

describe('checkSession', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const ago = (minutes) => new Date(now - minutes * 60 * 1000).toISOString();

  test('a block that ran its full length is saved with that length', () => {
    expect(checkSession({ startedAt: ago(25), minutes: '25' }, now)).toEqual({ session: { startedAt: new Date(ago(25)), minutes: 25 } });
  });

  test('pauses make a block take longer, which is fine; a little clock drift is allowed', () => {
    expect(checkSession({ startedAt: ago(40), minutes: '25' }, now).session.minutes).toBe(25);
    expect(checkSession({ startedAt: ago(24.5), minutes: '25' }, now).session).toBeDefined();
  });

  test('a block that cannot have finished yet is refused', () => {
    expect(checkSession({ startedAt: ago(10), minutes: '25' }, now)).toEqual({ error: 'This block hasn’t finished yet.' });
    expect(checkSession({ startedAt: ago(30), minutes: '50' }, now).error).toBeDefined();
  });

  test('only offered lengths, a real start time, and not older than a day', () => {
    expect(checkSession({ startedAt: ago(90), minutes: '90' }, now)).toEqual({ error: 'Unknown focus length.' });
    expect(checkSession({ startedAt: 'yesterday', minutes: '25' }, now)).toEqual({ error: 'Missing start time.' });
    expect(checkSession({ startedAt: ['x'], minutes: '25' }, now)).toEqual({ error: 'Missing start time.' });
    expect(checkSession({ minutes: '25' }, now)).toEqual({ error: 'Missing start time.' });
    expect(checkSession(undefined, now)).toEqual({ error: 'Unknown focus length.' });
    expect(checkSession({ startedAt: ago(25 * 60), minutes: '25' }, now)).toEqual({ error: 'This block is too old to save.' });
  });
});
