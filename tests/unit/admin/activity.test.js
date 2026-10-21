// No database: ActivityLog.create is mocked, so these cover what gets recorded and how the page filters it.
jest.mock('../../../models/ActivityLog', () => ({ create: jest.fn(), ACTIONS: [], RETENTION_DAYS: 90 }));
const ActivityLog = require('../../../models/ActivityLog');
const activity = require('../../../services/activity');

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/141.0`;

beforeEach(() => ActivityLog.create.mockReset());

describe('record', () => {
  test('saves the event with the account, its email and the IP', async () => {
    const user = { _id: 'u1', email: 'demo@agendal.app' };
    await activity.record({ ip: '14.226.8.91' }, { action: 'login', user, details: 'Chrome on Windows' });
    expect(ActivityLog.create).toHaveBeenCalledWith({
      action: 'login',
      account: 'u1',
      email: 'demo@agendal.app',
      actor: null,
      details: 'Chrome on Windows',
      ip: '14.226.8.91',
    });
  });

  test('a failed login for an unknown email keeps the typed email and no account', async () => {
    await activity.record({ ip: '1.2.3.4' }, { action: 'login_failed', email: 'nobody@example.com' });
    expect(ActivityLog.create).toHaveBeenCalledWith(expect.objectContaining({ account: null, email: 'nobody@example.com' }));
  });

  test('never throws, so a log failure cannot break a login', async () => {
    ActivityLog.create.mockRejectedValueOnce(new Error('database down'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(activity.record({ ip: '1.2.3.4' }, { action: 'login' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

test('describeDevice names the browser and system', () => {
  expect(activity.describeDevice(CHROME_WINDOWS)).toBe('Chrome on Windows');
  expect(activity.describeDevice(EDGE_WINDOWS)).toBe('Edge on Windows');
  expect(activity.describeDevice(SAFARI_IPHONE)).toBe('Safari on iOS');
  expect(activity.describeDevice('')).toBe('Unknown browser');
});

describe('activityFilter', () => {
  test('no query shows everything', () => {
    expect(activity.activityFilter({})).toEqual({ filter: {}, chip: '', search: '', cursor: null });
  });

  test('the "Admin lock / unlock" chip covers both actions', () => {
    expect(activity.activityFilter({ action: 'admin' }).filter.action).toEqual({ $in: ['admin_lock', 'admin_unlock'] });
  });

  test('an unknown chip or a bad date is ignored', () => {
    expect(activity.activityFilter({ action: 'drop_tables', before: 'yesterday' })).toEqual({ filter: {}, chip: '', search: '', cursor: null });
  });

  test('search matches email or IP and treats the text literally', () => {
    const { filter, search } = activity.activityFilter({ q: '  demo+1@agendal.app ' });
    expect(search).toBe('demo+1@agendal.app');
    const [email, ip] = filter.$or.map((clause) => Object.values(clause)[0]);
    expect(email.test('DEMO+1@agendal.app')).toBe(true);
    expect(email.test('demoo1@agendal.app')).toBe(false); // "+" is not a regex quantifier here
    expect(ip.source).toBe(email.source);
  });

  test('a crafted array in the query string is ignored', () => {
    expect(activity.activityFilter({ q: ['a', 'b'], action: ['login'] }).filter).toEqual({});
  });
});

test('groupByDay splits entries by the admin’s local day', () => {
  const now = new Date('2026-10-17T08:40:00Z'); // 15:40 Saturday in Ho Chi Minh City
  const at = (iso) => ({ createdAt: new Date(iso) });
  const days = activity.groupByDay(
    [at('2026-10-17T08:38:00Z'), at('2026-10-17T07:31:00Z'), at('2026-10-16T14:40:00Z'), at('2026-10-14T02:00:00Z')],
    'Asia/Ho_Chi_Minh',
    now
  );
  expect(days.map((day) => [day.label, day.entries.length])).toEqual([
    ['Today · Saturday 17 October', 2],
    ['Yesterday · Friday 16 October', 1],
    ['Wednesday 14 October', 1],
  ]);
});
