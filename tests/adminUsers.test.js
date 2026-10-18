// No database: these cover the filters, paging and status the /admin/users page is built from.
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { userFilter, pageNumber, statusOf, lockReason, lockUser, unlockUser, PAGE_SIZE } = require('../services/adminUsers');

const now = new Date('2026-10-17T08:00:00Z');

describe('userFilter', () => {
  test('no query lists every account', () => {
    expect(userFilter({}, now)).toEqual({ filter: {}, chip: '', search: '' });
  });

  test('"Active" leaves out admins and accounts locked out right now', () => {
    expect(userFilter({ status: 'active' }, now).filter).toEqual({
      role: { $ne: 'admin' },
      adminLock: null,
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    });
  });

  test('"Locked" covers an admin lock and a failed-login lockout; "Active" leaves both out', () => {
    expect(userFilter({ status: 'locked' }, now).filter).toEqual({ $or: [{ 'adminLock.at': { $exists: true } }, { lockedUntil: { $gt: now } }] });
    expect(userFilter({ status: 'active' }, now).filter.adminLock).toBeNull();
  });

  test('"Signed up this week" means the last 7 days', () => {
    expect(userFilter({ status: 'new' }, now).filter).toEqual({ createdAt: { $gte: new Date('2026-10-10T08:00:00Z') } });
  });

  test('search matches email or name, literally and ignoring case', () => {
    const { filter, search } = userFilter({ q: '  Demo+1 ' }, now);
    expect(search).toBe('Demo+1');
    const [email, name] = filter.$or.map((clause) => Object.values(clause)[0]);
    expect(email.test('demo+1@agendal.app')).toBe(true);
    expect(email.test('demoo1@agendal.app')).toBe(false);
    expect(name.source).toBe(email.source);
  });

  test('a chip and a search are combined', () => {
    const { filter } = userFilter({ status: 'admins', q: 'support' }, now);
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[0]).toEqual({ role: 'admin' });
  });

  test('unknown chips and crafted arrays are ignored', () => {
    expect(userFilter({ status: 'constructor', q: ['a'] }, now)).toEqual({ filter: {}, chip: '', search: '' });
    expect(userFilter({ status: ['admins'] }, now).chip).toBe('');
  });
});

describe('pageNumber', () => {
  test(`pages hold ${PAGE_SIZE} accounts`, () => {
    expect(pageNumber('2', 63)).toEqual({ page: 2, pages: 2 });
    expect(pageNumber(undefined, 63)).toEqual({ page: 1, pages: 2 });
  });

  test('out-of-range and junk values land on a real page', () => {
    expect(pageNumber('99', 63)).toEqual({ page: 2, pages: 2 });
    expect(pageNumber('-3', 63)).toEqual({ page: 1, pages: 2 });
    expect(pageNumber('abc', 63)).toEqual({ page: 1, pages: 2 });
    expect(pageNumber('1', 0)).toEqual({ page: 1, pages: 1 });
  });
});

test('statusOf: an admin lock wins over everything, and locked rows offer Unlock', () => {
  const at = new Date('2026-10-17T07:00:00Z');
  expect(statusOf({ role: 'user', adminLock: { at } }, now)).toMatchObject({ label: 'Locked', locked: true });
  expect(statusOf({ role: 'admin', adminLock: { at } }, now)).toMatchObject({ label: 'Locked', locked: true });
  expect(statusOf({ role: 'user', lockedUntil: new Date('2026-10-17T08:10:00Z') }, now)).toMatchObject({ locked: true });
  expect(statusOf({ role: 'admin' }, now)).toMatchObject({ locked: false });
});

test('statusOf: admin, locked out, active', () => {
  expect(statusOf({ role: 'admin' }, now).label).toBe('Admin');
  expect(statusOf({ role: 'user', lockedUntil: new Date('2026-10-17T08:10:00Z') }, now).label).toBe('Locked out');
  expect(statusOf({ role: 'user', lockedUntil: new Date('2026-10-17T07:50:00Z') }, now).label).toBe('Active');
  expect(statusOf({}, now).label).toBe('Active');
});

test('lockReason trims and keeps at most 200 characters', () => {
  expect(lockReason('  spam projects  ')).toBe('spam projects');
  expect(lockReason('x'.repeat(300))).toHaveLength(200);
  expect(lockReason(['a'])).toBe('');
});

describe('lockUser / unlockUser', () => {
  const admin = { _id: '64b000000000000000000001', email: 'admin@agendal.app' };
  const target = { _id: '64b000000000000000000002', email: 'bao.le@outlook.com', name: 'Bao Le' };
  const req = { ip: '27.72.98.130' };

  afterEach(() => jest.restoreAllMocks());

  test('an admin can’t lock their own account', async () => {
    const update = jest.spyOn(User, 'findOneAndUpdate');
    expect(await lockUser(req, admin, admin._id, '')).toEqual({ error: 'self' });
    expect(update).not.toHaveBeenCalled();
  });

  test('a malformed id is "not found", not a crash', async () => {
    expect(await lockUser(req, admin, 'not-an-id', '')).toEqual({ error: 'not_found' });
    expect(await unlockUser(req, admin, '../etc', '')).toEqual({ error: 'not_found' });
  });

  test('locking ends every session and goes into the activity log with the reason', async () => {
    const update = jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue(target);
    const log = jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

    expect(await lockUser(req, admin, target._id, ' Spam projects ', now)).toEqual({ user: target });
    const [filter, change] = update.mock.calls[0];
    expect(filter).toEqual({ _id: target._id, 'adminLock.at': { $exists: false } });
    expect(change.$inc).toEqual({ sessionVersion: 1 });
    expect(change.$set.adminLock).toEqual({ at: now, by: admin._id, reason: 'Spam projects' });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin_lock', account: target._id, actor: admin._id, details: 'By admin@agendal.app · Spam projects', ip: req.ip })
    );
  });

  test('locking an account that is already locked changes nothing', async () => {
    jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(User, 'exists').mockResolvedValue({ _id: target._id });
    const log = jest.spyOn(ActivityLog, 'create');
    expect(await lockUser(req, admin, target._id, '')).toEqual({ error: 'already' });
    expect(log).not.toHaveBeenCalled();
  });

  test('unlocking lifts the admin lock and any failed-login lockout, and is logged', async () => {
    const update = jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue(target);
    const log = jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

    expect(await unlockUser(req, admin, target._id, now)).toEqual({ user: target });
    const change = update.mock.calls[0][1];
    expect(change.$unset).toEqual({ adminLock: 1 });
    expect(change.$set).toEqual({ lockedUntil: null, loginFailures: { count: 0, since: null } });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_unlock', details: 'By admin@agendal.app' }));
  });
});
